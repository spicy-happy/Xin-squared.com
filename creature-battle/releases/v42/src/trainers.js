import { next } from './rng.js';
import { chooseTeam, choosePracticeTeam } from './ai.js';
import { cleanName } from './collection.js';
export const trainerKey = c => c.trainer.id ?? cleanName(c.trainer.nickname).toLocaleLowerCase('en-US');
export function battleTrainers(collection) {
  const trainers = new Map();
  for (const c of collection.filter(c => !c.prototype && !/^cr-debug/.test(c.id))) {
    const id = trainerKey(c);
    if (!trainers.has(id)) trainers.set(id, { ...c.trainer, id, type: c.type, creatures: [] });
    trainers.get(id).creatures.push(c);
  }
  return [...trainers.values()];
}
export function chooseOpponent(collection, opponentId, aiRng, { difficulty='easy', rules, playerTeam=[] } = {}) {
  if (opponentId === 'random') {
    const choice = difficulty==='easy' && rules
      ? choosePracticeTeam(collection, { rules, playerTeam, aiRng })
      : chooseTeam(collection, { difficulty: difficulty==='hard'?'normal':'easy', aiRng });
    return { ...choice, trainer: { bot: true, nickname: 'Battle Bot', portrait: 'assets/portraits/practice-bot.svg' } };
  }
  const opponent = battleTrainers(collection).find(t => t.id === opponentId);
  if (!opponent) throw Error('Unknown trainer');
  const team = []; let pool = [];
  for (let i = 0; i < 3; i++) {
    if (!pool.length) pool = [...opponent.creatures];
    let draw; [draw, aiRng] = next(aiRng);
    team.push(pool.splice(Math.floor(draw * pool.length), 1)[0]);
  }
  const choice = { team: structuredClone(team), aiRng };
  const { creatures, ...trainer } = opponent;
  return { ...choice, trainer };
}

export const sameTrainerName = (a, b) => cleanName(a).toLocaleLowerCase('en-US') === cleanName(b).toLocaleLowerCase('en-US');
