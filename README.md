# Working with Raspberry PI OS

## Installing OS on SD Card
* Install Raspberry PI OS Imager executable.
* Plug the card reader with the memory card to the computer.
* Run the Imager.
  > NOTE  
  > Don't mistakenly try the Raspberry PI with memory card to install the OS.

  > **How to choose the correct version of OS**
  > - If you use the OS headless (i.e. without monitor), then install the *lite* version. Otherwise Recommended version is good to go.
  > - If you want a bootable memory card to use in both 32bit and 64bit raspberry pi devices, then you have to install 32bit version of OS.
 * From Imager settings, enable hostname, SSH, Wifi, eventually configure everything.
 * Install entire *Remote Development* suite VSCode extensions to access and to do development in Raspberry PI.
 * Plug the memory card to Raspberry PI, connect to the computer usb, wait for a couple of minutes to load the OS.
 * Go to the Router admin panel and get the IP address of the RPI OS.
 * Start creating a new remote connection on the extension.
 * When prompted for ssh user@hostname, enter in that format `ssh -p 22 <os_username>@<rpi_ip_address>`.


## Install Node.js

Install Node.js from the NodeSource Repository, a third party service which resolves the installation process.

   ```
   curl -sL https://deb.nodesource.com/setup_<version>.x | sudo bash -
   ```
   
   ```
   sudo apt install nodejs
   ```

> NOTE  
> * Try avoiding the process of downloading installer, extracting etc. For new Linux users, it can be a mess.
> * ARMv6 processor is not supported by NodeSource; even for Node-v10.

### NodeJS Install Steps for ARMv61 processor (RPi Zero W)

1. Go to the unoffical builds download page of Node.js site and select the version of NodeJS you want to install. Copy the link of the ARMv6 version of NodeJS (Select the link with the .xz extension).

1. Download the file `wget <link>`.  
Example: `wget https://unofficial-builds.nodejs.org/download/release/v14.13.0/node-v14.13.0-linux-armv6l.tar.xz`

1. Extract the binary from the tarball file using the following command `tar xvfJ <file_name.tar.xz>`.  
Example `tar xvfJ node-v14.13.0-linux-armv6l.tar.xz`

1. Copy the contents of the extracted tarball file to the `usr/local` directory: `sudo cp -R <extracted tar folder>/* /usr/local`.  
Example: `sudo cp -R node-v14.13.0-linux-armv6l/* /usr/local`

1. Reboot and check everything is working correctly `node -v && npm -v`.

**Extra steps**

1. You might have to do the following if you receive a *command not found* error.
  First, open the `.profile` file using nano: `sudo nano ~/.profile`

1. Add the following line to the end of the file and hit Ctrl+X to save, and then hit 'y' and enter to confirm the changes: `PATH=$PATH:/usr/local/bin`.

1. Reboot and checck is it working.


## Install Git
```
sudo apt update
sudo apt install git
```

Enter the command below to verify the installation:
```
git --version
```

## Add command to execute on boot
* Open `/etc/rc.local` with root permission and commands before `exit` command.

Example
```
   node /home/pi/projects/raspberry-pi-projects/home-iot/app.js &
```
Example

## Restart network or the OS when connection is lost
* Create a shell script `/usr/local/bin/checkwifi.sh`.
   ```sh
   ping -c4 <router_ipv4> > /dev/null
 
   if [ $? != 0 ]
   then
     echo "No network connection, restarting wlan0"
     /sbin/ifdown 'wlan0'
     sleep 5
     /sbin/ifup --force 'wlan0'
   fi
   ```

   * Open the crontab editor by typing:
   ```sh
   crontab -e
   ```

   Add the following line:
   ```sh
   */5 * * * * /usr/bin/sudo -H /usr/local/bin/checkwifi.sh >> /dev/null 2>&1
   ```
   This will run the script in *checkwifi.sh* every 5 minutes, writing its output to `/dev/null` so it won't clog your syslog.

   * To reboot the PI, write the following script instead in *checkwifi.sh*:
   ```sh
   ping -c4 <router_ipv4> > /dev/null
    
   if [ $? != 0 ]
   then
     sudo /sbin/shutdown -r now
   fi
   ```

## Enable the 1-Wire Interface
*(Coutesy: circuitbasics.com)*  
We’ll need to enable the One-Wire interface before the Pi can receive data from the sensor. Once you’ve connected the DS18B20, power up your Pi and log in, then follow these steps to enable the One-Wire interface:

* At the command prompt, enter `sudo nano /boot/config.txt`, then add this to the bottom of the file:
```sh
dtoverlay=w1-gpio
```
If `dtoverlay=` is already there, doesn't matter; add one more at bottom.

* Exit *nano*, and reboot the Pi with `sudo reboot`.

* Log in to the Pi again, and at the command prompt enter `sudo modprobe w1-gpio`. Then enter `sudo modprobe w1-therm`.

* Change directories to the `/sys/bus/w1/devices` directory.

* Enter `ls` to list the devices. Something like `28-xxxxxxxxxxx w1_bus_master1` will be displayed.

* Go to `28-xxxxxxxxxxx` directory and type `cat w1_slave` to see the temperature value from sensor.


## TroubleShooting
* **Trouble**: Problem connecting to RPI with VSCode remote explorer with previous ssh config.  
  **Shoot**: Remove the previous ssh config from the computer. On Windows, generally it is stored in `os drive/users/<username>/.ssh/config`.


## Useful Notes
* Use `node` command to add a node.js app on device startup. Running with `npm` command will run an extra `npm` process.

* Installing Node.js with NodeSource will resolve the *ARM* architecture and other compatibilities and downloads the correct version of the Node.js distribution. So Node.js installed with one model Raspberry PI may not run on other model(s). Like RPI3 is ARMv71, so Node.js ARMv71 distribution has to be installed to run on that machine. But after that this installation will not run on RPI Zero W, which is ARMv61. ARMv61 distribution of Node.js has to be installed too.

## Useful Linux terminal commands

* Update & Upgrade PI OS
   ```
   sudo apt-get update
   sudo apt-get upgrade
   ```

   If problem occurred on upgrade, run this:
   ```
   sudo apt-get upgrade --fix-missing
   ```
 
* List current directory
   ```
   ls
   ```
* Make directory
   ```
   mkdir <dir_name>
   ```
* Remove non-empty directory:
   ```
   rm -r <dir_name>
   ```
* Remove all files of current directory, with recursive (-r) and force (-f) arguments:
   ```
   rm -r -f *.*
   ```
* Size of current directory  
   `-s` to display only the total size, `-h` to display sizes in a human-readable format.
   ```
   sudo du -sh
   ```
   Specific directory
   ```
   sudo du -sh /home/pi
   ```

* Open a file in terminal with *root* permission:
   ```
   sudo nano <file_name>
   ```

* Shutdown, reboot etc
   ```
   sudo shutdown -h now
   ```
   ```
   sudo reboot
   ```

* List running processes
   All processes
   ```
   ps -e
   ```

   Filtering processes
   ```
   ps -e | grep <partial_process_name> # example: ps -e | grep nod
   ```

   Real-time process listing by CPU usage
   ```
   top
   ```

* How to run a process in the background, permanently
   ```
   nohup <command_and_arguments> &
   ```
   `nohup` is short for "no hang-up". Ending '&' will run the command in the background.

* Run Tailscale vpn
   ```
   sudo tailscale up
   ```

* Raspberry PI OS configurations
   ```
   sudo rasp-config
   ```

* GPU temperature
   ```sh
   vcgencmd measure_temp
   ```

   Regular expression to get only the value:
   ```sh
   vcgencmd measure_temp | grep  -o -E '[[:digit:]].*'
   ```

* CPU Temperature
   ```sh
   cat /sys/class/thermal/thermal_zone0/temp
   ```

* Top 10 processes sorted by CPU usage. This will count the header line as one record, that's why `head -11`
   ```sh
   ps -eo comm,pcpu,pmem,time,stat --sort -pcpu | head -11
   ```

* Memory status
   ```sh
   free -h
   ```

* Cpu Information
   ```sh
   cat /proc/cpuinfo
   ```

  Use grep to filter information:
   ```sh
   cat /proc/cpuinfo | grep Model
   ```
   
* Check under-voltage warning:
   ```sh
   dmesg | grep voltage
   ```

   Also Cpu throttle status, good value is `0x0`:
   ```sh
   vcgencmd get_throttled
   ```

* Save any command output to a file `<command_and_arguments> > <file_name>`.
   Example:
   ```sh
   top -b -n1 > output.txt
   ```
   File will be saved in current directory.

* Wifi network information saved in `/etc/wpa_supplicant/wpa_supplicant.conf`.
   To add new network information, add following block of code at the end of the file:
   ```conf
   network={
      ssid="<ssid_name>"
      psk="<plain_text_password>"
   }
   ```
   > IMPORTANT
   > Don't use apostroph (') in wifi passwork.

* System log path `/var/log/messages`. Additionally enable watch dog to do vigorous logging.
