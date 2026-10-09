// Text is rendered with textContent by the UI; no child-supplied HTML.
export function eventLines(event, { name = side => `Creature ${side + 1}`, trainer = side => `Trainer ${side + 1}`, previous = name } = {}) {
  const n = event.side === 0 || event.side === 1 ? name(event.side) : '';
  switch (event.t) {
    case 'enter': return [`Go, ${n}!`];
    case 'round': if (event.reason === 'alternating') return ['The next round begins.']; return [event.reason === 'speed' ? `${name(event.order[0])} is faster!` : `Coin toss: ${name(event.order[0])} goes first!`,
      ...(event.double !== null ? [`${name(event.double)} goes again!`] : [])];
    case 'use': return [`${n} used ${event.name}!`, ...(event.moveId === 'overload' ? [`Its special recharges next turn.`] : [])];
    case 'fallback': return [`${n} has no attacks left.`];
    case 'miss': return ['So close! It missed!'];
    case 'hit': return [...(event.absorbed ? [`The shield blocked ${event.absorbed}!`] : []), ...(event.amount ? [`It dealt ${event.amount} damage.`] : []),
      ...(event.amount && event.eff === 'strong' ? ["It's super effective!"] : event.amount && event.eff === 'weak' ? ["It's not very effective…"] : []),
      ...(event.amount && event.crit ? ['A critical hit!'] : [])];
    case 'shieldBreak': return ['The shield broke!'];
    case 'hangOn': return [`${n} hung on with 1 HP!`];
    case 'recoil': return [`${n} got hurt too! (−${event.amount})`];
    case 'heal': return [event.amount ? `${n} healed ${event.amount}!` : `${n} already has full HP.`];
    case 'shieldUp': return [event.unchanged && event.amount ? 'Bubble Shield is already fully charged.' : event.amount ? `Bubble Shield protects ${event.amount} HP!` : `${n} already has full HP.`];
    case 'toughen': return [event.unchanged ? `${n} is already toughened.` : `${n} got tougher!`];
    case 'rest': return [`${n} is taking a nap... zZ`];
    case 'switch': return [`Come back, ${previous(event.side)}!`, `Go, ${n}!`];
    case 'faint': return [`${n} fainted!`];
    case 'skip': return [`${n} fainted and can't move.`];
    case 'needReplace': return ['Pick your next creature!'];
    case 'win': return [`${trainer(event.side)} wins!`];
    default: throw Error(`Unknown event: ${event.t}`);
  }
}
// Wrap a sentence for message-validation tools.
export function wrapLine(text, columns = 56) {
  const lines = [''];
  for (const word of text.split(' ')) {
    if ((lines.at(-1).length + 1 + word.length) > columns && lines.at(-1)) lines.push(word);
    else lines[lines.length - 1] += (lines.at(-1) ? ' ' : '') + word;
  }
  return lines;
}
