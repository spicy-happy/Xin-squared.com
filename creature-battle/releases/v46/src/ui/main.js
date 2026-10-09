import { loadRules } from '../rules.js';
import { loadCollection } from '../collection.js';
import { createMatch, applyAction, chooseReplacement, whoseTurn } from '../engine.js';
import { createTrainerProgress } from '../progress.js';
import { chooseOpponent, battleTrainers, sameTrainerName } from '../trainers.js';
import { chooseAction, chooseReplacement as aiReplacement } from '../ai.js';
import { teamPick, opponentPick } from './teampick.js';
import { initAudio, setMusic } from './audio.js';
import { battleView } from './battle.js';
import { spriteSrc, prepareSprites } from './pixels.js';
import { typeChip, carousel, shuffled, moveList } from './components.js';
initAudio();
const trainerProgress=createTrainerProgress();
const app=document.querySelector('#app'),debug=new URLSearchParams(location.search).get('debug')==='1';
const tag=document.querySelector('#debug-tag');tag.hidden=!debug;
const rotate=document.querySelector('#rotate'),orientation=matchMedia('(orientation: portrait)');
let ready=false,screen='home',rules,collection,mode='ai',difficulty='easy',opponentId='random',picks=[],state,view,seed=Date.now()>>>0,aiRng=crypto.getRandomValues(new Uint32Array(1))[0],lastSwitch=false,aiTimer=null,updateAvailable=0,firstPicks=null;
const imageSrc=c=>spriteSrc(debug?'tests/fixtures/placeholder.svg':c.image.src,c.type);
const portraitSrc=(t,type=t.type??collection?.find(c=>c.trainer.portrait===t.portrait)?.type??'grass')=>spriteSrc(t.bot?'assets/portraits/practice-bot.svg':debug?'tests/fixtures/portrait.svg':t.portrait,t.bot?'water':type);
const botDifficulty=()=>difficulty==='hard'?'normal':'easy';
const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x;};
const quitDialog=document.querySelector('#quit-dialog'),quitButton=document.querySelector('#quit-game');
function askQuit(){if(screen==='battle')quitDialog.showModal();else home();}
quitButton.onclick=askQuit;document.querySelector('#keep-playing').onclick=()=>quitDialog.close();document.querySelector('#confirm-quit').onclick=()=>{quitDialog.close();home();};
function orient(){setMusic(screen==='battle'?'battle':screen==='result'?'victory':'title');rotate.hidden=screen!=='battle'||!orientation.matches;document.body.classList.toggle('in-battle',screen==='battle');document.body.classList.toggle('rotate-required',!rotate.hidden);quitButton.hidden=screen!=='battle';document.querySelector('.prototype-tag').hidden=screen==='battle';}
orientation.addEventListener('change',orient);
async function checkForUpdate(){try{const r=await fetch(location.pathname,{cache:'no-store'});const html=r.ok?await r.text():'';const m=html.match(/GAME_VERSION\s*=\s*(\d+)/);if(m&&+m[1]>window.GAME_VERSION)updateAvailable=Math.max(updateAvailable,+m[1]);}catch{}return updateAvailable;}
function applyUpdate(){
 if(!updateAvailable)return false;
 const url=new URL(location.href),target=String(updateAvailable);
 // A URL marker survives blocked storage and stale HTML after a reload.
 if(Number(url.searchParams.get('cb-update'))>=updateAvailable)return false;
 try{if(Number(sessionStorage.getItem('cb-reloadedFor'))>=updateAvailable)return false;sessionStorage.setItem('cb-reloadedFor',target);}catch{}
 url.searchParams.set('cb-update',target);url.searchParams.set('v',target);location.replace(url.href);return true;
}
function focusScreen(){const target=app.querySelector('h1,h2')??app.querySelector('[aria-label]');if(target){target.tabIndex=-1;target.focus({preventScroll:true});}}
function cleanup(){if(view)view.dispose();view=null;clearTimeout(aiTimer);aiTimer=null;}
function page(title){cleanup();app.replaceChildren();const panel=el('section');panel.className='panel';panel.append(el('h1',title));app.append(panel);focusScreen();return panel;}
function button(parent,text,fn,id){const b=el('button',text);if(id)b.id=id;b.onclick=fn;parent.append(b);return b;}
document.querySelector('#game-home').onclick=e=>{e.preventDefault();if(ready)askQuit();};
function home(){quitDialog.close();screen='home';orient();if(applyUpdate())return;const panel=page('Creature Battle');checkForUpdate().then(()=>{if(screen==='home')applyUpdate();});panel.append(el('p','Your drawings. Teams of three. One move at a time.'));
  const choices=el('div');choices.className='choices';panel.append(choices);
  for(const [kind,text]of [['ai','Solo Battle'],['friend','2 Player Battle']]){const b=button(choices,text,()=>{mode=kind;setup();},`play-${kind}`);b.disabled=!collection.length;}
  button(choices,'See Creatures',()=>showCollection(),'collection');const sheet=el('a','Print Creature Sheet');sheet.id='print-sheet';sheet.href='output/pdf/creature-sheet.pdf?v=24';sheet.target='_blank';sheet.rel='noopener';choices.append(sheet);
}
function showCollection(){screen='collection';const panel=page('Creatures');
  panel.append(carousel(shuffled(collection),c=>{const card=el('article');card.className='collection-card';card.dataset.creature=c.id;const img=el('img');img.src=imageSrc(c);img.alt=c.name;card.append(img,el('h2',c.name),typeChip(c.type),el('p',`Made by ${c.trainer.nickname}`),moveList(c));return card;},'collection creatures'));button(panel,'Home',home);
}
function setup(previous=null){cleanup();if(!previous){difficulty='easy';opponentId=battleTrainers(collection)[0]?.id??'random';}picks=[];firstPicks=null;if(mode==='ai')opponent(previous);else pick(0,previous);}
function opponent(previous=null){cleanup();screen='opponent';orient();opponentPick({app,collection,portraitSrc,difficulty,onDifficulty:value=>{difficulty=value;},opponentId,onOpponent:value=>{opponentId=value;},hasVictory:(id,level)=>trainerProgress.hasVictory(id,level),onNext:()=>pick(0,previous)});focusScreen();}
function pick(side,previous=null){cleanup();screen='teampick';orient();teamPick({app,collection,rules,side,initialChoice:previous?.[side],imageSrc,portraitSrc,solo:mode==='ai',onBack:mode==='ai'?choice=>opponent([choice]):undefined,onDone:choice=>{
  picks[side]=choice;if(side===0&&mode==='friend')pick(1,previous);else if(mode==='ai'){
    const ai=chooseOpponent(collection,opponentId,aiRng,{difficulty,rules,playerTeam:picks[0].team});aiRng=ai.aiRng;picks[1]={team:ai.team,trainer:ai.trainer};start();
  }else start();
}});focusScreen();}
function start(){if(!debug)seed=crypto.getRandomValues(new Uint32Array(1))[0];if(!firstPicks)firstPicks=structuredClone(picks);if(mode==='ai'&&sameTrainerName(picks[0].trainer.nickname,picks[1].trainer.nickname)&&!picks[1].trainer.bot)picks[0]={...picks[0],trainer:{...picks[0].trainer,nickname:`${picks[0].trainer.nickname.slice(0,22).trimEnd()} 1`}};if(sameTrainerName(picks[0].trainer.nickname,picks[1].trainer.nickname))picks=picks.map((p,side)=>({...p,trainer:{...p.trainer,nickname:`${p.trainer.nickname.slice(0,22).trimEnd()} ${side+1}`}}));cleanup();screen='battle';orient();lastSwitch=false;const initial=createMatch({rules,teams:picks.map(p=>p.team),seed});state=initial.state;
  view=battleView({app,humanSides:mode==='ai'?[0]:[0,1],initial:state,trainers:picks.map(p=>p.trainer),imageSrc,portraitSrc,getState:()=>state,
    twoTap:()=>false,onAction:action,onReplacement:replace,onDrain:drain});view.animate(initial.events);
}
function action(side,choice){if(view.isLocked())return;try{const result=applyAction(state,side,choice);state=result.state;view.animate(result.events);}catch(e){console.error(e);}}
function replace(side,index){if(view.isLocked())return;const result=chooseReplacement(state,side,index);state=result.state;view.animate(result.events);}
function drain(){if(screen!=='battle')return;if(state.over){if(state.reason==='cap')console.error('Battle safety cap triggered');result();return;}
  const t=whoseTurn(state);if(mode==='ai'&&t.side===1){clearTimeout(aiTimer);const scheduledState=state;aiTimer=setTimeout(()=>{
    aiTimer=null;if(quitDialog.open){aiTimer=setTimeout(drain,400);return;}if(screen!=='battle'||!view||view.isLocked()||state!==scheduledState)return;
    const current=whoseTurn(state);if(current.over||current.side!==1)return;
    const opts={difficulty:botDifficulty(),aiRng,lastSwitch};if(current.need==='replacement'){const choice=aiReplacement(state,1,opts);aiRng=choice.aiRng;lastSwitch=choice.lastSwitch;replace(1,choice.index);}else{const choice=chooseAction(state,1,opts);aiRng=choice.aiRng;lastSwitch=choice.lastSwitch;action(1,choice.action);}
  },600+Math.floor(Math.random()*401));}
}
function result(){quitDialog.close();if(!debug)trainerProgress.recordResult({mode,opponentId,difficulty,...state});screen='result';orient();const panel=page(`${picks[state.winner].trainer.nickname} wins!`);panel.append(el('p',mode==='ai'&&!picks[1].trainer.bot&&state.winner===0?`You defeated ${picks[1].trainer.nickname} on ${difficulty==='hard'?'Hard':'Easy'}!`:`Good try, ${picks[1-state.winner].trainer.nickname}!`));panel.classList.add('result-panel');const lineup=el('div');lineup.className='result-team';for(const c of picks[state.winner].team){const card=el('article');const img=el('img');img.src=imageSrc(c);img.alt=c.name;card.append(img,el('span',c.name),typeChip(c.type));lineup.append(card);}panel.append(lineup);const choices=el('div');choices.className='choices';panel.append(choices);
  button(choices,'Play again',async()=>{await checkForUpdate();if(screen==='result'&&!applyUpdate()){if(debug)seed=(seed+1)>>>0;setup(firstPicks);}},'rematch');button(choices,'Home',home,'home');
}
try{
  const fetchJSON=async url=>{const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw Error(`Cannot load ${url}`);return r.json();};
  rules=loadRules(await fetchJSON('data/rules-v2.json'));collection=loadCollection(await fetchJSON('data/creatures-v2.json'),rules);
  if(debug){collection=loadCollection(await fetchJSON('tests/fixtures/creatures-v2.json'),rules);window.__battleDebug={state:()=>structuredClone(state),seed:n=>{seed=n>>>0;},force:(side,a)=>{if(view?.isLocked())throw Error('Animation or input guard active');action(side,a);},setHp:(side,hp)=>{if(!state||view.isLocked())throw Error('Not ready');const m=state.teams[side][state.active[side]];m.hp=Math.max(1,Math.min(m.maxHp,Math.floor(hp)));/* Debug view is deliberately rebuilt for a forced value. */ view.dispose();view=battleView({app,humanSides:mode==='ai'?[0]:[0,1],initial:state,trainers:picks.map(p=>p.trainer),imageSrc,portraitSrc,getState:()=>state,twoTap:()=>false,onAction:action,onReplacement:replace,onDrain:drain});},fixtures:()=>structuredClone(collection)};}
  await prepareSprites(collection,{debug});
  ready=true;home();if(debug)window.__battleReady=true;setTimeout(()=>checkForUpdate().then(()=>{if(screen==='home')applyUpdate();}),4000);
}catch(error){await checkForUpdate();if(!applyUpdate()){app.textContent=`We couldn't load the collection. ${error.message}`;console.error(error);button(app,'Retry',()=>location.reload());}}
