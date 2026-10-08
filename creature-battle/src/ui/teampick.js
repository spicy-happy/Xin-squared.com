import { teamRule, validateTeam } from '../collection.js';
export function teamPick({ app, collection, side, imageSrc, onDone }) {
  app.replaceChildren();const panel=document.createElement('section');panel.className='panel';app.append(panel);
  const title=document.createElement('h1');title.textContent=`Player ${side+1}: pick your team`;panel.append(title);
  const label=document.createElement('label');label.textContent='Trainer portrait: ';
  const select=document.createElement('select');select.id='trainer-pick';
  collection.forEach((c,i)=>{const o=document.createElement('option');o.value=i;o.textContent=c.trainer.nickname;select.append(o);});
  select.value=String(Math.min(side,collection.length-1));label.append(select);panel.append(label);
  const note=document.createElement('p');note.textContent=teamRule(collection).duplicates?'Pick 3. Copies are okay with this small collection.':'Pick 3 different creatures.';panel.append(note);
  const summary=document.createElement('div');summary.className='selection';panel.append(summary);
  const cards=document.createElement('div');cards.className='cards';panel.append(cards);
  const team=[];const done=document.createElement('button');done.id='team-done';done.textContent='Team ready!';done.disabled=true;
  const reset=document.createElement('button');reset.textContent='Clear picks';reset.onclick=()=>{team.length=0;update();};
  const update=()=>{summary.textContent=team.length?team.map(c=>c.name).join(' · '):'Choose your first creature';done.disabled=!validateTeam(team,collection);};
  collection.forEach(c=>{const b=document.createElement('button');b.className='pick-card';b.dataset.creature=c.id;
    const img=document.createElement('img');img.src=imageSrc(c);img.alt=c.name;
    const n=document.createElement('strong');n.textContent=c.name;const type=document.createElement('span');type.textContent=c.type;
    b.append(img,n,type);b.onclick=()=>{if(team.length<3&&(teamRule(collection).duplicates||!team.some(m=>m.id===c.id))){team.push(c);update();}};cards.append(b);
  });
  done.onclick=()=>{if(validateTeam(team,collection))onDone({team:[...team],trainer:collection[Number(select.value)].trainer});};
  const actions=document.createElement('div');actions.className='choices';actions.append(reset,done);panel.append(actions);update();
}
