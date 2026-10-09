import { moveSlots as slots } from './moves.js';
export const cleanName = name => typeof name === 'string' ? name.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
// Shared by the picker and collection intake. Check common disguises, keeping
// short words bounded so innocent names such as Cassie and Dickens still work.
const rudeRoots = /f[au]c+k|fuk|shit|bitch|asshole|arsehole|dickhead|cocksucker|nigg(?:er|a)|faggot|retard(?:ed)?/;
const rudeWords = /^(?:ass|arse|bastard|bastards|crap|damn|hell|dick|dicks|cock|cocks|cunt|cunts|piss|slut|sluts|whore|whores|fag|fags|idiot|idiots|stupid|dumb|dumbass|loser|losers|ugly|moron|morons|fat|hate|hates|hating|kill|kills|killer|killers|killing|die|dies|dead|suicide|sex|sexy|porn|penis|vagina|boob|boobs|nazi|hitler|kike|spic|chink)$/;
const meanPhrases = /shutup|youstink|yousuck|yousmell|nobodylikesyou|gotohell|ihate|hateyou|kill(?:you|yourself)|godie/;
const lookalikes = {'а':'a','е':'e','і':'i','о':'o','р':'p','с':'c','х':'x','у':'y','ѕ':'s','ο':'o','ι':'i','α':'a','0':'o','1':'i','3':'e','4':'a','5':'s','7':'t'};
export function nameError(name) {
  if (typeof name !== 'string' || /[\p{Cc}\p{Cf}]/u.test(name)) return 'Use letters, numbers, spaces, hyphens or apostrophes.';
  const clean = cleanName(name);
  if (!clean || clean.length > 24) return 'Use a name with 1–24 characters.';
  if (/https?:|www\.|\S+\.(com|net|org|io|edu)\b/i.test(clean) || !/^[\p{L}\p{M}\p{N} '\u2019-]+$/u.test(clean)) return 'Use letters, numbers, spaces, hyphens or apostrophes.';
  const folded = clean.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[аеіорсхуѕοια013457]/g, c => lookalikes[c]);
  const words = folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const undecorated = clean.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/\d/g, '').split(/[^\p{L}]+/u).filter(Boolean);
  // Common given names that contain an otherwise blocked English fragment.
  const joined = words.map(word => /^(ishita|shital|harshit|ashita)$/.test(word) ? 'friendly' : word).join('');
  if (rudeRoots.test(joined) || [...words,...undecorated].some(word => rudeWords.test(word)) || rudeWords.test(joined) || meanPhrases.test(joined)) return 'Choose a kind, kid-friendly name.';
  return '';
}
export function validName(name) { return !nameError(name); }
export function validateCreature(c, rules) {
  const errors = [];
  if (c?.schema !== 1 || c.rulesVersion !== rules.version || c.sheet !== rules.sheet) errors.push('Unsupported schema, rulesVersion or sheet');
  if (!/^cr-[a-z0-9]{6,}$/.test(c?.id ?? '')) errors.push('Invalid stable ID');
  if (!Object.hasOwn(rules.types,c?.type)) errors.push('Choose one valid type');
  const values = ['health','attack','defense','speed'].map(k => c?.stats?.[k]);
  if (values.some(x => !Number.isInteger(x) || x < rules.stats.min || x > rules.stats.max) ||
      values.reduce((a,b) => a+b,0) !== rules.stats.budget) errors.push(`Stats must be integers 0–${rules.stats.max} totalling ${rules.stats.budget}`);
  for (const [label,name] of [['Creature name',c?.name],['Trainer name',c?.trainer?.nickname]]) {
    const error = nameError(name); if (error) errors.push(`${label}: ${error}`);
  }
  for (const slot of slots) {
    const selected = c?.moves?.[slot];
    const category = selected?.category ?? slot;
    if (!Object.hasOwn(rules.moves,category) || !Object.hasOwn(rules.moves[category],selected?.id) || !validName(selected?.name)) errors.push(`Invalid ${slot} move`);
  }
  if (c?.image?.facing !== undefined && !['left','right','front'].includes(c.image.facing)) errors.push('Invalid facing direction');
  if (c?.trainer?.id !== undefined && !/^tr-[a-z0-9]{6,}$/.test(c.trainer.id)) errors.push('Invalid trainer ID');
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
    c.trainer.nickname = cleanName(c.trainer.nickname);
    const base = cleanName(c.name);
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
  // TEST entries retire automatically once six real submissions are available.
  const submitted=creatures.filter(c=>!c.prototype && !/^cr-debug/.test(c.id));
  return submitted.length>=6?submitted:creatures;
}
export function teamRule(collection) {
  return { canBattle: collection.length > 0, duplicates: collection.length < 3, size: 3 };
}
export function validateTeam(team, collection) {
  const rule = teamRule(collection);
  return rule.canBattle && team.length === rule.size && team.every(c => collection.some(x => x.id === c.id)) &&
    (rule.duplicates || new Set(team.map(c => c.id)).size === rule.size);
}

// Keep reviewed sheet choices intact, but surface unusual attack budgets.
export function creatureWarnings(c, rules) {
  const attacks = slots.filter(slot => (c.moves[slot].category ?? slot) !== 'defense');
  if (!attacks.length) return ['No selected attacks. Uses Struggle, which causes recoil.'];
  const uses = attacks.reduce((n, slot) => n + rules.moves[c.moves[slot].category ?? slot][c.moves[slot].id].pp, 0);
  return uses <= 3 ? [`Only ${uses} attack uses, then Struggle with recoil.`] : [];
}
