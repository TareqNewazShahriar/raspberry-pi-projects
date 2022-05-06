from signal import signal, SIGTERM, SIGHUP, pause
from rpi_lcd import LCD

lcd = LCD(address=0x27)

def safe_exit(signum, frame):
   exit(1)

signal(SIGTERM, safe_exit)
signal(SIGHUP, safe_exit)

try:
   lcd.text('Hello Raspberry Pi 3', 1)
   pause()
except KeyboardInterrupt:
   pass
finally:
   lcd.clear()
