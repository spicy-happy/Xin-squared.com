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
  self.c=canvas.Canvas(str(out),pagesize=letter,invariant=1);self.c.setTitle('My Battle Creature - Ruleset 1 / Sheet S1');self.zones=[]
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
 s.text(6.15,.73,f'Ruleset {RULES["version"]} / Sheet {RULES["sheet"]}',11,width=1.85)
 s.text(.5,.94,'Draw your creature. Circle one choice in each type, stat, and move row.',11)
 s.box(.5,1.05,4.6,3.5,'creature drawing');s.text(2.8,1.28,'Draw your creature here',13,True,True)
 s.box(5.4,1.05,2,2,'trainer portrait');s.text(6.4,1.28,'Draw your trainer',12,True,True);s.text(6.4,2.86,'A drawing, not a photo',11,center=True)
 s.text(5.4,3.33,"Creature's name",12,True);s.line(5.4,3.67,2.6)
 s.text(5.4,3.94,'Trainer nickname',12,True);s.line(5.4,4.28,2.6);s.text(5.4,4.48,'Use a made-up name.',11)
 s.text(.5,4.78,'TYPE - circle one',13,True)
 for i,(kind,t) in enumerate(RULES['types'].items()):
  x=.5+i*1.25;s.box(x,4.9,1,.5,'type '+kind);s.icon(kind,x+.5,5.06);s.text(x+.5,5.3,t['label'],13,True,True,width=.96)
 s.text(.5,5.67,'STATS - circle one number in each row',13,True)
 for row,stat in enumerate(['Health','Attack','Defense','Speed']):
  y=5.83+row*.49;s.text(.5,y+.25,stat,12,True,width=1)
  for n in range(RULES['stats']['max']+1):
   x=1.65+n*.8;s.box(x,y,.55,.45,f'{stat} {n}');s.text(x+.275,y+.22,str(n),14,True,True)
   c.setFillColor(INK)
   for d in range(n):c.circle((x+.275+(d-(n-1)/2)*.067)*72,(11-y-.34)*72,1.25,fill=1,stroke=0)
 for i,text in enumerate(['Grown-up:','check the dots','add up to 10','before the photo.']):s.text(6.6,6.16+i*.22,text,11,bold=i==0,width=1.4)
 s.text(.5,8.0,'Count your dots:',11,True)
 for n in range(RULES['stats']['budget']):
  c.rect((1.82+n*.23)*72,(11-8.02)*72,.16*72,.16*72,stroke=1,fill=0)
 s.text(4.22,8,'Fill all 10 boxes = done!',11,width=3.7)
 for row,slot in enumerate(['regular','special','defense']):
  y=8.15+row*.75;s.icon(slot,.62,y+.15);s.text(.79,y+.19,slot.upper(),13,True,width=1.08)
  s.text(.5,y+.39,'Name (optional)',11,width=1.35);s.line(.5,y+.59,1.25)
  for i,(mid,move) in enumerate(RULES['moves'][slot].items()):
   x=1.9+i*1.55;s.box(x,y,1.3,.6,slot+' '+mid);s.text(x+.65,y+.2,move['label'],13,True,True,width=1.2)
   lines=simpleSplit(move['hint'],'Helvetica',11,1.16*72);assert len(lines)<=2,(mid,'hint too tall')
   for k,text in enumerate(lines):s.text(x+.65,y+.39+k*.15,text,11,center=True,width=1.16)
 s.text(.5,10.47,'Print at 100% / actual size. Photo: whole page, flat, good light, all 4 squares.',11,width=7.5)
 c.showPage();c.save();print(f'Created {out} ({len(s.zones)} checked field zones)')
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--out',type=Path,default=ROOT/'output/pdf/creature-sheet.pdf');args=parser.parse_args();args.out.parent.mkdir(parents=True,exist_ok=True);make(args.out)
