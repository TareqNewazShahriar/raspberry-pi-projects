# Working with Raspberry PI OS

## Installing OS on SD Card
* Install Raspberry PI 
* Use a memory card to 

## Update & Upgrade PI OS
`sudo apt-get update`

`sudo apt-get upgrade`

`sudo apt-get upgrade --fix-missing`

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
