import lib.PCF8591 as ADC
import math

def setup():
   ADC.setup(0x48)

def getTemperature():
   analogVal = ADC.read(1)
   Vr = 5 * float(analogVal) / 255
   Rt = 10000 * Vr / (5 - Vr)
   exp = 0 if Rt == 0 else ((math.log(Rt / 10000)) / 3950)
   # print('analogVal', analogVal, 'Rt: ', Rt, 'exp', exp)
   temp = 1/(exp + (1 / (273.15+25)))
   temp = temp - 273.15
   return temp

if __name__ == '__main__':
   try:
      setup()
      print(getTemperature())
   except KeyboardInterrupt:
      pass
