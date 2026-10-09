import { trainerKey, gymLeaders } from '../trainers.js';
import { teamRule, validateTeam, cleanName, nameError } from '../collection.js';
import { element as el, typeChip, shuffled, carousel, difficultyPicker } from './components.js';
export function teamPick({app,collection,side,imageSrc,portraitSrc,onDone,solo=false,difficulty='easy',onDifficulty,opponentId='random',onOpponent,initialChoice=null}){
 app.replaceChildren();const panel=el('section','panel team-picker');app.append(panel);
 panel.setAttribute('aria-label',solo?'Solo battle team selection':`Player ${side+1} team selection`);
 const top=el('div','picker-heading');top.append(el('div','eyebrow',solo?'SOLO BATTLE':`PLAYER ${side+1}`));
 const toolbar=el('div','picker-toolbar'),done=el('button','primary','Start');done.id='team-done';done.disabled=true;
 if(solo)toolbar.append(difficultyPicker(difficulty,onDifficulty));toolbar.append(done);top.append(toolbar);panel.append(top);
 if(solo){
  const label=el('label','opponent-label','Opponent'),select=el('select');select.id='solo-opponent';
  const leaders=gymLeaders(collection);for(const leader of leaders){const option=el('option',null,`Gym Leader ${leader.nickname}`);option.value=leader.id;select.append(option);}
  const random=el('option',null,'Random Battle Bot');random.value='random';select.append(random);select.value=opponentId;label.append(select);panel.append(label);
  const preview=el('div','opponent-preview');panel.append(preview);
  function opponentPreview(){preview.replaceChildren();const leader=leaders.find(t=>t.id===select.value),img=el('img');img.src=portraitSrc(leader??{bot:true});img.alt=leader?.nickname??'Battle Bot';preview.append(img,el('span',null,leader?`${leader.nickname}'s gym · ${leader.creatures.length} creatures`:'Random creatures from the whole collection'));}
  select.onchange=()=>{onOpponent(select.value);opponentPreview();};opponentPreview();
 }

 const team=[],rule=teamRule(collection),options=rule.duplicates?Array.from({length:3},(_,i)=>({c:collection[i%collection.length],key:`copy-${i}`})):collection.map(c=>({c,key:c.id}));
 let trainer=collection.find(c=>c.id===initialChoice?.trainerId)??collection[Math.min(side,collection.length-1)];
 if(initialChoice)for(const c of initialChoice.team){const entry=options.find(e=>e.c.id===c.id&&!team.includes(e));if(entry)team.push(entry);}
 const summary=el('div','selection');summary.setAttribute('aria-label','Selected creatures');panel.append(summary);
 const trainerHeading=el('h2',null,'Trainer Portrait'),trainerCards=[],creatureCards=[];
 const trainerBar=el('div','trainer-heading'),nameLabel=el('label','trainer-name-label','Trainer name'),nameInput=el('input');nameInput.id='trainer-name';nameInput.maxLength=24;nameInput.autocomplete='off';nameInput.spellcheck=false;nameInput.value=initialChoice?.trainer.nickname??trainer.trainer.nickname;
 nameLabel.htmlFor=nameInput.id;nameLabel.append(nameInput);trainerBar.append(trainerHeading,nameLabel);panel.append(trainerBar);
 const nameMessage=el('p','name-error');nameMessage.id='trainer-name-error';nameMessage.setAttribute('role','status');nameMessage.hidden=true;nameInput.setAttribute('aria-describedby',nameMessage.id);panel.append(nameMessage);
 nameInput.oninput=update;
 const portraitRow=carousel(shuffled(collection.filter((c,i)=>collection.findIndex(m=>trainerKey(m)===trainerKey(c))===i)),c=>{const b=el('button','trainer-card');b.dataset.trainer=c.id;
  const img=el('img');img.src=portraitSrc(c.trainer,c.type);img.alt=c.trainer.nickname;const label=el('span',null,c.trainer.nickname);b.append(img,label);
  b.onclick=()=>{trainer=c;nameInput.value=c.trainer.nickname;update();};trainerCards.push({b,c,label});return b;
 },'trainer portraits');panel.append(portraitRow);
 panel.append(el('h2',null,'Creatures'));
 const creatureRow=carousel(shuffled(options),entry=>{const {c,key}=entry,b=el('button','pick-card');b.dataset.creature=c.id;b.dataset.pick=key;
  const img=el('img');img.src=imageSrc(c);img.alt=c.name;const mark=el('span','picked-label','SELECTED');
  b.append(mark,img,el('strong',null,c.name),typeChip(c.type),el('small','creature-creator',`Made by ${c.trainer.nickname}`));
  b.onclick=()=>{const i=team.findIndex(m=>m.key===key);if(i>=0)team.splice(i,1);else if(team.length<3)team.push(entry);update();};creatureCards.push({b,key});return b;
 },'creatures');panel.append(creatureRow);
 done.onclick=()=>{const creatures=team.map(e=>e.c);if(validateTeam(creatures,collection)&&!nameError(nameInput.value))onDone({team:creatures,trainerId:trainer.id,trainer:{...trainer.trainer,nickname:cleanName(nameInput.value),type:trainer.type}});};
 function update(){summary.replaceChildren();summary.append(el('span','selection-count',`${team.length}/3`));
  if(!team.length)summary.append(el('span','selection-placeholder','Select three creatures'));
  for(const entry of team){const chip=el('span','team-chip');chip.append(el('span',null,entry.c.name));
   const remove=el('button','remove-creature','x');remove.setAttribute('aria-label',`Remove ${entry.c.name}`);remove.onclick=()=>{team.splice(team.indexOf(entry),1);update();};chip.append(remove);summary.append(chip);
  }
  for(const {b,c,label}of trainerCards){const selected=trainerKey(trainer)===trainerKey(c);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));label.textContent=c.trainer.nickname;}
  for(const {b,key}of creatureCards){const selected=team.some(e=>e.key===key);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));b.disabled=!selected&&team.length===3;}
  const error=nameError(nameInput.value);nameInput.setAttribute('aria-invalid',String(!!error));nameMessage.textContent=error;nameMessage.hidden=!error;
  done.disabled=!!error||!validateTeam(team.map(e=>e.c),collection);
 }update();
}
