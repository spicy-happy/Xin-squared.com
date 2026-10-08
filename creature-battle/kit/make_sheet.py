#!/usr/bin/env python3
"""Generate the printable S1 prototype sheet from the live rules.
Requires reportlab and opencv-contrib-python-headless; run from any directory.
ArUco vector drawing adapted from doodle-dash/kit/make_pdf.py, IDs 30-33.
"""
import argparse, json, math
from pathlib import Path
import cv2
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import simpleSplit
ROOT=Path(__file__).resolve().parents[1]
RULES=json.loads((ROOT/'data/rules-v1.json').read_text())
INK='#2b2b33'
class Sheet:
 def __init__(self,out):
  self.c=canvas.Canvas(str(out),pagesize=letter,invariant=1);self.c.setTitle('My Battle Creature');self.zones=[]
 def box(self,x,y,w,h,label):
  assert x>=.5 and y>=.5 and x+w<=8.01 and y+h<=10.51,(label,'outside print area')
  for a,b,c,d,n in self.zones:
   assert x+w<=a or a+c<=x or y+h<=b or b+d<=y,(label,'overlaps',n)
  self.zones.append((x,y,w,h,label));self.c.setStrokeColor(INK);self.c.setLineWidth(1.1);self.c.roundRect(x*72,(11-y-h)*72,w*72,h*72,6,stroke=1,fill=0)
 def text(self,x,y,text,size=11,bold=False,center=False,width=None):
  font='Helvetica-Bold' if bold else 'Helvetica';self.c.setFont(font,size);self.c.setFillColor(INK)
  if width is not None:assert self.c.stringWidth(text,font,size)<=width*72,(text,'overflows')
  (self.c.drawCentredString if center else self.c.drawString)(x*72,(11-y)*72,text)
 def line(self,x,y,w):
  self.c.setStrokeColor(INK);self.c.setLineWidth(.8);self.c.line(x*72,(11-y)*72,(x+w)*72,(11-y)*72)
 def marker(self,mid,x,y,size=.35):
  dictionary=cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
  cells=cv2.aruco.generateImageMarker(dictionary,mid,6);cell=size/6
  self.c.setFillColor('black');self.c.rect(x*72,(11-y-size)*72,size*72,size*72,fill=1,stroke=0)
  self.c.setFillColor('white');path=self.c.beginPath()
  for row in range(6):
   for col in range(6):
    if cells[row,col]>127:path.rect((x+col*cell)*72,(11-y-(row+1)*cell)*72,cell*72,cell*72)
  self.c.drawPath(path,fill=1,stroke=0)
 def icon(self,kind,x,y,size=.18):
  c=self.c;c.saveState();c.translate(x*72,(11-y)*72);s=size*72;c.setStrokeColor(INK);c.setFillColor(INK);c.setLineWidth(1.1)
  p=c.beginPath()
  shapes={
   'fire':[(0,-.4),(-.4,0),(-.1,.6),(.1,.2),(.3,.5),(.4,-.1)],
   'water':[(0,.6),(-.35,-.1),(-.2,-.4),(.2,-.4),(.35,-.1)],
   'grass':[(-.35,-.4),(-.4,.2),(.4,.5),(.3,-.3)],
   'electric':[(.1,.6),(-.4,-.1),(0,-.1),(-.1,-.6),(.4,.1),(0,.1)],
   'ground':[(-.6,-.4),(-.1,.5),(.1,.1),(.3,.4),(.6,-.4)],
   'flying':[(-.5,-.3),(-.2,.4),(.5,.5),(.2,-.2)],
   'regular':[(math.cos(i*math.pi/4)*(.55 if i%2==0 else .2),math.sin(i*math.pi/4)*(.55 if i%2==0 else .2)) for i in range(8)],
   'special':[(0,.5),(.5,0),(0,-.5),(-.5,0)],
   'defense':[(math.cos(i*math.pi/3)*.5,math.sin(i*math.pi/3)*.5) for i in range(6)]}
  for i,(a,b) in enumerate(shapes[kind]):(p.moveTo if i==0 else p.lineTo)(a*s,b*s)
  p.close();c.drawPath(p,fill=0,stroke=1);c.restoreState()
def make(out):
 s=Sheet(out);c=s.c
 for mid,x,y in [(30,.08,.08),(31,8.07,.08),(32,8.07,10.57),(33,.08,10.57)]:s.marker(mid,x,y)
 s.text(.5,.73,'MY BATTLE CREATURE',20,True);
 s.box(.5,.95,4.6,3.6,'creature drawing');s.text(2.8,1.18,'Draw your creature here',13,True,True)
 s.box(5.4,.95,2.6,2.6,'trainer portrait');s.text(6.7,1.18,'Draw your trainer',12,True,True)
 s.text(5.4,3.94,"Creature's name",12,True);s.line(5.4,4.28,2.6)
 s.text(.5,4.78,'TYPE - circle one',13,True)
 for i,(kind,t) in enumerate(RULES['types'].items()):
  x=.5+i*1.25;s.box(x,4.9,1,.5,'type '+kind);s.icon(kind,x+.5,5.06);s.text(x+.5,5.3,t['label'],13,True,True,width=.96)
 s.text(.5,5.67,'STATS - 10 dots max',13,True)
 for row,stat in enumerate(['Health','Attack','Defense','Speed']):
  y=5.83+row*.49;s.text(.5,y+.25,stat,12,True,width=1)
  for n in range(RULES['stats']['max']+1):
   x=1.65+n*.8;s.box(x,y,.55,.45,f'{stat} {n}');s.text(x+.275,y+.22,str(n),14,True,True)
   c.setFillColor(INK)
   for d in range(n):c.circle((x+.275+(d-(n-1)/2)*.067)*72,(11-y-.34)*72,1.25,fill=1,stroke=0)
 s.text(.5,8.05,'ATTACKS: Select 3',15,True)
 s.text(.5,8.29,'Choose any 3 from the options below.',11)
 # One shared grid: choices are not constrained to the old move categories.
 moves=[move for slot in RULES['moves'].values() for move in slot.values()]
 for i,move in enumerate(moves):
  x=.5+(i%4)*1.9333333333;y=8.46+(i//4)*.67
  s.box(x,y,1.7,.57,'attack '+move['label']);s.text(x+.85,y+.21,move['label'],13,True,True,width=1.55)
  lines=simpleSplit(move['hint'],'Helvetica',11,1.5*72);assert len(lines)<=2,(move['label'],'hint too tall')
  for k,text in enumerate(lines):s.text(x+.85,y+.39+k*.14,text,11,center=True,width=1.5)
 c.showPage();c.save();print(f'Created {out} ({len(s.zones)} checked field zones)')
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--out',type=Path,default=ROOT/'output/pdf/creature-sheet.pdf');args=parser.parse_args();args.out.parent.mkdir(parents=True,exist_ok=True);make(args.out)
