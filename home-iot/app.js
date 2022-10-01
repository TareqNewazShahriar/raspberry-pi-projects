const { exec, spawn } = require('child_process')
const http = require('http').createServer(handler);
const fs = require('fs'); //require filesystem module
const io = require('socket.io')(http) //require socket.io module and pass the http object (server)
const Gpio = require('onoff').Gpio; //include onoff to interact with the GPIO
const Humiture = require('node-dht-sensor');

const LogLevel = { none: 0, important: 1, medium: 2, verbose: 3 };
const PhotoresistorValueStatus = { goodLight: 187, mediumLight: 200, lightDark: 217, dark: 235, blackhole:  Number.POSITIVE_INFINITY };
const debug_ = LogLevel.none;
const DELAY = 5 * 60 * 1000
const ON = 1;
const OFF = 0;
let _port = 8080

http.listen(_port)
console.log(`Server is listening to port ${_port}...`)

process.on('warning', e => console.warn(e.stack));
function handler(req, res) {
   // read file index.html in public folder
   fs.readFile(__dirname + '/public/index.html', function(err, data) {
      if (err) { // file not found
         console.log('Error occurred on getting index.html file.', err)
         res.writeHead(404, { 'Content-Type': 'text/html' }); //display 404 on error
         return res.end("404 Not Found");
      }

      res.writeHead(200, { 'Content-Type': 'text/html' }); //write HTML
      res.write(data); // Write html string
      res.end();
   });
}

io.sockets.on('connection', function (socket) { // WebSocket Connection
   console.log('socket connection established.');
   
   fs.mkdir(__dirname + '/output', () => {/*callback is required*/});

   emitSensorsData(socket);
   setInterval(emitSensorsData, DELAY, socket);

   socket.on('light', function (data) { //get light switch status from client
      val = data.val | 0; // make it a number
      //console.log('message from "light" event. val:', data); //turn LED on or off, for now we will just show it in console.log
      LED.writeSync(val);
      if (data.from != 'server')
         socket.broadcast.emit('light', { from: 'server', val: data.val, to: 'braodcast' }); // broadcast to all connected sites about the change
   });

   socket.on('pi-stat', function () {
      getPiHealthData()
         .then(statInfo => socket.emit('pi-stat', { from: 'server', val: statInfo, to: 'connectee' }))
         .catch(err => socket.emit('pi-state', { from: 'server', error: err, to: 'connectee' }));
   });

   socket.on('terminate-app', function () {
      console.log('terminate-app...');
      try {
         process.exit();
      }
      catch (err) {
         console.log('Error on exit', err);
      }
   });
   
   socket.on('reboot', function () {
      console.log('rebooting...');
      exec('sudo reboot', (error, data) => {
            if(error)
               console.error({errorOnReboot: error, data});
         });
   });
   socket.on('poweroff', function () {
      console.log('turning off...');
      exec('sudo poweroff', (error, data) => {
         if(error)
            console.error({errorOnPoweroff: error, data});
      });
   });
});

function emitSensorsData(socket) {
   Promise.allSettled([executePythonScript('thermistor_with_a2d.py'), executePythonScript('photoresistor_with_a2d.py'), readHumiture(), getPiHealthData()])
      .then(results => {
         if(debug_ >= LogLevel.medium) console.log('Promise.allSettled sattled', results)

         let data = {
            val: {
               thermistor: results[0].value.data ? parseFloat(results[0].value.data) : 0,
               photoresistor: results[1].value.data ? parseFloat(results[1].value.data) : 0,
               photoresistorStatus: '',
               ...(results[2].value || {}),
               ...(results[3].value || {})
            },
            errors: [results[0].reason, results[1].reason, results[2].reason].filter(x => !!x),
            from: 'server',
            to: 'connectee',
            connectionCount: io.sockets.server.engine.clientsCount,
            time: new Date().toLocaleString(),
            success: null
         }
         data.success = !data.errors.length;
         data.val.photoresistorStatus = Object.entries(PhotoresistorValueStatus).find(x => data.val.photoresistor <= x[1])[0];

         if(debug_ >= LogLevel.medium) console.log(data);

         socket.emit('periodic-data', data);
         
         // Log in file
         fs.appendFile(__dirname + '/output/temperature.log',
            JSON.stringify(data) + '\n',
            () => {/*callback is required*/});
      })
      .catch(err => {
         if(debug_ >= LogLevel.important) console.log('emitSensorsData catch')
         socket.emit('periodic-data', { from: 'server', error: err, to: 'connectee' });
      });
}

function readHumiture() {
   return new Promise((resolve, reject) => {
      try {
         Humiture.read(11, 10, function(err, temperature, humidity) {
            if (!err) {
               // console.log(`temp: ${temperature}°C, humidity: ${humidity}%`)
               resolve({ temperature, humidity })
            }
            else {
               console.log({humitureReadError: err})
               reject(err)
            }
         });
      }
      catch (error) {
         console.log({humitureCatchError: error})
         reject(error)
      }
   });
}

function executePythonScript(codeFileName) {
   if(debug_ >= LogLevel.verbose) console.log({ msg:'executePythonScript() entered', path: `${__dirname}/pythonScript/${codeFileName}` })
   const pyProg = spawn('python', [`${__dirname}/pythonScript/${codeFileName}`]);
   return new Promise((resolve, reject) => {
      try {
         if(debug_ >= LogLevel.verbose) console.log({msg: 'executePythonScript() -> in promise'})
         pyProg.stdout.on('data', function(data) {
            if(debug_ >= LogLevel.verbose) console.log({msg: 'executePythonScript() -> data', data})
            let result = { data: data.toString() };
            resolve(result);
         });

         pyProg.stdout.on('error', function(err){
            console.log({msg: 'pyProg.stdout.on > error', err});
            reject(err);
         });
         pyProg.stdout.on('end', function(data){
            if(debug_ >= LogLevel.verbose) console.log({msg: 'pyProg.stdout.on > end', data});
            resolve({});
         });
      }
      catch(err) {
         console.log({execPythonError: err})
         reject(err)
      }
   });
}

function getPiHealthData() {
   if(debug_ >= LogLevel.verbose) console.log('getPiHealthData() entered')
   return new Promise((resolve, reject) => {
      exec('cat /proc/cpuinfo | grep Raspberry; echo "===Cpu temperature==="; cat /sys/class/thermal/thermal_zone0/temp; echo "===Gpu temperature==="; vcgencmd measure_temp; echo "===Memory Usage==="; free -h; echo "===Cpu Usage (top 5 processes)==="; ps -eo comm,pcpu,pmem,time,stat --sort -pcpu | head -6; echo "===Voltage condition (expected: 0x0)==="; dmesg | grep voltage; vcgencmd get_throttled;',
         (error, data) => {
            if(debug_ >= LogLevel.verbose) console.log({msg: 'getPiHealthData() > exec > callback', error})
            if(error) {
               console.error({errorOnPiHealthData: error})
               reject(error)
            }      
            else {
               resolve({piHealthData: data});
            }
         });
   });
}

function blinkLed(led, i) {
   var LED = new Gpio(17, 'out');
   LED.writeSync(OFF); // Turn off at server star.

   setTimeout(
      data => {
         data.led.writeSync(Number(!data.led.readSync()));
         if (data.i < 3)
            blinkLed(led, data.i + 1)
      },
      400,
      { led, i }
   );
}
