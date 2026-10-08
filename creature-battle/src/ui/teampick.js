import { teamRule, validateTeam } from '../collection.js';
import { element as el, typeChip, shuffled, carousel } from './components.js';
export function teamPick({app,collection,side,imageSrc,portraitSrc,onDone,onBack,solo=false,difficulty='normal',onDifficulty}){
 app.replaceChildren();const panel=el('section','panel team-picker');app.append(panel);
 const top=el('div','picker-heading');top.append(el('div','eyebrow',solo?'SOLO BATTLE':`PLAYER ${side+1}`),el('h1',null,'Choose Your Team'));
 if(solo){const label=el('label','difficulty-label','Difficulty '),select=el('select');select.id='difficulty';
  for(const [value,text]of [['normal','Normal'],['hard','Hard']]){const option=el('option',null,text);option.value=value;select.append(option);}select.value=difficulty;select.onchange=()=>onDifficulty(select.value);label.append(select);top.append(label);
 }panel.append(top);
 const team=[],rule=teamRule(collection),options=rule.duplicates?Array.from({length:3},(_,i)=>({c:collection[i%collection.length],key:`copy-${i}`})):collection.map(c=>({c,key:c.id}));
 let trainer=collection[Math.min(side,collection.length-1)];
 const summary=el('div','selection');summary.setAttribute('aria-label','Selected creatures');panel.append(summary);
 const trainerHeading=el('h2',null,'Trainer Portrait'),trainerCards=[],creatureCards=[];
 panel.append(trainerHeading);
 const portraitRow=carousel(shuffled(collection),c=>{const b=el('button','trainer-card');b.dataset.trainer=c.id;
  const img=el('img');img.src=portraitSrc(c.trainer,c.type);img.alt=c.trainer.nickname;b.append(img,el('span',null,c.trainer.nickname));
  b.onclick=()=>{trainer=c;update();};trainerCards.push({b,c});return b;
 },'trainer portraits');panel.append(portraitRow);
 panel.append(el('h2',null,'Creatures'));
 const creatureRow=carousel(shuffled(options),entry=>{const {c,key}=entry,b=el('button','pick-card');b.dataset.creature=c.id;b.dataset.pick=key;
  const img=el('img');img.src=imageSrc(c);img.alt=c.name;const mark=el('span','picked-label','SELECTED');
  b.append(mark,img,el('strong',null,c.name),typeChip(c.type));
  b.onclick=()=>{const i=team.findIndex(m=>m.key===key);if(i>=0)team.splice(i,1);else if(team.length<3)team.push(entry);update();};creatureCards.push({b,key});return b;
 },'creatures');panel.append(creatureRow);
 const actions=el('div','choices picker-actions'),done=el('button','primary','Start');done.id='team-done';done.disabled=true;
 const back=el('button',null,'Home');back.onclick=onBack;actions.append(back,done);panel.append(actions);
 done.onclick=()=>{const creatures=team.map(e=>e.c);if(validateTeam(creatures,collection))onDone({team:creatures,trainer:{...trainer.trainer,type:trainer.type}});};
 function update(){summary.replaceChildren();summary.append(el('span','selection-count',`${team.length}/3`));
  if(!team.length)summary.append(el('span','selection-placeholder','Select three creatures'));
  for(const entry of team){const chip=el('span','team-chip');chip.append(el('span',null,entry.c.name),typeChip(entry.c.type));
   const remove=el('button','remove-creature','x');remove.setAttribute('aria-label',`Remove ${entry.c.name}`);remove.onclick=()=>{team.splice(team.indexOf(entry),1);update();};chip.append(remove);summary.append(chip);
  }
  for(const {b,c}of trainerCards){const selected=trainer.id===c.id;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}
  for(const {b,key}of creatureCards){const selected=team.some(e=>e.key===key);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));b.disabled=!selected&&team.length===3;}
  done.disabled=!validateTeam(team.map(e=>e.c),collection);
 }update();
}
