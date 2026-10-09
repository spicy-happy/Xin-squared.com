const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');import assert from 'node:assert/strict';
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8902';
const b=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
const p=await b.newPage({viewport:{width:844,height:390}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(origin+'/creature-battle/');await p.locator('#play-ai').waitFor();
await p.evaluate(async()=>{window.musicTest=await import(`/creature-battle/releases/v43/src/ui/audio.js?v=${GAME_VERSION}`);});
assert.equal((await p.evaluate(()=>musicTest.soundState())).music,'title');assert.equal((await p.evaluate(()=>musicTest.soundState())).musicPaused,true);
await p.locator('#collection').click();await p.waitForFunction(()=>musicTest.soundState().musicReady>=2&&!musicTest.soundState().musicPaused);
let s=await p.evaluate(()=>musicTest.soundState());assert.equal(s.music,'title');assert.equal(s.musicLoop,true);assert.equal(s.musicVolume,.25);
await p.locator('#sound-toggle').click();assert.equal((await p.evaluate(()=>musicTest.soundState())).musicPaused,true);
await p.locator('#sound-toggle').click();await p.waitForFunction(()=>!musicTest.soundState().musicPaused);
await p.getByRole('button',{name:'Home',exact:true}).click();await p.locator('#play-ai').click();
for(let i=0;i<3;i++)await p.locator('.carousel-group:nth-child(2) .pick-card').nth(i).click();await p.locator('#team-done').click();
await p.waitForFunction(()=>musicTest.soundState().music==='battle'&&musicTest.soundState().musicReady>=2&&!musicTest.soundState().musicPaused);
await p.locator('#quit-game').click();await p.locator('#confirm-quit').click();await p.waitForFunction(()=>musicTest.soundState().music==='title'&&musicTest.soundState().musicReady>=2&&!musicTest.soundState().musicPaused);
// Decode the third supplied file; complete-match checks verify Result selects it.
await p.evaluate(()=>musicTest.setMusic('victory'));await p.waitForFunction(()=>musicTest.soundState().music==='victory'&&musicTest.soundState().musicReady>=2&&!musicTest.soundState().musicPaused);
for(const track of ['title','battle','victory']){const r=await p.request.get(origin+`/creature-battle/assets/music/${track}.mp3`);assert.equal(r.status(),200);assert.ok((await r.body()).length>1000000);}
assert.deepEqual(errors,[]);await b.close();console.log('All three MP3s load and play; title/battle/quit transitions, looping, low volume and mute/unmute pass.');
