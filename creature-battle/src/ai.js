import { getActions } from './engine.js';
import { expectedDamage, damage, typeMult, roundHalfUp } from './rules.js';
import { next } from './rng.js';
import { teamRule } from './collection.js';

// Copy only revealed fields. Neither battle rolls nor pairing coin memo enter AI code.
export function publicBattle(state) {
  return { rules: state.rules, teams: state.teams, active: state.active, switchesLeft: state.switchesLeft,
    nextHitGuaranteed: state.nextHitGuaranteed, round: state.round, slot: state.slot, order: state.order, needReplacement: state.needReplacement, over: state.over };
}
const cur = (s, side) => s.teams[side][s.active[side]];
const matchup = (r, me, foe) => typeMult(r, me.type, foe.type) / typeMult(r, foe.type, me.type);
function randomSource(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('aiRng must be uint32');
  let aiRng = seed;
  return { draw() { let x; [x, aiRng] = next(aiRng); return x; }, get state() { return aiRng; } };
}
function attackScore(s, side, action, difficulty) {
  const me = cur(s, side), foe = cur(s, 1-side), r = s.rules;
  const fallback = action.kind === 'fallback';
  const move = fallback ? r.fallback : r.moves[action.kind][me.moves[action.kind].id];
  const context = { first: me.stats.speed > foe.stats.speed, fallback, guaranteedHit: s.nextHitGuaranteed?.[side] === true };
  const accuracy = context.guaranteedHit ? 100 : move.accuracy;
  const expected = expectedDamage(r, me, foe, move, context);
  if (difficulty === 'easy') return expected;
  const sure = Math.max(0, damage(r, me, foe, move, context) - foe.shield);
  const lethal = sure >= foe.hp && !(r.hangOn && !foe.lastChanceUsed && foe.hp > 1 && sure >= Math.floor(foe.maxHp / 2));
  if (lethal) return 100 + accuracy / 10 + (accuracy === 100 ? 5 : 0);
  // A shield is public: use Regular to wear it down instead of spending specials.
  if (foe.shield > 0 && action.kind === 'special') return -20;
  let score = expected;
  if (foe.shield > 0) score += Math.min(foe.shield,damage(r,me,foe,move,context));
  if (move.recoil) score *= 0.85;
  if (move.rest) {
    // Estimate one reply; recharging blocks only the next special, not the turn.
    const replies = ['regular','special'].filter(k => foe.pp[k] > 0 && !(k === 'special' && foe.recharging)).map(k => r.moves[k][foe.moves[k].id]);
    if (!replies.length) replies.push(r.fallback);
    const reply = Math.max(...replies.map(m => damage(r, foe, me, m, { first: foe.stats.speed > me.stats.speed })));
    if (me.hp <= reply) return -30;
    score *= 0.6;
  }
  return score;
}
export function scoreAction(s, side, action, difficulty = 'normal') {
  if (['regular','special','fallback'].includes(action.kind)) return attackScore(s, side, action, difficulty);
  if (difficulty === 'easy') return 0;
  const me = cur(s,side), foe = cur(s,1-side), frac = me.hp/me.maxHp;
  if (action.kind === 'defense') {
    const id=me.moves.defense.id;
    // Value the real gain rather than a fixed small score that attacks always beat.
    const [num,den]=s.rules.moves.defense[id].factor;
    if (id==='heal') return frac < 0.45 ? Math.min(me.maxHp-me.hp, roundHalfUp(me.maxHp*num,den))*0.85 : -5;
    if (id==='guard') {
      const full = roundHalfUp(me.maxHp*num,den);
      const gain = Math.max(0,Math.min(me.maxHp-me.hp,full)-me.shield);
      return gain ? (frac > 0.6 ? 13 : 4)*gain/full : -5;
    }
    return me.toughened ? -5 : frac > 0.6 ? 13 : 4;
  }
  const ratio=matchup(s.rules,me,foe), bench=s.teams[side][action.index];
  if (ratio > 0.5 || frac <= 0.3) return -30;
  const gain=matchup(s.rules,bench,foe)-ratio;
  return gain>0 ? 30+10*gain : -30;
}
export function chooseAction(state, side, { difficulty = 'easy', aiRng, lastSwitch = false } = {}) {
  if (!['easy','normal'].includes(difficulty)) throw Error('Invalid difficulty');
  const s=publicBattle(state), random=randomSource(aiRng);
  let actions=getActions(s,side).filter(a=>a.enabled);
  if (difficulty==='easy' && lastSwitch) actions=actions.filter(a=>a.kind!=='switch');
  if (!actions.length) throw Error('No legal action');
  const mistake=random.draw() < (difficulty==='easy' ? 0.85 : 0.1);
  const action=mistake ? actions[Math.floor(random.draw()*actions.length)] :
    actions.reduce((best,a)=>scoreAction(s,side,a,difficulty)>scoreAction(s,side,best,difficulty)?a:best);
  return { action: { kind: action.kind, ...(action.index === undefined ? {} : {index:action.index}) },
    aiRng: random.state, lastSwitch: action.kind==='switch' };
}
export function chooseReplacement(state, side, { difficulty='easy', aiRng } = {}) {
  const s=publicBattle(state), random=randomSource(aiRng), foe=cur(s,1-side);
  const options=s.teams[side].map((m,i)=>({m,i})).filter(({m,i})=>m.hp>0 && i!==s.active[side]);
  if (!options.length) throw Error('No replacement');
  const index=difficulty==='easy'?options[Math.floor(random.draw()*options.length)].i:
    options.reduce((best,a)=>matchup(s.rules,a.m,foe)>matchup(s.rules,best.m,foe) ||
      (matchup(s.rules,a.m,foe)===matchup(s.rules,best.m,foe) && a.m.hp>best.m.hp)?a:best).i;
  return { index, aiRng: random.state, lastSwitch: false };
}
// Team choice has no opponent argument; it cannot inspect a hidden team.
export function chooseTeam(collection, { difficulty='easy', aiRng } = {}) {
  const random=randomSource(aiRng), rule=teamRule(collection), team=[];
  if (!rule.canBattle) return { team, aiRng: random.state };
  for(let i=0;i<rule.size;i++) {
    let options=collection.filter(c=>rule.duplicates || !team.some(m=>m.id===c.id));
    if(difficulty==='normal') {
      const balanced=options.filter(c=>Object.values(c.stats).every(n=>n>0 && n<5));
      if(balanced.length)options=balanced;
      const different=options.filter(c=>!team.some(m=>m.type===c.type));
      if(different.length)options=different;
    }
    team.push(options[Math.floor(random.draw()*options.length)]);
  }
  return { team: structuredClone(team), aiRng:random.state };
}

// Normal openly uses the child's chosen team to offer favourable matchups.
// Select from the weakest matchups first, with random ties; Hard stays unchanged.
export function choosePracticeTeam(collection,{rules,openingType,playerTeam=[],aiRng}){
 const random=randomSource(aiRng),rule=teamRule(collection),team=[];
 if(!rule.canBattle)return {team,aiRng:random.state};
 const types=playerTeam.length?playerTeam.map(c=>c.type):[openingType];
 for(let i=0;i<rule.size;i++){
  const options=collection.filter(c=>rule.duplicates||!team.some(m=>m.id===c.id));
  const score=c=>typeMult(rules,types[i%types.length],c.type)/typeMult(rules,c.type,types[i%types.length]);
  const best=Math.max(...options.map(score));
  const pool=options.filter(c=>score(c)===best);
  team.push(pool[Math.floor(random.draw()*pool.length)]);
 }
 return {team:structuredClone(team),aiRng:random.state};
}
