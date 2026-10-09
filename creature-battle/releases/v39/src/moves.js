// Storage slots stay stable for old rosters/replays; category describes the move.
export const moveSlots = ['regular', 'special', 'defense'];
export const moveCategory = (m, slot) => m.moves[slot].category ?? slot;
export const moveRule = (rules, m, slot) => rules.moves[moveCategory(m, slot)][m.moves[slot].id];
export const attackSlots = m => moveSlots.filter(slot => moveCategory(m, slot) !== 'defense');
export const usableAttacks = m => attackSlots(m).filter(slot => m.pp[slot] > 0 && !(moveCategory(m, slot) === 'special' && m.recharging));
export const facingFlip = (m, side) => m.image.facing === (side === 0 ? 'left' : 'right');
