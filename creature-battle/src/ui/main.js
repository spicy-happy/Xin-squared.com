import { loadRules } from '../rules.js';
import { loadCollection } from '../collection.js';
import { createMatch, applyAction, chooseReplacement, whoseTurn } from '../engine.js';
import { chooseAction, chooseTeam, chooseReplacement as aiReplacement } from '../ai.js';
import { teamPick } from './teampick.js';
import { initAudio } from './audio.js';
import { battleView } from './battle.js';
import { spriteSrc, prepareSprites } from './pixels.js';
import { typeChip, carousel, shuffled } from './components.js';
initAudio();
const app=document.querySelector('#app'),debug=new URLSearchParams(location.search).get('debug')==='1';
const tag=document.querySelector('#debug-tag');tag.hidden=!debug;
const rotate=document.querySelector('#rotate'),orientation=matchMedia('(orientation: portrait)');
let ready=false,screen='home',rules,collection,mode='ai',difficulty='normal',picks=[],state,view,seed=Date.now()>>>0,aiRng=571,lastSwitch=false,aiTimer=null,updateAvailable=false;
const imageSrc=c=>spriteSrc(debug?'tests/fixtures/placeholder.svg':c.image.src,c.type);
const portraitSrc=(t,type=t.type??collection?.find(c=>c.trainer.portrait===t.portrait)?.type??'grass')=>spriteSrc(t.bot?'assets/portraits/practice-bot.svg':debug?'tests/fixtures/portrait.svg':t.portrait,t.bot?'water':type);
const botDifficulty=()=>difficulty==='hard'?'normal':'easy';
const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x;};
function orient(){rotate.hidden=screen!=='battle'||!orientation.matches;}
orientation.addEventListener('change',orient);
async function checkForUpdate(){try{const r=await fetch(location.pathname,{cache:'no-store'});const html=r.ok?await r.text():'';const m=html.match(/GAME_VERSION\s*=\s*(\d+)/);if(m&&+m[1]!==window.GAME_VERSION)updateAvailable=true;}catch{}return updateAvailable;}
function applyUpdate(){if(!updateAvailable)return false;try{if(sessionStorage.getItem('cb-reloadedFor')===String(window.GAME_VERSION))return false;sessionStorage.setItem('cb-reloadedFor',String(window.GAME_VERSION));}catch{}location.replace(location.pathname+'?v='+Date.now()+(debug?'&debug=1':''));return true;}
function cleanup(){if(view)view.dispose();view=null;clearTimeout(aiTimer);aiTimer=null;}
function page(title){cleanup();app.replaceChildren();const panel=el('section');panel.className='panel';panel.append(el('h1',title));app.append(panel);return panel;}
function button(parent,text,fn,id){const b=el('button',text);if(id)b.id=id;b.onclick=fn;parent.append(b);return b;}
document.querySelector('#game-home').onclick=e=>{e.preventDefault();if(ready)home();};
function home(){screen='home';orient();if(applyUpdate())return;const panel=page('Creature Battle');checkForUpdate().then(()=>{if(screen==='home')applyUpdate();});panel.append(el('p','Your drawings. Teams of three. One move at a time.'));
  const choices=el('div');choices.className='choices';panel.append(choices);
  for(const [kind,text]of [['ai','Solo Battle'],['friend','2 Player Battle']]){const b=button(choices,text,()=>{mode=kind;setup();},`play-${kind}`);b.disabled=!collection.length;}
  button(choices,'See Creatures',()=>showCollection(),'collection');const sheet=el('a','Print Creature Sheet');sheet.id='print-sheet';sheet.href='output/pdf/creature-sheet.pdf?v=23';sheet.target='_blank';sheet.rel='noopener';choices.append(sheet);
}
function showCollection(){screen='collection';const panel=page('Creatures');
  panel.append(carousel(shuffled(collection),c=>{const card=el('article');card.className='collection-card';const img=el('img');img.src=imageSrc(c);img.alt=c.name;card.append(img,el('h2',c.name),typeChip(c.type),el('p',`Made by ${c.trainer.nickname}`));return card;},'collection creatures'));button(panel,'Home',home);
}
function setup(){cleanup();difficulty='normal';picks=[];pick(0);}
function pick(side){cleanup();screen='teampick';orient();teamPick({app,collection,side,imageSrc,portraitSrc,solo:mode==='ai',difficulty,onDifficulty:value=>{difficulty=value;},onDone:choice=>{
  picks[side]=choice;if(side===0&&mode==='friend')lookAway();else if(mode==='ai'){
    const ai=chooseTeam(collection,{difficulty:botDifficulty(),aiRng});aiRng=ai.aiRng;picks[1]={team:ai.team,trainer:{bot:true,nickname:'Battle Bot',portrait:'assets/portraits/practice-bot.svg'}};start();
  }else start();
}});}
function lookAway(){screen='lookaway';const panel=page("Player 2's turn");panel.className='look-away';panel.append(el('p',"Player 1, look away!"));button(panel,"I'm ready",()=>pick(1),'lookaway-ready');}
function start(){if(picks[0].trainer.nickname===picks[1].trainer.nickname)picks=picks.map((p,side)=>({...p,trainer:{...p.trainer,nickname:`${p.trainer.nickname.slice(0,22).trimEnd()} ${side+1}`}}));cleanup();screen='battle';orient();lastSwitch=false;const initial=createMatch({rules,teams:picks.map(p=>p.team),seed});state=initial.state;
  view=battleView({app,humanSides:mode==='ai'?[0]:[0,1],initial:state,trainers:picks.map(p=>p.trainer),imageSrc,portraitSrc,getState:()=>state,
    twoTap:()=>false,onAction:action,onReplacement:replace,onDrain:drain});view.animate(initial.events);
}
function action(side,choice){if(view.isLocked())return;try{const result=applyAction(state,side,choice);state=result.state;view.animate(result.events);}catch(e){console.error(e);}}
function replace(side,index){if(view.isLocked())return;const result=chooseReplacement(state,side,index);state=result.state;view.animate(result.events);}
function drain(){if(screen!=='battle')return;if(state.over){if(state.reason==='cap')console.error('Battle safety cap triggered');result();return;}
  const t=whoseTurn(state);if(mode==='ai'&&t.side===1){clearTimeout(aiTimer);aiTimer=setTimeout(()=>{
    aiTimer=null;if(screen!=='battle'||!view||view.isLocked())return;
    const current=whoseTurn(state);if(current.over||current.side!==1)return;
    const opts={difficulty:botDifficulty(),aiRng,lastSwitch};if(current.need==='replacement'){const choice=aiReplacement(state,1,opts);aiRng=choice.aiRng;lastSwitch=false;replace(1,choice.index);}else{const choice=chooseAction(state,1,opts);aiRng=choice.aiRng;lastSwitch=choice.lastSwitch;action(1,choice.action);}
  },600+Math.floor(Math.random()*401));}
}
function result(){screen='result';orient();const panel=page(`${picks[state.winner].trainer.nickname} wins!`);panel.append(el('p',`Good try, ${picks[1-state.winner].trainer.nickname}!`));const lineup=el('div');lineup.className='result-team';for(const c of picks[state.winner].team){const card=el('article');const img=el('img');img.src=imageSrc(c);img.alt=c.name;card.append(img,el('span',c.name),typeChip(c.type));lineup.append(card);}panel.append(lineup);const choices=el('div');choices.className='choices';panel.append(choices);
  button(choices,'Rematch',async()=>{await checkForUpdate();if(screen==='result'&&!applyUpdate()){seed=(seed+1)>>>0;start();}},'rematch');button(choices,'New teams',async()=>{await checkForUpdate();if(screen==='result'&&!applyUpdate())setup();},'new-teams');button(choices,'Home',home,'home');
}
try{
  const fetchJSON=async url=>{const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw Error(`Cannot load ${url}`);return r.json();};
  rules=loadRules(await fetchJSON('data/rules-v1.json'));collection=loadCollection(await fetchJSON('data/creatures.json'),rules);
  if(debug){collection=loadCollection(await fetchJSON('tests/fixtures/creatures.json'),rules);window.__battleDebug={state:()=>structuredClone(state),seed:n=>{seed=n>>>0;},force:(side,a)=>{if(view?.isLocked())throw Error('Animation or input guard active');action(side,a);},setHp:(side,hp)=>{if(!state||view.isLocked())throw Error('Not ready');const m=state.teams[side][state.active[side]];m.hp=Math.max(1,Math.min(m.maxHp,Math.floor(hp)));/* Debug view is deliberately rebuilt for a forced value. */ view.dispose();view=battleView({app,humanSides:mode==='ai'?[0]:[0,1],initial:state,trainers:picks.map(p=>p.trainer),imageSrc,portraitSrc,getState:()=>state,twoTap:()=>false,onAction:action,onReplacement:replace,onDrain:drain});},fixtures:()=>structuredClone(collection)};}
  await prepareSprites(collection,{debug});
  ready=true;home();if(debug)window.__battleReady=true;setTimeout(()=>checkForUpdate().then(()=>{if(screen==='home')applyUpdate();}),4000);
}catch(error){app.textContent=`We couldn't load the collection. ${error.message}`;console.error(error);}
