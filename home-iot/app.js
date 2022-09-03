const http = require('http').createServer(handler);
const fs = require('fs'); //require filesystem module
const Gpio = require('onoff').Gpio; //include onoff to interact with the GPIO
const Humiture = require('node-dht-sensor');
const io = require('socket.io')(http) //require socket.io module and pass the http object (server)

let _port = 8080
http.listen(_port);
console.log(`Server is listening to port ${_port}...`);

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

   fs.readFile(__dirname + '/public/index.html', function (err, data) { //read file index.html in public folder
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

const DELAY = 1000 * 5
const ON = 1;
const OFF = 0;
var LED = new Gpio(17, 'out');
LED.writeSync(OFF); // Turn off at server star.

io.sockets.on('connection', function (socket) { // WebSocket Connection
   console.log('socket connection established. LED status', LED.readSync());
   socket.emit('light', { from: 'server', val: LED.readSync(), to: 'connectee' });
   broadcastHumitureData(socket);
   setInterval(broadcastHumitureData, DELAY, socket);
   blinkLed(LED, 0);

   socket.on('light', function (data) { //get light switch status from client
      val = data.val | 0; // make it a number
      console.log('message from "light" event. val:', data); //turn LED on or off, for now we will just show it in console.log
      LED.writeSync(val);
      if (data.from != 'server')
         socket.broadcast.emit('light', { from: 'server', val: data.val, to: 'braodcast' }); // broadcast to all connected sites about the change
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

function broadcastHumitureData(socket) {
   readHumiture()
      .then(reading => socket.emit('humiture', { from: 'server', val: reading, to: 'broadcast' }))
      .catch(err => socket.emit('humiture', { from: 'server', error: err, to: 'broadcast' }));
}

function readHumiture() {
   return new Promise((resolve, reject) => {
      try {
         Humiture.read(11, 4, function(err, temperature, humidity) {
            if (!err) {
              // console.log(`temp: ${temperature}°C, humidity: ${humidity}%`)
              resolve({temperature, humidity})
            }
            else {
               reject(err)
            }
         });
      }
      catch (error) {
         reject(error)
      }
   });
}
