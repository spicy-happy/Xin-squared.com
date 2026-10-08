import { getActions, whoseTurn } from '../engine.js';
import { eventLines } from '../messages.js';
import { typeChip } from './components.js';
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
const icon={regular:'+',special:'*',defense:'#',switch:'<>'};
export function battleView({app,initial,trainers,imageSrc,portraitSrc,getState,onAction,onReplacement,onDrain,twoTap,humanSides=[0,1]}) {
  const view=structuredClone(initial),log=[];let locked=false,guardUntil=0,skip=null,selected=null,disposed=false,newPair=true,animationSide=null;
  app.replaceChildren();const arena=el('section','arena');app.append(arena);const round=el('div','round');arena.append(round);
  const body=el('div','battle-body');arena.append(body);const sides=[],grids=[],panels=[];
  const center=el('div','center'),tab=el('div','turn-tab'),box=el('button','text-box');box.id='battle-text';
  const announcement=el('div','sr-only');announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');announcement.setAttribute('aria-atomic','true');center.append(announcement);
  const history=el('button',null,'Battle Log');history.id='battle-history';center.append(tab,box,history);
  for(let side=0;side<2;side++){
    const section=el('section','side');section.dataset.side=side;const status=el('div','status'),stage=el('div','stage'),grid=el('div','grid');
    grid.dataset.grid=side;section.append(status,stage,grid);sides.push(section);grids.push(grid);panels.push({status,stage});
    if(side===1)body.append(center);body.append(section);
  }
  const active=side=>view.teams[side][view.active[side]];
  const name=side=>{const m=active(side);return active(0).name===active(1).name?`${trainers[side].nickname}'s ${m.name}`:m.name;};
  // Colour only name references inserted by the message formatter.
  function messages(e, previous){
    let token='NAME_REF_';while(JSON.stringify([e,name(0),name(1),previous,trainers.map(t=>t.nickname)]).includes(token))token+='X';
    const refs=[name(0),name(1),...previous];
    return eventLines(e,{name:s=>`${token}${s}_END`,previous:s=>`${token}${s+2}_END`,trainer:s=>trainers[s].nickname}).map(text=>{
      const parts=text.split(new RegExp(`(${token}[0-3]_END)`)).filter(Boolean).map(part=>{
        if(!part.startsWith(token))return {text:part};
        const i=Number(part.slice(token.length,-4));return {text:refs[i],side:i%2};
      });return {parts,text:parts.map(p=>p.text).join('')};
    });
  }
  function line(lines){box.classList.toggle('wide',lines.some(l=>l.text.length>34));box.replaceChildren();
    for(const message of lines){const row=el('div','message-line');
      for(const part of message.parts){if(part.side===undefined){row.append(document.createTextNode(part.text));continue;}
        const chip=el('span',`name-chip ${part.side?'right':'left'}`),portrait=el('img');portrait.src=portraitSrc(trainers[part.side]);portrait.alt='';chip.append(portrait,document.createTextNode(part.text));row.append(chip);
      }box.append(row);
    }
    box.append(el('small',null,locked?'>> Tap to skip':humanSides.includes(whoseTurn(getState()).side)?'Choose a move':'Bot is thinking…'));
    announcement.textContent=lines.map(l=>l.text).join(' ');
  }
  function paint(){for(let side=0;side<2;side++){
    const m=active(side),{status,stage}=panels[side];status.replaceChildren();const identity=el('div','identity');const p=el('img','portrait');p.src=portraitSrc(trainers[side]);p.alt=trainers[side].nickname;identity.append(p,document.createTextNode(name(side)));status.append(identity);
    const hp=el('div','hp'),fill=el('div','hp-fill'),shield=el('div','shield-fill');const total=Math.max(m.maxHp,m.hp+m.shield);fill.style.width=`${100*m.hp/total}%`;shield.style.width=`${100*m.shield/total}%`;hp.append(fill,shield);status.append(hp);
    const badges=el('div','badges');badges.append(el('span',null,`${m.hp}/${m.maxHp}${m.shield?` +${m.shield}`:''}`),typeChip(m.type),el('span',null,`${m.toughened?'Tough ':''}${m.resting?'NAP next turn':''}`));status.append(badges);
    stage.replaceChildren();const img=el('img');img.src=imageSrc(m);img.alt=m.name;stage.append(img);
  }}
  function confirm(side,action,text){if(!twoTap())return perform(side,action);const key=JSON.stringify(action);
    if(selected===key)return perform(side,action);selected=key;
    const bubble=el('div','confirm');bubble.append(el('div',null,text));const row=el('div','confirm-actions');const go=el('button',null,'GO!'),back=el('button',null,'Back');go.onclick=()=>perform(side,action);back.onclick=()=>{selected=null;controls();};row.append(go,back);bubble.append(row);grids[side].append(bubble);
  }
  function perform(side,action){if(disposed||locked||!humanSides.includes(side)||Date.now()<guardUntil)return;selected=null;onAction(side,action);}
  function tray(side,replacement){const s=view,g=grids[side];g.replaceChildren();const tray=el('div','tray');tray.append(el('strong',null,replacement?(humanSides.includes(side)?'Pick your next creature!':'Bot is choosing a creature…'):`Switches left: ${s.switchesLeft[side]}`));
    s.teams[side].forEach((m,index)=>{if(index===s.active[side]||m.hp<=0)return;const b=el('button',null,`${m.name} ${m.hp}/${m.maxHp}`);b.dataset.bench=index;b.append(typeChip(m.type));
      b.disabled=locked||!humanSides.includes(side);b.onclick=()=>{if(disposed||locked||!humanSides.includes(side)||Date.now()<guardUntil)return;if(replacement){onReplacement(side,index);}else confirm(side,{kind:'switch',index},`Bring in ${m.name}. Uses one switch.`);};tray.append(b);
    });if(!replacement){const cancel=el('button',null,'Back');cancel.onclick=controls;tray.append(cancel);}g.append(tray);
  }
  function controls(){if(disposed)return;const s=view,turn=locked?{side:animationSide,need:'action'}:whoseTurn(s);selected=null;
    const side=turn.side;tab.textContent=turn.over?'Battle complete':humanSides.includes(side)?`${side===0?'◀':'▶'} ${trainers[side].nickname}'s turn`:`${trainers[side].nickname} ${locked?'is moving…':'is thinking…'}`;tab.style.color=side===0?'var(--left)':'var(--right)';
    for(let owner=0;owner<2;owner++){
      sides[owner].classList.toggle('active',!locked&&!turn.over&&side===owner&&humanSides.includes(owner));sides[owner].classList.toggle('inactive',turn.over||side!==owner);const g=grids[owner];g.replaceChildren();
      const m=s.teams[owner][s.active[owner]],actions=getActions(s,owner);
      for(const [kind,label]of [['regular','Regular Attack'],['special','Special Attack'],['defense','Defensive Move'],['switch','Switch']]){
        const a=kind==='switch'?actions.find(a=>a.kind==='switch'&&a.enabled)??actions.find(a=>a.kind==='switch'):actions.find(a=>a.kind===kind||(kind==='regular'&&a.kind==='fallback'));
        const move=kind==='switch'?null:a.kind==='fallback'?s.rules.fallback:s.rules.moves[kind][m.moves[kind].id];
        const b=el('button',kind);b.dataset.action=kind;b.append(el('span','category',label));
        if(move){b.append(el('span','move-name',`${icon[kind]} ${a.kind==='fallback'?move.label:m.moves[kind].name}`),el('span','hint',move.secondPower?s.order[0]===owner?'strong now':'weak now':move.hint));
          const pp=m.pp[kind];b.append(el('span','pp',a.kind==='fallback'?'Always ready':pp>3?`${pp} left`:'●'.repeat(pp)+'○'.repeat(move.pp-pp)));
        }else b.append(el('span','pp','●'.repeat(s.switchesLeft[owner])+'○'.repeat(s.rules.switchLimit-s.switchesLeft[owner])));
        b.disabled=locked||!humanSides.includes(owner)||!a.enabled;b.setAttribute('aria-disabled',String(b.disabled));if(!a.enabled){const hint=b.querySelector('.hint');if(hint)hint.textContent=a.reason;else b.append(el('span','hint',a.reason));}
        b.onclick=()=>{if(disposed||locked||!humanSides.includes(owner)||Date.now()<guardUntil)return;if(kind==='switch')tray(owner,false);else {const explanation=a.kind==='fallback'?'Always hits. No type bonus.':kind==='defense'?move.label==='Heal'?`Get +${Math.min(m.maxHp-m.hp,Math.floor(m.maxHp*move.factor[0]/move.factor[1]+0.5))} HP.`:move.hint:move.hint;confirm(owner,{kind:a.kind},explanation);}};g.append(b);
      }
      if(!locked&&turn.need==='replacement'&&side===owner)tray(owner,true);
    }
  }
  function applyEvent(e){if(e.t==='switch'){newPair=true;active(e.side).shield=0;active(e.side).toughened=false;view.active[e.side]=e.to;}if(e.t==='enter'){newPair=true;view.active[e.side]=e.slot;}
    const owner=e.t==='hit'?e.target:e.side;const m=owner===0||owner===1?active(owner):null;
    if(m){if(e.hpAfter!==undefined)m.hp=e.hpAfter;if(e.ppAfter)m.pp={...e.ppAfter};if(e.shieldAfter!==undefined)m.shield=e.shieldAfter;if(e.t==='toughen')m.toughened=true;if(e.t==='rest')m.resting=false;if(e.t==='use'&&e.moveId==='overload')m.resting=true;if(e.t==='faint'){m.resting=false;m.toughened=false;} }
    if(e.switchesLeft!==undefined)view.switchesLeft[e.side]=e.switchesLeft;
    if(e.t==='round'){view.order=[...e.order];view.round=e.n;round.textContent=`ROUND ${e.n} · ${name(e.order[0])} ${e.reason==='coin'?'won the coin toss':'is faster'}${e.double!==null?' · 2 in a row':''}`;if(e.reason==='coin')for(const owner of [1,0]){const portrait=el('img',newPair?'coin-portrait flip':'coin-portrait');portrait.src=portraitSrc(trainers[owner]);portrait.alt=trainers[owner].nickname;round.prepend(portrait);}newPair=false;}
  }
  async function animate(events){
    animationSide=events.find(e=>['use','switch','rest'].includes(e.t))?.side ?? events.find(e=>e.t==='round')?.order[0] ?? whoseTurn(getState()).side ?? getState().winner ?? 0;
    locked=true;controls();
    let cancelled=false,wake,last=[],summary=[];
    skip=()=>{cancelled=true;if(wake)wake();};
    for(const e of events){
      if(disposed)return;const previous=[name(0),name(1)];applyEvent(e);paint();controls();
      const lines=messages(e,previous);
      for(const message of lines){log.push(message.text);if(log.length>10)log.shift();}
      if(['hit','heal','miss','recoil','faint','win','switch','rest'].includes(e.t)){
        if(e.t==='hit')summary=[lines.find(l=>l.text.startsWith('It dealt'))];
        else summary=summary[0]?.text.startsWith('It dealt')?[summary[0],lines[0]]:[lines[0]];
      }
      for(let i=0;i<lines.length;i+=2){last=lines.slice(i,i+2);if(cancelled)continue;line(last);
        const duration=Math.max(1400*last.length,last.reduce((n,l)=>n+l.text.split(/\s+/).length,0)*350);
        await new Promise(resolve=>{const timer=setTimeout(resolve,duration);wake=()=>{clearTimeout(timer);resolve();};});
      }
    }
    if(disposed)return;Object.assign(view,structuredClone(getState()));skip=null;locked=false;guardUntil=Date.now()+400;paint();controls();line(summary.length?summary:last);
    setTimeout(()=>{if(!disposed){controls();onDrain();}},400);
  }
  box.onclick=()=>{if(locked&&skip)skip();};history.onclick=()=>{if(locked||Date.now()<guardUntil)return;const panel=el('div','log-panel');for(const text of log)panel.append(el('p',null,text));const close=el('button',null,'Close');close.onclick=()=>panel.remove();panel.append(close);app.append(panel);};
  paint();controls();return {animate,dispose(){disposed=true;if(skip)skip();},isLocked:()=>locked||Date.now()<guardUntil,refresh:paint};
}
