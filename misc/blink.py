#import Pi GPIO and time modules
import RPi.GPIO as GPIO
import time

#set up GPIO numbering and turn off warnings (don't worry if you don't understand this right now)
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(True)

#set up which pin to control the LED from and set it to output
ledPin = 26
GPIO.setup(ledPin, GPIO.OUT)

for i in range(5):
    print("LED turning on")
    GPIO.output(ledPin, GPIO.HIGH)
    time.sleep(0.5)
    print("LED turning off")
    GPIO.output(ledPin, GPIO.LOW)
    time.sleep(0.5)
