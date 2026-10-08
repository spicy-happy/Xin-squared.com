const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const p=await browser.newPage({viewport:{width:844,height:390},reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.clock.install();await p.goto((process.env.BATTLE_ORIGIN||'http://127.0.0.1:8902')+'/creature-battle/?debug=1');await p.waitForFunction(()=>window.__battleReady);await p.locator('#play-ai').click();
for(const id of ['cr-debug00','cr-debug03','cr-debug02'])await p.locator(`.carousel-group:nth-child(2) [data-creature="${id}"]`).click();await p.locator('#team-done').click();await p.clock.runFor(15000);
const spent=s=>s.teams[1].reduce((n,m)=>n+Object.values(m.pp).reduce((a,b)=>a+b,0),0)+s.switchesLeft[1];
const state=()=>p.evaluate(()=>__battleDebug.state());
for(const index of [1,0,1]){
 const before=await state();assert.equal(before.order[before.slot],0);await p.locator('[data-side="0"] [data-action="switch"]').click();await p.locator(`[data-side="0"] [data-bench="${index}"]`).click();
 await p.clock.runFor(20000);const after=await state();assert.equal(spent(before)-spent(after),1,'AI must spend exactly one move after the human switch');assert.equal(after.order[after.slot],0);assert.equal(after.needReplacement,null);assert.ok(await p.locator('[data-side="0"] [data-action="defense"]').isEnabled());
 const returned=spent(after);await p.clock.runFor(20000);assert.equal(spent(await state()),returned,'AI must wait for the human, with no second timer action');
}
// The selected active creature has Mega Burst. Recharging must not skip input.
const before=await state();await p.locator('[data-side="0"] [data-action="special"]').click();await p.clock.runFor(20000);const after=await state();assert.equal(spent(before)-spent(after),1);assert.equal(after.order[after.slot],0);assert.equal(after.teams[0][after.active[0]].recharging,true);assert.equal(await p.locator('[data-side="0"] [data-action="special"]').isEnabled(),false);assert.ok(await p.locator('[data-side="0"] [data-action="defense"]').isEnabled());
assert.deepEqual(errors,[]);await browser.close();console.log('Solo UI: each of three switches gets exactly one bot move then returns input; no delayed second move; Mega Burst recharge preserves the human turn.');
