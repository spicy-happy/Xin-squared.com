export const element=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
export function typeChip(type){const chip=element('span',`type-chip type-${type}`,type);chip.setAttribute('aria-label',`Type: ${type}`);return chip;}
export function shuffled(items){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
export function difficultyPicker(value,onChange){
 const label=element('div','difficulty-label'),caption=element('span',null,'Difficulty'),wrapper=element('div','difficulty-picker');caption.id='difficulty-label';label.append(caption,wrapper);
 const trigger=element('button','difficulty-trigger');trigger.id='difficulty';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-labelledby',caption.id);trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-controls','difficulty-options');
 const text=element('span'),arrow=element('span','pixel-chevron');arrow.setAttribute('aria-hidden','true');trigger.append(text,arrow);
 const options=element('div','difficulty-options');options.id='difficulty-options';options.setAttribute('role','listbox');options.setAttribute('aria-label','Difficulty');options.hidden=true;
 const values=['normal','hard'],buttons=[];let active=values.indexOf(value);
 const show=open=>{options.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(open)trigger.setAttribute('aria-activedescendant',buttons[active].id);else trigger.removeAttribute('aria-activedescendant');};
 const paint=()=>{text.textContent=value==='hard'?'Hard':'Normal';trigger.dataset.value=value;buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===active)));if(!options.hidden)trigger.setAttribute('aria-activedescendant',buttons[active].id);};
 const choose=i=>{active=i;value=values[i];paint();show(false);onChange(value);trigger.focus();};
 values.forEach((v,i)=>{const b=element('button','difficulty-option',v==='hard'?'Hard':'Normal');b.id=`difficulty-${v}`;b.setAttribute('role','option');b.tabIndex=-1;b.onmousedown=e=>e.preventDefault();b.onclick=()=>choose(i);buttons.push(b);options.append(b);});
 trigger.onclick=()=>{active=values.indexOf(value);paint();show(options.hidden);};
 trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();if(options.hidden)show(true);else active=e.key==='Home'?0:e.key==='End'?1:(active+(e.key==='ArrowDown'?1:-1)+2)%2;paint();}
  else if(['Enter',' '].includes(e.key)&&!options.hidden){e.preventDefault();choose(active);}else if(e.key==='Escape'){e.preventDefault();show(false);}
 };
 wrapper.addEventListener('focusout',e=>{if(!wrapper.contains(e.relatedTarget))show(false);});
 wrapper.append(trigger,options);paint();show(false);return label;
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
 let frame=0,animating=false,destination=0;
 const period=()=>groups[0].getBoundingClientRect().width+12;
 const recenter=()=>{const p=period(),before=rail.scrollLeft;if(!p||!rail.isConnected)return 0;let position=before;while(position<p*.5)position+=p;while(position>p*1.5)position-=p;if(position!==before)rail.scrollLeft=position;return rail.scrollLeft-before;};
 rail.addEventListener('scroll',()=>{if(!animating)recenter();},{passive:true});
 const stop=()=>{cancelAnimationFrame(frame);animating=false;recenter();};rail.addEventListener('pointerdown',stop);
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
 previous.onclick=()=>step(-1);next.onclick=()=>step(1);
 rail.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();step(e.key==='ArrowLeft'?-1:1);}});
 requestAnimationFrame(()=>{if(rail.isConnected)rail.scrollLeft=period();});
 return wrapper;
}
