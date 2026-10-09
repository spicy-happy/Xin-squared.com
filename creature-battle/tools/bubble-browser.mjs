const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');import assert from 'node:assert/strict';
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8902';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true}),p=await browser.newPage({viewport:{width:844,height:390}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(origin+'/creature-battle/?debug=1');await p.waitForFunction(()=>window.__battleReady);
for(const missing of [0,5,40]){
 await p.evaluate(async missing=>{
  window.bubbleView?.dispose();
  const {createMatch,applyAction}=await import(`/creature-battle/releases/v42/src/engine.js?v=${GAME_VERSION}`),{battleView}=await import(`/creature-battle/releases/v42/src/ui/battle.js?v=${GAME_VERSION}`),rules=await(await fetch('/creature-battle/data/rules-v2.json',{cache:'no-cache'})).json();
  const teams=[0,1].map(side=>__battleDebug.fixtures().slice(0,3).map(c=>({...c,stats:side?{health:5,attack:3,defense:2,speed:0}:{health:2,attack:3,defense:0,speed:5},moves:{...c.moves,defense:{id:'guard',name:'Bubble Shield'}}})));
  window.bubbleState=createMatch({rules,teams,seed:9}).state;bubbleState.teams[0][0].hp-=missing;
  window.bubbleView=battleView({app:document.querySelector('#app'),initial:bubbleState,trainers:[{nickname:'Xin'},{nickname:'Bot'}],humanSides:[0,1],imageSrc:()=>'/creature-battle/tests/fixtures/placeholder.svg',portraitSrc:()=>'/creature-battle/tests/fixtures/portrait.svg',getState:()=>bubbleState,onAction:(side,action)=>{const r=applyAction(bubbleState,side,action);bubbleState=r.state;window.bubbleDone=bubbleView.animate(r.events);},onReplacement:()=>{},onDrain:()=>{},twoTap:()=>false});
 },missing);
 await p.locator('[data-side="0"] [data-action="defense"]').click();await p.evaluate(()=>bubbleDone);
 const state=await p.evaluate(()=>bubbleState.teams[0][0]);assert.equal(state.shield,Math.min(missing,29));assert.ok(state.hp+state.shield<=state.maxHp);assert.equal(state.pp.defense,2);
 const numbers=await p.locator('[data-side="0"] .hp-number').innerText();assert.equal(numbers,`${state.hp}/${state.maxHp}${state.shield?` +${state.shield}`:''}`);
 assert.match(await p.locator('#battle-text').innerText(),missing?new RegExp(`protects ${Math.min(missing,29)} HP`):/already has full HP/);
}
assert.deepEqual(errors,[]);await browser.close();console.log('Bubble Shield UI: full HP adds zero; near-full shield caps at missing HP; lower HP uses normal shield cap. Combined total never exceeds maximum.');
