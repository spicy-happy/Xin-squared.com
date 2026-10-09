import { trainerKey, battleTrainers, trainerTeam } from '../trainers.js';
import { teamRule, validateTeam, cleanName, nameError } from '../collection.js';
import { element as el, typeChip, shuffled, carousel, difficultyPicker, pixelPicker, moveList } from './components.js';
export function opponentPick({app,collection,portraitSrc,difficulty='easy',onDifficulty,opponentId='random',onOpponent,hasVictory=()=>false,onNext}){
 app.replaceChildren();const panel=el('section','panel team-picker opponent-picker');panel.setAttribute('aria-label','Solo battle opponent selection');app.append(panel);
 const top=el('div','picker-heading');top.append(el('div','eyebrow','SOLO BATTLE'));
 const toolbar=el('div','picker-toolbar');toolbar.append(difficultyPicker(difficulty,value=>{difficulty=value;onDifficulty(value);refreshVictories();}));top.append(toolbar);panel.append(top,el('h2',null,'Select Opponent'));
  const trainers=battleTrainers(collection);
  const picker=pixelPicker({id:'solo-opponent',label:'Opponent',value:opponentId,choices:[...trainers.map(t=>({value:t.id,label:t.nickname,completed:hasVictory(t.id,difficulty)})),{value:'random',label:'Random Battle Bot'}],onChange:value=>{opponentId=value;onOpponent(value);opponentPreview();}});
  picker.classList.add('opponent-label');panel.append(picker);
  const preview=el('div','opponent-preview');panel.append(preview);
  function opponentPreview(){preview.replaceChildren();const trainer=trainers.find(t=>t.id===opponentId),img=el('img');img.src=portraitSrc(trainer??{bot:true});img.alt=trainer?.nickname??'Battle Bot';preview.append(img,el('span',null,trainer?`${trainer.nickname} · ${trainer.creatures.length} ${trainer.creatures.length===1?'creature':'creatures'}`:'Random creatures from the whole collection'));}
  const refreshVictories=()=>{picker.setCompleted(trainers.filter(t=>hasVictory(t.id,difficulty)).map(t=>t.id));opponentPreview();};
  opponentPreview();
 const actions=el('div','choices picker-actions'),next=el('button','primary','Next');next.id='opponent-next';next.onclick=onNext;actions.append(next);panel.append(actions);
}
export function teamPick({app,collection,rules,side,imageSrc,portraitSrc,onDone,solo=false,onBack,initialChoice=null}){
 const entered=performance.now(),entering=()=>performance.now()-entered<350;
 app.replaceChildren();const panel=el('section','panel team-picker');app.append(panel);
 panel.setAttribute('aria-label',solo?'Solo battle team selection':`Player ${side+1} team selection`);
 const top=el('div','picker-heading');top.append(el('div','eyebrow',solo?'SOLO BATTLE':`PLAYER ${side+1}`));
 const toolbar=el('div','picker-toolbar'),done=el('button','primary',!solo&&side===0?'Next':'Start');done.id='team-done';done.disabled=true;
 if(onBack){const back=el('button',null,'Back');back.id='opponent-back';back.onclick=()=>onBack(selection());toolbar.append(back);}
 toolbar.append(done);top.append(toolbar);panel.append(top);

 const team=[],rule=teamRule(collection),options=rule.duplicates?collection.flatMap(c=>Array.from({length:3},(_,i)=>({c,key:`${c.id}-copy-${i}`}))):collection.map(c=>({c,key:c.id}));
 let trainer=collection.find(c=>c.id===initialChoice?.trainerId)??collection[Math.min(side,collection.length-1)];
 if(initialChoice)for(const c of initialChoice.team){const entry=options.find(e=>e.c.id===c.id&&!team.includes(e));if(entry)team.push(entry);}
 const summary=el('div','selection');summary.setAttribute('aria-label','Selected creatures');panel.append(summary);
 const orderStatus=el('span','sr-only');orderStatus.setAttribute('role','status');orderStatus.setAttribute('aria-live','polite');panel.append(orderStatus);
 let drag=null;
 const trainerHeading=el('h2',null,'Select Trainer'),trainerCards=[],creatureCards=[];
 const trainerBar=el('div','trainer-heading'),nameLabel=el('label','trainer-name-label','Trainer name'),nameInput=el('input');nameInput.id='trainer-name';nameInput.maxLength=24;nameInput.autocomplete='off';nameInput.spellcheck=false;nameInput.value=initialChoice?.trainer.nickname??trainer.trainer.nickname;
 nameLabel.htmlFor=nameInput.id;nameLabel.append(nameInput);trainerBar.append(trainerHeading,nameLabel);panel.append(trainerBar);
 const nameMessage=el('p','name-error');nameMessage.id='trainer-name-error';nameMessage.setAttribute('role','status');nameMessage.hidden=true;nameInput.setAttribute('aria-describedby',nameMessage.id);panel.append(nameMessage);
 nameInput.oninput=update;
 const portraitRow=carousel(shuffled(collection.filter((c,i)=>collection.findIndex(m=>trainerKey(m)===trainerKey(c))===i)),c=>{const b=el('button','trainer-card');b.dataset.trainer=c.id;
  const img=el('img');img.src=portraitSrc(c.trainer,c.type);img.alt=c.trainer.nickname;const label=el('span',null,c.trainer.nickname);b.append(img,label);
  b.onclick=()=>{trainer=c;nameInput.value=c.trainer.nickname;team.splice(0);for(const owned of trainerTeam(collection,c)){const entry=options.find(e=>e.c.id===owned.id&&!team.includes(e));if(entry)team.push(entry);}update();};trainerCards.push({b,c,label});return b;
 },'trainer portraits');panel.append(portraitRow);
 panel.append(el('h2',null,'Creatures'));
 const creatureRow=carousel(shuffled(options),entry=>{const {c,key}=entry,b=el('button','pick-card');b.dataset.creature=c.id;b.dataset.pick=key;
  const img=el('img');img.src=imageSrc(c);img.alt=c.name;const mark=el('span','picked-label','SELECTED');
  b.append(mark,img,el('strong',null,c.name),typeChip(c.type),el('small','creature-creator',`Made by ${c.trainer.nickname}`));
  b.append(moveList(c));
  b.onclick=()=>{const i=team.findIndex(m=>m.key===key);if(i>=0)team.splice(i,1);else if(team.length<3)team.push(entry);update();};creatureCards.push({b,key});return b;
 },'creatures');panel.append(creatureRow);
 function selection(){return {team:team.map(e=>e.c),trainerId:trainer.id,trainer:{...trainer.trainer,nickname:nameInput.value,type:trainer.type}};}
 done.onclick=()=>{const creatures=team.map(e=>e.c);if(validateTeam(creatures,collection)&&!nameError(nameInput.value))onDone({team:creatures,trainerId:trainer.id,trainer:{...trainer.trainer,nickname:cleanName(nameInput.value),type:trainer.type}});};
 function moveEntry(entry,index){
  const from=team.indexOf(entry),to=Math.max(0,Math.min(team.length-1,index));
  if(from<0||from===to)return false;
  team.splice(from,1);team.splice(to,0,entry);return true;
 }
 function focusEntry(entry){summary.querySelector(`[data-team-key="${CSS.escape(entry.key)}"] .team-order-handle`)?.focus({preventScroll:true});}
 function announce(entry){const index=team.indexOf(entry);orderStatus.textContent=`${entry.c.name} moved to position ${index+1} of ${team.length}.${index===0?' Opens the battle.':''}`;}
 function finishDrag(cancel=false){
  if(!drag)return;
  const current=drag;drag=null;
  if(cancel)team.splice(0,team.length,...current.original);
  current.ghost?.remove();current.chip.classList.remove('dragging');
  if(current.handle.hasPointerCapture(current.pointerId))current.handle.releasePointerCapture(current.pointerId);
  update();focusEntry(current.entry);if(!cancel&&current.moving)announce(current.entry);
 }
 function syncPositions(){
  for(const [i,entry]of team.entries()){
   const chip=summary.querySelector(`[data-team-key="${CSS.escape(entry.key)}"]`);
   chip.querySelector('.team-position').textContent=String(i+1);
   chip.querySelector('.team-order-handle').setAttribute('aria-label',`Move ${entry.c.name}, position ${i+1} of ${team.length}${i===0?', opens the battle':''}`);
   chip.querySelector('.team-order-handle').title='Drag to reorder, or use the arrow keys. First opens the battle.';
  }
 }
 function update(){summary.replaceChildren();summary.append(el('span','selection-count',`${team.length}/3`));
  if(!team.length)summary.append(el('span','selection-placeholder','Select three creatures'));
  const ordered=el('span','team-order');ordered.setAttribute('role','list');ordered.setAttribute('aria-label','Battle order');summary.append(ordered);
  for(const entry of team){
   const chip=el('span','team-chip');chip.dataset.teamKey=entry.key;chip.setAttribute('role','listitem');
   const handle=el('button','team-order-handle');handle.type='button';
   handle.append(el('span','team-position'),el('span','team-creature-name',entry.c.name));
   handle.onkeydown=e=>{
    if(e.key==='Escape'&&drag){e.preventDefault();finishDrag(true);return;}
    if(e.altKey||e.ctrlKey||e.metaKey)return;
    const index=team.indexOf(entry),to=e.key==='Home'?0:e.key==='End'?team.length-1:['ArrowLeft','ArrowUp'].includes(e.key)?index-1:['ArrowRight','ArrowDown'].includes(e.key)?index+1:null;
    if(to===null)return;e.preventDefault();
    if(moveEntry(entry,to)){update();focusEntry(entry);announce(entry);}
   };
   handle.onpointerdown=e=>{
    if(!e.isPrimary||e.button!==0||team.length<2||drag)return;
    e.preventDefault();handle.focus({preventScroll:true});const rect=chip.getBoundingClientRect();
    drag={entry,chip,handle,pointerId:e.pointerId,x:e.clientX,y:e.clientY,offsetX:e.clientX-rect.left,offsetY:e.clientY-rect.top,width:rect.width,original:[...team],moving:false};
    handle.setPointerCapture(e.pointerId);
   };
   handle.onpointermove=e=>{
    if(!drag||drag.pointerId!==e.pointerId)return;
    const current=drag;
    if(!current.moving&&Math.hypot(e.clientX-current.x,e.clientY-current.y)<6)return;
    e.preventDefault();
    if(!current.moving){
     current.moving=true;current.chip.classList.add('dragging');current.ghost=chip.cloneNode(true);current.ghost.classList.remove('dragging');current.ghost.classList.add('team-drag-preview');current.ghost.setAttribute('aria-hidden','true');current.ghost.style.width=`${current.width}px`;
     for(const button of current.ghost.querySelectorAll('button'))button.tabIndex=-1;
     document.body.append(current.ghost);
    }
    current.ghost.style.left=`${e.clientX-current.offsetX}px`;current.ghost.style.top=`${e.clientY-current.offsetY}px`;
    const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.team-chip');
    if(target&&ordered.contains(target)){
     const to=team.findIndex(item=>item.key===target.dataset.teamKey);
     if(moveEntry(entry,to)){for(const [i,item]of team.entries())ordered.querySelector(`[data-team-key="${CSS.escape(item.key)}"]`).style.order=String(i);syncPositions();}
    }
   };
   handle.onpointerup=e=>{if(drag?.pointerId===e.pointerId)finishDrag();};
   handle.onpointercancel=e=>{if(drag?.pointerId===e.pointerId)finishDrag(true);};
   handle.onlostpointercapture=e=>{if(drag?.pointerId===e.pointerId)finishDrag(true);};
   const remove=el('button','remove-creature','x');remove.setAttribute('aria-label',`Remove ${entry.c.name}`);remove.onclick=()=>{team.splice(team.indexOf(entry),1);update();};
   chip.append(handle,remove);ordered.append(chip);
  }
  syncPositions();
  for(const {b,c,label}of trainerCards){b.disabled=entering();const selected=trainerKey(trainer)===trainerKey(c);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));label.textContent=c.trainer.nickname;}
  for(const {b,key}of creatureCards){const selected=team.some(e=>e.key===key);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));b.disabled=entering()||(!selected&&team.length===3);}
  const error=nameError(nameInput.value);nameInput.setAttribute('aria-invalid',String(!!error));nameMessage.textContent=error;nameMessage.hidden=!error;
  done.disabled=!!error||!validateTeam(team.map(e=>e.c),collection);
 }update();setTimeout(()=>{if(!panel.isConnected)return;for(const {b}of trainerCards)b.disabled=false;for(const {b,key}of creatureCards)b.disabled=!team.some(e=>e.key===key)&&team.length===3;},360);
}
