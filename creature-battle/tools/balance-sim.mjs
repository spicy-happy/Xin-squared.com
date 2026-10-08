import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadRules } from '../src/rules.js';
import { createMatch, whoseTurn, applyAction, chooseReplacement } from '../src/engine.js';
import { chooseAction, chooseTeam, chooseReplacement as aiReplacement } from '../src/ai.js';
import { next } from '../src/rng.js';
const rules=loadRules(JSON.parse(readFileSync(new URL('../data/rules-v1.json',import.meta.url))));
const statNames=['health','attack','defense','speed'];
const builds=[];
for(let h=0;h<=5;h++)for(let a=0;a<=5;a++)for(let d=0;d<=5;d++)for(let s=0;s<=5;s++)if(h+a+d+s===rules.stats.budget)builds.push({health:h,attack:a,defense:d,speed:s});
function source(seed){let rng=seed;return()=>{let x;[x,rng]=next(rng);return x;};}
const pick=(random,list)=>list[Math.floor(random()*list.length)];
function def(random, legalBuilds=builds) {
  return {schema:1,id:'cr-sim000',rulesVersion:rules.version,sheet:rules.sheet,name:'Simulation placeholder',trainer:{nickname:'Simulation Trainer',portrait:'assets/portraits/cr-sim000.12345678.webp'},
    image:{src:'assets/creatures/cr-sim000.12345678.webp',w:512,h:512},added:'2026-10-07',
    type:pick(random,Object.keys(rules.types)),stats:structuredClone(pick(random,legalBuilds)),
    moves:Object.fromEntries(['regular','special','defense'].map(k=>{const id=pick(random,Object.keys(rules.moves[k]));return[k,{id,name:rules.moves[k][id].label}];}))};
}
export function battle(teams, seed, difficulties=['normal','normal']) {
  let {state,events}=createMatch({rules,teams,seed});
  const ai=[{aiRng:(seed^0x12345678)>>>0,lastSwitch:false},{aiRng:(seed^0x87654321)>>>0,lastSwitch:false}];
  let actions=0,hits=0,hangOn=0,double=0,rests=0;
  const count=events=>{for(const e of events){if(e.t==='hit')hits++;if(e.t==='hangOn')hangOn++;if(e.t==='round'&&e.double!==null)double++;if(e.t==='rest')rests++;}};
  count(events);
  while(!state.over) {
    const t=whoseTurn(state),opts={...ai[t.side],difficulty:difficulties[t.side]};
    if(t.need==='replacement') {
      const choice=aiReplacement(state,t.side,opts);ai[t.side]={...choice};
      ({state,events}=chooseReplacement(state,t.side,choice.index));
    }else {
      const choice=chooseAction(state,t.side,opts);ai[t.side]={aiRng:choice.aiRng,lastSwitch:choice.lastSwitch};
      ({state,events}=applyAction(state,t.side,choice.action));actions++;
    }
    count(events);
  }
  return {state,actions:actions+rests,hits,hangOn,double};
}
export function simulate({n=10000,paired=4000,easy=4000,seed=3}={}) {
  const random=source(seed),wins={},lengths=[];let caps=0,draws=0,hits=0,hangOn=0,double=0,heavy=0,heavyOut=0;
  const add=(key,w)=>{wins[key]??=[0,0];wins[key][0]+=w;wins[key][1]++;};
  for(let g=0;g<n;g++) {
    const teams=[0,1].map(()=>Array.from({length:3},()=>def(random)));
    const res=battle(teams,Math.floor(random()*4294967296));
    lengths.push(res.actions);hits+=res.hits;hangOn+=res.hangOn;double+=res.double;
    caps+=+(res.state.reason==='cap');draws+=+(res.state.winner!==0&&res.state.winner!==1);
    for(let side=0;side<2;side++)for(const m of res.state.teams[side]) {
      const w=+(res.state.winner===side);add(`type:${m.type}`,w);
      for(const k of ['regular','special','defense'])add(`move:${m.moves[k].id}`,w);
      for(const k of statNames)add(`stat:${k}:${m.stats[k]}`,w);
      if(m.moves.regular.id==='heavy'){heavy++;heavyOut+=+(m.pp.regular===0);}
    }
  }
  const transfers={};
  // Port exp_transfer.py: mirrored types/moves, every creature moves exactly 2 points.
  for(const [src,dst] of [['health','attack'],['health','defense'],['attack','defense']]) {
    const eligible=builds.filter(b=>b[src]>=2&&b[dst]<=3),pairedRandom=source(11);let wins=0;
    for(let g=0;g<paired;g++) {
      const original=Array.from({length:3},()=>def(pairedRandom,eligible));
      const moved=structuredClone(original);for(const c of moved){c.stats[src]-=2;c.stats[dst]+=2;}
      const movedSide=g%2?1:0;
      const teams=movedSide?[original,moved]:[moved,original];
      wins+=+(battle(teams,Math.floor(pairedRandom()*4294967296)).state.winner===movedSide);
    }
    transfers[`${src}→${dst}`]=100*wins/paired;
  }
  let normalWins=0;
  for(let g=0;g<easy;g++) {
    const teams=[0,1].map(()=>Array.from({length:3},()=>def(random))),normalSide=g%2;
    normalWins+=+(battle(teams,Math.floor(random()*4294967296),normalSide?['easy','normal']:['normal','easy']).state.winner===normalSide);
  }
  lengths.sort((a,b)=>a-b);
  // Full §6 opponent includes its independent team selector, not only battle choices.
  const teamRandom=source(501);let fullNormalWins=0;
  for(let g=0;g<easy;g++) {
    const collection=Array.from({length:24},(_,i)=>({...def(teamRandom),id:`cr-sim${String(i).padStart(3,'0')}`}));
    const normalSide=g%2,difficulties=normalSide?['easy','normal']:['normal','easy'];
    const teams=difficulties.map(difficulty=>chooseTeam(collection,{difficulty,aiRng:Math.floor(teamRandom()*4294967296)}).team);
    fullNormalWins+=+(battle(teams,Math.floor(teamRandom()*4294967296),difficulties).state.winner===normalSide);
  }
  const rates=Object.fromEntries(Object.entries(wins).map(([k,[w,n]])=>[k,100*w/n]));
  const gates=[];
  const gate=(metric,value,pass)=>gates.push({metric,value,pass});
  for(const t of Object.keys(rules.types))gate(`type ${t} (47–53%)`,rates[`type:${t}`],rates[`type:${t}`]>=47&&rates[`type:${t}`]<=53);
  for(const slot of Object.values(rules.moves))for(const id of Object.keys(slot))gate(`move ${id} (46–54%)`,rates[`move:${id}`],rates[`move:${id}`]>=46&&rates[`move:${id}`]<=54);
  for(const k of statNames){const delta=rates[`stat:${k}:5`]-rates[`stat:${k}:0`];gate(`${k} 5−0 (±3 points)`,delta,Math.abs(delta)<=3);}
  for(const [k,v]of Object.entries(transfers))gate(`paired ${k} (45–55%)`,v,v>=45&&v<=55);
  const median=lengths[Math.floor(n/2)],p90=lengths[Math.floor(n*0.9)];
  gate('median actions (22–34)',median,median>=22&&median<=34);gate('p90 actions (≤55)',p90,p90<=55);
  gate('draws (0)',draws,draws===0);gate('safety-cap endings (0)',caps,caps===0);
  gate('Heavy exhausted (3–15%)',100*heavyOut/heavy,heavyOut/heavy>=0.03&&heavyOut/heavy<=0.15);
  gate('Full Normal beats Easy (≥70%)',100*fullNormalWins/easy,fullNormalWins/easy>=0.7);
  return {samples:{n,paired,easy,seed},rates,transfers,median,p90,draws,caps,hangOn:{count:hangOn,hits,percent:100*hangOn/hits},doublePerBattle:double/n,heavyExhaustion:100*heavyOut/heavy,normalVsEasy:100*fullNormalWins/easy,actionOnlyNormalVsEasy:100*normalWins/easy,gates,pass:gates.every(g=>g.pass)};
}
function main(){
  const args=process.argv.slice(2);const numeric=(key,fallback)=>{const i=args.indexOf(key);if(i<0)return fallback;const n=Number(args[i+1]);if(!Number.isInteger(n)||n<1)throw Error(`Invalid ${key}`);return n;};
  const result=simulate({n:numeric('--battles',10000),paired:numeric('--paired',4000),easy:numeric('--easy',4000),seed:numeric('--seed',3)});
  console.log(`Samples: random ${result.samples.n}; each paired ${result.samples.paired}; Normal/Easy ${result.samples.easy}; seed ${result.samples.seed}`);
  for(const g of result.gates)console.log(`${g.pass?'PASS':'FAIL'} | ${g.metric} | ${g.value.toFixed(2)}`);
  console.log(`Action/replacement-only Normal/Easy on assigned random teams (diagnostic): ${result.actionOnlyNormalVsEasy.toFixed(2)}%`);
  console.log(`Hang on ${result.hangOn.count}/${result.hangOn.hits} hits (${result.hangOn.percent.toFixed(4)}%); double turns/battle ${result.doublePerBattle.toFixed(2)}`);
  const out=args.indexOf('--json');if(out>=0)writeFileSync(args[out+1],JSON.stringify(result,null,2)+'\n');
  process.exitCode=result.pass?0:1;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])main();
