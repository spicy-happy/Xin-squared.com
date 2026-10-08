import { getActions, whoseTurn } from '../engine.js';
import { eventLines } from '../messages.js';
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
const icon={regular:'✦',special:'◆',defense:'⬡',switch:'⇄'};
export function battleView({app,initial,trainers,imageSrc,portraitSrc,getState,onAction,onReplacement,onDrain,twoTap}) {
  const view=structuredClone(initial),log=[];let locked=false,guardUntil=0,skip=null,selected=null,disposed=false,newPair=true,animationSide=null;
  app.replaceChildren();const arena=el('section','arena');app.append(arena);const round=el('div','round');arena.append(round);
  const body=el('div','battle-body');arena.append(body);const sides=[],grids=[],panels=[];
  const center=el('div','center'),tab=el('div','turn-tab'),box=el('button','text-box');box.id='battle-text';
  const history=el('button',null,'📜 Last 10 lines');history.id='battle-history';center.append(tab,box,history);
  for(let side=0;side<2;side++){
    const section=el('section','side');section.dataset.side=side;const status=el('div','status'),stage=el('div','stage'),grid=el('div','grid');
    grid.dataset.grid=side;section.append(status,stage,grid);sides.push(section);grids.push(grid);panels.push({status,stage});
    if(side===1)body.append(center);body.append(section);
  }
  const active=side=>view.teams[side][view.active[side]];
  const name=side=>{const m=active(side);return active(0).name===active(1).name?`${trainers[side].nickname}'s ${m.name}`:m.name;};
  function line(text){box.classList.toggle('wide',text.length>34);box.replaceChildren();const names=[name(0),name(1)];let pos=0;
    while(pos<text.length){let side=-1,start=text.length;for(let i=0;i<2;i++){const p=text.indexOf(names[i],pos);if(p>=0&&(p<start||(p===start&&names[i].length>(names[side]?.length??0)))){side=i;start=p;}}
      if(side<0){box.append(document.createTextNode(text.slice(pos)));break;}
      box.append(document.createTextNode(text.slice(pos,start)));const chip=el('span',`name-chip ${side?'right':'left'}`);const portrait=el('img');portrait.src=portraitSrc(trainers[side]);portrait.alt='';chip.append(portrait,document.createTextNode(names[side]));box.append(chip);pos=start+names[side].length;
    }
    box.append(el('small',null,locked?'⏩ Tap here to skip':'Choose a move'));
  }
  function paint(){for(let side=0;side<2;side++){
    const m=active(side),{status,stage}=panels[side];status.replaceChildren();const identity=el('div','identity');const p=el('img','portrait');p.src=portraitSrc(trainers[side]);p.alt=trainers[side].nickname;identity.append(p,document.createTextNode(name(side)));status.append(identity);
    const hp=el('div','hp'),fill=el('div','hp-fill'),shield=el('div','shield-fill');const total=Math.max(m.maxHp,m.hp+m.shield);fill.style.width=`${100*m.hp/total}%`;shield.style.width=`${100*m.shield/total}%`;hp.append(fill,shield);status.append(hp);
    const badges=el('div','badges');badges.append(el('span',null,`${m.hp}/${m.maxHp}${m.shield?` +${m.shield}`:''}`),el('span',null,`${m.type} ${m.toughened?'Tough ':''}${m.resting?'💤 next turn':''}`));status.append(badges);
    stage.replaceChildren();const img=el('img');img.src=imageSrc(m);img.alt=m.name;stage.append(img);
  }}
  function confirm(side,action,text){if(!twoTap())return perform(side,action);const key=JSON.stringify(action);
    if(selected===key)return perform(side,action);selected=key;
    const bubble=el('div','confirm');bubble.append(el('div',null,text));const row=el('div','confirm-actions');const go=el('button',null,'GO!'),back=el('button',null,'Back');go.onclick=()=>perform(side,action);back.onclick=()=>{selected=null;controls();};row.append(go,back);bubble.append(row);grids[side].append(bubble);
  }
  function perform(side,action){if(disposed||locked||Date.now()<guardUntil)return;selected=null;onAction(side,action);}
  function tray(side,replacement){const s=getState(),g=grids[side];g.replaceChildren();const tray=el('div','tray');tray.append(el('strong',null,replacement?'Pick your next creature!':`Switches left: ${s.switchesLeft[side]}`));
    s.teams[side].forEach((m,index)=>{if(index===s.active[side]||m.hp<=0)return;const b=el('button',null,`${m.name} ${m.hp}/${m.maxHp}`);b.dataset.bench=index;
      b.onclick=()=>{if(locked||Date.now()<guardUntil)return;if(replacement){onReplacement(side,index);}else confirm(side,{kind:'switch',index},`Bring in ${m.name}. Uses one switch.`);};tray.append(b);
    });if(!replacement){const cancel=el('button',null,'Back');cancel.onclick=controls;tray.append(cancel);}g.append(tray);
  }
  function controls(){if(disposed)return;const s=getState(),turn=locked?{side:animationSide,need:'action'}:whoseTurn(s);selected=null;
    const side=turn.side;tab.textContent=turn.over?'Battle complete':`${side===0?'◀':'▶'} ${trainers[side].nickname}'s turn`;tab.style.color=side===0?'var(--left)':'var(--right)';
    for(let owner=0;owner<2;owner++){
      sides[owner].classList.toggle('active',!turn.over&&side===owner);sides[owner].classList.toggle('inactive',turn.over||side!==owner);const g=grids[owner];g.replaceChildren();
      const m=s.teams[owner][s.active[owner]],actions=getActions(s,owner);
      for(const [kind,label]of [['regular','Regular Attack'],['special','Special Attack'],['defense','Defensive Move'],['switch','Switch']]){
        const a=kind==='switch'?actions.find(a=>a.kind==='switch'&&a.enabled)??actions.find(a=>a.kind==='switch'):actions.find(a=>a.kind===kind||(kind==='regular'&&a.kind==='fallback'));
        const move=kind==='switch'?null:a.kind==='fallback'?s.rules.fallback:s.rules.moves[kind][m.moves[kind].id];
        const b=el('button',kind);b.dataset.action=kind;b.append(el('span','category',label));
        if(move){b.append(el('span','move-name',`${icon[kind]} ${a.kind==='fallback'?move.label:m.moves[kind].name}`),el('span','hint',move.secondPower?s.order[0]===owner?'strong now':'weak now':move.hint));
          const pp=m.pp[kind];b.append(el('span','pp',a.kind==='fallback'?'Always ready':pp>3?`${pp} left`:'●'.repeat(pp)+'○'.repeat(move.pp-pp)));
        }else b.append(el('span','pp','●'.repeat(s.switchesLeft[owner])+'○'.repeat(s.rules.switchLimit-s.switchesLeft[owner])));
        b.disabled=locked||!a.enabled;b.setAttribute('aria-disabled',String(b.disabled));if(!a.enabled){const hint=b.querySelector('.hint');if(hint)hint.textContent=a.reason;else b.append(el('span','hint',a.reason));}
        b.onclick=()=>{if(locked||Date.now()<guardUntil)return;if(kind==='switch')tray(owner,false);else {const explanation=a.kind==='fallback'?'Always hits. No type bonus.':kind==='defense'?move.label==='Heal'?`Get +${Math.min(m.maxHp-m.hp,Math.floor(m.maxHp*move.factor[0]/move.factor[1]+0.5))} HP.`:move.hint:move.hint;confirm(owner,{kind:a.kind},explanation);}};g.append(b);
      }
      if(!locked&&turn.need==='replacement'&&side===owner)tray(owner,true);
    }
  }
  function applyEvent(e){if(e.t==='switch'){newPair=true;active(e.side).shield=0;active(e.side).toughened=false;view.active[e.side]=e.to;}if(e.t==='enter'){newPair=true;view.active[e.side]=e.slot;}
    const owner=e.t==='hit'?e.target:e.side;const m=owner===0||owner===1?active(owner):null;
    if(m){if(e.hpAfter!==undefined)m.hp=e.hpAfter;if(e.ppAfter)m.pp={...e.ppAfter};if(e.shieldAfter!==undefined)m.shield=e.shieldAfter;if(e.t==='toughen')m.toughened=true;if(e.t==='rest')m.resting=false;if(e.t==='use'&&e.moveId==='overload')m.resting=true;if(e.t==='faint'){m.resting=false;m.toughened=false;} }
    if(e.t==='round'){round.textContent=`ROUND ${e.n} · ${name(e.order[0])} ${e.reason==='coin'?'won the coin toss':'is faster'}${e.double!==null?' · 2 in a row':''}`;if(e.reason==='coin')for(const owner of [1,0]){const portrait=el('img',newPair?'coin-portrait flip':'coin-portrait');portrait.src=portraitSrc(trainers[owner]);portrait.alt=trainers[owner].nickname;round.prepend(portrait);}newPair=false;}
  }
  async function animate(events){
    animationSide=events.find(e=>['use','switch','rest'].includes(e.t))?.side ?? events.find(e=>e.t==='round')?.order[0] ?? whoseTurn(getState()).side ?? getState().winner ?? 0;
    locked=true;controls();
    const countContext={name:()=>'',trainer:()=>'',previous:()=>''};
    const hasRest=events.some(e=>e.t==='rest');
    const others=events.filter(e=>e.t!=='rest').reduce((n,e)=>n+eventLines(e,countContext).length,0);
    let cancelled=false,wake,last='Choose a move';
    skip=()=>{cancelled=true;if(wake)wake();};
    for(const e of events){
      if(disposed)return;const previous=[name(0),name(1)];applyEvent(e);paint();
      const lines=eventLines(e,{name,trainer:s=>trainers[s].nickname,previous:s=>previous[s]});
      for(const text of lines){
        last=text;log.push(text);if(log.length>10)log.shift();
        if(cancelled)continue;line(text);
        await new Promise(resolve=>{const timer=setTimeout(resolve,e.t==='rest'?1200:(hasRest?600:1600)/Math.max(1,others));wake=()=>{clearTimeout(timer);resolve();};});
      }
    }
    if(disposed)return;skip=null;locked=false;guardUntil=Date.now()+400;line(last);controls();
    setTimeout(()=>{if(!disposed){controls();onDrain();}},400);
  }
  box.onclick=()=>{if(locked&&skip)skip();};history.onclick=()=>{if(locked||Date.now()<guardUntil)return;const panel=el('div','log-panel');for(const text of log)panel.append(el('p',null,text));const close=el('button',null,'Close');close.onclick=()=>panel.remove();panel.append(close);app.append(panel);};
  paint();controls();return {animate,dispose(){disposed=true;if(skip)skip();},isLocked:()=>locked||Date.now()<guardUntil,refresh:paint};
}
