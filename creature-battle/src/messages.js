// Text is rendered with textContent by the UI; no child-supplied HTML.
export function eventLines(event, { name = side => `Creature ${side + 1}`, trainer = side => `Trainer ${side + 1}`, previous = name } = {}) {
  const n = name(event.side);
  switch (event.t) {
    case 'enter': return [`Go, ${n}!`];
    case 'round': return [event.reason === 'speed' ? `${name(event.order[0])} is faster!` : `Coin toss: ${name(event.order[0])} goes first!`,
      ...(event.double !== null ? [`${name(event.double)} goes again!`] : [])];
    case 'use': return [`${n} used ${event.name}!`, ...(event.moveId === 'overload' ? ['Next turn: nap.'] : [])];
    case 'fallback': return [`${n} is worn out… Tired Tackle!`];
    case 'miss': return ['So close! It missed!'];
    case 'hit': return [...(event.absorbed ? [`The shield blocked ${event.absorbed}!`] : []), `It dealt ${event.amount} damage.`,
      ...(event.eff === 'strong' ? ["It's super effective!"] : event.eff === 'weak' ? ["It's not very effective…"] : []),
      ...(event.crit ? ['A critical hit!'] : [])];
    case 'shieldBreak': return ['The shield broke!'];
    case 'hangOn': return [`${n} hung on with 1 HP!`];
    case 'recoil': return [`${n} got hurt too! (−${event.amount})`];
    case 'heal': return [`${n} healed ${event.amount}!`];
    case 'shieldUp': return ['A bubble shield popped up!'];
    case 'toughen': return [`${n} got tougher!`];
    case 'rest': return [`${n} is taking a nap 💤`];
    case 'switch': return [`Come back, ${previous(event.side)}!`, `Go, ${n}!`];
    case 'faint': return [`${n} fainted!`];
    case 'skip': return [`${n} fainted and can't move.`];
    case 'needReplace': return ['Pick your next creature!'];
    case 'win': return [`${trainer(event.side)} wins!`];
    default: throw Error(`Unknown event: ${event.t}`);
  }
}
// Message queue shows one short sentence per page, at most two wrapped lines.
export function wrapLine(text, columns = 56) {
  const lines = [''];
  for (const word of text.split(' ')) {
    if ((lines.at(-1).length + 1 + word.length) > columns && lines.at(-1)) lines.push(word);
    else lines[lines.length - 1] += (lines.at(-1) ? ' ' : '') + word;
  }
  return lines;
}
