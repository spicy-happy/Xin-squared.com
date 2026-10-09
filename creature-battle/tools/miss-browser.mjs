const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');import assert from 'node:assert/strict';
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8902';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
const p=await browser.newPage({viewport:{width:844,height:390},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.install();
await p.goto(origin+'/creature-battle/?debug=1');await p.waitForFunction(()=>window.__battleReady);
await p.evaluate(async()=>{
 const {createMatch,applyAction}=await import(`/creature-battle/releases/v42/src/engine.js?v=${GAME_VERSION}`),{next}=await import(`/creature-battle/releases/v42/src/rng.js?v=${GAME_VERSION}`),{battleView}=await import(`/creature-battle/releases/v42/src/ui/battle.js?v=${GAME_VERSION}`),rules=await(await fetch('/creature-battle/data/rules-v2.json')).json();
 const teams=[0,1].map(side=>__battleDebug.fixtures().slice(0,3).map(c=>({...c,stats:side?{health:5,attack:3,defense:2,speed:0}:{health:2,attack:3,defense:0,speed:5},moves:{...c.moves,special:{id:'blast',name:'Energy Burst'},defense:{id:'heal',name:'Healing Glow'}}})));
 let seed=0;while(next(seed)[0]<0.9)seed++;window.missSeed=seed;window.missState=createMatch({rules,teams,seed}).state;window.missEvents=[];
 window.missView=battleView({app:document.querySelector('#app'),initial:missState,trainers:[{nickname:'Xin'},{nickname:'Bot'}],humanSides:[0,1],imageSrc:()=>'/creature-battle/tests/fixtures/placeholder.svg',portraitSrc:()=>'/creature-battle/tests/fixtures/portrait.svg',getState:()=>missState,onAction:(side,action)=>{const r=applyAction(missState,side,action);missState=r.state;missEvents.push(r.events);missView.animate(r.events);},onReplacement:()=>{},onDrain:()=>{},twoTap:()=>false});
});
await p.locator('[data-side="0"] [data-action="special"]').click();await p.clock.runFor(15000);
assert.ok(await p.evaluate(()=>missEvents.at(-1).some(e=>e.t==='miss')));assert.match(await p.locator('#battle-text').innerText(),/miss/i);
await p.locator('[data-side="1"] [data-action="defense"]').click();await p.clock.runFor(15000);
await p.evaluate(()=>missState.rng=missSeed);
await p.locator('[data-side="0"] [data-action="special"]').click();await p.clock.runFor(15000);
assert.ok(await p.evaluate(()=>missEvents.at(-1).some(e=>e.t==='hit')&&!missEvents.at(-1).some(e=>e.t==='miss')));assert.match(await p.locator('#battle-text').innerText(),/damage/);
assert.deepEqual(await p.evaluate(()=>missState.nextHitGuaranteed),[false,false]);assert.deepEqual(errors,[]);await browser.close();console.log('Visible controls: seeded miss, opponent defense, then guaranteed hit despite another failing accuracy roll.');
