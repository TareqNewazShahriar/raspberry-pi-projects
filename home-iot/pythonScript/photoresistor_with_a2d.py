import lib.PCF8591 as ADC

def getPhotoresistor():
   ADC.setup(0x48)
   return ADC.read(2)

if __name__ == '__main__':
   try:
      print(getPhotoresistor())
   except KeyboardInterrupt:
      pass
