import { playSound } from './audio.js';
// Presentation only: timings and particles never draw from the battle RNG.
export const moveAnimations={
 steady:'tackle',quick:'quick-strike',pierce:'piercing-jab',heavy:'body-slam',
 blast:'energy-burst',risky:'wild-blast',recoil:'double-rush',overload:'mega-burst',
 guard:'bubble-shield',heal:'healing-glow',toughen:'iron-hide',struggle:'struggle'
};
export function battleJuice({panels,fx,scenery,active}){
 const animations=new Set(),nodes=new Set();let disposed=false,lastMove=null;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 function play(node,frames,duration=280,delay=0,easing='steps(10,end)'){
  if(disposed||reduced())return Promise.resolve();
  const animation=node.animate(frames,{duration,delay,easing,fill:'none'});animations.add(animation);
  return animation.finished.catch(()=>{}).finally(()=>animations.delete(animation));
 }
 function point(side){const r=panels[side].img.getBoundingClientRect(),a=fx.getBoundingClientRect();return {x:Math.round(r.x+r.width/2-a.x),y:Math.round(r.y+r.height*.65-a.y),size:r.width};}
 function particle(kind,side,p=point(side),size=12){
  const node=document.createElement('div');node.className=`juice-fx ${kind} type-${active(side).type}`;
  node.style.cssText=`left:${p.x}px;top:${p.y}px;width:${size}px;height:${size}px;`;fx.append(node);nodes.add(node);return node;
 }
 function ephemeral(node,frames,duration=300,delay=0){return play(node,frames,duration,delay).finally(()=>{node.remove();nodes.delete(node);});}
 function burst(side,kind='juice-pixel',count=8,radius=40,inward=false){
  const p=point(side);return Promise.all(Array.from({length:count},(_,i)=>{
   const angle=i*Math.PI*2/count,dx=Math.round(Math.cos(angle)*radius/4)*4,dy=Math.round(Math.sin(angle)*radius/4)*4;
   const node=particle(kind,side,p,kind==='juice-star'?16:8);
   return ephemeral(node,inward?[{transform:`translate(${dx}px,${dy}px) scale(.5)`,opacity:0},{opacity:1,offset:.3},{transform:'translate(0,0) scale(1)',opacity:0}]:[{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.5)`,opacity:0}],360,i*12);
  }));
 }
 function ring(side,kind='juice-ring',size=48,delay=0){const p=point(side);if(kind==='juice-ground-ring')p.y+=p.size*.35;const node=particle(kind,side,p,size);return ephemeral(node,[{transform:'translate(-50%,-50%) scale(.3)',opacity:.8},{transform:'translate(-50%,-50%) scale(1.5)',opacity:0}],360,delay);}
 function shadow(side,frames,duration){return play(panels[side].fighter.querySelector('.pixel-shadow'),frames,duration);}
 async function hop(side,out=false){
  if(disposed||reduced())return;const dir=side===0?1:-1,img=panels[side].img,distance=Math.min(120,point(side).size),compact=panels[side].stage.clientHeight<140,rise=compact?-12:-40;
  const frames=out?[
   {transform:'translate(0,0) scale(1,1)',opacity:1},
   {transform:'translate(0,4px) scale(1.18,.78)',offset:.2,opacity:1},
   {transform:`translate(${-dir*distance/2}px,${rise}px) scale(${compact?'.82,.85':'.82,1.14'})`,offset:.65,opacity:.8},
   {transform:`translate(${-dir*distance}px,-12px) scale(.6,.9)`,opacity:0}
  ]:[
   {transform:`translate(${-dir*distance}px,${rise}px) scale(${compact?'.82,.85':'.82,1.16'})`,opacity:0},
   {transform:`translate(${-dir*distance*.4}px,${rise}px) scale(${compact?'.9,.9':'.9,1.1'})`,opacity:1,offset:.35},
   {transform:'translate(0,4px) scale(1.22,.76)',offset:.7,opacity:1},
   {transform:'translate(0,-8px) scale(.9,1.12)',offset:.86,opacity:1},
   {transform:'translate(0,0) scale(1,1)',opacity:1}
  ];
  await Promise.all([play(img,frames,out?340:540),shadow(side,[{transform:'scale(.65)',opacity:.2},{transform:'scale(1.12)',opacity:.8,offset:.7},{transform:'scale(1)',opacity:1}],out?340:540),out?Promise.resolve():burst(side,'juice-dust',6,32)]);
 }
 async function dash(side,style){
  const img=panels[side].img,dir=side===0?1:-1,source=point(side),target=point(1-side);
  const distance=Math.max(24,Math.abs(target.x-source.x)-source.size*.65)*dir;
  const compact=panels[side].stage.clientHeight<140;
  const duration=style==='quick-strike'?400:style==='body-slam'?660:style==='double-rush'?650:480;
  let frames;
  if(style==='body-slam')frames=[{transform:'translate(0,0)'},{transform:`translate(${-dir*8}px,6px) scale(1.2,.72)`,offset:.2},{transform:`translate(${distance*.5}px,${compact?-20:-48}px) scale(${compact?'.72,.72':'.85,1.15'})`,offset:.45},{transform:`translate(${distance}px,4px) scale(1.25,.8)`,offset:.65},{transform:`translate(0,${compact?-4:-10}px) scale(.92,1.08)`,offset:.88},{transform:'translate(0,0)'}];
  else if(style==='double-rush')frames=[{transform:'translate(0,0)'},{transform:`translate(${-dir*8}px,4px) scale(1.18,.82)`,offset:.15},{transform:`translate(${distance}px,-12px) scale(1.2,.85)`,offset:.4},{transform:`translate(${distance*.5}px,${compact?-8:-24}px) scale(${compact?'.85,.9':'.9,1.12'})`,offset:.58},{transform:`translate(${distance}px,0) scale(1.15,.9)`,offset:.75},{transform:'translate(0,0)'}];
  else frames=[{transform:'translate(0,0)'},{transform:`translate(${-dir*12}px,4px) scale(1.14,.82)`,offset:.25},{transform:`translate(${distance}px,-8px) scale(${style==='piercing-jab'?1.3:1.18},.86)`,offset:.52},{transform:`translate(${distance*.75}px,0) scale(.88,1.12)`,offset:.68},{transform:`translate(${-dir*4}px,0) scale(1.06,.94)`,offset:.9},{transform:'translate(0,0)'}];
  const jobs=[play(img,frames,duration),shadow(side,[{transform:'scale(1)'},{transform:`translateX(${distance*.75}px) scale(.75)`,opacity:.4,offset:.52},{transform:'scale(1)',opacity:1}],duration)];
  if(style==='quick-strike')for(let i=0;i<3;i++){
   const ghost=particle('juice-afterimage',side,source,source.size);ghost.style.backgroundImage=`url("${img.src}")`;
   jobs.push(ephemeral(ghost,[{transform:'translate(-50%,-65%)',opacity:.35},{transform:`translate(calc(-50% + ${distance*(.25+i*.15)}px),-65%)`,opacity:0}],280,70+i*45));
  }
  if(style==='piercing-jab'){
   const slash=particle('juice-jab',side,target,48);jobs.push(ephemeral(slash,[{transform:`translate(-50%,-50%) scaleX(.1)`,opacity:0},{transform:'translate(-50%,-50%) scaleX(1.4)',opacity:1,offset:.5},{transform:'translate(-50%,-50%) scaleX(.4)',opacity:0}],220,220));
  }
  if(style==='body-slam')jobs.push(ring(1-side,'juice-ground-ring',64,320));
  if(style==='struggle')jobs.push(burst(side,'juice-dust',4,24));
  await Promise.all(jobs);
 }
 async function projectile(side,style){
  const img=panels[side].img,source=point(side),target=point(1-side),dir=side===0?1:-1,big=style==='mega-burst';
  await Promise.all([play(img,[{transform:'scale(1)'},{transform:'translateY(4px) scale(1.16,.8)',offset:.6},{transform:`translate(${-dir*8}px,0) scale(.88,1.16)`}],big?420:260),burst(side,'juice-pixel',big?12:6,big?64:36,true),ring(side,'juice-charge',big?72:40)]);
  if(disposed)return;
  const jobs=[play(img,[{transform:'scale(.9,1.1)'},{transform:`translate(${-dir*12}px,0) scale(1.12,.9)`,offset:.3},{transform:'scale(1)'}],360)];
  const count=style==='wild-blast'?3:1;
  for(let i=0;i<count;i++){
   const orb=particle(`projectile ${big?'juice-mega':style==='wild-blast'?'juice-wild':'juice-energy'}`,side,source,big?40:style==='wild-blast'?20:24),dy=count===1?0:(i-1)*28;
   jobs.push(ephemeral(orb,[{transform:'translate(-50%,-50%) scale(.6)',opacity:1},{transform:`translate(${target.x-source.x-12}px,${target.y-source.y+dy-12}px) scale(${big?1.5:1})`,opacity:1,offset:.82},{transform:`translate(${target.x-source.x-12}px,${target.y-source.y+dy-12}px) scale(1.7)`,opacity:0}],big?420:320,i*50));
  }
  await Promise.all(jobs);
 }
 function shake(strength){
  const frames=[{transform:'translate(0,0)'},{transform:`translate(${-strength}px,2px)`,offset:.2},{transform:`translate(${strength}px,-2px)`,offset:.4},{transform:`translate(${-Math.max(2,strength-2)}px,0)`,offset:.65},{transform:'translate(0,0)'}];
  return Promise.all([scenery,...panels.map(p=>p.stage),fx].map(node=>play(node,frames,240,0,'steps(1,end)')));
 }
 function flash(){const node=particle('juice-flash',0,{x:0,y:0},1);return ephemeral(node,[{opacity:0},{opacity:.24,offset:.25},{opacity:0}],180);}
 async function effect(e,onImpact){
  if(e.t==='use'){lastMove=moveAnimations[e.moveId]??'tackle';fx.dataset.move=lastMove;}
  if(disposed||reduced()){if(!disposed)onImpact?.();return;}
  const side=e.t==='hit'?e.target:e.side,img=panels[side]?.img;
  if(e.t==='use'){
   await Promise.all([play(img,[{transform:'scale(1)'},{transform:`translate(${e.side===0?-8:8}px,4px) scale(1.14,.82)`,offset:.65},{transform:'scale(1)'}],300),['energy-burst','wild-blast','mega-burst'].includes(lastMove)?ring(e.side,'juice-charge',lastMove==='mega-burst'?72:40):Promise.resolve()]);
  }else if(['enter','switch'].includes(e.t))await hop(e.side);
  else if(e.t==='hit'||e.t==='recoil'){
   const strength=e.t==='recoil'?2:e.crit||lastMove==='mega-burst'?6:lastMove==='body-slam'||lastMove==='wild-blast'?4:2;
   const launch=e.t==='hit'?( ['energy-burst','wild-blast','mega-burst'].includes(lastMove)?projectile(e.side,lastMove):dash(e.side,lastMove)):Promise.resolve();
   const impact=async()=>{
    if(e.t==='hit')await play(fx,[{opacity:1},{opacity:1}],['energy-burst','wild-blast','mega-burst'].includes(lastMove)?lastMove==='mega-burst'?760:560:lastMove==='body-slam'?420:lastMove==='double-rush'?280:240);
    if(disposed)return;onImpact?.();playSound('hit');
    await Promise.all([play(img,[{transform:'scale(1)',filter:'brightness(1)'},{transform:'scale(1)',offset:.15,filter:'brightness(1.8)'},{transform:`translate(${side===0?-8:8}px,2px) scale(.8,1.15)`,offset:.32,filter:'brightness(1.4)'},{transform:'translate(0,-4px) scale(1.12,.9)',offset:.65,filter:'brightness(1)'},{transform:'scale(1)',filter:'brightness(1)'}],360),shake(strength),flash(),burst(side,lastMove==='piercing-jab'?'juice-shard':'juice-star',e.crit?10:6,36),e.t==='hit'&&lastMove==='mega-burst'?ring(side,'juice-ring',80):Promise.resolve()]);
   };
   await Promise.all([launch,impact()]);
  }else if(e.t==='miss')await Promise.all([['energy-burst','wild-blast','mega-burst'].includes(lastMove)?projectile(e.side,lastMove):dash(e.side,lastMove),play(panels[1-e.side].img,[{transform:'translate(0,0)'},{transform:`translate(${e.side===0?24:-24}px,-12px) scale(.9,1.08)`,offset:.45},{transform:'translate(0,0)'}],400,380)]);
  else if(e.t==='heal')await Promise.all([play(img,[{transform:'scale(1)',filter:'brightness(1)'},{transform:'translateY(-8px) scale(.94,1.06)',filter:'brightness(1.25)'},{transform:'scale(1)',filter:'brightness(1)'}],480),burst(side,'juice-heart',7,48),ring(side,'juice-heal-ring',64)]);
  else if(e.t==='shieldUp'){
   const bubble=particle('juice-bubble',side,point(side),point(side).size*1.15);
   await Promise.all([ephemeral(bubble,[{transform:'translate(-50%,-60%) scale(.3)',opacity:0},{transform:'translate(-50%,-60%) scale(1.12,.9)',opacity:.8,offset:.5},{transform:'translate(-50%,-60%) scale(.94,1.06)',opacity:.7,offset:.75},{transform:'translate(-50%,-60%) scale(1)',opacity:0}],560),burst(side,'juice-bubble-small',6,48)]);
  }else if(e.t==='toughen'){
   const plate=particle('juice-armor',side,point(side),point(side).size*.9);
   await Promise.all([ephemeral(plate,[{transform:'translate(-50%,-50%) scaleY(.2)',opacity:0},{transform:'translate(-50%,-50%) scaleY(1)',opacity:.7,offset:.5},{transform:'translate(-50%,-50%) scale(1.15)',opacity:0}],480),burst(side,'juice-shard',8,40),play(img,[{transform:'scale(1)'},{transform:'scale(1.15,.88)'},{transform:'scale(1)'}],400)]);
  }else if(e.t==='shieldBreak')await burst(side,'juice-shard',10,64);
  else if(e.t==='hangOn')await Promise.all([ring(side,'juice-last-chance',72),play(img,[{transform:'scale(1)'},{transform:'translateY(3px) scale(1.16,.8)'},{transform:'translateY(-8px) scale(.9,1.12)'},{transform:'scale(1)'}],440)]);
  else if(e.t==='faint')await Promise.all([play(img,[{transform:'scale(1)',opacity:1},{transform:'translateY(4px) scale(1.2,.72)',opacity:1,offset:.18},{transform:`translateY(${panels[side].stage.clientHeight<140?-8:-18}px) scale(.84,1.12) rotate(-8deg)`,opacity:1,offset:.4},{transform:`translateY(${panels[side].stage.clientHeight+img.clientHeight}px) rotate(-16deg) scale(.8)`,opacity:0}],620),shadow(side,[{opacity:1},{opacity:0}],400)]);
 }
 return {effect,exit:side=>hop(side,true),cancel(){disposed=true;for(const a of animations)a.cancel();for(const node of nodes)node.remove();nodes.clear();},pending:()=>animations.size};
}
