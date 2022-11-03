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
var _Optocoupler_Pin = 16;
var _values = { bulbControlMode: 1, bulbState: OFF };

(function init() {
   firestoreService.getById(DB.Collections.values, 'user-settings')
      .then(data => {
         _values = data;
         periodicTask();
      })
      .catch(log);

   setInterval(periodicTask, _SensorMonitorInterval);

   firestoreService.attachListenerOnDocument(DB.Collections.values, 'machine-data-request', true, (data) => {
      if(data.success) {
         getClientData()
            .then(clientData => firestoreService.update(DB.Collections.values, 'machine-data', clientData))
            .catch(errorData => (_DebugLevel >= LogLevel.important ? log(errorData) : null));
      }
   });

   log({message: `Node server started.`});
   process.on('warning', e => console.warn(e.stack));
   process.on('SIGINT', () => {
      log({message: 'Node server exiting.'});
      process.exit();
   });
})();

firestoreService.attachListenerOnDocument(DB.Collections.values, 'bulb-control-mode__from-client', true, function (data) {
   if(data.success) {
      _values.bulbControlMode = data.value;
      
      // If sensor mode activated, check the sensor value and take action
      if(_values.bulbControlMode === BulbControlModes.sensor) {
         executePythonScript('photoresistor_with_a2d.py', toNumber)
            .then(resultData => {
               let newBulbState = controlBulb(resultData.value, _values.bulbControlMode, _values.bulbState);
               
               if(newBulbState !== _values.bulbState) {
                  _values.bulbState = newBulbState;
                  firestoreService.update(DB.Collections.values, 'user-settings', _values).catch(log);
                  firestoreService.update(DB.Collections.values, 'bulb-state--from-machine', { value: _values.bulbState }).catch(log);
               }
               firestoreService.update(DB.Collections.values, 'bulb-control-mode__from-machine', { value: _values.bulbControlMode }).catch(log);
            })
            .catch(log);
      }
   }
   else {
      log(data);
   }
});

// Turn on/off the bulb from client
firestoreService.attachListenerOnDocument(DB.Collections.values, 'bulb-status__from-client', true, (data) => {
   if(!data.success) {
      log(data);
      return;
   }

   if(_values.bulbControlMode !== BulbControlModes.manual)
      return;
   
   try {
      _values.bulbState = controlBulb(null, _values.bulbControlMode, data.value);
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

function periodicTask()
{
   executePythonScript('photoresistor_with_a2d.py', toNumber)
      .then(data => { controlBulb(data.value, _values.bulbControlMode, _values.bulbState); })
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
               time: new Date() // TODO: make utc using offset gmt
            }
            
            data.bulbState = data.photoresistor.success?
               controlBulb(data.photoresistor.value, _values.bulbControlMode, _values.bulbState) :
               _values.bulbState;
            if(data.bulbState !== _values.bulbState) {
               _values.bulbState = data.bulbState;

               firestoreService.update(DB.Collections.values, 'user-settings', _values)
                  .catch(errorData => log(errorData));
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

function controlBulb(roomLightValue, bulbControlMode, bulbState)
{
   if(bulbControlMode === BulbControlModes.sensor) {
      const hour = new Date().getHours();
      // Set ON
      if(bulbState === OFF &&
         (hour.between(17, 23) /*evening*/ || roomLightValue >= PhotoresistorValueStatuses.LightDark))
      {
         bulbState = ON;
         if(_DebugLevel >= LogLevel.important)
            log({message: 'Going to switch bulb state.', bulbState, bulbControlMode, roomLightValue});
      }
      // Set OFF
      // NOTE: If the bulb is on checking the sensor will not help (because the room is lit). Check the time instead.
      else if(bulbState === ON && 
         (hour.between(1, 6) /*midnight*/ || roomLightValue < PhotoresistorValueStatuses.LightDark))
      {
         bulbState = OFF;
         if(_DebugLevel >= LogLevel.important)
            log({message: 'Going to switch bulb state.', bulbState, bulbControlMode, roomLightValue});
      }
   }

   // Set the state to PIN
   const pin = new Gpio(_Optocoupler_Pin, 'out');
   pin.writeSync(bulbState);
   
   // whatever the request state is, return the actual state of the bulb.
   let val = pin.readSync();
   if(_DebugLevel >= LogLevel.important && val != bulbState)
      log({message: 'Bulb state', requested: bulbState, actual: val});

   return val;
}

function log(logData) {
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