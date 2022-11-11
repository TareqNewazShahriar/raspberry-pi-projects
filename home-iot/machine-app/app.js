const { exec } = require('child_process');
const Gpio = require('onoff').Gpio; //include onoff to interact with the GPIO
const { firestoreService, DB } = require('./firestoreService');

const LogLevel = { none: 0, important: 1, medium: 2, verbose: 3 };
const PhotoresistorValueStatuses = { Good: 187, Medium: 200, LightDark: 217, Dark: 255, ItBecameBlackhole:  Number.POSITIVE_INFINITY };
const BulbControlModes = { sensor: 1, manual: 2 }
const _DebugLevel = LogLevel.important;
const _SensorMonitorInterval = 5 * 60 * 1000;
const ON = 1;
const OFF = Number(!ON);
const _Optocoupler_Pin = 16;
const _optocoupler_Gpio = new Gpio(_Optocoupler_Pin, 'out');
var _values = { bulbControlMode: 1, bulbState: OFF };
var _monitorTaskRef;

log({message: `Node app started.`});
process.on('warning', e => console.warn(e.stack));
process.on('SIGINT', () => {
   log({message: 'Node app exiting.'});
   process.exit();
});

firestoreService.getById(DB.Collections.values, 'user-settings')
   .then(data => {
      _values = data;
      if(_values.bulbControlMode === BulbControlModes.sensor)
         monitorEnvironment();
      else {
         clearInterval(_monitorTaskRef);
         _monitorTaskRef = null;
      }
   })
   .catch(log);

firestoreService.attachListenerOnDocument(DB.Collections.values, 'machine-data-request', true, (data) => {
   if(data.success) {
      getClientData()
         .then(clientData => firestoreService.update(DB.Collections.values, 'machine-data', clientData))
         .catch(errorData => (_DebugLevel >= LogLevel.important ? log(errorData) : null));
   }
});

firestoreService.attachListenerOnDocument(DB.Collections.values, 'bulb-control-mode__from-client', true, function (data) {
   console.log('modee', JSON.stringify(data))


   if(data.success) {
      _values.bulbControlMode = data.doc.value;
      
      // If sensor mode activated, check the sensor value and take action
      if(_values.bulbControlMode === BulbControlModes.sensor) {
         monitorEnvironment();
         _monitorTaskRef = setInterval(monitorEnvironment, _SensorMonitorInterval);
      }
      else {
         clearInterval(_monitorTaskRef);
         _monitorTaskRef = null;
      }
   }
   else {
      log(data);
   }
});

// Turn on/off the bulb from client
firestoreService.attachListenerOnDocument(DB.Collections.values, 'bulb-state__from-client', true, (data) => {
   console.log('statee', JSON.stringify(data))

   if(!data.success) {
      log(data);
      return;
   }

   if(_values.bulbControlMode !== BulbControlModes.manual)
      return;
   
   try {
      _values.bulbState = controlBulb(null, _values.bulbControlMode, data.doc.value, 'bulb-state__from-client');
      firestoreService.update(DB.Collections.values, 'user-settings', _values);
   }
   catch(err) {
      log({ message: 'Error while switching bulb pin.', error: err, _values, data});
   }

   firestoreService.update(DB.Collections.values, 'bulb-state__from-machine', { value: _values.bulbState }).catch(log);
});

firestoreService.attachListenerOnDocument(DB.Collections.values, 'reboot__from-client', true, data => {
   log({ message: 'rebooting...'});
   exec('sudo reboot', (error, data) => {
      log({ message: 'Error on reboot', error, data});
   });
});

_monitorTaskRef = setInterval(monitorEnvironment, _SensorMonitorInterval);

function monitorEnvironment()
{
   executePythonScript('photoresistor_with_a2d.py', toNumber)
      .then(data => {
         let newState = controlBulb(data.value, _values.bulbControlMode, _values.bulbState, 'monitoring task');
         if(newState !== _values.bulbState) {
            _values.bulbState = newState;
            firestoreService.update(DB.Collections.values, 'user-settings', _values).catch(log);
            firestoreService.update(DB.Collections.values, 'bulb-state__from-machine', { value: _values.bulbState }).catch(log);
         }
      })
      .catch(data => log({message: 'Error while getting photoresistor data.', data}));
}

function getClientData()
{
   return new Promise((resolve, reject) => {
      Promise.allSettled([executePythonScript('thermistor_with_a2d.py', toNumber), executePythonScript('photoresistor_with_a2d.py', toNumber), getPiHealthData()])
         .then(results => {
            if(_DebugLevel >= LogLevel.verbose) log({message: 'Promise.allSettled sattled', results})

            let data = {
               thermistor: results[0].value || results[0].reason,
               photoresistor: results[1].value || results[1].reason,
               piHealthData: results[2].value || results[2].reason,
               photoresistorStatus: Object.entries(PhotoresistorValueStatuses).map(x => `${x[0]}: ${x[1]}`).join(', '),
               bulbControlMode: _values.bulbControlMode,
               bulbState: undefined,
               time: new Date(), // TODO: make utc using offset gmt
               node_pid: process.pid,
               node_parent_pid: process.ppid
            }
            
            data.bulbState = data.photoresistor.success?
               controlBulb(data.photoresistor.value, _values.bulbControlMode, _values.bulbState, 'getting machine data') :
               _values.bulbState;
            if(data.bulbState !== _values.bulbState) {
               _values.bulbState = data.bulbState;

               firestoreService.update(DB.Collections.values, 'user-settings', _values).catch(log);
            }

            if(_DebugLevel >= LogLevel.medium)
               log({message: `LogLevel:${_DebugLevel}`, data});

            resolve(data);
         })
         .catch(err => {
            reject({ message: 'emitSensorsData catch', error: err.toJsonString('emitSensorsData > catch')});
         });
   });
}

function executePythonScript(codeFileName, parseCallback)
{
   if(_DebugLevel >= LogLevel.verbose) log({ message:'executePythonScript entered', path: `${__dirname}/pythonScript/${codeFileName}` })

   return new Promise((resolve, reject) => {
      exec(`python ${__dirname}/pythonScript/${codeFileName}`, (error, data) => {
            if(_DebugLevel >= LogLevel.verbose) log({message: 'executePythonScript -> in promise'});

            if(error) {
               if(_DebugLevel >= LogLevel.important) log({message: 'executePythonScript > error', error: err});
               
               reject({error: err.toJsonString('execute-python > on error event'), succes: false});
            }
            else {
               if(_DebugLevel >= LogLevel.verbose) log({message: 'executePythonScript -> success', data});
         
               let result = {}; 
               try {
                  result.value = parseCallback ? parseCallback(data.toString()) : data.toString();
                  result.success = true;
                  resolve(result);
               }
               catch (error) {
                  result.error = error.toJsonString('execute-python > data > try-catch');
                  result.success = false;
                  reject(result);
               }
            }
         });//exec
      });//promise
}

function getPiHealthData() {
   if(_DebugLevel >= LogLevel.verbose) log({ message: 'getPiHealthData() entered'})
   return new Promise((resolve, reject) => {
      exec(`cat /proc/cpuinfo | grep Raspberry; echo "===Cpu temperature==="; cat /sys/class/thermal/thermal_zone0/temp; echo "===Gpu temperature==="; vcgencmd measure_temp; echo "===Memory Usage==="; free -h; echo "===Cpu Usage (top processes)==="; ps -eo time,pmem,pcpu,command --sort -pcpu | head -8; echo "===Voltage condition (expected: 0x0)==="; vcgencmd get_throttled; echo "===System Messages==="; dmesg | egrep 'voltage|error|fail';`,
         (error, data) => {
            if(_DebugLevel >= LogLevel.verbose) log({message: 'getPiHealthData() > exec > callback', error})
            if(error) {
               console.error({errorOnPiHealthData: error})
               reject({error: error.toJsonString('piHealthData'), succes: false})
            }      
            else {
               resolve({value: data, success: true});
            }
         });
   });
}

function controlBulb(roomLightValue, bulbControlMode, bulbState, from) {
   if(bulbControlMode === BulbControlModes.sensor) {
      const currentHour = new Date().getHours();
      // Set ON
      if(bulbState === OFF &&
         (currentHour.between(17, 23) /*evening 6pm-12am*/ ||
            (roomLightValue >= PhotoresistorValueStatuses.LightDark && currentHour.between(0, 6) === false)))
      {
         bulbState = ON;
         if(_DebugLevel >= LogLevel.important)
            log({message: 'Going to switch bulb state.', bulbState, bulbControlMode, roomLightValue, hour: currentHour, from});
      }
      // Set OFF
      // NOTE: If the bulb is on checking the sensor will not help (because the room is lit). Check the time instead.
      else if(bulbState === ON && 
         (currentHour.between(0, 6)/*midnight*/ ||
         (roomLightValue < PhotoresistorValueStatuses.LightDark && currentHour.between(17, 23) === false)))
      {
         bulbState = OFF;
         if(_DebugLevel >= LogLevel.important)
            log({message: 'Going to switch bulb state.', bulbState, bulbControlMode, roomLightValue, hour: currentHour, from});
      }
   }

   // Set the state to PIN
   _optocoupler_Gpio.writeSync(bulbState);

   // whatever the request state is, return the actual state of the bulb.
   let val = _optocoupler_Gpio.readSync();
   if(_DebugLevel >= LogLevel.important && val != bulbState)
      log({message: 'Bulb state', currentState: val, requested: bulbState, currentHour, from});

   return val;
}

function log(logData) {
   logData.node_pid = process.pid;
   logData.node_parent_pid = process.ppid;
   console.log(`${new Date().toLocaleString()}\n`, logData);
   firestoreService.create(DB.Collections.logs, logData, new Date().toJSON());
}

function toNumber(text) {
   let n = parseFloat(text);
   if(Number.isNaN(n))
      throw new Error('Not a number');
   else
      return n;
}

Error.prototype.toJsonString = function(inFunc) {
   this.inFunction = inFunc;
   return JSON.stringify(this, Object.getOwnPropertyNames(this));
}

Number.prototype.between = function(a, b) {
   return this >= a && this <= b;
}
