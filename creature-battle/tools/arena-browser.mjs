const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8902',out=process.env.ARTIFACT_DIR||new URL('../design/acceptance/shared-arena/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),results=[];
for(const [width,height]of [[667,375],[844,390],[1024,768]]){
 const p=await browser.newPage({viewport:{width,height}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/creature-battle/');await p.locator('#play-friend').click();for(let i=0;i<3;i++)await p.locator('.carousel-group:nth-child(2) .pick-card').nth(i).click();await p.locator('#team-done').click();await p.locator('#lookaway-ready').click();for(let i=0;i<3;i++)await p.locator('.carousel-group:nth-child(2) .pick-card').nth(i+3).click();await p.locator('#team-done').click();await p.locator('#battle-text').click();await p.waitForTimeout(450);await p.evaluate(()=>document.fonts.ready);
 assert.equal(await p.locator('.round,.turn-tab,#battle-history,.move-name,.hint').count(),0);assert.equal(await p.locator('.pixel-shadow').count(),2);assert.equal(await p.locator('.hp-pixel').count(),40);
 const box=await p.locator('#battle-text').boundingBox(),body=await p.locator('.battle-body').boundingBox();assert.ok(Math.abs(box.width-body.width)<2);assert.ok(box.y<body.y);
 assert.ok(await p.locator('.portrait').evaluateAll(es=>es.every(e=>getComputedStyle(e).borderTopWidth==='0px')));
 const right=p.locator('[data-side="1"]');assert.ok((await right.locator('.portrait').boundingBox()).x>(await right.locator('.creature-name').boundingBox()).x);
 for(const side of [0,1]){const status=p.locator(`[data-side="${side}"] .status`),bar=await status.locator('.hp').boundingBox(),chip=await status.locator('.type-chip').boundingBox();assert.ok(chip.x>=bar.x+bar.width);}
 assert.ok(await p.locator('.stage').evaluateAll(es=>es.every(e=>{const a=e.getBoundingClientRect(),b=e.querySelector('.creature-sprite').getBoundingClientRect();return b.y>=a.y-1&&b.bottom<=a.bottom+1&&b.width<=144;})));
 assert.ok(await p.locator('[data-action]').evaluateAll(es=>es.every(e=>/^\d+\/\d+$|^--$/.test(e.querySelector('.pp').textContent))));
 assert.ok(await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth));
 await p.screenshot({path:`${out}/arena-${width}x${height}.png`});
 const action=p.locator('[data-action="regular"]:enabled').first();await action.click();await p.waitForTimeout(50);
 assert.ok(await p.locator('#battle-text').evaluate(e=>e.classList.contains('writing')));assert.ok(await p.locator('.creature-sprite').evaluateAll(es=>es.some(e=>e.getAnimations().length>0)));
 const full=await p.locator('#battle-text .message-line').first().getAttribute('data-text'),partial=await p.locator('#battle-text .message-line').first().innerText();assert.ok(partial.length<full.length);
 await p.locator('#battle-text').click();await p.waitForTimeout(450);assert.match(await p.locator('#battle-text').innerText(),/damage|missed/);assert.match(await p.locator('#battle-text').innerText(),/turn|choosing/);
 const sound=await p.evaluate(async()=>{const m=await import(`/creature-battle/src/ui/audio.js?v=${GAME_VERSION}`);return m.soundState();});assert.equal(sound.decoded,9);assert.equal(sound.state,'running');assert.ok(sound.played>0);
 await p.locator('#sound-toggle').click();assert.equal(await p.locator('#sound-toggle').getAttribute('aria-pressed'),'false');const muted=await p.evaluate(async()=>{const m=await import(`/creature-battle/src/ui/audio.js?v=${GAME_VERSION}`),before=m.soundState().played;await m.playSound('hit');return m.soundState().muted&&m.soundState().played===before;});assert.ok(muted);await p.locator('#sound-toggle').click();
 await p.screenshot({path:`${out}/damage-${width}x${height}.png`});
 if(width===1024){await p.locator('[data-action="special"]:enabled').first().click();await p.locator('.projectile').waitFor();await p.screenshot({path:`${out}/special-effect.png`});await p.locator('#battle-text').click();await p.waitForTimeout(450);
  const defense=p.locator('[data-action="defense"]:enabled');if(await defense.count()){await defense.first().click();await p.locator('.defense-spark').first().waitFor();await p.screenshot({path:`${out}/defense-effect.png`});await p.locator('#battle-text').click();await p.waitForTimeout(450);}
  await p.locator('[data-action="switch"]:enabled').first().click();await p.locator('[data-bench]:enabled').first().click();await p.waitForTimeout(40);assert.ok(await p.locator('.creature-sprite').evaluateAll(es=>es.some(e=>e.getAnimations().length>0)));await p.locator('#battle-text').click();await p.waitForTimeout(450);
 }assert.deepEqual(errors,[]);results.push({width,height,sharedArena:true,threeLineLog:true,typewriter:true,attackAnimation:true,pixelHP:true,shadows:true,audio:sound});await p.close();
}
await browser.close();writeFileSync(out+'/arena-results.json',JSON.stringify(results,null,2));console.log('Shared arena, typewriter, effects, pixel HP, layout and nine decoded sounds pass at three sizes.');
