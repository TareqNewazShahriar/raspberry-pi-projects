const { exec } = require('child_process');
const http = require('http').createServer(responseHandler);
const fs = require('fs'); //require filesystem module
const io = require('socket.io')(http); //require socket.io module and pass the http object (server)
const Gpio = require('onoff').Gpio; //include onoff to interact with the GPIO
const { firestoreService, DB } = require('./firestoreService');

const LogLevel = { none: 0, important: 1, medium: 2, verbose: 3 };
const PhotoresistorValueStatuses = { Good: 187, Medium: 200, LightDark: 217, Dark: 255, ItBecameBlackhole:  Number.POSITIVE_INFINITY };
const BulbControlModes = { sensor: 1, manual: 2 }
const _DebugLevel = LogLevel.important;
const _SensorMonitorInterval = 5 * 60 * 1000;
const ON = 1;
const OFF = Number(!ON);
const _Port = 8080;
var _Optocoupler_Pin = 16;
const _ValuesJsonPath = `${__dirname}/data/values.json`;
var _values = {};
var _socket = null;


(function init() {
   firestoreService.getByIdWithListener(DB.Collections.values, 'values', (data) => {
      if(data.success) {
         _values = data.doc;
         periodicTask();
         setInterval(periodicTask, _SensorMonitorInterval);
      }
      else {
         log(data);
      }
   });
      

   http.listen(_Port);
   log({message: `Node server started. Port ${_Port}.`});
   process.on('warning', e => console.warn(e.stack));
   process.on('SIGINT', () => {
      log({message: 'Node server exiting.'});
      process.exit();
   });
})();

function responseHandler(req, res) {
   // read file index.html in public folder
   fs.readFile(__dirname + '/public/index.html', function(err, data) {
      if (err) { // file not found
         log({message: 'Error occurred on getting index.html file.', error: err});
         res.writeHead(404, { 'Content-Type': 'text/html' }); //display 404 on error
         return res.end("404 Not Found");
      }

      res.writeHead(200, { 'Content-Type': 'text/html' }); //write HTML
      res.write(data); // Write html string
      res.end();
   });
}

// Register all pub-sub in socket
io.sockets.on('connection', function (socket) { // WebSocket Connection
   log({ message: 'socket connection established.'});
   
   _socket = socket;

   fs.mkdir(__dirname + '/output', () => {/*callback is required*/});

   // Get bulb control mode from client
   socket.on('bulb-control-mode', function (data) {
      _values.bulbControlMode = data.value;
      
      // If sensor mode activated, check the sensor value and take action
      if(_values.bulbControlMode === BulbControlModes.sensor) {
         executePythonScript('photoresistor_with_a2d.py', toNumber)
            .then(resultData => {
               _values.bulbState = controlBulb(resultData.value, _values.bulbControlMode, _values.bulbState);
               // send to all connected clients
               socket.emit('bulb-status--from-server', { from: 'server', value: _values.bulbState, to: 'all' });
            })
            .catch(errData => { /* log */})
            .finally(() => {
               fs.writeFile(_ValuesJsonPath, JSON.stringify(_values), () => {});
            });
      }
   });

   // Turn on/off the bulb from client
   socket.on('bulb-status--from-client', function (data) {
      if(_values.bulbControlMode !== BulbControlModes.manual)
         return;
      
      try {
         _values.bulbState = controlBulb(null, _values.bulbControlMode, data.value);
         fs.writeFileSync(_ValuesJsonPath, JSON.stringify(_values));
      }
      catch(err) {
         log({ message: 'Error while switching bulb pin.', error: err, _values, data});
      }

      // broadcast to all connected sites about the change
      socket.broadcast.emit('bulb-status--from-server', { from: 'server', value: _values.bulbState, to: 'braodcast' });
   });

   socket.on('pi-stat', function () {
      getPiHealthData()
         .then(data => socket.emit('pi-stat', { from: 'server', piHealthData: data, to: 'connectee' }))
         .catch(data => socket.emit('pi-state', { from: 'server', piHealthData: data, to: 'connectee' }));
   });

   socket.on('terminate-app', function () {
      log({ message: 'terminate-app...'});
      try {
         log({ message: 'Node server exiting!'});
         _localTunnelInstance ? _localTunnelInstance.close() : null;
         process.exit();
      }
      catch (err) {
         if(_DebugLevel >= LogLevel.important)
            log({ message: 'Error on terminating Node!', error: err.toJsonString()});
      }
   });
   
   socket.on('reboot', function () {
      log({ message: 'rebooting...'});
      exec('sudo reboot', (error, data) => {
            if(error && _DebugLevel >= LogLevel.important)
               log({ message: 'Error on reboot', error, data});
         });
   });
   socket.on('poweroff', function () {
      log({ message: 'turning off...'});
      exec('sudo poweroff', (error, data) => {
         if(error && _DebugLevel >= LogLevel.important)
            log({ message: 'error on poweroff', error, data});
      });
   });
});

function periodicTask() {
   if(io.sockets.server.engine.clientsCount > 0) {
      emitPeriodicData(_socket);
   }
   else {
      executePythonScript('photoresistor_with_a2d.py', toNumber)
         .then(data => controlBulb(data.value, _values.bulbControlMode, _values.bulbState))
         .catch(data => _DebugLevel >= LogLevel.important ? log({message: 'Error while getting photoresistor data.', data}) : null);
   }
}

function emitPeriodicData(socket)
{
   Promise.allSettled([executePythonScript('thermistor_with_a2d.py', toNumber), executePythonScript('photoresistor_with_a2d.py', toNumber), getPiHealthData()])
      .then(results => {
         if(_DebugLevel >= LogLevel.verbose) log({message: 'Promise.allSettled sattled', results})
         
         let data = {
            thermistor: results[0].value || results[0].reason,
            photoresistor: results[1].value || results[1].reason,
            piHealthData: results[2].value || results[2].reason,
            photoresistorStatus: Object.entries(PhotoresistorValueStatuses).map(x => `${x[0]}: ${x[1]}`).join(', '),
            bulbControlMode: _values.bulbControlMode,
            bulbState: null,
            connectionCount: io.sockets.server.engine.clientsCount,
            time: new Date().toLocaleString(),
            from: 'server',
            to: 'connectee'
         }
         
         data.bulbState = data.photoresistor.success?
            controlBulb(data.photoresistor.value, _values.bulbControlMode, _values.bulbState) :
            _values.bulbState;
         if(data.bulbState !== _values.bulbState) {
            _values.bulbState = data.bulbState;
            fs.writeFileSync(_ValuesJsonPath, JSON.stringify(_values));
         }

         if(_DebugLevel >= LogLevel.medium) log({message: `LogLevel:${_DebugLevel}`, data});
         socket.emit('periodic-data', data);
      })
      .catch(err => {
         if(_DebugLevel >= LogLevel.important)
            log({ message: 'emitSensorsData catch', error: err.toJsonString('emitSensorsData > catch')});
         
         // No need to emit the event; because the data fields will be in a unstable state.
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
         bulbState  = ON;
         if(_DebugLevel >= LogLevel.important)
            log({message: 'Going to switch bulb state.', bulbState, bulbControlMode, roomLightValue});
      }
      // Set OFF
      // NOTE: If the bulb is on checking the sensor will not help (because the room is lit). Check the time instead.
      else if(bulbState === ON && 
         (hour.between(1, 6) /*midnight*/ || roomLightValue < PhotoresistorValueStatuses.LightDark))
      {
         bulbState  = OFF;
         if(_DebugLevel >= LogLevel.important)
            log({message: 'Going to switch bulb state.', bulbState, bulbControlMode, roomLightValue});
      }
   }

   // Set the state to PIN
   const pin = new Gpio(_Optocoupler_Pin, 'out');
   pin.writeSync(bulbState);
   
   // whatever the request state is, return the actual state of the bulb.
   let val = pin.readSync();
   if(_DebugLevel >= LogLevel.important && val !== bulbState)
      log({message: 'Bulb state', requested: bulbState, actual: val});
   return val;
}

function log(logData) {
   console.log(`${new Date().toLocaleString()}\n`, logData);
   firestoreService.addDoc(DB.Collections.logs, logData, new Date().toJSON());
}

function toNumber(text) {
   let n = parseFloat(text);
   if(Number.isNaN(n))
      throw new Error('Not a number')
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