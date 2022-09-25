const { exec } = require('child_process')
const http = require('http').createServer(handler);
const fs = require('fs'); //require filesystem module
const io = require('socket.io')(http) //require socket.io module and pass the http object (server)
const Gpio = require('onoff').Gpio; //include onoff to interact with the GPIO
const Humiture = require('node-dht-sensor');

let _port = 8081
http.listen(_port)
console.log(`Server is listening to port ${_port}...`)

process.on('warning', e => console.warn(e.stack));
process.on('SIGINT', function () { //on ctrl+c
   LED.writeSync(OFF);
   LED.unexport(); // Unexport LED GPIO to free resources
   process.exit(); //exit completely
});

function handler(req, res) {
   let exit = req.url && req.url.toLowerCase().includes('exit');
   if (exit) {
      console.log('Exiting...')
      try {
         process.exit();
      }
      catch (err) {
         console.log('Error on exit', err);
      }
   }

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

const DELAY = 5 * 1000
const ON = 1;
const OFF = 0;
var LED = new Gpio(17, 'out');
LED.writeSync(OFF); // Turn off at server star.

io.sockets.on('connection', function (socket) { // WebSocket Connection
   console.log('socket connection established.');
   socket.emit('light', { from: 'server', val: LED.readSync(), to: 'connectee' });
   
   fs.mkdir(__dirname + '/output', () => {/*callback is required*/});
   
   emitSensorsData(socket);
   setInterval(emitSensorsData, DELAY, socket);
   blinkLed(LED, 0);

   socket.on('light', function (data) { //get light switch status from client
      val = data.val | 0; // make it a number
      //console.log('message from "light" event. val:', data); //turn LED on or off, for now we will just show it in console.log
      LED.writeSync(val);
      if (data.from != 'server')
         socket.broadcast.emit('light', { from: 'server', val: data.val, to: 'braodcast' }); // broadcast to all connected sites about the change
   });

   socket.on('pi-stat', function (data) {
      getPiHealthData()
         .then(statInfo => socket.emit('pi-stat', { from: 'server', val: statInfo, to: 'connectee' }))
         .catch(err => socket.emit('pi-state', { from: 'server', error: err, to: 'connectee' }));
   });
});

function blinkLed(led, i) {
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

function emitSensorsData(socket) {
   Promise.allSettled([readHumiture(), executePython(), getPiHealthData()])
      .then(results => {
         let data = {
            val: {
               ...(results[0].value || {}),
               ...(results[1].value || {}),
               ...(results[2].value || {})
            },
            errors: [results[0].reason, results[1].reason, results[2].reason].filter(x => !!x),
            from: 'server',
            to: 'connectee',
            time: new Date().toLocaleString(),
            success: undefined
         }
         data.success = !data.errors.length;
         
         socket.emit('periodic-data', data);
         
         // Log in file
         fs.appendFile(__dirname + '/output/temperature.log',
            JSON.stringify(data) + '\n',
            () => {/*callback is required*/});
      })
      .catch(err => socket.emit('periodic-data', { from: 'server', error: err, to: 'connectee' }));
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
               console.log({humitureError: err})
               reject(err)
            }
         });
      }
      catch (error) {
         console.log({humitureError: error})
         reject(error)
      }
   });
}

function getPiHealthData() {
   return new Promise((resolve, reject) => {
      exec('cat /proc/cpuinfo | grep Raspberry; echo "===Cpu temperature==="; cat /sys/class/thermal/thermal_zone0/temp; echo "===Gpu temperature==="; vcgencmd measure_temp; echo "===Memory Usage==="; free -h; echo "===Cpu Usage (top 5 processes)==="; ps -eo comm,pcpu,pmem,time,stat --sort -pcpu | head -6; echo "===Voltage condition (expected: 0x0)==="; dmesg | grep voltage; vcgencmd get_throttled;',
         (error, stdout) => {
            if(error) {
               console.error({errorOnPiHealthData: error})
               reject(error)
            }      
            else {
               resolve({piHealthData: stdout});
            }
         });
   });
}

function executePython() {
   const { spawn } = require('child_process');
   const pyProg = spawn('python', ['./../misc/thermistor_with_a2d.py']);
   return new Promise((resolve, reject) => {
      try {
         pyProg.stdout.on('data', function(data) {
            let result = { thermistor: parseFloat(data.toString()) };
            resolve(result);
         });
      }
      catch(err) {
         console.log({execPythonError: err})
         reject(err)
      }
   });
}
