import { damage, expectedDamage, roundHalfUp } from './rules.js';

const current = (s, side) => s.teams[side][s.active[side]];
const copyCreature = m => ({ ...m, pp: { ...m.pp } });
const fraction = (n, f) => roundHalfUp(n * f[0], f[1]);

// Expected outcomes from public information only: no battle rolls are sampled.
// Fractional HP/shields represent uncertainty, not guaranteed hits or KOs.
export function tacticalState(s, side, lastSwitch = false) {
  return { rules: s.rules, teams: s.teams, active: s.active, switchesLeft: s.switchesLeft,
    nextHitGuaranteed: s.nextHitGuaranteed ?? [false, false], switchLocked: [side === 0 && lastSwitch, side === 1 && lastSwitch] };
}
function attacks(s, side) {
  const m = current(s, side), actions = [];
  if (m.pp.regular > 0) actions.push({ kind: 'regular' });
  if (m.pp.special > 0 && !m.recharging) actions.push({ kind: 'special' });
  if (!actions.length) actions.push({ kind: 'fallback' });
  return actions;
}
export function hasDefenseGain(r, m) {
  const id = m.moves.defense.id;
  return id === 'heal' ? m.hp < m.maxHp : id === 'toughen' ? !m.toughened :
    Math.min(m.maxHp - m.hp, fraction(m.maxHp, r.moves.defense.guard.factor)) > m.shield;
}
function options(s, side) {
  const m = current(s, side), actions = attacks(s, side);
  if (m.pp.defense > 0 && hasDefenseGain(s.rules, m)) actions.push({ kind: 'defense' });
  if (!s.switchLocked[side] && s.switchesLeft[side] > 0) s.teams[side].forEach((c, index) => {
    if (index !== s.active[side] && c.hp > 0) actions.push({ kind: 'switch', index });
  });
  return actions;
}
function project(input, side, action) {
  const target = 1 - side, s = { ...input, teams: input.teams.map(t => [...t]), active: [...input.active],
    switchesLeft: [...input.switchesLeft], nextHitGuaranteed: [...input.nextHitGuaranteed], switchLocked: [...input.switchLocked] };
  const me = copyCreature(current(s, side)), foe = copyCreature(current(s, target)), r = s.rules;
  s.teams[side][s.active[side]] = me; s.teams[target][s.active[target]] = foe;
  me.recharging = false; s.switchLocked[side] = action.kind === 'switch';
  if (action.kind === 'switch') {
    me.shield = 0; me.toughened = false; s.active[side] = action.index; s.switchesLeft[side]--; return s;
  }
  const fallback = action.kind === 'fallback', move = fallback ? r.fallback : r.moves[action.kind][me.moves[action.kind].id];
  if (!fallback) me.pp[action.kind]--;
  if (action.kind === 'defense') {
    const id = me.moves.defense.id;
    if (id === 'heal') me.hp = Math.min(me.maxHp, me.hp + fraction(me.maxHp, move.factor));
    else if (id === 'guard') me.shield = Math.min(me.maxHp - me.hp, fraction(me.maxHp, move.factor));
    else me.toughened = true;
    return s;
  }
  me.recharging = !!move.rest;
  const guarantee = Number(s.nextHitGuaranteed[side]), accuracy = guarantee + (1 - guarantee) * move.accuracy / 100;
  const context = { first: me.stats.speed > foe.stats.speed, fallback };
  const critChance = fallback ? 0 : (r.crit.basePercent + r.crit.perSpeedPercent * me.stats.speed) / 100;
  const available = me.aliveChance ?? 1, foeAvailable = foe.aliveChance ?? 1;
  let hp = foe.hp * (1 - accuracy * available), shield = foe.shield * (1 - accuracy * available);
  let survival = 1 - accuracy * available, savedChance = 0, recoil = 0;
  for (const [crit, chance] of [[false, 1 - critChance], [true, critChance]]) {
    const probability = chance * accuracy * available;
    if (!probability) continue;
    const raw = damage(r, me, foe, move, { ...context, crit });
    const absorbed = Math.min(foe.shield, raw);
    let loss = Math.min(foe.hp, raw - absorbed);
    const saved = r.hangOn && !foe.lastChanceUsed && foe.hp > 1 &&
      raw - absorbed >= Math.floor(foe.maxHp / 2) && loss === foe.hp;
    if (saved) { loss--; savedChance += probability; }
    const remaining = foe.hp - loss;
    hp += probability * remaining;
    shield += probability * (remaining > 0 ? foe.shield - absorbed : 0);
    survival += probability * Number(remaining > 0);
    if (move.recoil && (fallback || loss > 0) && (fallback || me.hp > 1)) {
      const amount = Math.min(fallback ? me.hp : me.hp - 1, Math.max(1, Math.floor(loss * move.recoil[0] / move.recoil[1] + .5)));
      recoil += chance * accuracy * amount * foeAvailable;
    }
  }
  foe.aliveChance = foeAvailable * survival;
  // Keep HP conditional on survival, so a likely miss does not turn a likely
  // knockout into a fictitious healthy creature taking another full-strength turn.
  foe.hp = survival > 0 ? hp / survival : 0;
  foe.shield = survival > 0 ? shield / survival : 0;
  if (savedChance > 0) foe.lastChanceUsed = true;
  s.nextHitGuaranteed[side] = 1 - accuracy;
  me.hp = Math.max(0, me.hp - recoil);
  for (const m of [me, foe]) if (m.hp <= 0) { m.shield = 0; m.toughened = false; m.recharging = false; }
  return s;
}
function value(s, side) {
  const teamValue = owner => s.teams[owner].reduce((sum, m) => sum +
    (m.aliveChance ?? 1) * (100 * m.hp / m.maxHp + (m.hp > 0 ? 75 : 0) + 12 * m.shield / m.maxHp +
    (m.toughened ? 3 : 0) + .6 * m.pp.special + .25 * m.pp.defense), 2 * s.switchesLeft[owner]);
  return teamValue(side) - teamValue(1 - side);
}
function terminal(s) { return s.teams.some(team => team.every(m => m.hp <= 0)); }
function ready(s, side) {
  if (current(s, side).hp > 0) return s;
  // Forced replacement is free and inherits the next action. Estimate the best
  // healthy attacker rather than inventing a turn spent on replacement.
  const foe = current(s, 1 - side);
  let best = -Infinity, index = s.active[side];
  s.teams[side].forEach((m, i) => {
    if (m.hp <= 0) return;
    const candidate = { ...s, active: s.active.map((slot, owner) => owner === side ? i : slot) };
    const pressure = Math.max(...attacks(candidate, side).map(a => expectedDamage(s.rules, m, foe,
      a.kind === 'fallback' ? s.rules.fallback : s.rules.moves[a.kind][m.moves[a.kind].id],
      { first: m.stats.speed > foe.stats.speed, fallback: a.kind === 'fallback' })));
    const score = m.hp / m.maxHp * 40 + pressure;
    if (score > best) { best = score; index = i; }
  });
  return { ...s, active: s.active.map((slot, owner) => owner === side ? index : slot),
    switchLocked: s.switchLocked.map((locked, owner) => owner === side ? true : locked) };
}
export function tacticalScore(input, side, action) {
  const after = project(input, side, action);
  if (terminal(after)) return value(after, side);
  const foeTurn = ready(after, 1 - side);
  // Our action, their strongest response, and our next available action.
  return Math.min(...options(foeTurn, 1 - side).map(reply => {
    const response = project(foeTurn, 1 - side, reply), immediate = value(response, side);
    if (terminal(response)) return immediate;
    const next = ready(response, side);
    const followup = Math.max(...options(next, side).map(a => value(project(next, side, a), side)));
    return .4 * immediate + .6 * followup;
  }));
}
export function replacementScore(s, side, index) {
  const candidate = { ...tacticalState(s, side, true), active: s.active.map((slot, owner) => owner === side ? index : slot) };
  return Math.max(...options(candidate, side).map(a => tacticalScore(candidate, side, a)));
}
