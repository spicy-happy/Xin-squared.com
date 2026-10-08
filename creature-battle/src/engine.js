import { next } from './rng.js';
import { loadRules, maxHp, damage, roundHalfUp, typeFactor } from './rules.js';
import { validateCreature } from './collection.js';

const current = (s, side) => s.teams[side][s.active[side]];
const draw = s => { const [value, rng] = next(s.rng); s.rng = rng; return value; };
const fraction = (value, f) => roundHalfUp(value * f[0], f[1]);
const leave = m => { m.shield = 0; m.toughened = false; };
const snapshot = m => ({ hpAfter: m.hp, ppAfter: { ...m.pp }, shieldAfter: m.shield, rechargingAfter: m.recharging });
function enter(s, events, side) {
  const m = current(s, side);
  events.push({ t: 'enter', side, slot: s.active[side], name: m.name, ...snapshot(m), switchesLeft: s.switchesLeft[side] });
}
function win(s, events, side, reason) {
  s.over = true; s.winner = side; s.reason = reason;
  events.push({ t: 'win', side, reason });
}
function cap(s, events) {
  // Exact common denominator for all six max-HP fractions (BigInt only here).
  const denom = s.teams.flat().reduce((n, m) => n * BigInt(m.maxHp), 1n);
  const sums = s.teams.map(team => team.reduce((n, m) => n + BigInt(m.hp) * (denom / BigInt(m.maxHp)), 0n));
  const dealt = s.teams.map(team => team.reduce((n, m) => n + m.damageDealt, 0));
  const winner = sums[0] !== sums[1] ? +(sums[1] > sums[0]) :
    dealt[0] !== dealt[1] ? +(dealt[1] > dealt[0]) : +(draw(s) >= 0.5);
  win(s, events, winner, 'cap');
}
function startRound(s, events) {
  if (s.round >= s.rules.roundCap) { cap(s, events); return; }
  s.round++;
  s.slot = 0;
  const speeds = [current(s, 0).stats.speed, current(s, 1).stats.speed];
  let reason = speeds[0] === speeds[1] ? 'coin' : 'speed';
  if (reason === 'coin' && s.pairCoin === null) s.pairCoin = draw(s) < 0.5 ? 0 : 1;
  let first = reason === 'coin' ? s.pairCoin : +(speeds[1] > speeds[0]);
  // Speed chooses the opening turn. Switching or replacing never grants
  // a bonus action by reversing the order at a later round boundary.
  if (s.lastActor !== null) { first = 1 - s.lastActor; reason = 'alternating'; }
  s.order = [first, 1 - first];
  events.push({ t: 'round', n: s.round, order: [...s.order], reason, double: s.lastActor === first ? first : null });
}
function advance(s, events) {
  while (!s.over) {
    const fainted = s.active.findIndex((slot, side) => s.teams[side][slot].hp === 0);
    if (fainted !== -1) {
      const living = s.teams[fainted].map((m,index)=>({m,index})).filter(({m})=>m.hp>0);
      if (living.length === 1) {
        s.active[fainted] = living[0].index; s.pairCoin = null;
        enter(s, events, fainted); continue;
      }
      s.needReplacement = fainted; events.push({t:'needReplace',side:fainted}); return;
    }
    if (s.slot === 2) { startRound(s, events); if (s.over) return; }
    return;
  }
}
export function createMatch({ rules, teams, seed }) {
  rules = loadRules(rules);
  if (!Array.isArray(teams) || teams.length !== 2 || teams.some(t => !Array.isArray(t) || t.length !== 3)) throw Error('Two teams of three required');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('Seed must be uint32');
  const instances = teams.map(team => team.map(def => {
    const errors = validateCreature(def, rules);
    if (errors.length) throw Error(errors.join('; '));
    const m = structuredClone(def);
    return { ...m, maxHp: maxHp(rules, m.stats), hp: maxHp(rules, m.stats),
      pp: Object.fromEntries(['regular','special','defense'].map(slot => [slot, rules.moves[slot][m.moves[slot].id].pp])),
      lastChanceUsed: false, shield: 0, toughened: false, recharging: false, damageDealt: 0 };
  }));
  const state = { rules, teams: instances, active: [0,0], rng: seed >>> 0, switchesLeft: [rules.switchLimit, rules.switchLimit],
    nextHitGuaranteed: [false, false], round: 0, slot: 0, order: [], pairCoin: null, lastActor: null, needReplacement: null, over: false };
  const events = [];
  enter(state, events, 0); enter(state, events, 1); startRound(state, events);
  return { state, events };
}
export function whoseTurn(state) {
  if (state.over) return { over: true, winner: state.winner, reason: state.reason };
  return state.needReplacement !== null ? { side: state.needReplacement, need: 'replacement' } :
    { side: state.order[state.slot], need: 'action' };
}
export function getActions(state, side) {
  if (side !== 0 && side !== 1) throw Error('Invalid side');
  const turn = whoseTurn(state);
  const m = current(state, side);
  const allowed = !turn.over && turn.need === 'action' && turn.side === side;
  const make = (kind, ok, reason, index) => ({ kind, ...(index === undefined ? {} : { index }), enabled: allowed && ok,
    ...(!allowed ? { reason: "Wait for your turn!" } : !ok ? { reason } : {}) });
  const fallback = m.pp.regular === 0 && (m.pp.special === 0 || m.recharging);
  const defenseReason = m.pp.defense === 0 ? 'All used up!' : null;
  return [make(fallback ? 'fallback' : 'regular', fallback || m.pp.regular > 0, 'All used up!'),
    make('special', m.pp.special > 0 && !m.recharging, m.pp.special === 0 ? 'All used up!' : 'Recharging! Choose another move.'), make('defense', !defenseReason, defenseReason),
    ...state.teams[side].map((bench, index) => make('switch', index !== state.active[side] && bench.hp > 0 && state.switchesLeft[side] > 0,
      state.switchesLeft[side] === 0 ? 'No switches left!' : bench.hp === 0 ? 'Needs a rest!' : 'Already here!', index))];
}
export function applyAction(input, side, action) {
  if (!action || !getActions(input, side).some(a => a.enabled && a.kind === action.kind && a.index === action.index)) throw Error('Illegal action');
  const state = structuredClone({...input, rules: undefined}); state.rules = Object.isFrozen(input.rules) ? input.rules : loadRules(input.rules);
  const s = state, events = [];
  const m = current(s, side), target = 1 - side, foe = current(s, target);
  // A recovery turn allows another move or a switch; it never skips input.
  m.recharging = false;
  if (action.kind === 'switch') {
    leave(m);
    const from = s.active[side]; s.active[side] = action.index; s.pairCoin = null; s.switchesLeft[side]--;
    events.push({ t: 'switch', side, from, to: action.index, switchesLeft: s.switchesLeft[side], ...snapshot(current(s, side)) });
    enter(s, events, side);
  } else {
    const slot = action.kind, fallback = slot === 'fallback';
    const move = fallback ? s.rules.fallback : s.rules.moves[slot][m.moves[slot].id];
    if (!fallback) m.pp[slot]--;
    m.recharging = !!move.rest;
    if (fallback) events.push({ t: 'fallback', side });
    events.push({ t: 'use', side, slot: s.active[side], moveId: fallback ? move.id : m.moves[slot].id,
      name: fallback ? move.label : m.moves[slot].name, ppAfter: { ...m.pp }, rechargingAfter: m.recharging });
    if (slot === 'defense') {
      const id = m.moves.defense.id;
      if (id === 'heal') {
        const amount = Math.min(m.maxHp - m.hp, fraction(m.maxHp, move.factor)); m.hp += amount;
        events.push({ t: 'heal', side, amount, hpAfter: m.hp, ppAfter: { ...m.pp } });
      } else if (id === 'guard') {
        const before = m.shield;
        m.shield = Math.min(m.maxHp - m.hp, fraction(m.maxHp, move.factor));
        events.push({ t: 'shieldUp', side, amount: m.shield, unchanged: m.shield === before, shieldAfter: m.shield, ppAfter: { ...m.pp } });
      } else { const unchanged = m.toughened; m.toughened = true; events.push({ t: 'toughen', side, unchanged, ppAfter: { ...m.pp } }); }
    } else {
      // A revealed miss banks one guaranteed hit for this player, across switches.
      const hit = s.nextHitGuaranteed[side] || move.accuracy === 100 || draw(s) * 100 < move.accuracy;
      s.nextHitGuaranteed[side] = !hit;
      if (!hit) events.push({ t: 'miss', side });
      else {
        const crit = !fallback && draw(s) * 100 < s.rules.crit.basePercent + s.rules.crit.perSpeedPercent * m.stats.speed;
        // Quick Strike rewards the current matchup speed, independent of turn slots.
        const raw = damage(s.rules, m, foe, move, { first: m.stats.speed > foe.stats.speed, crit, fallback });
        const absorbed = Math.min(foe.shield, raw); foe.shield -= absorbed;
        let amount = Math.min(foe.hp, raw - absorbed);
        const hangOn = s.rules.hangOn && !foe.lastChanceUsed && foe.hp > 1 && raw - absorbed >= Math.floor(foe.maxHp / 2) && amount === foe.hp;
        if (hangOn) {amount--;foe.lastChanceUsed=true;}
        foe.hp -= amount; m.damageDealt += amount;
        const factor = fallback ? [1,1] : typeFactor(s.rules, m.type, foe.type);
        events.push({ t: 'hit', side, target, amount, crit, eff: factor[0] > factor[1] ? 'strong' : factor[0] < factor[1] ? 'weak' : null,
          absorbed, shieldAfter: foe.shield, hpAfter: foe.hp });
        if (absorbed > 0 && foe.shield === 0) events.push({ t: 'shieldBreak', side: target });
        if (hangOn) events.push({ t: 'hangOn', side: target });
        if (move.recoil && (fallback || amount > 0) && (fallback || m.hp > 1)) {
          const recoil = Math.min(fallback ? m.hp : m.hp - 1, Math.max(1, fraction(amount, move.recoil))); m.hp -= recoil;
          events.push({ t: 'recoil', side, amount: recoil, hpAfter: m.hp });
        }
        for (const [faintedSide, creature] of [[target,foe],[side,m]]) if (creature.hp === 0) {
          creature.recharging = false; leave(creature); s.pairCoin = null;
          events.push({t:'faint',side:faintedSide,...snapshot(creature)});
        }
        // A final hit wins even if Struggle's recoil also faints its user.
        if (s.teams[target].every(x=>x.hp===0)) win(s,events,side,'ko');
        else if (s.teams[side].every(x=>x.hp===0)) win(s,events,target,'ko');
      }
    }
  }
  s.lastActor = side; s.slot++;
  advance(s, events);
  return { state, events };
}
export function chooseReplacement(input, side, index) {
  const turn = whoseTurn(input);
  if (turn.over || turn.need !== 'replacement' || turn.side !== side || !Number.isInteger(index) ||
      index === input.active[side] || !(input.teams[side][index]?.hp > 0)) throw Error('Illegal replacement');
  const state = structuredClone({...input, rules: undefined}); state.rules = Object.isFrozen(input.rules) ? input.rules : loadRules(input.rules);
  const events = [];
  state.active[side] = index; state.pairCoin = null; state.needReplacement = null;
  // A replacement before its action inherits that unspent slot.
  // At round end advance starts the next round after replacements are complete.
  enter(state, events, side); advance(state, events);
  return { state, events };
}
