import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8918',out=process.env.BATTLE_OUTPUT||'/tmp/cb-pixels-browser';mkdirSync(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin+'/creature-battle/');await page.locator('#play-ai').click();
const sprites=await page.evaluate(async()=>{
 const {spriteSrc}=await import(`/creature-battle/releases/v39/src/ui/pixels.js?v=${GAME_VERSION}`);
 const {creatures}=await (await fetch('data/creatures-v2.json')).json(),results=[];
 for(const c of creatures)for(const src of [c.image.src,c.trainer.portrait]){
  const image=new Image();image.src=spriteSrc(src,c.type);await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const {data}=ctx.getImageData(0,0,canvas.width,canvas.height),colors=new Set();let soft=0;
  for(let i=0;i<data.length;i+=4){if(data[i+3]!==0&&data[i+3]!==255)soft++;if(data[i+3])colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);}
  results.push({id:c.id,prototype:!!c.prototype,width:image.naturalWidth,height:image.naturalHeight,soft,colors:colors.size,converted:image.src.startsWith('data:image/png')});
 }
 return results;
});
for(const sprite of sprites){assert.equal(sprite.width,sprite.prototype?48:96);assert.equal(sprite.height,sprite.width);assert.equal(sprite.soft,0);assert.ok(sprite.converted);if(!sprite.prototype)assert.ok(sprite.colors>4,'Original artwork colors survive conversion');}
const menu=page.locator('#solo-opponent');await menu.click();await page.getByRole('option',{name:'Random Battle Bot',exact:true}).click();assert.equal(await menu.getAttribute('data-value'),'random');
await menu.focus();await menu.press('Home');assert.equal(await menu.getAttribute('aria-expanded'),'true');assert.equal(await menu.getAttribute('data-value'),'random');await menu.press('Enter');
assert.equal(await menu.getAttribute('data-value'),'tr-unclemark');assert.match(await page.locator('.opponent-preview').innerText(),/Uncle Mark/);
await menu.click();await menu.press('End');await menu.press('Escape');assert.equal(await menu.getAttribute('data-value'),'tr-unclemark');assert.equal(await menu.getAttribute('aria-expanded'),'false');
await menu.click();await page.screenshot({path:out+'/opponent-menu.png'});await menu.press('Escape');
await menu.click();await menu.press('Tab');assert.equal(await menu.getAttribute('aria-expanded'),'false');
for(const [width,height] of [[320,740],[390,844],[844,390],[1024,768]]){
 await page.setViewportSize({width,height});await menu.click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const bounds=await page.locator('#solo-opponent-options').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width,JSON.stringify(bounds));
 const style=await menu.evaluate(e=>({font:getComputedStyle(e).fontFamily,radius:getComputedStyle(e).borderRadius}));assert.match(style.font,/Pixel/);assert.equal(style.radius,'0px');
 await page.screenshot({path:`${out}/picker-${width}.png`,fullPage:true});await menu.press('Escape');
}
assert.deepEqual(errors,[]);writeFileSync(out+'/results.json',JSON.stringify({sprites,errors},null,2));await browser.close();console.log(JSON.stringify({sprites,errors}));
