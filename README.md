# whats-up-home-iot-machine-app
A Node app runs in Raspberry PI, checks for light data to switch on/off the room light. 
Also turns off the light on sleep time. Light and temperature data collected from the 
sensors using Python scripts.

## Devices
* Development in model `3 B+`.
* Deployed in model `Zero W`.
* Sensors: Photoresistor, Thermistor
* Circuitry: Optocoupler, Bridge rectifier

## Required packages
**Python Packages**  
* `pip3`: to install python3 packages.
* `smbus2`
* `PCF8591`: ADC driver code file.

**Node Packages**  
* `onoff`
* `firebase`




### Note
When asked for password when pushing, use access token in keep, until the token is set in Git locally.
