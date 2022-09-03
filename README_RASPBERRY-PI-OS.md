# Working with Raspberry PI OS

## Installing OS on SD Card
* Install Raspberry PI OS Imager executable.
* Plug the card reader with the memory card to the computer.
* Run the Imager.
  > NOTE  
  > Don't mistakenly try raspberry pi with memory card to install the OS.

  > **How to choose the correct version of OS**
  > - If you use the OS headless (i.e. without monitor), then install the *lite* version. Otherwise Recommended version is good to go.
  > - If you want a bootable memory card to use in both 32bit and 64bit raspberry pi device, then you have to install 32bit version of OS.
 * From Imager settings, enable hostname, SSH, Wifi, eventually configure everything.
 * Install entire *Remote Development* suite VSCode extensions to access and to do development in Raspberry PI.
 * Plug the memory card to Raspberry PI, connect to the computer usb, wait for couple of minutes to load the OS.
 * Go to the Router admin panel and get the IP address of the RPI OS.
 * Start creating a new remote connection on the extension.
 * When prompted for ssh user@hostname, enter in that format `ssh -p 22 <os_username>@<rpi_ip_address>`.


### TroubleShooting
* **Trouble: Problem connecting to RPI with VSCode remote explorer with previous ssh config.**  
  Shoot: Remote the previous ssh config from the computer.


## Install Node.js

Install Node.js from the NodeSource Repository, a third party service which resolves the installation process.

   ```
   curl -sL https://deb.nodesource.com/setup_<version>.x | sudo bash -
   ```
   
   ```
   sudo apt install nodejs
   ```

> NOTE  
> *Try avoiding the process of downloading installer, extracting etc.*

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
* Open `/etc/rc.local` with root permission.
* Add Node command with full path; then save and exit.

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

* Top 10 processes based on Cpu usage:
   ```sh
   ps -eo comm,pcpu,pmem,time,stat --sort -pcpu | head -10
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
   