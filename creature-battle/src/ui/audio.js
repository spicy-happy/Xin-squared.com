const names=['button','regular','special','hit','heal','shield','switch','faint','win'];
let context,volume,ready,muted=false,played=0;const buffers=new Map();
const music=new Audio();music.loop=true;music.volume=.25;music.preload='none';
let musicTrack=null,musicUnlocked=false;
function resumeMusic(){
 if(!musicUnlocked||muted||document.hidden||!musicTrack)return;
 music.play().catch(()=>{}); // Autoplay remains gated by a real user gesture.
}
export function setMusic(track){
 if(!['title','battle','victory'].includes(track))throw Error('Unknown music track');
 if(musicTrack===track)return;
 music.pause();musicTrack=track;
 music.src=new URL(`../../assets/music/${track}.mp3?v=${window.GAME_VERSION}`,import.meta.url).href;
 resumeMusic();
}
const files=Promise.all(names.map(async name=>{const r=await fetch(new URL(`../../assets/sounds/${name}.wav?v=${window.GAME_VERSION}`,import.meta.url));if(!r.ok)throw Error('Sound unavailable');return [name,await r.arrayBuffer()];})).catch(()=>[]);
function unlock(){
 musicUnlocked=true;resumeMusic();
 if(!context){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return Promise.resolve();context=new Audio();volume=context.createGain();volume.gain.value=muted?0:.55;volume.connect(context.destination);ready=files.then(pairs=>Promise.all(pairs.map(async([name,data])=>buffers.set(name,await context.decodeAudioData(data))))).catch(()=>{});}
 if(context.state==='suspended')context.resume().catch(()=>{});return ready;
}
export async function playSound(name){if(muted||!context)return;await ready;if(muted||context.state!=='running'||!buffers.has(name))return;
 const source=context.createBufferSource();source.buffer=buffers.get(name);source.connect(volume);source.start();played++;
}
export function soundState(){return {muted,decoded:buffers.size,played,state:context?.state??'locked',music:musicTrack,musicPaused:music.paused,musicTime:music.currentTime,musicVolume:music.volume,musicLoop:music.loop,musicReady:music.readyState};}
export function initAudio(){
 const button=document.querySelector('#sound-toggle');const update=()=>{button.textContent=muted?'Sound off':'Sound on';button.setAttribute('aria-pressed',String(!muted));button.setAttribute('aria-label',muted?'Turn sound on':'Mute sound');};
 button.onclick=()=>{muted=!muted;if(muted)music.pause();else resumeMusic();if(volume)volume.gain.setValueAtTime(muted?0:.55,context.currentTime);update();unlock();};update();
 document.addEventListener('visibilitychange',()=>{if(document.hidden)music.pause();else resumeMusic();});
 document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock);
 document.addEventListener('click',e=>{const control=e.target.closest('button,a');if(control&&control!==button&&!control.disabled)playSound('button');});
}
