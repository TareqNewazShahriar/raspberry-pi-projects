# raspberry-pi-projects
All of my projects, test codes using raspberry PI (PI 3, Zero W)

## Install Packages
Install **onoff** package globally. It will be used by all Node projects.
```
npm i -g onoff
```

## Run Node.js projects

* Go to project app directory and install dependencies
   ```
   npm i
   ```

* Run the app
   ```
   npm start
   ```

## Useful Notes
* Connect ds18b20 (1-wire digital temperature sensor) to GPIO4 (GPCLK0) pin. Any general pin, like GPIO17 will not work.

