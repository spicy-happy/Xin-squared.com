import { moveSlots, moveCategory, moveRule, facingFlip } from '../moves.js';
import { getActions, whoseTurn } from '../engine.js';
import { eventLines } from '../messages.js';
import { typeChip } from './components.js';
import { playSound } from './audio.js';
import { battleJuice } from './juice.js';
const shortMove=name=>innerWidth>740?name:name.replace('Piercing','Pierce').replace('Shield','Shld').replace('Healing','Heal');
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
export function battleView({app,initial,trainers,imageSrc,portraitSrc,getState,onAction,onReplacement,onDrain,twoTap,humanSides=[0,1]}){
 const view=structuredClone(initial),fallen=initial.active.map((slot,side)=>initial.teams[side][slot].hp<=0);let locked=false,guardUntil=0,skip=null,selected=null,disposed=false,animationSide=null,typingFrame=0,finishTyping=null;
 // Retain the action through disabled animation frames and the input guard.
 let focusAction=null,focusPending=false,openTray=null;
 let messageId=0;const messageRows=new Map();
 app.replaceChildren();const arena=el('section','arena');app.append(arena);
 const box=el('div','text-box');box.id='battle-text';box.setAttribute('aria-label','Battle messages.');arena.append(box);
 const announcement=el('div','sr-only');announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');announcement.setAttribute('aria-atomic','true');arena.append(announcement);
 const body=el('div','battle-body');arena.append(body);const scenery=el('div','battle-scenery');scenery.setAttribute('aria-hidden','true');body.append(scenery);const sides=[],grids=[],panels=[];
 for(let side=0;side<2;side++){
  const section=el('section','side');section.dataset.side=side;const status=el('div','status'),stage=el('div','stage'),grid=el('div','grid');grid.dataset.grid=side;
  const fighter=el('div','fighter'),img=el('img','creature-sprite'),shadow=el('div','pixel-shadow');shadow.setAttribute('aria-hidden','true');fighter.append(shadow,img);stage.append(fighter);
  section.append(status,stage,grid);body.append(section);sides.push(section);grids.push(grid);panels.push({status,stage,fighter,img});
 }
 const fx=el('div','battle-effects');fx.setAttribute('aria-hidden','true');body.append(fx);
 const active=side=>view.teams[side][view.active[side]];
 const name=side=>active(0).name===active(1).name?`${trainers[side].nickname}'s ${active(side).name}`:active(side).name;
 function messages(e,previous){
  if(e.t==='round'||e.t==='needReplace'||e.t==='fallback')return [];
  let token='NAME_REF_';while(JSON.stringify([e,name(0),name(1),previous,trainers.map(t=>t.nickname)]).includes(token))token+='X';
  const refs=[name(0),name(1),...previous];return eventLines(e,{name:s=>`${token}${s}_END`,previous:s=>`${token}${s+2}_END`,trainer:s=>trainers[s].nickname}).map(text=>{
   const parts=text.split(new RegExp(`(${token}[0-3]_END)`)).filter(Boolean).map(part=>{if(!part.startsWith(token))return {text:part};const i=Number(part.slice(token.length,-4));return {text:refs[i],side:i%2};});return {id:++messageId,kind:e.t,parts,text:parts.map(p=>p.text).join('')};
  });
 }
 // Keep message nodes in place. Effects extend their existing paragraph;
 // repainting earlier lines made one action look as though it happened again.
 function line(lines,typeNew=false){
  finishTyping?.();const visible=lines.slice(-3),keep=new Set(visible.map(m=>m.id)),segments=[],spoken=[];let count=0;
  for(const [id,record]of messageRows)if(!keep.has(id)){record.row.remove();messageRows.delete(id);}
  for(const message of visible){
   let record=messageRows.get(message.id);
   if(!record){record={row:el('div','message-line'),spans:[]};messageRows.set(message.id,record);box.append(record.row);}
   record.row.dataset.text=message.text;
   for(let i=0;i<message.parts.length;i++){
    const part=message.parts[i];let span=record.spans[i];
    if(!span){span=el('span',part.side===undefined?null:`name-chip ${part.side?'right':'left'}`);record.spans.push(span);record.row.append(span);}
    const prefix=span.textContent,suffix=part.text.slice(prefix.length);
    if(!suffix)continue;spoken.push(suffix);
    if(typeNew){segments.push({node:span,prefix,text:suffix,start:count});count+=suffix.length;}else span.textContent=part.text;
   }
  }
  const newText=spoken.join('').trim();if(newText)announcement.textContent=newText;box.classList.toggle('writing',count>0);
  box.scrollTop=box.scrollHeight;
  if(!count)return Promise.resolve();
  return new Promise(resolve=>{const started=performance.now();const draw=n=>{segments.forEach(s=>{s.node.textContent=s.prefix+s.text.slice(0,Math.max(0,n-s.start));});box.scrollTop=box.scrollHeight;};
   finishTyping=()=>{cancelAnimationFrame(typingFrame);draw(count);box.classList.remove('writing');finishTyping=null;resolve();};
   const tick=now=>{if(disposed){finishTyping?.();return;}const n=Math.floor((now-started)/18);draw(n);if(n<count)typingFrame=requestAnimationFrame(tick);else finishTyping?.();};typingFrame=requestAnimationFrame(tick);
  });
 }
 function turnLine(){const turn=whoseTurn(getState());const text=turn.over?'Battle complete.':turn.need==='replacement'?`${trainers[turn.side].nickname}, choose your next creature.`:humanSides.includes(turn.side)?`${trainers[turn.side].nickname}'s turn. Choose a move.`:`${trainers[turn.side].nickname} is choosing a move...`;return {id:++messageId,kind:'prompt',text,parts:[{text}]};}
 const join=(a,b)=>({...a,text:a.text+' '+b.text,parts:[...a.parts,{text:' '},...b.parts]});
 function paint(){for(let side=0;side<2;side++){
  const m=active(side),{status,img}=panels[side];status.replaceChildren();const identity=el('div','identity'),portrait=el('img','portrait');portrait.src=portraitSrc(trainers[side]);portrait.alt=trainers[side].nickname;identity.append(portrait,el('span','creature-name',name(side)));status.append(identity);
  const meter=el('div','meter-row'),hp=el('div','hp');hp.setAttribute('role','meter');hp.setAttribute('aria-label',`${m.name} HP`);hp.setAttribute('aria-valuemin','0');hp.setAttribute('aria-valuemax',String(m.maxHp));hp.setAttribute('aria-valuenow',String(m.hp));
  const ratio=m.hp/m.maxHp;hp.classList.toggle('hp-medium',ratio<=.5&&ratio>.2);hp.classList.toggle('hp-low',ratio<=.2&&m.hp>0);
  const fill=el('span','hp-fill');fill.style.width=`${100*ratio}%`;hp.append(fill);meter.append(hp);
  const details=el('div','hp-details');details.append(el('span','hp-number',`${m.hp}/${m.maxHp}${m.shield?` +${m.shield}`:''}${m.recharging?' · RECHARGE':''}${m.toughened?' · TOUGH':''}`),typeChip(m.type));status.append(meter,details);
  img.src=imageSrc(m);img.alt=m.name;img.dataset.flip=String(facingFlip(m,side));img.style.transform=facingFlip(m,side)?'scaleX(-1)':'scaleX(1)';img.style.opacity=fallen[side]?'0':'1';panels[side].fighter.classList.toggle('fainted',fallen[side]);
 }}
 function confirm(side,action,text){if(!twoTap())return perform(side,action);const key=JSON.stringify(action);if(selected===key)return perform(side,action);selected=key;
  const bubble=el('div','confirm');bubble.append(el('div',null,text));const row=el('div','confirm-actions'),go=el('button',null,'GO!'),back=el('button',null,'Back');go.onclick=()=>perform(side,action);back.onclick=()=>{selected=null;controls();};row.append(go,back);bubble.append(row);grids[side].append(bubble);
 }
 function perform(side,action){if(disposed||locked||!humanSides.includes(side)||Date.now()<guardUntil)return;selected=null;onAction(side,action);}
 function tray(side,replacement){openTray={side,replacement};if(!replacement)focusAction='switch';const s=view,g=grids[side];g.replaceChildren();const tray=el('div','tray');tray.classList.toggle('replacement-tray',replacement);grids.forEach(g=>g.classList.remove('choosing'));g.classList.add('choosing');tray.append(el('strong',null,replacement?(humanSides.includes(side)?'Pick your next creature!':'Bot is choosing a creature...'):`Switches left: ${s.switchesLeft[side]}`));
  s.teams[side].forEach((m,index)=>{if(!replacement&&index===s.active[side])return;const b=el('button','bench-card');b.dataset.bench=index;const img=el('img');img.src=imageSrc(m);img.alt='';const text=el('span','bench-name',m.name);text.append(el('small',null,m.hp<=0?'Fainted':`${m.hp}/${m.maxHp}`));b.append(img,text,typeChip(m.type));b.classList.toggle('bench-fainted',m.hp<=0);b.disabled=m.hp<=0||index===s.active[side]||locked||Date.now()<guardUntil||!humanSides.includes(side);
   b.onclick=()=>{if(disposed||locked||!humanSides.includes(side)||Date.now()<guardUntil)return;if(replacement)onReplacement(side,index);else confirm(side,{kind:'switch',index},`Bring in ${m.name}.`);};tray.append(b);
  });if(!replacement){const back=el('button',null,'Back');back.onclick=()=>closeTray(side);tray.append(back);}g.append(tray);if(!locked&&(document.activeElement===document.body||arena.contains(document.activeElement))){const first=tray.querySelector('button:enabled');if(first){first.focus({preventScroll:true});focusPending=false;}}
 }
 function closeTray(side){openTray=null;focusAction='switch';focusPending=true;controls(side);}
 arena.addEventListener('keydown',e=>{if(e.key==='Escape'&&openTray&&!openTray.replacement){e.preventDefault();closeTray(openTray.side);}});
 function controls(returnSide){if(disposed)return;const focused=document.activeElement;if(arena.contains(focused)){focusPending=true;focusAction=focused.dataset.action??focusAction;}openTray=null;const s=view,turn=locked?{side:animationSide,need:'action'}:whoseTurn(s),guarded=Date.now()<guardUntil;selected=null;
  for(let owner=0;owner<2;owner++){
   sides[owner].classList.toggle('active',!locked&&!guarded&&!turn.over&&turn.side===owner&&humanSides.includes(owner));const g=grids[owner];g.classList.remove('choosing');g.replaceChildren();
   const m=s.teams[owner][s.active[owner]],actions=getActions(s,owner);
   const fallbackSlot=moveSlots.find(slot=>moveCategory(m,slot)!=='defense');
   const exhausted=actions.some(a=>a.kind==='fallback');g.classList.toggle('five-actions',!fallbackSlot);
   for(const kind of [...moveSlots,...(!fallbackSlot?['fallback']:[]),'switch']){
    if(exhausted&&kind!==fallbackSlot&&moveSlots.includes(kind)&&moveCategory(m,kind)!=='defense')continue;
    const label=kind==='switch'?'Switch':kind==='fallback'?'Struggle':m.moves[kind].name;
    const a=kind==='switch'?actions.find(a=>a.kind==='switch'&&a.enabled)??actions.find(a=>a.kind==='switch'):actions.find(a=>a.kind===kind||(kind===fallbackSlot&&a.kind==='fallback'));
    const fallback=a.kind==='fallback',move=kind==='switch'?null:fallback?s.rules.fallback:moveRule(s.rules,m,kind);
    const remaining=kind==='switch'?s.switchesLeft[owner]:m.pp[kind],maximum=kind==='switch'?s.rules.switchLimit:fallback?null:move.pp;
    const b=el('button',kind==='switch'?'switch':fallback?'regular':moveCategory(m,kind));b.dataset.action=kind;b.classList.toggle('struggle',fallback);b.append(el('span','category',fallback?'Struggle':shortMove(label)),el('span','pp',fallback?'--':`${remaining}/${maximum}`));
    b.classList.toggle('exhausted',!fallback&&remaining===0);b.disabled=locked||guarded||!humanSides.includes(owner)||!a.enabled;b.setAttribute('aria-disabled',String(b.disabled));b.title=`${fallback?'Struggle':label}${!a.enabled?`. ${a.reason}`:''}`;
    b.setAttribute('aria-label',`${fallback?'Struggle, small damage with recoil':`${label}, ${remaining} of ${maximum} uses left`}${!a.enabled?`. ${a.reason}`:''}`);
    b.onclick=()=>{if(disposed||locked||!humanSides.includes(owner)||Date.now()<guardUntil)return;if(kind==='switch')tray(owner,false);else confirm(owner,{kind:a.kind},label);};g.append(b);
   }
   if(!locked&&turn.need==='replacement'&&turn.side===owner)tray(owner,true);
  }
  if(focusPending&&!locked&&!guarded&&!turn.over&&turn.need==='action'&&(document.activeElement===document.body||arena.contains(document.activeElement))){const grid=grids[returnSide??turn.side],next=grid.querySelector(`[data-action="${focusAction}"]:enabled`)??grid.querySelector('[data-action]:enabled');if(next){next.focus({preventScroll:true});focusPending=false;}}
 }
 function applyEvent(e){if(e.t==='switch'){active(e.side).shield=0;active(e.side).toughened=false;view.active[e.side]=e.to;}if(e.t==='enter')view.active[e.side]=e.slot;if(['enter','switch'].includes(e.t))fallen[e.side]=false;if(e.t==='faint')fallen[e.side]=true;
  const owner=e.t==='hit'?e.target:e.side,m=owner===0||owner===1?active(owner):null;
  if(m){if(e.hpAfter!==undefined)m.hp=e.hpAfter;if(e.ppAfter)m.pp={...e.ppAfter};if(e.shieldAfter!==undefined)m.shield=e.shieldAfter;if(e.t==='toughen')m.toughened=true;if(e.rechargingAfter!==undefined)m.recharging=e.rechargingAfter;if(e.t==='faint'){m.recharging=false;m.toughened=false;}}
  if(e.switchesLeft!==undefined)view.switchesLeft[e.side]=e.switchesLeft;if(e.t==='round'){view.order=[...e.order];view.round=e.n;}
 }
 const juice=battleJuice({panels,fx,scenery,active});
 function effect(e,onImpact){if(!['hit','recoil'].includes(e.t)||matchMedia('(prefers-reduced-motion: reduce)').matches)eventSound(e);return juice.effect(e,onImpact);}
 function eventSound(e){const sound=e.t==='use'?(view.rules.moves.special[e.moveId]?'special':view.rules.moves.defense[e.moveId]?null:'regular'):({hit:'hit',recoil:'hit',heal:'heal',shieldUp:'shield',toughen:'shield',switch:'switch',enter:'switch',faint:'faint'})[e.t];if(sound)playSound(sound);}
 async function animate(events){
  animationSide=events.find(e=>['use','switch','rest'].includes(e.t))?.side??events.find(e=>e.t==='round')?.order[0]??whoseTurn(getState()).side??getState().winner??0;locked=true;controls();
  let cancelled=false,wake,buffer=[],pendingEntry=null;
  skip=()=>{cancelled=true;finishTyping?.();juice.cancel();wake?.();};
  for(const e of events){
   if(disposed)return;
   if(e.t==='switch'&&!cancelled){await juice.exit(e.side);if(disposed)return;}
   const previous=[name(0),name(1)],repeatedEntry=e.t==='enter'&&e.side===pendingEntry;pendingEntry=e.t==='switch'?e.side:null;const delayedHit=e.t==='hit'&&!cancelled&&!matchMedia('(prefers-reduced-motion: reduce)').matches;if(!delayedHit)applyEvent(e);paint();controls();if(repeatedEntry)continue;const lines=messages(e,previous);
   if(!lines.length)continue;const paragraph=lines.reduce((a,b)=>join(a,b));
   if(['hit','miss','heal','shieldUp','toughen','shieldBreak','hangOn','recoil'].includes(e.t)&&buffer.length)buffer[buffer.length-1]=join(buffer.at(-1),paragraph);
   else buffer=[...buffer,paragraph].slice(-2);
   if(cancelled){eventSound(e);continue;}
   await Promise.all([line(buffer,true),effect(e,delayedHit?()=>{applyEvent(e);paint();controls();}:undefined)]);
   if(!cancelled&&['hit','heal','faint','switch','rest','win'].includes(e.t))await new Promise(resolve=>{const timer=setTimeout(resolve,Math.max(1100,paragraph.text.split(/\s+/).length*200));wake=()=>{clearTimeout(timer);resolve();};});
  }
  if(disposed)return;Object.assign(view,structuredClone(getState()));skip=null;locked=false;guardUntil=Date.now()+400;paint();controls();const prompt=turnLine(),last=buffer.at(-1);if(last?.kind==='faint')buffer[buffer.length-1]=join(last,prompt);else buffer.push(prompt);line(buffer.slice(-3));announcement.textContent=prompt.text;
  setTimeout(()=>{if(!disposed){controls();onDrain();}},400);
 }
 paint();controls();line([turnLine()]);
 return {animate,dispose(){disposed=true;if(skip)skip();finishTyping?.();juice.cancel();},isLocked:()=>locked||Date.now()<guardUntil,refresh:paint};
}
