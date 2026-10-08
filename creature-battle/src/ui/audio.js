const names=['button','regular','special','hit','heal','shield','switch','faint','win'];
let context,volume,ready,muted=false,played=0;const buffers=new Map();
const files=Promise.all(names.map(async name=>{const r=await fetch(new URL(`../../assets/sounds/${name}.wav?v=${window.GAME_VERSION}`,import.meta.url));if(!r.ok)throw Error('Sound unavailable');return [name,await r.arrayBuffer()];})).catch(()=>[]);
function unlock(){
 if(!context){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return Promise.resolve();context=new Audio();volume=context.createGain();volume.gain.value=muted?0:.55;volume.connect(context.destination);ready=files.then(pairs=>Promise.all(pairs.map(async([name,data])=>buffers.set(name,await context.decodeAudioData(data))))).catch(()=>{});}
 if(context.state==='suspended')context.resume().catch(()=>{});return ready;
}
export async function playSound(name){if(muted||!context)return;await ready;if(muted||context.state!=='running'||!buffers.has(name))return;
 const source=context.createBufferSource();source.buffer=buffers.get(name);source.connect(volume);source.start();played++;
}
export function soundState(){return {muted,decoded:buffers.size,played,state:context?.state??'locked'};}
export function initAudio(){
 const button=document.querySelector('#sound-toggle');const update=()=>{button.textContent=muted?'Sound off':'Sound on';button.setAttribute('aria-pressed',String(!muted));button.setAttribute('aria-label',muted?'Turn sound on':'Mute sound');};
 button.onclick=()=>{muted=!muted;if(volume)volume.gain.setValueAtTime(muted?0:.55,context.currentTime);update();unlock();};update();
 document.addEventListener('pointerdown',unlock,{passive:true});document.addEventListener('keydown',unlock);
 document.addEventListener('click',e=>{const control=e.target.closest('button,a');if(control&&control!==button&&!control.disabled)playSound('button');});
}
