import { readFileSync } from 'node:fs';
import { loadRules } from '../releases/v46/src/rules.js';
import { createMatch, whoseTurn, applyAction, chooseReplacement, getActions } from '../releases/v46/src/engine.js';
import { next } from '../releases/v46/src/rng.js';
export const rules = loadRules(JSON.parse(readFileSync(new URL('../data/rules-v2.json', import.meta.url))));
export function creature(overrides = {}) {
  return { schema: 1, id: 'cr-test00', rulesVersion: rules.version, sheet: 'S1', name: 'Test creature', trainer: { nickname: 'Test Trainer', portrait: 'assets/portraits/cr-test00.12345678.webp' },
    image: { src: 'assets/creatures/cr-test00.12345678.webp', w: 512, h: 400 }, type: 'water',
    stats: { health: 3, attack: 3, defense: 2, speed: 2 },
    moves: { regular: { id: 'steady', name: 'Steady' }, special: { id: 'blast', name: 'Blast' }, defense: { id: 'heal', name: 'Heal' } },
    added: '2026-10-07', ...overrides };
}
export const moves = (regular='steady', special='blast', defense='heal') => Object.fromEntries(Object.entries({ regular, special, defense }).map(([k,id]) => [k,{ id, name: rules.moves[k][id].label }]));
export const stats = (health,attack,defense,speed) => ({health,attack,defense,speed});
export function match(a={}, b={}, seed=9) {
  return createMatch({rules, teams: [Array.from({length:3},()=>creature(a)),Array.from({length:3},()=>creature(b))],seed});
}
export const active = (s, side) => s.teams[side][s.active[side]];
export const clone = s => structuredClone(s);
export const builds = [];
for (let h=0;h<=5;h++) for(let a=0;a<=5;a++) for(let d=0;d<=5;d++) for(let s=0;s<=5;s++) if(h+a+d+s===10) builds.push(stats(h,a,d,s));
export function randomCreature(random, id='cr-test00') {
  const pick = list => list[Math.floor(random()*list.length)];
  return creature({id,type:pick(Object.keys(rules.types)),stats:pick(builds),moves:moves(...['regular','special','defense'].map(slot=>pick(Object.keys(rules.moves[slot]))))});
}
export function runRandom(seed) {
  let policyRng = (seed+1024)>>>0, steps = 0;
  const random = () => { let v; [v,policyRng]=next(policyRng); return v; };
  const teams=[0,1].map(()=>Array.from({length:3},()=>randomCreature(random)));
  let {state} = createMatch({rules,teams,seed});
  while (!state.over) {
    const turn = whoseTurn(state);
    let x; [x, policyRng] = next(policyRng);
    if (turn.need === 'replacement') {
      const opts = state.teams[turn.side].map((m,i)=>m.hp>0 ? i : -1).filter(i=>i>=0);
      ({state} = chooseReplacement(state, turn.side, opts[Math.floor(x*opts.length)]));
    } else {
      const actions = getActions(state,turn.side).filter(a=>a.enabled);
      ({state} = applyAction(state,turn.side,actions[Math.floor(x*actions.length)]));
    }
    if (++steps > 300) throw Error('Did not terminate');
  }
  return state;
}
