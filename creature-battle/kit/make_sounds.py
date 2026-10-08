"""Original short arcade effects: PCM WAVs, synthesized without external samples."""
import math, random, struct, wave
from pathlib import Path
RATE = 22050
OUT = Path(__file__).resolve().parents[1] / 'assets/sounds'
SCORES = {
 'button': [(880, 1320, .045, 'square')],
 'regular': [(420, 90, .18, 'square')],
 'special': [(220, 440, .09, 'square'), (440, 880, .09, 'square'), (880, 330, .12, 'square')],
 'hit': [(180, 40, .13, 'noise')],
 'heal': [(330, 330, .10, 'triangle'), (440, 440, .10, 'triangle'), (660, 660, .16, 'triangle')],
 'shield': [(660, 880, .12, 'triangle'), (880, 660, .12, 'triangle')],
 'switch': [(440, 220, .08, 'square'), (220, 660, .10, 'square')],
 'faint': [(330, 80, .30, 'triangle')],
 'win': [(523,523,.14,'square'), (659,659,.14,'square'), (784,784,.14,'square'), (1047,1047,.28,'triangle'), (880,880,.14,'square'), (988,988,.14,'square'), (1047,1047,.42,'triangle')],
}
def generate():
 OUT.mkdir(parents=True, exist_ok=True)
 for name, notes in SCORES.items():
  data = bytearray(); rng = random.Random(731); phase = 0
  for start, end, duration, shape in notes:
   count = round(RATE * duration)
   for i in range(count):
    t = i / count; frequency = start + (end-start)*t; phase = (phase+frequency/RATE)%1
    sample = 1 if phase < .5 else -1
    if shape == 'triangle': sample = 1-4*abs(phase-.5)
    if shape == 'noise': sample = .7*rng.uniform(-1,1)+.3*sample
    envelope = min(1, i/(RATE*.004), (count-i)/(RATE*.016))
    data.extend(struct.pack('<h', round(sample*envelope*.22*32767)))
  with wave.open(str(OUT / (name+'.wav')), 'wb') as wav:
   wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(RATE); wav.writeframes(data)
if __name__ == '__main__': generate()
