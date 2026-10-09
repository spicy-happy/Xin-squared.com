const palettes={
 fire:['#24302a','#9b4438','#e69b68','#f5efd3'],water:['#24302a','#385d8e','#80b6b8','#f5efd3'],
 grass:['#24302a','#496b42','#a2b76c','#f5efd3'],electric:['#24302a','#8b7136','#e5c665','#f5efd3'],
 ground:['#24302a','#795345','#bba17c','#f5efd3'],flying:['#24302a','#6f608e','#b6a8c4','#f5efd3']
};
const sprites=new Map();
const key=(src,type)=>`${src}|${type}`;
export function spriteSrc(src,type='grass'){return sprites.get(key(src,type))??src;}
export async function prepareSprites(collection,{debug=false}={}){
 const originalColors=new Set(collection.filter(c=>!c.prototype&&!debug).flatMap(c=>[c.image.src,c.trainer.portrait]));
 const sources=collection.flatMap(c=>[[debug?'tests/fixtures/placeholder.svg':c.image.src,c.type],[debug?'tests/fixtures/portrait.svg':c.trainer.portrait,c.type]]);
 sources.push(['assets/portraits/practice-bot.svg','water']);
 await Promise.all([...new Map(sources.map(pair=>[key(...pair),pair])).values()].map(async([src,type])=>{
  const img=new Image();img.src=src;await img.decode();const canvas=document.createElement('canvas');canvas.width=48;canvas.height=48;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;
  const scale=Math.min(48/img.naturalWidth,48/img.naturalHeight),w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale);
  ctx.drawImage(img,Math.floor((48-w)/2),Math.floor((48-h)/2),w,h);
  const pixels=ctx.getImageData(0,0,48,48),palette=(palettes[type]??palettes.grass).map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));
  for(let i=0;i<pixels.data.length;i+=4){if(pixels.data[i+3]<100){pixels.data[i+3]=0;continue;}
   if(originalColors.has(src))continue;
   const light=.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2];
   const rgb=palette[light<65?0:light<150?1:light<238?2:3];pixels.data.set([...rgb,255],i);
  }
  ctx.putImageData(pixels,0,0);sprites.set(key(src,type),canvas.toDataURL('image/png'));
 }));
}
