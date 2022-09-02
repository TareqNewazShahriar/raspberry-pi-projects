# Working with Raspberry PI OS

## Installing OS on SD Card
* Install Raspberry PI OS Imager executable.
* Plug the card reader with memoery card to computer.
* Run the Imager.
  > NOTE  
  > Don't mistakenly try raspberyy pi with memory card to install the OS.
  
  > **How to choose the correct version of OS**
  > - If you use the OS headless (i.e. without monitor), then install the *lite* version. Otherwise Recommended verion is good to go.
  > - If you want to the bootable memoery card to use in both 32bit and 64bit raspberry pi device, then you have to install 32bit version of OS.
 * From Imager settings, enable hostname, SSH, Wifi, eventually configure everything.
 * Install entire *Remote Development* suite VSCode extensions to access and to do development in Raspberry PI.
 * Plug memory card to Raspberry PI, connect to computer usb, wait for couple of minutes to load the OS.
 * Go to Router admin panel and get the IP address of the RPI OS.
 * Start creating a new remote connection on the extension.
 * When prompt for ssh user@hostname, enter in that format `ssh -p 22 <os_username>@<rpi_ip_address>`.


### TroubleShooting
* **Trouble: Problem connecting to RPI with VSCode remote explorer with previous ssh config.**  
  Shoot: Remote the previous ssh config from computer.


## Install Node.js

Install Node.js from the NodeSource Repository, a third party service which resolves the installationg process.

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

## Useful Linux terminal commands

* Update & Upgrade PI OS
   ```
   sudo apt-get update
   sudo apt-get upgrade
   ```

      if problem occurred on upgrade, run this:
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
* Remove all files of current direcoty, with
   ```
   rm -r -f *.*
   ```
* Size of current direcotory  
   `-s` display only the total size, `-h` display sizes in a human-readable format.
   ```
   sudo du -sh 
   ```
   Specific directory
   ```
   sudo du -sh /home/pi
   ```
