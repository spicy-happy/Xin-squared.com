// Wins belong to stable trainer IDs and the difficulty actually played.
const STORAGE_KEY='cb-trainer-victories-v1';
const levels=['easy','hard'];
export function createTrainerProgress({storage=()=>globalThis.localStorage}={}){
 const memory={easy:new Set(),hard:new Set()};
 function load(){
  try{const saved=JSON.parse(storage()?.getItem(STORAGE_KEY)??'null');
   if(saved?.version===1)for(const level of levels)if(Array.isArray(saved[level]))for(const id of saved[level])if(typeof id==='string'&&id&&id!=='random')memory[level].add(id);
  }catch{/* Corrupt or unavailable storage must not interrupt a battle. */}
 }
 function hasVictory(id,level){load();return levels.includes(level)&&memory[level].has(id);}
 function recordResult({mode,opponentId,difficulty,over,winner,reason}){
  if(mode!=='ai'||!over||winner!==0||reason!=='ko'||!levels.includes(difficulty)||typeof opponentId!=='string'||!opponentId||opponentId==='random')return false;
  load();memory[difficulty].add(opponentId);
  try{storage()?.setItem(STORAGE_KEY,JSON.stringify({version:1,...Object.fromEntries(levels.map(level=>[level,[...memory[level]]]))}));}catch{/* Retain the mark for this session when storage is blocked. */}
  return true;
 }
 return {hasVictory,recordResult};
}
