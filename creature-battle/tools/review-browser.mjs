// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright ES module.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');import assert from 'node:assert/strict';
const BASE=process.env.BATTLE_ORIGIN || 'http://127.0.0.1:8902';
const b=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const p=await b.newPage({viewport:{width:844,height:390}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(`${BASE}/creature-battle/?debug=1`);await p.waitForFunction(()=>window.__battleReady);
await p.locator('#play-ai').click();await p.locator('#start-picking').click();for(let i=0;i<3;i++)await p.locator('.pick-card').nth(i).click();await p.locator('#team-done').click();await p.locator('#start-battle').click();await p.locator('#battle-text').click();await p.waitForTimeout(450);
assert.equal(await p.locator('[data-side="1"] button:enabled').count(),0);
assert.match(await p.locator('[data-side="1"] .portrait').getAttribute('src'),/practice-bot/);
assert.equal(await p.locator('#app').getAttribute('aria-live'),null);
// Directly drive the view to cover replacement, message roles, and presentation snapshots.
await p.evaluate(async()=>{
 const {battleView}=await import(`/creature-battle/src/ui/battle.js?v=${window.GAME_VERSION}`);
 const initial=__battleDebug.state();let state=structuredClone(initial),calls=0;
 initial.teams[0][initial.active[0]].name='A';initial.teams[1][initial.active[1]].name='It';state=structuredClone(initial);
 const app=document.createElement('div');app.id='review';document.body.append(app);
 const v=battleView({app,initial,trainers:[{nickname:'Human'},{nickname:'Bot'}],humanSides:[0],imageSrc:()=>'/creature-battle/tests/fixtures/placeholder.svg',portraitSrc:()=>'/creature-battle/tests/fixtures/portrait.svg',getState:()=>state,onAction:()=>calls++,onReplacement:()=>calls++,onDrain:()=>{},twoTap:()=>false});
 const oldName=app.querySelector('[data-side="0"] .stage img').alt;
 state.active[0]=1;
 const anim=v.animate([{t:'use',side:1,name:'Test',moveId:'heavy',ppAfter:initial.teams[1][initial.active[1]].pp},{t:'hit',side:1,target:0,amount:9,crit:true,eff:'neutral',hpAfter:20},{t:'round',n:2,order:[0,1],reason:'speed',double:null}]);
 if(app.querySelector('[data-side="0"] .stage img').alt!==oldName)throw Error('View ran ahead');
 window.reviewView={app,v,anim,get calls(){return calls},setState:s=>{state=s},initial};
});
const r=p.locator('#review');await p.waitForTimeout(1450);
assert.equal(await r.locator('.message-line').count(),2);
assert.equal(await r.locator('#battle-text .name-chip').count(),0); // It dealt… and A critical hit!
await r.locator('#battle-text').click();await p.waitForTimeout(450);assert.match(await r.locator('#battle-text').innerText(),/It dealt 9 damage/);
await p.evaluate(async()=>{const {v,initial,setState,app}=reviewView;const s=structuredClone(initial);s.needReplacement=1;s.teams[1][s.active[1]].hp=0;setState(s);const a=v.animate([{t:'needReplace',side:1}]);app.querySelector('#battle-text').click();await a;});
assert.ok(await r.locator('[data-side="1"] [data-bench]').count());assert.equal(await r.locator('[data-side="1"] button:enabled').count(),0);
assert.equal(await r.locator('[data-side="1"].active').count(),0);
await r.locator('[data-side="1"] [data-bench]').first().evaluate(e=>e.onclick());assert.equal(await p.evaluate(()=>reviewView.calls),0);
assert.deepEqual(errors,[]);await b.close();console.log('Review regressions pass: bot actions/replacements, snapshot controls, 2-message pacing, damage retention, short names, portrait, live region.');
