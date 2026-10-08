import { teamRule, validateTeam, cleanName, nameError } from '../collection.js';
import { element as el, typeChip, shuffled, carousel, difficultyPicker } from './components.js';
export function teamPick({app,collection,side,imageSrc,portraitSrc,onDone,solo=false,difficulty='normal',onDifficulty}){
 app.replaceChildren();const panel=el('section','panel team-picker');app.append(panel);
 panel.setAttribute('aria-label',solo?'Solo battle team selection':`Player ${side+1} team selection`);
 const top=el('div','picker-heading');top.append(el('div','eyebrow',solo?'SOLO BATTLE':`PLAYER ${side+1}`));
 const toolbar=el('div','picker-toolbar'),done=el('button','primary','Start');done.id='team-done';done.disabled=true;
 if(solo)toolbar.append(difficultyPicker(difficulty,onDifficulty));toolbar.append(done);top.append(toolbar);panel.append(top);
 const team=[],rule=teamRule(collection),options=rule.duplicates?Array.from({length:3},(_,i)=>({c:collection[i%collection.length],key:`copy-${i}`})):collection.map(c=>({c,key:c.id}));
 let trainer=collection[Math.min(side,collection.length-1)];const trainerNames=new Map();
 const summary=el('div','selection');summary.setAttribute('aria-label','Selected creatures');panel.append(summary);
 const trainerHeading=el('h2',null,'Trainer Portrait'),trainerCards=[],creatureCards=[];
 const trainerBar=el('div','trainer-heading'),nameLabel=el('label','trainer-name-label','Trainer name'),nameInput=el('input');nameInput.id='trainer-name';nameInput.maxLength=24;nameInput.autocomplete='off';nameInput.spellcheck=false;nameInput.value=trainer.trainer.nickname;
 nameLabel.htmlFor=nameInput.id;nameLabel.append(nameInput);trainerBar.append(trainerHeading,nameLabel);panel.append(trainerBar);
 const nameMessage=el('p','name-error');nameMessage.id='trainer-name-error';nameMessage.setAttribute('role','status');nameMessage.hidden=true;nameInput.setAttribute('aria-describedby',nameMessage.id);panel.append(nameMessage);
 nameInput.oninput=()=>{trainerNames.set(trainer.id,nameInput.value);update();};
 const portraitRow=carousel(shuffled(collection),c=>{const b=el('button','trainer-card');b.dataset.trainer=c.id;
  const img=el('img');img.src=portraitSrc(c.trainer,c.type);img.alt=c.trainer.nickname;const label=el('span',null,c.trainer.nickname);b.append(img,label);
  b.onclick=()=>{trainer=c;nameInput.value=trainerNames.get(c.id)??c.trainer.nickname;update();};trainerCards.push({b,c,label});return b;
 },'trainer portraits');panel.append(portraitRow);
 panel.append(el('h2',null,'Creatures'));
 const creatureRow=carousel(shuffled(options),entry=>{const {c,key}=entry,b=el('button','pick-card');b.dataset.creature=c.id;b.dataset.pick=key;
  const img=el('img');img.src=imageSrc(c);img.alt=c.name;const mark=el('span','picked-label','SELECTED');
  b.append(mark,img,el('strong',null,c.name),typeChip(c.type));
  b.onclick=()=>{const i=team.findIndex(m=>m.key===key);if(i>=0)team.splice(i,1);else if(team.length<3)team.push(entry);update();};creatureCards.push({b,key});return b;
 },'creatures');panel.append(creatureRow);
 done.onclick=()=>{const creatures=team.map(e=>e.c);if(validateTeam(creatures,collection)&&!nameError(nameInput.value))onDone({team:creatures,trainer:{...trainer.trainer,nickname:cleanName(nameInput.value),type:trainer.type}});};
 function update(){summary.replaceChildren();summary.append(el('span','selection-count',`${team.length}/3`));
  if(!team.length)summary.append(el('span','selection-placeholder','Select three creatures'));
  for(const entry of team){const chip=el('span','team-chip'),label=el('span','team-credit');label.append(el('span',null,entry.c.name),el('small',null,`Made by ${entry.c.trainer.nickname}`));chip.append(label);
   const remove=el('button','remove-creature','x');remove.setAttribute('aria-label',`Remove ${entry.c.name}`);remove.onclick=()=>{team.splice(team.indexOf(entry),1);update();};chip.append(remove);summary.append(chip);
  }
  for(const {b,c,label}of trainerCards){const selected=trainer.id===c.id;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));const draft=trainerNames.get(c.id)??c.trainer.nickname;label.textContent=nameError(draft)?c.trainer.nickname:cleanName(draft);b.title=label.textContent;}
  for(const {b,key}of creatureCards){const selected=team.some(e=>e.key===key);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));b.disabled=!selected&&team.length===3;}
  const error=nameError(nameInput.value);nameInput.setAttribute('aria-invalid',String(!!error));nameMessage.textContent=error;nameMessage.hidden=!error;
  done.disabled=!!error||!validateTeam(team.map(e=>e.c),collection);
 }update();
}
