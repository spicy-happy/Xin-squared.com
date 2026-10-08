const slots = ['regular', 'special', 'defense'];
export function validName(name) {
  return typeof name === 'string' && name.trim().length >= 1 && name.length <= 24 &&
    !/https?:|www\.|\S+\.(com|net|org|io|edu)\b|[<>\u0000-\u001f]/i.test(name);
}
export function validateCreature(c, rules) {
  const errors = [];
  if (c?.schema !== 1 || c.rulesVersion !== rules.version || c.sheet !== rules.sheet) errors.push('Unsupported schema, rulesVersion or sheet');
  if (!/^cr-[a-z0-9]{6,}$/.test(c?.id ?? '')) errors.push('Invalid stable ID');
  if (!rules.types[c?.type]) errors.push('Choose one valid type');
  const values = ['health','attack','defense','speed'].map(k => c?.stats?.[k]);
  if (values.some(x => !Number.isInteger(x) || x < rules.stats.min || x > rules.stats.max) ||
      values.reduce((a,b) => a+b,0) !== rules.stats.budget) errors.push(`Stats must be integers 0–${rules.stats.max} totalling ${rules.stats.budget}`);
  if (!validName(c?.name) || !validName(c?.trainer?.nickname)) errors.push('Names must be 1–24 characters, with no URLs');
  for (const slot of slots) if (!rules.moves[slot][c?.moves?.[slot]?.id] || !validName(c?.moves?.[slot]?.name)) errors.push(`Invalid ${slot} move`);
  const asset = (p, kind) => typeof p === 'string' && new RegExp(`^assets/${kind}/cr-[a-z0-9]+\\.[a-f0-9]{8,64}\\.webp$`).test(p);
  if (!asset(c?.image?.src, 'creatures') || !asset(c?.trainer?.portrait, 'portraits') ||
      !Number.isInteger(c?.image?.w) || c.image.w <= 0 || !Number.isInteger(c?.image?.h) || c.image.h <= 0) errors.push('Invalid image metadata');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c?.added ?? '') || Number.isNaN(Date.parse(c.added))) errors.push('Invalid added date');
  return errors;
}
export function loadCollection(json, rules) {
  if (json?.schema !== 1 || !Array.isArray(json.creatures)) throw Error('Invalid collection');
  const ids = new Set();
  for (const c of json.creatures) {
    const errors = validateCreature(c, rules);
    if (ids.has(c.id)) errors.push('Duplicate ID');
    if (errors.length) throw Error(`${c.id}: ${errors.join('; ')}`);
    ids.add(c.id);
  }
  const creatures = structuredClone(json.creatures);
  const canonical = name => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  // Reserve explicit names (including existing numbered names) before allocating suffixes.
  const reserved = new Set(creatures.map(c => canonical(c.name))), used = new Set();
  for (const c of creatures) {
    const base = c.name.trim();
    c.name = base;
    if (used.has(canonical(base))) {
      let number = 1;
      do {
        const suffix = ` ${number++}`;
        c.name = base.slice(0, 24 - suffix.length).trimEnd() + suffix;
      } while (reserved.has(canonical(c.name)) || used.has(canonical(c.name)));
    }
    used.add(canonical(c.name));
  }
  return creatures;
}
export function teamRule(collection) {
  return { canBattle: collection.length > 0, duplicates: collection.length < 3, size: 3 };
}
export function validateTeam(team, collection) {
  const rule = teamRule(collection);
  return rule.canBattle && team.length === rule.size && team.every(c => collection.some(x => x.id === c.id)) &&
    (rule.duplicates || new Set(team.map(c => c.id)).size === rule.size);
}
