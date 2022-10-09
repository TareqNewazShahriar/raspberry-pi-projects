const { exec, spawn } = require('child_process');
const http = require('http').createServer(handler);
const fs = require('fs'); //require filesystem module
const io = require('socket.io')(http) //require socket.io module and pass the http object (server)
const Gpio = require('onoff').Gpio; //include onoff to interact with the GPIO
const Humiture = require('node-dht-sensor');
const localtunnel = require('localtunnel');

const LogLevel = { none: 0, important: 1, medium: 2, verbose: 3 };
const PhotoresistorValueStatuses = { Good: 187, Medium: 200, LightDark: 217, Dark: 255, ItBecameBlackhole:  Number.POSITIVE_INFINITY };
const BulbControlModes = { sensor: 1, manual: 2 }
const debug_ = LogLevel.important;
const DELAY = 5 * 60 * 1000;
const ON = 1;
const OFF = 0;
const _port = 8081
var _localTunnelInstance = null;
var _localProxyStatus = 'Uninitialized';

let _bulbControlMode = BulbControlModes.sensor;

http.listen(_port)
log(`Server is listening to port ${_port}...`)

process.on('warning', e => console.warn(e.stack));
process.on('SIGINT', () => {
   _localTunnelInstance ? _localTunnelInstance.close() : null;
   log('Node server exiting.');
   process.exit();
});

startLocalhostProxy();

function handler(req, res) {
   // read file index.html in public folder
   fs.readFile(__dirname + '/public/index.html', function(err, data) {
      if (err) { // file not found
         log('Error occurred on getting index.html file.', err)
         res.writeHead(404, { 'Content-Type': 'text/html' }); //display 404 on error
         return res.end("404 Not Found");
      }

      res.writeHead(200, { 'Content-Type': 'text/html' }); //write HTML
      res.write(data); // Write html string
      res.end();
   });
}

io.sockets.on('connection', function (socket) { // WebSocket Connection
   log('socket connection established.');
   
   fs.mkdir(__dirname + '/output', () => {/*callback is required*/});

   emitSensorsData(socket);
   setInterval(emitSensorsData, DELAY, socket);

   socket.on('bulb-control-mode', function (data) { //get light switch status from client
      _bulbControlMode = data.value;
      let electricalSwitch = new Gpio(17, 'out');
      electricalSwitch.writeSync(_bulbControlMode);
      if (data.from != 'server')
         // broadcast to all connected sites about the change
         socket.broadcast.broadcast('bulb-control-mode', { from: 'server', value: _bulbControlMode, to: 'braodcast' });
   });

   socket.on('pi-stat', function () {
      getPiHealthData()
         .then(statInfo => socket.emit('pi-stat', { from: 'server', value: statInfo, to: 'connectee' }))
         .catch(err => socket.emit('pi-state', { from: 'server', error: err.toJsonString(`On "pi-stat" socket event > catch`), to: 'connectee' }));
   });

   socket.on('terminate-app', function () {
      log('terminate-app...');
      try {
         log('Node server exiting!');
         _localTunnelInstance ? _localTunnelInstance.close() : null;
         process.exit();
      }
      catch (err) {
         if(debug_ >= LogLevel.important)
            log('Error on exit', err);
      }
   });
   
   socket.on('reboot', function () {
      log('rebooting...');
      exec('sudo reboot', (error, data) => {
            if(error && debug_ >= LogLevel.important)
               log({errorOnReboot: error, data});
         });
   });
   socket.on('poweroff', function () {
      log('turning off...');
      exec('sudo poweroff', (error, data) => {
         if(error && debug_ >= LogLevel.important)
            log({errorOnPoweroff: error, data});
      });
   });
});

function emitSensorsData(socket) {
   Promise.allSettled([executePythonScript('thermistor_with_a2d.py', parseFloat), executePythonScript('photoresistor_with_a2d.py', parseFloat), getPiHealthData()])
      .then(results => {
         if(debug_ >= LogLevel.medium) log('Promise.allSettled sattled', results)

         let data = {
            thermistor: results[0].value,
            photoresistor: results[1].value,
            piHealthData: results[2].value,
            photoresistorStatus: Object.entries(PhotoresistorValueStatuses).map(x => `${x[0]}: ${x[1]}`).join(', '),
            bulbControlMode: _bulbControlMode,
            from: 'server',
            to: 'connectee',
            connectionCount: io.sockets.server.engine.clientsCount,
            localProxyStatus: _localProxyStatus,
            time: new Date().toLocaleString()
         }
         if(debug_ >= LogLevel.medium) log(data);

         socket.emit('periodic-data', data);
      })
      .catch(err => {
         if(debug_ >= LogLevel.important) log('emitSensorsData catch', err.toJsonString('emitSensorsData > catch'));
         
         socket.emit('periodic-data', { from: 'server', error: err.toJsonString('emitSensorsData > catch'), to: 'connectee' });
      });
}

function readHumiture() {
   return new Promise((resolve, reject) => {
      try {
         Humiture.read(11, 10, function(err, temperature, humidity) {
            if (!err) {
               // log(`temp: ${temperature}°C, humidity: ${humidity}%`)
               resolve({ temperature, humidity })
            }
            else {
               log({humitureReadError: err})
               reject(err)
            }
         });
      }
      catch (error) {
         if(debug_ >= LogLevel.important) log({humitureCatchError: error})
         reject(error)
      }
   });
}

function executePythonScript(codeFileName, parseCallback)
{
   if(debug_ >= LogLevel.verbose) log({ msg:'executePythonScript() entered', path: `${__dirname}/pythonScript/${codeFileName}` })
   
   const pyProg = spawn('python', [`${__dirname}/pythonScript/${codeFileName}`]);
   return new Promise((resolve, reject) => {
      try {
         if(debug_ >= LogLevel.verbose) log({msg: 'executePythonScript() -> in promise'})
         
         pyProg.stdout.on('data', function(data) {
            if(debug_ >= LogLevel.verbose) log({msg: 'executePythonScript() -> data', data})
            let result = {success: undefined}; 
            try {
               result.value = parseCallback ? parseCallback(data.toString()) : data.toString();
               result.success = true;
               resolve(result);
            }
            catch (error) {
               result.error = error.toJsonString('execute-python > on data event');
               result.success = false;
               reject(result);
            }
         });

         pyProg.stdout.on('error', function(err) {
            if(debug_ >= LogLevel.important) log({msg: 'pyProg.stdout.on > error', err});
            
            reject({error: err.toJsonString('execute-python > on error event'), succes: false});
         });
         pyProg.stdout.on('end', function(data){
            if(debug_ >= LogLevel.verbose) log({msg: 'pyProg.stdout.on > end', data});
            resolve({error: new Error('Data cannot be retreived from Python script.').toJsonString('execute-python > on end event'), success: false});
         });
      }
      catch(err) {
         log({execPythonError: err})
         reject({error: err, success: false})
      }
   });
}

function getPiHealthData() {
   if(debug_ >= LogLevel.verbose) log('getPiHealthData() entered')
   return new Promise((resolve, reject) => {
      exec(`cat /proc/cpuinfo | grep Raspberry; echo "===Cpu temperature==="; cat /sys/class/thermal/thermal_zone0/temp; echo "===Gpu temperature==="; vcgencmd measure_temp; echo "===Memory Usage==="; free -h; echo "===Cpu Usage (top 5 processes)==="; ps -eo command,pid,pcpu,pmem,time --sort -pcpu | head -8; echo "===Voltage condition (expected: 0x0)==="; vcgencmd get_throttled; echo "===System Messages==="; dmesg | egrep 'voltage|error|fail';`,
         (error, data) => {
            if(debug_ >= LogLevel.verbose) log({msg: 'getPiHealthData() > exec > callback', error})
            if(error) {
               console.error({errorOnPiHealthData: error})
               reject({error: error, succes: false})
            }      
            else {
               resolve({value: data, success: true});
            }
         });
   });
}

function startLocalhostProxy() {
   if(debug_ >= LogLevel.important) log('startLocalhostProxy called')
   _localProxyStatus = 'Initializing...';
   localtunnel({ subdomain: 'hamba-biology', port: _port })
      .then(tunnel => {
         _localTunnelInstance = tunnel;
         _localProxyStatus = `Proxy resolved. [${tunnel.url}]`;

         if(debug_ >= LogLevel.important) log('startLocalhostProxy > then', tunnel.url);

         tunnel.on('close', () => {
            let delay = 30;
            _localProxyStatus = `Closed. Initializing in ${delay} seconds.`;
            log('startLocalhostProxy > tunnel on-close');
            setTimeout(() => startLocalhostProxy, delay * 1000); // restart the localtunnel after 30 seconds
         });
      })
      .catch(err => {
         _localProxyStatus = `Error on proxy resolve. [Error: ${err.toJsonString()}].`;
         if(debug_ >= LogLevel.important) log('startLocalhostProxy > catch', err);
      });
}

function log(...params) {
   console.log(params);
   // Log in file
   fs.appendFile(`${__dirname}/output/log-${new Date().toDateString()}.txt`,
      `${new Date().toLocaleString()}\n${JSON.stringify(params)}\n\n`,
      () => {/*callback is required*/});
}

Error.prototype.toJsonString = function(inFunc) {
   this.inFunction = inFunc;
   return JSON.stringify(this, Object.getOwnPropertyNames(this));
}
