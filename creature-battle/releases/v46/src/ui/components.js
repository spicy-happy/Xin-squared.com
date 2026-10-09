import { moveSlots } from '../moves.js';
export const element=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
export function typeChip(type){const chip=element('span',`type-chip type-${type}`,type);chip.setAttribute('aria-label',`Type: ${type}`);return chip;}
export function shuffled(items){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
export function difficultyPicker(value,onChange){
 return pixelPicker({id:'difficulty',label:'Difficulty',value,onChange,choices:[{value:'easy',label:'Easy'},{value:'hard',label:'Hard'}]});
}
// Keep menus inside the game's pixel font, borders and keyboard controls.
export function pixelPicker({id,label,value,onChange,choices}){
 const row=element('div','difficulty-label'),caption=element('span',null,label),wrapper=element('div','difficulty-picker');caption.id=`${id}-label`;row.append(caption,wrapper);
 const trigger=element('button','difficulty-trigger');trigger.id=id;trigger.type='button';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-labelledby',caption.id);trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-controls',`${id}-options`);
 const text=element('span'),arrow=element('span','pixel-chevron');arrow.setAttribute('aria-hidden','true');trigger.append(text,arrow);
 const options=element('div','difficulty-options');options.id=`${id}-options`;options.setAttribute('role','listbox');options.setAttribute('aria-label',label);options.hidden=true;
 const buttons=[];let selected=Math.max(0,choices.findIndex(c=>c.value===value)),active=selected;
 const show=open=>{options.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(open)trigger.setAttribute('aria-activedescendant',buttons[active].id);else trigger.removeAttribute('aria-activedescendant');};
 const paintLabel=(node,choice)=>{node.replaceChildren(element('span',null,choice.label));if(choice.completed){const tick=element('span','trainer-win-check');tick.setAttribute('aria-hidden','true');node.append(tick,element('span','sr-only','Defeated'));}};
 const paint=()=>{paintLabel(text,choices[selected]);trigger.dataset.value=choices[selected].value;buttons.forEach((b,i)=>{paintLabel(b,choices[i]);b.setAttribute('aria-selected',String(i===selected));b.classList.toggle('highlighted',i===active);});if(!options.hidden)trigger.setAttribute('aria-activedescendant',buttons[active].id);};
 row.setCompleted=ids=>{choices=choices.map(c=>({...c,completed:ids.includes(c.value)}));paint();};
 const choose=i=>{selected=active=i;paint();show(false);onChange(choices[i].value);trigger.focus();};
 choices.forEach((choice,i)=>{const b=element('button','difficulty-option',choice.label);b.id=`${id}-${choice.value}`;b.type='button';b.setAttribute('role','option');b.tabIndex=-1;b.onmousedown=e=>e.preventDefault();b.onclick=()=>choose(i);buttons.push(b);options.append(b);});
 trigger.onclick=()=>{active=selected;paint();show(options.hidden);};
 trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();if(options.hidden){active=selected;show(true);}active=e.key==='Home'?0:e.key==='End'?choices.length-1:(active+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;paint();}
  else if(['Enter',' '].includes(e.key)&&!options.hidden){e.preventDefault();choose(active);}else if(e.key==='Escape'){e.preventDefault();show(false);}else if(e.key==='Tab')show(false);
 };
 wrapper.addEventListener('focusout',e=>{if(!wrapper.contains(e.relatedTarget))show(false);});
 wrapper.append(trigger,options);paint();show(false);return row;
}
// Native swipes and animated arrow steps share three synchronized copies.
// Moving by a complete cycle at the edge keeps the loop visually continuous.
export function carousel(items,renderItem,label){
 const wrapper=element('div','carousel'),previous=element('button','carousel-arrow','<'),next=element('button','carousel-arrow','>');
 previous.setAttribute('aria-label',`Previous ${label}`);next.setAttribute('aria-label',`Next ${label}`);
 const rail=element('div','carousel-rail');rail.setAttribute('role','region');rail.setAttribute('aria-label',label);rail.tabIndex=0;
 const track=element('div','carousel-track'),groups=[];
 for(let cycle=0;cycle<3;cycle++){const group=element('div','carousel-group');
  for(const item of items){const card=renderItem(item);if(cycle!==1){card.tabIndex=-1;card.setAttribute('aria-hidden','true');}group.append(card);}groups.push(group);track.append(group);
 }
 rail.append(track);wrapper.append(previous,rail,next);
 let frame=0,animating=false,pressing=false,destination=0;
 const period=()=>groups[0].getBoundingClientRect().width+12;
 const recenter=()=>{const p=period(),before=rail.scrollLeft;if(!p||!rail.isConnected)return 0;let position=before;while(position<p*.5)position+=p;while(position>p*1.5)position-=p;if(position!==before)rail.scrollLeft=position;return rail.scrollLeft-before;};
 rail.addEventListener('scroll',()=>{if(!animating&&!pressing&&!rail.contains(document.activeElement))recenter();},{passive:true});
 const release=()=>{pressing=false;document.removeEventListener('pointerup',release);document.removeEventListener('pointercancel',release);requestAnimationFrame(()=>{if(!animating)recenter();});};
 rail.addEventListener('pointerdown',()=>{cancelAnimationFrame(frame);animating=false;pressing=true;document.addEventListener('pointerup',release,{once:true});document.addEventListener('pointercancel',release,{once:true});});
 const step=direction=>{
  const card=groups[0].firstElementChild;if(!card)return;
  const distance=direction*(card.getBoundingClientRect().width+12);destination=(animating?destination:rail.scrollLeft)+distance;
  cancelAnimationFrame(frame);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){animating=false;rail.scrollLeft=destination;recenter();return;}
  let start=rail.scrollLeft,target=destination;const began=performance.now();animating=true;
  const tick=now=>{if(!rail.isConnected){animating=false;return;}const t=Math.min(1,(now-began)/240),ease=1-(1-t)**3;
   rail.scrollLeft=Math.round((start+(target-start)*ease)/2)*2;
   const shift=recenter();start+=shift;target+=shift;destination+=shift;
   if(t<1)frame=requestAnimationFrame(tick);else{animating=false;recenter();}
  };frame=requestAnimationFrame(tick);
 };
 rail.addEventListener('focusin',e=>{if(e.target===rail)return;cancelAnimationFrame(frame);animating=false;e.target.scrollIntoView({block:'nearest',inline:'nearest'});});
 previous.onclick=()=>step(-1);next.onclick=()=>step(1);
 rail.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();step(e.key==='ArrowLeft'?-1:1);}});
 requestAnimationFrame(()=>{if(rail.isConnected)rail.scrollLeft=period();});
 return wrapper;
}

export function moveList(creature){
 const block=element('span','card-moves'),heading=element('span','card-moves-label','Moves'),list=element('span','card-move-list');
 heading.setAttribute('aria-hidden','true');list.setAttribute('role','list');list.setAttribute('aria-label','Moves');
 for(const slot of moveSlots){const item=element('span','card-move',creature.moves[slot].name);item.setAttribute('role','listitem');list.append(item);}
 block.append(heading,list);return block;
}
