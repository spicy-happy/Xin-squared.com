import { loadRules } from '../rules.js';
import { loadCollection } from '../collection.js';
import { createMatch, applyAction, chooseReplacement, whoseTurn } from '../engine.js';
import { chooseAction, chooseTeam, chooseReplacement as aiReplacement } from '../ai.js';
import { teamPick } from './teampick.js';
import { battleView } from './battle.js';
const app=document.querySelector('#app'),debug=new URLSearchParams(location.search).get('debug')==='1';
const tag=document.querySelector('#debug-tag');tag.hidden=!debug;
const rotate=document.querySelector('#rotate'),orientation=matchMedia('(orientation: portrait)');
let screen='home',rules,collection,mode='ai',difficulty='easy',picks=[],state,view,seed=Date.now()>>>0,aiRng=571,lastSwitch=false,aiTimer=null,updateAvailable=false;
const imageSrc=c=>debug?'tests/fixtures/placeholder.svg':c.image.src;
const portraitSrc=t=>t.bot?'assets/portraits/practice-bot.svg':debug?'tests/fixtures/portrait.svg':t.portrait;
const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x;};
function orient(){rotate.hidden=screen!=='battle'||!orientation.matches;}
orientation.addEventListener('change',orient);
async function checkForUpdate(){try{const r=await fetch(location.pathname,{cache:'no-store'});const html=r.ok?await r.text():'';const m=html.match(/GAME_VERSION\s*=\s*(\d+)/);if(m&&+m[1]!==window.GAME_VERSION)updateAvailable=true;}catch{}return updateAvailable;}
function applyUpdate(){if(!updateAvailable)return false;try{if(sessionStorage.getItem('cb-reloadedFor')===String(window.GAME_VERSION))return false;sessionStorage.setItem('cb-reloadedFor',String(window.GAME_VERSION));}catch{}location.replace(location.pathname+'?v='+Date.now()+(debug?'&debug=1':''));return true;}
function cleanup(){if(view)view.dispose();view=null;clearTimeout(aiTimer);aiTimer=null;}
function page(title){cleanup();app.replaceChildren();const panel=el('section');panel.className='panel';panel.append(el('h1',title));app.append(panel);return panel;}
function button(parent,text,fn,id){const b=el('button',text);if(id)b.id=id;b.onclick=fn;parent.append(b);return b;}
function home(){screen='home';orient();if(applyUpdate())return;const panel=page('Creature Battle');checkForUpdate().then(()=>{if(screen==='home')applyUpdate();});panel.append(el('p','Your drawings. Teams of three. One move at a time.'));
  if(!collection.length)panel.append(el('p','Make the first creature! Draw a creature and a made-up trainer portrait. A grown-up imports the sheet after permission and review.'));
  const choices=el('div');choices.className='choices';panel.append(choices);
  for(const [kind,text]of [['ai','Play against AI'],['friend','Play with a friend']]){const b=button(choices,text,()=>{mode=kind;setup();},`play-${kind}`);b.disabled=!collection.length;}
  button(choices,'Creature collection',()=>showCollection(),'collection');button(choices,'Print a creature sheet',()=>{screen='print';const p=page('Make a creature');p.append(el('p','The printable Ruleset 1 sheet and import kit arrive in Phase 4. Drawings need parent or teacher permission and owner review before publishing.'));button(p,'Home',home);},'print-sheet');
}
function showCollection(){screen='collection';const panel=page('Creature collection');if(!collection.length)panel.append(el('p','No creatures yet. Make the first one!'));
  const cards=el('div');cards.className='cards';panel.append(cards);for(const c of collection){const card=el('article');const img=el('img');img.src=imageSrc(c);img.alt=c.name;img.style.height='100px';card.append(img,el('h2',c.name),el('p',`Drawn by ${c.trainer.nickname}`));cards.append(card);}button(panel,'Home',home);
}
function setup(){screen='setup';const panel=page(mode==='ai'?'Choose practice or challenge':'Two trainers, one screen');
  difficulty='easy';if(mode==='ai'){const label=el('label','Difficulty: '),select=el('select');select.id='difficulty';for(const [v,t]of [['easy','Easy (practice)'],['normal','Normal']]){const o=el('option',t);o.value=v;select.append(o);}select.onchange=()=>difficulty=select.value;label.append(select);panel.append(label);}
  panel.append(el('p',mode==='friend'?'Player 1 sits on the left. Pick your teams privately, then put the screen flat between you.':'Pick a trainer portrait and three creatures.'));button(panel,'Pick my team',()=>{picks=[];pick(0);},'start-picking');button(panel,'Home',home);
}
function pick(side){screen='teampick';teamPick({app,collection,side,imageSrc,onDone:choice=>{picks[side]=choice;if(side===0&&mode==='friend')lookAway();else if(mode==='ai'){const ai=chooseTeam(collection,{difficulty,aiRng});aiRng=ai.aiRng;picks[1]={team:ai.team,trainer:{bot:true,nickname:'Practice Bot',portrait:'assets/portraits/practice-bot.svg'}};reveal();}else reveal();}});}
function lookAway(){screen='lookaway';const panel=page("Player 2's turn");panel.className='look-away';panel.append(el('p',"Player 1, look away!"));button(panel,"I'm ready",()=>pick(1),'lookaway-ready');}
function reveal(){if(picks[0].trainer.nickname===picks[1].trainer.nickname)picks=picks.map((p,side)=>({...p,trainer:{...p.trainer,nickname:`Player ${side+1}`}}));screen='reveal';const panel=page('Meet the teams');for(let side=0;side<2;side++)panel.append(el('p',`${picks[side].trainer.nickname}: ${picks[side].team.map(c=>c.name).join(' · ')}`));panel.append(el('p','Put it flat between you, sitting side by side. Player 1 is on the left.'));button(panel,'Battle!',start,'start-battle');}
function start(){cleanup();screen='battle';orient();lastSwitch=false;const initial=createMatch({rules,teams:picks.map(p=>p.team),seed});state=initial.state;
  view=battleView({app,humanSides:mode==='ai'?[0]:[0,1],initial:state,trainers:picks.map(p=>p.trainer),imageSrc,portraitSrc,getState:()=>state,
    twoTap:()=>document.querySelector('#confirm-setting').checked,onAction:action,onReplacement:replace,onDrain:drain});view.animate(initial.events);
}
function action(side,choice){if(view.isLocked())return;try{const result=applyAction(state,side,choice);state=result.state;view.animate(result.events);}catch(e){console.error(e);}}
function replace(side,index){if(view.isLocked())return;const result=chooseReplacement(state,side,index);state=result.state;view.animate(result.events);}
function drain(){if(screen!=='battle')return;if(state.over){if(state.reason==='cap')console.error('Battle safety cap triggered');result();return;}
  const t=whoseTurn(state);if(mode==='ai'&&t.side===1){clearTimeout(aiTimer);aiTimer=setTimeout(()=>{
    aiTimer=null;if(screen!=='battle'||!view||view.isLocked())return;
    const current=whoseTurn(state);if(current.over||current.side!==1)return;
    const opts={difficulty,aiRng,lastSwitch};if(current.need==='replacement'){const choice=aiReplacement(state,1,opts);aiRng=choice.aiRng;lastSwitch=false;replace(1,choice.index);}else{const choice=chooseAction(state,1,opts);aiRng=choice.aiRng;lastSwitch=choice.lastSwitch;action(1,choice.action);}
  },600+Math.floor(Math.random()*401));}
}
function result(){screen='result';orient();const panel=page(`${picks[state.winner].trainer.nickname} wins!`);panel.append(el('p',`Good try, ${picks[1-state.winner].trainer.nickname}!`));const choices=el('div');choices.className='choices';panel.append(choices);
  button(choices,'Rematch',async()=>{await checkForUpdate();if(screen==='result'&&!applyUpdate()){seed=(seed+1)>>>0;start();}},'rematch');button(choices,'New teams',async()=>{await checkForUpdate();if(screen==='result'&&!applyUpdate())setup();},'new-teams');button(choices,'Home',home,'home');
}
try{
  const fetchJSON=async url=>{const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw Error(`Cannot load ${url}`);return r.json();};
  rules=loadRules(await fetchJSON('data/rules-v1.json'));collection=loadCollection(await fetchJSON('data/creatures.json'),rules);
  if(debug){collection=loadCollection(await fetchJSON('tests/fixtures/creatures.json'),rules);window.__battleDebug={state:()=>structuredClone(state),seed:n=>{seed=n>>>0;},force:(side,a)=>{if(view?.isLocked())throw Error('Animation or input guard active');action(side,a);},setHp:(side,hp)=>{if(!state||view.isLocked())throw Error('Not ready');const m=state.teams[side][state.active[side]];m.hp=Math.max(1,Math.min(m.maxHp,Math.floor(hp)));/* Debug view is deliberately rebuilt for a forced value. */ view.dispose();view=battleView({app,humanSides:mode==='ai'?[0]:[0,1],initial:state,trainers:picks.map(p=>p.trainer),imageSrc,portraitSrc,getState:()=>state,twoTap:()=>document.querySelector('#confirm-setting').checked,onAction:action,onReplacement:replace,onDrain:drain});},fixtures:()=>structuredClone(collection)};}
  home();if(debug)window.__battleReady=true;setTimeout(()=>checkForUpdate().then(()=>{if(screen==='home')applyUpdate();}),4000);
}catch(error){app.textContent=`We couldn't load the collection. ${error.message}`;console.error(error);}
