export const element=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
export function typeChip(type){const chip=element('span',`type-chip type-${type}`,type);chip.setAttribute('aria-label',`Type: ${type}`);return chip;}
export function shuffled(items){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
// Three identical cycles permit native touch scrolling in both directions.
// Recenter by exactly one cycle, preserving the visible items and their order.
export function carousel(items,renderItem,label){
 const wrapper=element('div','carousel'),previous=element('button','carousel-arrow','<'),next=element('button','carousel-arrow','>');
 previous.setAttribute('aria-label',`Previous ${label}`);next.setAttribute('aria-label',`Next ${label}`);
 const rail=element('div','carousel-rail');rail.setAttribute('role','region');rail.setAttribute('aria-label',label);rail.tabIndex=0;
 const track=element('div','carousel-track'),groups=[];
 for(let cycle=0;cycle<3;cycle++){const group=element('div','carousel-group');
  for(const item of items){const card=renderItem(item);if(cycle!==1){card.tabIndex=-1;card.setAttribute('aria-hidden','true');}group.append(card);}groups.push(group);track.append(group);
 }
 rail.append(track);wrapper.append(previous,rail,next);
 const period=()=>groups[0].getBoundingClientRect().width+12;
 const recenter=()=>{const p=period();if(!p||!rail.isConnected)return;if(rail.scrollLeft<p*.5)rail.scrollLeft+=p;else if(rail.scrollLeft>p*1.5)rail.scrollLeft-=p;};
 rail.addEventListener('scroll',recenter,{passive:true});
 const step=direction=>{const card=groups[0].firstElementChild;rail.scrollLeft+=direction*(card.getBoundingClientRect().width+12);recenter();};
 previous.onclick=()=>step(-1);next.onclick=()=>step(1);
 rail.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();step(e.key==='ArrowLeft'?-1:1);}});
 requestAnimationFrame(()=>{if(rail.isConnected)rail.scrollLeft=period();});
 return wrapper;
}
