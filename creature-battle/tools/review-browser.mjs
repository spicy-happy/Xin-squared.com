// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright ES module.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');import assert from 'node:assert/strict';
const BASE=process.env.BATTLE_ORIGIN || 'http://127.0.0.1:8902';
const b=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
const p=await b.newPage({viewport:{width:844,height:390}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(`${BASE}/creature-battle/?debug=1`);await p.waitForFunction(()=>window.__battleReady);
await p.locator('#play-ai').click();for(let i=0;i<3;i++)await p.locator('.carousel-group:nth-child(2) .pick-card').nth(i).click();await p.locator('#team-done').click();await p.locator('#battle-text').click();await p.waitForTimeout(450);
assert.equal(await p.locator('[data-side="1"] button:enabled').count(),0);
assert.match(await p.locator('[data-side="1"] .portrait').getAttribute('src'),/^data:image\/png/);
assert.equal(await p.locator('#app').getAttribute('aria-live'),null);
// Directly drive the view to cover replacement, message roles, and presentation snapshots.
await p.evaluate(async()=>{
 const {battleView}=await import(`/creature-battle/releases/v39/src/ui/battle.js?v=${window.GAME_VERSION}`);
 const initial=__battleDebug.state();let state=structuredClone(initial),calls=0;
 initial.teams[0][initial.active[0]].name='A';initial.teams[1][initial.active[1]].name='It';state=structuredClone(initial);
 const app=document.createElement('div');app.id='review';document.body.append(app);
 const v=battleView({app,initial,trainers:[{nickname:'Human'},{nickname:'Bot'}],humanSides:[0],imageSrc:()=>'/creature-battle/tests/fixtures/placeholder.svg',portraitSrc:()=>'/creature-battle/tests/fixtures/portrait.svg',getState:()=>state,onAction:()=>calls++,onReplacement:()=>calls++,onDrain:()=>{},twoTap:()=>false});
 const oldName=app.querySelector('[data-side="0"] .stage img').alt;
 state.active[0]=1;
 const anim=v.animate([{t:'use',side:1,name:'Test',moveId:'heavy',ppAfter:initial.teams[1][initial.active[1]].pp},{t:'hit',side:1,target:0,amount:9,absorbed:3,crit:true,eff:'strong',hpAfter:20},{t:'round',n:2,order:[0,1],reason:'speed',double:null}]);
 if(app.querySelector('[data-side="0"] .stage img').alt!==oldName)throw Error('View ran ahead');
 window.reviewView={app,v,anim,get calls(){return calls},setState:s=>{state=s},initial};
});
const r=p.locator('#review');await r.locator('.message-line[data-text*="It dealt 9 damage."]').waitFor();
const paragraph=r.locator('.message-line[data-text*="A critical hit!"]');assert.match(await paragraph.getAttribute('data-text'),/It used Test! The shield blocked 3! It dealt 9 damage/);
assert.equal(await paragraph.locator('.name-chip').count(),1);await p.waitForFunction(()=>document.querySelector('#review .name-chip')?.textContent==='It');assert.equal(await paragraph.locator('.name-chip').innerText(),'It');
await r.locator('#battle-text').click();await p.waitForTimeout(450);assert.match(await r.locator('#battle-text').innerText(),/It dealt 9 damage/);
await p.evaluate(async()=>{const {v,initial,setState,app}=reviewView;const s=structuredClone(initial);s.needReplacement=1;s.teams[1][s.active[1]].hp=0;setState(s);const a=v.animate([{t:'needReplace',side:1}]);app.querySelector('#battle-text').click();await a;});
assert.ok(await r.locator('[data-side="1"] [data-bench]').count());assert.equal(await r.locator('[data-side="1"] button:enabled').count(),0);
assert.equal(await r.locator('[data-side="1"].active').count(),0);
await r.locator('[data-side="1"] [data-bench]').first().evaluate(e=>e.onclick());assert.equal(await p.evaluate(()=>reviewView.calls),0);
await p.evaluate(async()=>{const {battleView}=await import(`/creature-battle/releases/v39/src/ui/battle.js?v=${GAME_VERSION}`);reviewView.v.dispose();const s=structuredClone(reviewView.initial);for(const team of s.teams)for(const c of team)c.pp.special=0;window.ppState=s;window.ppView=battleView({app:reviewView.app,initial:s,trainers:[{nickname:'Human'},{nickname:'Bot'}],humanSides:[0,1],imageSrc:()=>'/creature-battle/tests/fixtures/placeholder.svg',portraitSrc:()=>'/creature-battle/tests/fixtures/portrait.svg',getState:()=>s,onAction:()=>{},onReplacement:()=>{},onDrain:()=>{},twoTap:()=>false});});
assert.equal(await r.locator('[data-action="special"].exhausted:disabled').count(),2);assert.ok((await r.locator('[data-action="special"] .pp').allTextContents()).every(t=>/^0\/\d+$/.test(t)));
await p.evaluate(async()=>{ppView.dispose();for(const team of ppState.teams)for(const c of team)c.pp.regular=0;const {battleView}=await import(`/creature-battle/releases/v39/src/ui/battle.js?v=${GAME_VERSION}`);window.ppView=battleView({app:reviewView.app,initial:ppState,trainers:[{nickname:'Human'},{nickname:'Bot'}],humanSides:[0,1],imageSrc:()=>'/creature-battle/tests/fixtures/placeholder.svg',portraitSrc:()=>'/creature-battle/tests/fixtures/portrait.svg',getState:()=>ppState,onAction:()=>{},onReplacement:()=>{},onDrain:()=>{},twoTap:()=>false});});
assert.ok((await r.locator('[data-action="regular"] .category').allTextContents()).every(t=>t==='Tired Attack'));assert.equal(await r.locator('[data-action="regular"]:enabled').count(),1);
await p.evaluate(async()=>{ppView.dispose();const {battleView}=await import(`/creature-battle/releases/v39/src/ui/battle.js?v=${GAME_VERSION}`);const initial=structuredClone(reviewView.initial);initial.teams[0][initial.active[0]].hp=2;const state=structuredClone(initial);state.teams[0][state.active[0]].hp=0;state.needReplacement=0;window.faintView=battleView({app:reviewView.app,initial,trainers:[{nickname:'Human'},{nickname:'Bot'}],humanSides:[0,1],imageSrc:()=>'/creature-battle/tests/fixtures/placeholder.svg',portraitSrc:()=>'/creature-battle/tests/fixtures/portrait.svg',getState:()=>state,onAction:()=>{},onReplacement:()=>{},onDrain:()=>{},twoTap:()=>false});faintView.animate([{t:'hit',side:1,target:0,amount:2,hpAfter:0,crit:false,eff:'neutral'},{t:'faint',side:0},{t:'needReplace',side:0}]);});
assert.equal(await r.locator('[data-side="0"] .creature-sprite').evaluate(e=>e.style.opacity),'1');
await r.locator('[data-side="0"] .fighter.fainted').waitFor();assert.equal(await r.locator('[data-side="0"] .pixel-shadow').evaluate(e=>getComputedStyle(e).opacity),'0');await r.locator('#battle-text').click();await p.waitForTimeout(450);assert.equal(await r.locator('[data-side="0"] .creature-sprite').evaluate(e=>e.style.opacity),'0');
assert.deepEqual(errors,[]);await b.close();console.log('Review regressions pass: bot actions/replacements, snapshot controls, 3-line typed messages, damage retention, short names, portrait, live region.');
