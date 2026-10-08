export function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
const positive = n => Number.isSafeInteger(n) && n > 0;
export function loadRules(json) {
  const r = structuredClone(json);
  if (r.schema !== 1 || r.version !== 1 || r.sheet !== 'S1') throw Error('Unsupported rules or sheet');
  if (!positive(r.stats?.budget) || r.stats.min !== 0 || !positive(r.stats.max) ||
      !positive(r.hp?.base) || !positive(r.hp.perHealth) || !positive(r.statScale) ||
      !positive(r.switchLimit) || !positive(r.roundCap)) throw Error('Invalid rules numbers');
  const fraction = f => Array.isArray(f) && f.length === 2 && f.every(positive);
  if (!fraction(r.crit?.mult) || !Number.isInteger(r.crit.basePercent) ||
      !Number.isInteger(r.crit.perSpeedPercent) || r.crit.basePercent < 0 ||
      r.crit.basePercent + r.stats.max * r.crit.perSpeedPercent > 100) throw Error('Invalid critical rules');
  if (Object.keys(r.types ?? {}).length !== 6) throw Error('Six types required');
  for (const [id, t] of Object.entries(r.types)) {
    if (!t.label || !Array.isArray(t.strong) || !Array.isArray(t.weak) ||
        t.strong.length !== 2 || t.weak.length !== 2 || new Set([...t.strong, ...t.weak]).size !== 4 ||
        [...t.strong, ...t.weak].some(x => x === id || !r.types[x])) throw Error('Invalid type chart');
  }
  if (!['strong', 'weak', 'neutral'].every(k => fraction(r.typeFactors?.[k]))) throw Error('Invalid type factors');
  for (const slot of ['regular', 'special', 'defense']) {
    if (Object.keys(r.moves?.[slot] ?? {}).length !== (slot === 'defense' ? 3 : 4)) throw Error('Invalid move menu');
    for (const m of Object.values(r.moves[slot])) {
      if (!m.label || !m.hint || !positive(m.pp)) throw Error('Invalid move');
      if (slot === 'defense' ? !fraction(m.factor) :
          !positive(m.power) || !positive(m.accuracy) || m.accuracy > 100) throw Error('Invalid move numbers');
      if (m.secondPower !== undefined && !positive(m.secondPower)) throw Error('Invalid Quick power');
      if (m.recoil !== undefined && !fraction(m.recoil)) throw Error('Invalid recoil');
    }
  }
  if (!positive(r.fallback?.power) || r.fallback.accuracy !== 100 || r.fallback.crit !== false || (r.fallback.recoil !== undefined && !fraction(r.fallback.recoil))) throw Error('Invalid fallback');
  return deepFreeze(r);
}
// All combat quantities use a single exact fraction and one half-up rounding.
export const roundHalfUp = (num, den) => {
  if (!Number.isSafeInteger(num) || num < 0 || !positive(den) || !Number.isSafeInteger(2 * num + den)) throw Error('Unsafe fraction');
  return Math.floor((2 * num + den) / (2 * den));
};
export const maxHp = (rules, stats) => rules.hp.base + rules.hp.perHealth * stats.health;
export function typeFactor(rules, attackType, targetType) {
  if (!rules.types[attackType] || !rules.types[targetType]) throw Error('Unknown type');
  const row = rules.types[attackType];
  return rules.typeFactors[row.strong.includes(targetType) ? 'strong' : row.weak.includes(targetType) ? 'weak' : 'neutral'];
}
export const typeMult = (rules, a, d) => { const [n, den] = typeFactor(rules, a, d); return n / den; };
export function damage(rules, attacker, defender, move, { first = true, crit = false, fallback = false } = {}) {
  const power = !first && move.secondPower !== undefined ? move.secondPower : move.power;
  const type = fallback ? [1, 1] : typeFactor(rules, attacker.type, defender.type);
  const critical = crit && !fallback ? rules.crit.mult : [1, 1];
  const tough = defender.toughened ? rules.moves.defense.toughen.factor : [1, 1];
  const num = power * (rules.statScale + attacker.stats.attack) * type[0] * critical[0] * tough[0];
  const den = (rules.statScale + (move.piercing ? 0 : defender.stats.defense)) * type[1] * critical[1] * tough[1];
  return Math.max(1, roundHalfUp(num, den));
}
// Only the AI expectation uses floats; it cannot observe the battle RNG.
export function expectedDamage(rules, attacker, defender, move, context = {}) {
  const fallback = context.fallback === true;
  const p = fallback ? 0 : (rules.crit.basePercent + rules.crit.perSpeedPercent * attacker.stats.speed) / 100;
  const actual = crit => {
    const hit = Math.max(0, damage(rules, attacker, defender, move, { ...context, crit }) - defender.shield);
    const capped = Math.min(hit, defender.hp);
    return rules.hangOn && !defender.lastChanceUsed && defender.hp > 1 && hit >= Math.floor(defender.maxHp / 2) && capped === defender.hp ? capped - 1 : capped;
  };
  return ((1 - p) * actual(false) + p * actual(true)) * (context.guaranteedHit ? 1 : move.accuracy / 100);
}
