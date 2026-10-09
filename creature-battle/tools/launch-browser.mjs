import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8918';
const unavailableAssets=[];
const page=await browser.newPage({viewport:{width:844,height:390}});
page.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)unavailableAssets.push(r.url());});
await page.goto(origin+'/creature-battle/');await page.locator('#play-ai').waitFor();
await page.locator('#play-ai').click();
await page.waitForFunction(async()=>{
 const {soundState}=await import(`/creature-battle/releases/v39/src/ui/audio.js?v=${GAME_VERSION}`);
 const audio=soundState();return audio.decoded===9 && audio.musicReady>=2;
});
assert.deepEqual(unavailableAssets,[]);
// Exercise the actual juice module with animation timelines frozen at impact.
const motion=await page.evaluate(async()=>{
 const {battleJuice}=await import(`/creature-battle/releases/v39/src/ui/juice.js?v=${GAME_VERSION}`);
 const host=document.createElement('div');host.style.cssText='position:fixed;inset:0';document.body.append(host);
 const panels=[0,1].map(side=>{
  const stage=document.createElement('div'),fighter=document.createElement('div'),img=document.createElement('img'),shadow=document.createElement('div');
  stage.style.cssText='position:absolute;inset:0';fighter.style.cssText=`position:absolute;left:${side?600:100}px;top:120px;width:144px;height:144px`;
  img.style.cssText='width:96px;height:96px;position:absolute;left:0;top:0;transform-origin:50% 88%';img.dataset.flip=String(side===0);img.style.transform=side===0?'scaleX(-1)':'scaleX(1)';
  shadow.className='pixel-shadow';shadow.style.cssText='width:96px;height:24px;position:absolute;left:0;top:100px';fighter.append(img,shadow);stage.append(fighter);host.append(stage);return {stage,fighter,img};
 });
 const fx=document.createElement('div');fx.style.cssText='position:absolute;inset:0';host.append(fx);
 const juice=battleJuice({panels,fx,scenery:host,active:()=>({type:'water'})});
 const center=node=>{const r=node.getBoundingClientRect();return r.x+r.width/2;};
 const inspect=async(side,event,offset)=>{
  const img=panels[side].img,shadow=panels[side].fighter.querySelector('.pixel-shadow'),base=center(img),shadowBase=center(shadow);
  const pending=juice.effect(event);await new Promise(requestAnimationFrame);
  for(const animation of host.getAnimations({subtree:true})){animation.pause();animation.currentTime=animation.effect.getTiming().duration*offset;}
  const result={dx:center(img)-base,shadowDx:center(shadow)-shadowBase,matrix:getComputedStyle(img).transform};
  for(const animation of host.getAnimations({subtree:true}))animation.finish();await pending;return result;
 };
 await juice.effect({t:'use',side:0,moveId:'quick'});
 const left=await inspect(0,{t:'miss',side:0},.52);
 const right=await inspect(1,{t:'miss',side:1},.52);
 const entry=await inspect(0,{t:'enter',side:0},0);
 const exitBase=center(panels[0].img),exitPromise=juice.exit(0);await new Promise(requestAnimationFrame);
 for(const a of host.getAnimations({subtree:true})){a.pause();a.currentTime=a.effect.getTiming().duration*.98;}
 const exitDx=center(panels[0].img)-exitBase;
 for(const a of host.getAnimations({subtree:true}))a.finish();await exitPromise;
 juice.cancel();host.remove();return {left,right,entry,exitDx};
});
assert.ok(motion.left.dx>100,JSON.stringify(motion));assert.ok(motion.left.shadowDx>0);
assert.ok(motion.right.dx < -100);assert.ok(motion.right.shadowDx<0);
assert.ok(motion.entry.dx<0);assert.ok(motion.exitDx<0);
assert.ok(Number(motion.left.matrix.match(/matrix\(([^,]+)/)[1])<0,'Artwork stays flipped at impact');
// A failed roster load still checks for an update and recovers automatically.
const recovery=await browser.newPage();let failed=false;
await recovery.route('**/data/creatures-v2.json',route=>{if(!failed){failed=true;return route.fulfill({status:200,contentType:'application/json',body:'{"schema":0}'});}return route.continue();});
await recovery.route('**/creature-battle/',async route=>{
 const response=await route.fetch();let body=await response.text();
 if(failed)body=body.replace(/GAME_VERSION = \d+/, 'GAME_VERSION = 40');
 await route.fulfill({response,body});
});
await recovery.goto(origin+'/creature-battle/');await recovery.waitForURL(/\?v=/);await recovery.locator('#play-ai').waitFor();assert.equal(failed,true);
// The original v37 validators can still load their unchanged live data.
const legacy=await page.evaluate(async()=>{
 const r=await(await fetch('data/rules-v1.json')).json(),c=await(await fetch('data/creatures.json')).json();
 return {version:r.version,versions:c.creatures.map(c=>c.rulesVersion),valid:c.creatures.every(c=>['regular','special','defense'].every(k=>r.moves[k][c.moves[k].id]))};
});
assert.equal(legacy.version,1);assert.ok(legacy.versions.every(v=>v===1));assert.ok(legacy.valid);
// Old HTML can receive any mix of cached and freshly fetched v37 modules.
// The frozen source paths make those mixtures identical and compatible.
for(const cached of [[],['src/ui/main.js','src/collection.js'],['src/ui/teampick.js','src/engine.js']]){
 const legacyPage=await browser.newPage(),errors=[];legacyPage.on('pageerror',e=>errors.push(e.message));
 let initial=true;
 await legacyPage.route('**/creature-battle/',route=>{
  if(initial){initial=false;return route.fulfill({contentType:'text/html',body:readFileSync(new URL('../tests/fixtures/legacy-v37-index.html',import.meta.url),'utf8')});}
  return route.continue();
 });
 for(const path of cached)await legacyPage.route(`**/creature-battle/${path}?v=37`,route=>route.fulfill({contentType:'text/javascript',body:readFileSync(new URL('../'+path,import.meta.url),'utf8')}));
 await legacyPage.goto(origin+'/creature-battle/');await legacyPage.waitForURL(/\?v=/);await legacyPage.locator('#play-ai').waitFor();
 await legacyPage.locator('#play-ai').click();await legacyPage.locator('#team-done').waitFor();assert.deepEqual(errors,[]);await legacyPage.close();
}
await browser.close();console.log(JSON.stringify({motion,cacheRecovery:true,legacyCompatible:true,mixedV37Caches:true,audioLoaded:true}));
