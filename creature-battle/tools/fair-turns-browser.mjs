const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
const p=await browser.newPage({viewport:{width:844,height:390}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto((process.env.BATTLE_ORIGIN||'http://127.0.0.1:8902')+'/creature-battle/?debug=1');await p.waitForFunction(()=>window.__battleReady);
// A hit, one Last Chance, then recoil: the existing sentence must stay visible
// when the next effect is appended, rather than being typed a second time.
await p.evaluate(async()=>{
 const {battleView}=await import(`/creature-battle/releases/v46/src/ui/battle.js?v=${GAME_VERSION}`),{createMatch}=await import(`/creature-battle/releases/v46/src/engine.js?v=${GAME_VERSION}`),rules=await(await fetch('/creature-battle/data/rules-v2.json',{cache:'no-cache'})).json();
 const teams=[__battleDebug.fixtures().slice(0,3),__battleDebug.fixtures().slice(3,6)];window.fairState=createMatch({rules,teams,seed:9}).state;
 fairState.teams[0][0].name='Sparky';fairState.teams[1][0].name='Bubbles';
 window.fairView=battleView({app:document.querySelector('#app'),initial:fairState,trainers:[{nickname:'Xin'},{nickname:'Bot'}],imageSrc:()=>'/creature-battle/tests/fixtures/placeholder.svg',portraitSrc:()=>'/creature-battle/tests/fixtures/portrait.svg',getState:()=>fairState,onAction:()=>{},onReplacement:()=>{},onDrain:()=>{},twoTap:()=>false});
 window.fairDone=fairView.animate([{t:'use',side:0,moveId:'recoil',name:'Double Rush'}, {t:'hit',side:0,target:1,amount:80,absorbed:0,crit:false,eff:null,hpAfter:1},{t:'hangOn',side:1},{t:'recoil',side:0,amount:20,hpAfter:76}]);
});
await p.waitForFunction(()=>[...document.querySelectorAll('.message-line')].some(e=>e.dataset.text.includes('got hurt too')));
const extending=p.locator('.message-line').filter({hasText:'hung on with 1 HP!'});assert.equal(await extending.count(),1);assert.ok((await extending.innerText()).includes('Bubbles hung on with 1 HP!'));
const spoken=await p.locator('.arena [role="status"]').innerText();assert.ok(!spoken.includes('hung on'));assert.ok(spoken.includes('got hurt too'));
await p.evaluate(()=>fairDone);const log=await p.locator('#battle-text').innerText();assert.equal(log.match(/hung on with 1 HP!/g)?.length,1);assert.deepEqual(errors,[]);await browser.close();console.log('Narration preserves the existing Last Chance sentence when recoil is appended; one Last Chance is shown once.');
