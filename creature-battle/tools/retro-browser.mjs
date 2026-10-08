const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
const out=new URL('../design/acceptance/retro/',import.meta.url).pathname;mkdirSync(out,{recursive:true});
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8902';const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const results=[];
for(const [width,height]of [[390,844],[844,390],[1024,768]]){
 const p=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/creature-battle/');await p.locator('#play-ai').waitFor();await p.locator('#play-ai').click();
 await p.getByRole('heading',{name:'Choose Your Team',exact:true}).waitFor();await p.evaluate(()=>document.fonts.ready);
 assert.deepEqual(await p.locator('#difficulty option').allTextContents(),['Normal','Hard']);assert.equal(await p.locator('#difficulty').inputValue(),'normal');await p.locator('#difficulty').selectOption('hard');
 assert.equal(await p.getByRole('button',{name:'Pick my team',exact:true}).count(),0);assert.equal(await p.getByRole('button',{name:'Clear picks',exact:true}).count(),0);assert.equal(await p.locator('#team-done').isEnabled(),false);
 const cards=p.locator('.carousel-group:nth-child(2) .pick-card');const keys=await cards.evaluateAll(es=>es.map(e=>e.dataset.creature));
 await cards.nth(0).click();assert.equal(await p.locator('.selection .remove-creature').count(),1);assert.equal(await p.locator(`.pick-card[data-creature="${keys[0]}"][aria-pressed="true"]`).count(),3);
 await cards.nth(0).click();assert.equal(await p.locator('.selection .remove-creature').count(),0);
 for(let i=0;i<3;i++)await cards.nth(i).click();assert.equal(await p.locator('#team-done').isEnabled(),true);
 await p.locator('.remove-creature').nth(1).click();assert.equal(await p.locator('#team-done').isEnabled(),false);await cards.nth(1).click();
 const portraits=p.locator('.carousel-group:nth-child(2) .trainer-card');await portraits.nth(1).click();assert.equal(await p.locator('.trainer-card[aria-pressed="true"]').count(),3);
 for(let i=0;i<14;i++)await p.getByRole('button',{name:'Next creatures',exact:true}).click();for(let i=0;i<18;i++)await p.getByRole('button',{name:'Previous trainer portraits',exact:true}).click();
 const rail=p.getByRole('region',{name:'creatures',exact:true}),bounds=await rail.boundingBox(),cdp=await p.context().newCDPSession(p);
 const before=await rail.evaluate(e=>e.scrollLeft),y=bounds.y+bounds.height/2,start=bounds.x+bounds.width-20,end=bounds.x+20;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
 for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/12,y}]});await p.waitForTimeout(16);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(350);
 assert.notEqual(await rail.evaluate(e=>e.scrollLeft),before);await cdp.detach();
 await p.waitForFunction(()=>[...document.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0));
 assert.ok(await p.locator('.trainer-card img,.pick-card img').evaluateAll(es=>es.every(e=>e.naturalWidth===48&&e.naturalHeight===48&&getComputedStyle(e).imageRendering==='pixelated')));
 assert.ok(await p.locator('.pick-card').evaluateAll(es=>es.every(e=>e.querySelector('.type-chip'))));
 assert.ok(!(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));await p.screenshot({path:`${out}/picker-${width}x${height}.png`,fullPage:true});
 await p.locator('#team-done').click();if(width<height){assert.ok(await p.locator('#rotate').isVisible());await p.setViewportSize({width:844,height:390});}
 await p.locator('#battle-text').click();await p.waitForTimeout(450);assert.equal(await p.locator('[data-side="1"] button:enabled').count(),0);assert.equal(await p.locator('.status .type-chip').count(),2);
 await p.screenshot({path:`${out}/battle-${width}x${height}.png`});assert.deepEqual(errors,[]);results.push({width,height,toggle:true,removableChips:true,loops:true,touchSwipe:true,pixelArt48:true,hardStarts:true,errors});await p.close();
}
writeFileSync(out+'/results.json',JSON.stringify(results,null,2));await browser.close();console.log('Retro picker and battle checks pass at all three viewports.');
