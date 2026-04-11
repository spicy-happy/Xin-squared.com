/**
 * Session Planner — Phase 5
 * Picks words, selects activity types (exposure vs quiz),
 * picks distractors, runs activities, updates Leitner state.
 */

import { renderExposure } from './activities/exposure.js';
import { renderCompoundDiscovery } from './activities/compound-discovery.js';
import { renderAudioRecognition } from './activities/audio-recognition.js';
import { renderMeaningMatch } from './activities/meaning-match.js';
import { renderPinyinMatch } from './activities/pinyin-match.js';
import { renderReverseMeaning } from './activities/reverse-meaning.js';
import { renderStrokeWriting, renderFreeTrace, renderFlashWrite, renderFreeWrite } from './activities/stroke-writing.js';
import { renderMatchingGame } from './activities/matching-game.js';
import { renderTimedChallenge } from './activities/timed-challenge.js';
import { speakChinese } from './enrichment.js';
import { playCelebration, playClick, playLevelUp } from './sounds.js';
import { t } from './i18n.js';

// ─── Collectible stickers (emoji-based) ───
const STICKERS = [
  { id: 'lantern', emoji: '🏮', name: 'Red Lantern' },
  { id: 'dragon', emoji: '🐉', name: 'Dragon' },
  { id: 'dumpling', emoji: '🥟', name: 'Dumpling' },
  { id: 'panda', emoji: '🐼', name: 'Panda' },
  { id: 'moon', emoji: '🌙', name: 'Moon' },
  { id: 'bamboo', emoji: '🎋', name: 'Bamboo' },
  { id: 'fish', emoji: '🐟', name: 'Lucky Fish' },
  { id: 'star', emoji: '⭐', name: 'Gold Star' },
  { id: 'fan', emoji: '🪭', name: 'Fan' },
  { id: 'tea', emoji: '🍵', name: 'Tea' },
  { id: 'tiger', emoji: '🐯', name: 'Tiger' },
  { id: 'lotus', emoji: '🪷', name: 'Lotus' },
  { id: 'firework', emoji: '🎆', name: 'Firework' },
  { id: 'ink', emoji: '🖌️', name: 'Ink Brush' },
  { id: 'jade', emoji: '🟢', name: 'Jade Stone' },
  { id: 'koi', emoji: '🐠', name: 'Koi Fish' },
  { id: 'blossom', emoji: '🌸', name: 'Cherry Blossom' },
  { id: 'phoenix', emoji: '🦅', name: 'Phoenix' },
  { id: 'cloud', emoji: '☁️', name: 'Cloud' },
  { id: 'temple', emoji: '⛩️', name: 'Temple Gate' },
];

/** Shuffle array in place (Fisher-Yates) */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Response time modulation (Phase 8) ───

/** Compute median of a numeric array. */
function computeMedian(arr) {
  if (!arr || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Classify response time relative to the kid's personal median.
 * Returns 'fast', 'normal', or 'slow'. Returns 'normal' if not enough data.
 */
function classifyResponseTime(responseTimeMs, medianMs) {
  if (!medianMs || !responseTimeMs) return 'normal';
  if (responseTimeMs < medianMs * 0.5) return 'fast';
  if (responseTimeMs > medianMs * 2) return 'slow';
  return 'normal';
}

/** Record a response time for an activity type on a profile. Rolling window of 30. */
function recordResponseTime(storage, profileId, activityType, timeMs) {
  const profiles = storage.getProfiles();
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return;

  if (!profile.responseTimes) profile.responseTimes = {};
  if (!profile.responseTimes[activityType]) {
    profile.responseTimes[activityType] = { times: [], median: null };
  }

  const rt = profile.responseTimes[activityType];
  rt.times.push(timeMs);
  if (rt.times.length > 30) rt.times = rt.times.slice(-30);
  if (rt.times.length >= 5) rt.median = computeMedian(rt.times);
  storage.saveProfiles(profiles);
}

/** Get the median response time for an activity type. */
function getMedianResponseTime(storage, profileId, activityType) {
  const profile = storage.getProfile(profileId);
  return profile?.responseTimes?.[activityType]?.median || null;
}

// ─── Phase 10: Difficulty auto-bump ───

/** Target success rates per level (from spec Section 9) */
const LEVEL_TARGET_SUCCESS = { 1: 0.90, 2: 0.85, 3: 0.80, 4: 0.75 };
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

/** Record an interaction signal for auto-bump tracking. Rolling 2-week window. */
function recordInteractionSignal(storage, profileId, { correct, hintUsed }) {
  const profiles = storage.getProfiles();
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return;

  if (!profile.bumpSignals) profile.bumpSignals = { interactions: [] };
  const signals = profile.bumpSignals;
  const now = Date.now();

  signals.interactions.push({ t: now, correct: !!correct, hint: !!hintUsed });

  // Prune entries older than 2 weeks
  const cutoff = now - TWO_WEEKS_MS;
  signals.interactions = signals.interactions.filter(s => s.t > cutoff);

  storage.saveProfiles(profiles);
}

/**
 * Check if the profile's level should be bumped up or down.
 * Silent — no confirmation. Logs to levelHistory for audit.
 */
function checkAutoBump(storage, profileId) {
  const profiles = storage.getProfiles();
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) return;

  // Parent override lock prevents auto-bump
  if (profile.levelLocked) return;

  const level = profile.level || 2;
  const signals = profile.bumpSignals;
  if (!signals || !signals.interactions || signals.interactions.length < 10) return;

  const now = Date.now();
  const cutoff = now - TWO_WEEKS_MS;
  const recent = signals.interactions.filter(s => s.t > cutoff);
  if (recent.length < 10) return;

  // Calculate signals
  const successRate = recent.filter(s => s.correct).length / recent.length;
  const hintRate = recent.filter(s => s.hint).length / recent.length;

  const stats = profile.sessionStats || { completed: 0, quit: 0 };
  const totalSessions = stats.completed + stats.quit;
  const completionRate = totalSessions > 0 ? stats.completed / totalSessions : 1;

  const target = LEVEL_TARGET_SUCCESS[level] || 0.85;

  let newLevel = level;

  // Bump up: success > target+10%, completion >= 90%, hints < 15%
  if (level < 4 && successRate > target + 0.10 && completionRate >= 0.90 && hintRate < 0.15) {
    newLevel = level + 1;
  }
  // Bump down: success < target-10% OR completion < 60% OR hints > 40%
  else if (level > 1 && (successRate < target - 0.10 || completionRate < 0.60 || hintRate > 0.40)) {
    newLevel = level - 1;
  }

  if (newLevel !== level) {
    profile.level = newLevel;
    if (!profile.levelHistory) profile.levelHistory = [];
    profile.levelHistory.push({
      from: level, to: newLevel, at: now,
      successRate: Math.round(successRate * 100),
      completionRate: Math.round(completionRate * 100),
      hintRate: Math.round(hintRate * 100),
    });
    console.log(`[xxg] Auto-bump: level ${level} → ${newLevel} (success: ${Math.round(successRate*100)}%, completion: ${Math.round(completionRate*100)}%, hints: ${Math.round(hintRate*100)}%)`);
    storage.saveProfiles(profiles);
  }
}

// ─── Phase 12: Confusion pair data ───
// Map each character to its confusion group(s). Built from spec Appendix A.
const CONFUSION_GROUPS = [
  ["大","太","犬"], ["人","入","八"], ["木","本","末","未"], ["日","曰"],
  ["土","士"], ["干","千"], ["天","夫"], ["王","玉"], ["白","百"],
  ["己","已","巳"], ["午","牛"], ["刀","力"], ["手","毛"],
  ["口","日","目","田"], ["小","少"], ["看","着"], ["在","再"],
  ["请","情","清","晴"], ["他","她","它"], ["吗","妈","马"], ["哥","歌"],
  ["爸","爷"], ["我","找"], ["买","卖"], ["东","车"], ["去","云"],
  ["几","九"], ["了","子"], ["不","下"], ["左","右"], ["出","山"],
  ["上","下"], ["中","申"],
];
const CONFUSION_MAP = {}; // char → group index
CONFUSION_GROUPS.forEach((group, idx) => {
  for (const ch of group) {
    if (!CONFUSION_MAP[ch]) CONFUSION_MAP[ch] = [];
    CONFUSION_MAP[ch].push(idx);
  }
});

/** Multiple-choice quiz types (need distractors) */
const MC_QUIZ_TYPES = [
  { name: 'audioRecognition', render: renderAudioRecognition },
  { name: 'meaningMatch', render: renderMeaningMatch },
  { name: 'pinyinMatch', render: renderPinyinMatch },
  { name: 'reverseMeaning', render: renderReverseMeaning },
];

/** Writing activity types by stage (no distractors needed) */
const WRITING_TYPES = {
  strokeWriting: { name: 'strokeWriting', render: renderStrokeWriting },
  freeTrace:     { name: 'freeTrace',     render: renderFreeTrace },
  flashWrite:    { name: 'flashWrite',    render: renderFlashWrite },
  freeWrite:     { name: 'freeWrite',     render: renderFreeWrite },
};

const WRITING_NAMES = new Set(Object.keys(WRITING_TYPES));

/** All quiz types (MC + guided stroke writing for backward compat) */
const QUIZ_TYPES = [
  ...MC_QUIZ_TYPES,
  WRITING_TYPES.strokeWriting,
];

/**
 * Pick distractors for a target word from the word bank.
 * Prefers words of the same length (compound ↔ compound, single ↔ single).
 * Returns array of distractor word objects (without the target).
 */
function pickDistractors(targetWord, wordBank, count = 3) {
  const targetMeaning = (targetWord.meaning || targetWord.meanings?.[0] || '').toLowerCase();
  const targetWords = targetMeaning.split(/\s*[\/,]\s*/).filter(Boolean);

  const others = wordBank.filter(w => {
    if (w.character === targetWord.character) return false;
    const m = w.meaning || w.meanings?.[0];
    if (!m) return false;
    // Exclude words with overlapping meaning to avoid confusing options
    const wMeaning = m.toLowerCase();
    const wWords = wMeaning.split(/\s*[\/,]\s*/).filter(Boolean);
    // Check if any meaning word overlaps (e.g. both have "eye")
    for (const tw of targetWords) {
      for (const ww of wWords) {
        if (tw === ww) return false;
        // Also check if one contains the other (e.g. "eye" vs "eyebrow")
        if (tw.length > 2 && ww.startsWith(tw)) return false;
        if (ww.length > 2 && tw.startsWith(ww)) return false;
      }
    }
    return true;
  });

  const targetLen = targetWord.character.length;
  // Prefer same-length words as distractors
  const sameLen = others.filter(w => w.character.length === targetLen);
  const diffLen = others.filter(w => w.character.length !== targetLen);
  shuffle(sameLen);
  shuffle(diffLen);
  // Fill with same-length first, then different-length if needed
  return [...sameLen, ...diffLen].slice(0, count);
}

/**
 * Pick a quiz activity for a seen word based on its Leitner box.
 * Writing activities get harder as box advances per 5-stage mastery:
 *   Box 1:   guided stroke tracing (Stage 3)
 *   Box 2:   free trace — outline only (Stage 3-4)
 *   Box 3:   flash and write — from memory (Stage 4)
 *   Box 4-5: free write / dictation (Stage 4-5)
 * Writing activities are mixed with MC quizzes at increasing rates.
 */
function pickQuizForWord(word) {
  const box = word.box || 1;
  const canWrite = word.hasStrokeData !== false;

  // Writing probability increases with box level
  const writeChance = box <= 1 ? 0.2 : box <= 2 ? 0.3 : 0.45;

  if (canWrite && Math.random() < writeChance) {
    if (box <= 1) return WRITING_TYPES.strokeWriting;
    if (box <= 2) return WRITING_TYPES.freeTrace;
    if (box <= 3) return WRITING_TYPES.flashWrite;
    return WRITING_TYPES.freeWrite;
  }

  return MC_QUIZ_TYPES[Math.floor(Math.random() * MC_QUIZ_TYPES.length)];
}

/**
 * Run a practice session for the active profile.
 */
export function renderSession(app, storage, navigate) {
  const profileId = storage.getActiveProfileId();
  const profile = storage.getProfile(profileId);
  if (!profile || !profile.wordBank.length) {
    navigate('words');
    return;
  }

  let sessionPlan = []; // Array of { word, activityType, render }
  let currentIndex = 0;
  let sessionFastStreak = 0; // Phase 8: tracks consecutive fast answers
  let pendingMilestone = null; // { packName, pct } — queued pack milestone to show

  // Session persistence key
  const SESSION_KEY = 'session_' + profileId;

  // Session plan version — bump when plan logic changes to invalidate old saved sessions
  const SESSION_VERSION = 13;

  /** Save current session state so it survives page refresh */
  function saveSessionState() {
    storage.set(SESSION_KEY, {
      version: SESSION_VERSION,
      currentIndex,
      plan: sessionPlan.map(p => ({
        character: p.word?.character,
        characters: p.words?.map(w => w.character),
        activityType: p.activityType,
        mode: p.mode,
      })),
    });
  }

  /** Clear saved session state */
  function clearSessionState() {
    storage.remove(SESSION_KEY);
  }

  /** Map an activity type name back to its render function */
  function getRenderer(activityType) {
    if (activityType === 'exposure') return null;
    if (activityType === 'matchingMeaning' || activityType === 'matchingPinyin') return null;
    if (activityType === 'timedChallenge') return null;
    const mc = MC_QUIZ_TYPES.find(q => q.name === activityType);
    if (mc) return mc.render;
    const wt = WRITING_TYPES[activityType];
    if (wt) return wt.render;
    // Fallback: try QUIZ_TYPES
    const qt = QUIZ_TYPES.find(q => q.name === activityType);
    return qt?.render || null;
  }

  /** Try to restore a saved session. Returns true if restored. */
  function restoreSession() {
    const saved = storage.get(SESSION_KEY);
    if (!saved || !saved.plan || !saved.plan.length) return false;
    // Discard sessions from older plan versions
    if ((saved.version || 0) < SESSION_VERSION) return false;

    const freshProfile = storage.getProfile(profileId);
    const wordMap = {};
    for (const w of freshProfile.wordBank) wordMap[w.character] = w;

    // Rebuild plan from saved state
    const plan = [];
    for (const entry of saved.plan) {
      // Multi-word activities (matching game, timed challenge)
      if (entry.characters) {
        const words = entry.characters.map(ch => wordMap[ch]).filter(Boolean);
        if (words.length === 0) continue;
        plan.push({
          words,
          activityType: entry.activityType,
          mode: entry.mode,
          render: getRenderer(entry.activityType),
        });
      } else {
        const word = wordMap[entry.character];
        if (!word) continue; // word was deleted since session was saved
        plan.push({
          word,
          activityType: entry.activityType,
          render: getRenderer(entry.activityType),
        });
      }
    }

    if (plan.length === 0) return false;

    sessionPlan = plan;
    currentIndex = Math.min(saved.currentIndex || 0, plan.length - 1);
    return true;
  }

  // ─── Age-based session sizing ───
  // Based on working memory research (Gathercole 2004) and PRC curriculum pacing.
  // New words per session scale with age; review words fill the rest.
  // Total session: ~80% review, ~20% new (the "80/20 rule" for vocabulary).
  const SESSION_CONFIG_BASE = {
    1: { newWords: 2, reviewWords: 3  },  // age 4-5: 2 new + 3 review ≈ 12 activities
    2: { newWords: 3, reviewWords: 5  },  // age 6:   3 new + 5 review ≈ 16 activities
    3: { newWords: 4, reviewWords: 6  },  // age 7-8: 4 new + 6 review ≈ 20 activities
    4: { newWords: 5, reviewWords: 8  },  // age 9+:  5 new + 8 review ≈ 24 activities
  };

  // ─── Adaptive session sizing ───
  // Track whether kids complete or quit sessions. Adjust size accordingly.
  // Kids who keep pressing "another session" get longer sessions over time.
  // Kids who frequently quit get shorter sessions so they can finish in one sitting.
  function getSessionConfig(level) {
    const base = SESSION_CONFIG_BASE[level] || SESSION_CONFIG_BASE[2];
    const stats = profile.sessionStats || { completed: 0, quit: 0, streak: 0 };

    // Compute multiplier: grows with completion streak, shrinks with quits
    // streak: consecutive completed sessions (resets on quit)
    // Each streak adds +0.05 (cap 1.2x), each quit subtracts 0.15 (floor 0.7x)
    let multiplier = 1.0;
    multiplier += Math.min(stats.streak, 4) * 0.05;   // max +0.2 from streak
    multiplier -= Math.min(stats.quit, 2) * 0.15;     // max -0.3 from quits
    multiplier = Math.max(0.7, Math.min(1.2, multiplier));

    return {
      newWords: Math.max(2, Math.round(base.newWords * multiplier)),
      reviewWords: Math.max(3, Math.round(base.reviewWords * multiplier)),
    };
  }

  /** Record a session completion (finished all activities). */
  function recordSessionComplete() {
    const profiles = storage.getProfiles();
    const p = profiles.find(pr => pr.id === profileId);
    if (!p) return;
    if (!p.sessionStats) p.sessionStats = { completed: 0, quit: 0, streak: 0 };
    p.sessionStats.completed++;
    p.sessionStats.streak++;
    // Decay quit counter over time — each completion erases one quit
    if (p.sessionStats.quit > 0) p.sessionStats.quit--;
    storage.saveProfiles(profiles);
  }

  /** Record a session quit (left before completing). */
  function recordSessionQuit() {
    const profiles = storage.getProfiles();
    const p = profiles.find(pr => pr.id === profileId);
    if (!p) return;
    if (!p.sessionStats) p.sessionStats = { completed: 0, quit: 0, streak: 0 };
    p.sessionStats.quit++;
    p.sessionStats.streak = 0;
    storage.saveProfiles(profiles);
  }

  const SESSION_CONFIG = getSessionConfig(profile.level);

  // ─── Spaced repetition intervals (conservative, kid-friendly) ───
  // Box level → minimum days before review is due.
  // Words in lower boxes come back sooner; mastered words fade out.
  const REVIEW_INTERVALS_DAYS = {
    1: 0,    // box 1: review every session
    2: 1,    // box 2: next day
    3: 3,    // box 3: after 3 days
    4: 7,    // box 4: after a week
    5: 14,   // box 5: after 2 weeks
  };
  const DAY_MS = 24 * 60 * 60 * 1000;

  /** Pick fresh session words and build a session plan */
  function buildSessionPlan() {
    const now = Date.now();
    const freshProfile = storage.getProfile(profileId);
    const allWords = freshProfile.wordBank;
    const config = SESSION_CONFIG;

    // Exclude words from inactive (paused) packs
    const importedPacksList = storage.getImportedPacks(profileId);
    const inactivePackIds = new Set(importedPacksList.filter(p => p.inactive).map(p => p.id));
    const words = allWords.filter(w => {
      if (!w.packIds || w.packIds.length === 0) return true; // custom words always included
      return !w.packIds.every(id => inactivePackIds.has(id)); // include if at least one active pack
    });

    // Starred words always get priority
    const starred = words.filter(w => w.starFlag && w.starFlag.expiresAt > now);

    // New words: never seen before
    // For sequenced packs, sort by sequence number so words are introduced in order
    const newWords = words.filter(w => !w.lastSeen && (!w.starFlag || w.starFlag.expiresAt <= now));
    const sequencedPackIds = new Set(importedPacksList.filter(p => p.sequenced).map(p => p.id));
    const hasSequenced = newWords.some(w => w.sequence != null && w.packIds?.some(id => sequencedPackIds.has(id)));
    if (hasSequenced) {
      // Sort by sequence for sequenced packs, push non-sequenced to end
      newWords.sort((a, b) => {
        const aSeq = (a.sequence != null && a.packIds?.some(id => sequencedPackIds.has(id))) ? a.sequence : 9999;
        const bSeq = (b.sequence != null && b.packIds?.some(id => sequencedPackIds.has(id))) ? b.sequence : 9999;
        return aSeq - bSeq;
      });
    } else {
      shuffle(newWords);
    }

    // Review words: seen before AND due for review based on box interval.
    // Lower boxes and older reviews get priority.
    const reviewDue = words
      .filter(w => {
        if (!w.lastSeen) return false;
        if (w.starFlag && w.starFlag.expiresAt > now) return false;
        const box = w.box || 1;
        const intervalMs = (REVIEW_INTERVALS_DAYS[box] || 0) * DAY_MS;
        return (now - w.lastSeen) >= intervalMs;
      })
      .sort((a, b) => {
        // Lower box first (struggling words), then oldest-seen first
        if ((a.box || 1) !== (b.box || 1)) return (a.box || 1) - (b.box || 1);
        return (a.lastSeen || 0) - (b.lastSeen || 0);
      });

    // Pick new words (capped by config)
    const maxNew = Math.min(config.newWords, newWords.length);
    const pickedNew = newWords.slice(0, maxNew);

    // Pick review words (fill remaining slots, starred first)
    const maxReview = config.reviewWords;
    const pickedReview = [
      ...starred.slice(0, Math.min(starred.length, maxReview)),
      ...reviewDue,
    ].slice(0, maxReview);

    // Combine: new words + review words
    const picked = [...pickedNew, ...pickedReview];

    // Fallback: if nothing picked, just grab whatever we have
    if (picked.length === 0) {
      picked.push(...words.slice(0, Math.min(config.newWords + config.reviewWords, words.length)));
    }

    // ─── Session structure ───
    // Loose phases with some randomness. Ends with dictation writing.
    //
    // 1. Introduce new words (exposure) + warm-up quiz for review words
    // 2. Mixed practice — quizzes and guided writing, shuffled
    // 3. Final round — dictation writing (freewrite) for all words
    //
    // Not every word gets every activity — some randomness keeps it fresh.

    const plan = [];

    // ─── Build activities per word ───
    // Each word gets 2-3 activities across the session.
    // New words: exposure → quiz → writing
    // Review words: quiz → quiz (different type) or writing
    // Activities are then interleaved so no type repeats too much.

    const exposures = [];   // New word introductions
    const quizzes = [];     // Multiple-choice quizzes
    const writings = [];    // Stroke/writing activities

    for (const word of picked) {
      const isNew = !word.lastSeen;
      const box = word.box || 1;
      const canWrite = word.hasStrokeData !== false;

      if (isNew) {
        // New word: exposure + 2 quizzes (different types) + writing
        exposures.push({ word, activityType: 'exposure', render: null });
        const quiz1 = MC_QUIZ_TYPES[Math.floor(Math.random() * MC_QUIZ_TYPES.length)];
        quizzes.push({ word, activityType: quiz1.name, render: quiz1.render });
        let quiz2 = MC_QUIZ_TYPES[Math.floor(Math.random() * MC_QUIZ_TYPES.length)];
        let tries = 0;
        while (quiz2.name === quiz1.name && tries < 8) {
          quiz2 = MC_QUIZ_TYPES[Math.floor(Math.random() * MC_QUIZ_TYPES.length)];
          tries++;
        }
        quizzes.push({ word, activityType: quiz2.name, render: quiz2.render });
        if (canWrite) {
          const wType = WRITING_TYPES.strokeWriting;
          writings.push({ word, activityType: wType.name, render: wType.render });
        }
      } else {
        // Review word: 1 quiz + maybe writing
        const quiz1 = MC_QUIZ_TYPES[Math.floor(Math.random() * MC_QUIZ_TYPES.length)];
        quizzes.push({ word, activityType: quiz1.name, render: quiz1.render });

        // Writing chance increases with box level — kids who know a word should practice writing it
        const writeChance = box <= 1 ? 0.35 : box <= 2 ? 0.5 : 0.6;
        if (canWrite && Math.random() < writeChance) {
          let wType;
          // Radicals are simple characters — cap writing difficulty at freeTrace
          const isSimpleRadical = word.isRadical && word.character.length === 1;
          if (box <= 1) wType = WRITING_TYPES.strokeWriting;
          else if (box <= 2 || isSimpleRadical) wType = WRITING_TYPES.freeTrace;
          else if (box <= 3) wType = WRITING_TYPES.flashWrite;
          else wType = WRITING_TYPES.freeWrite;
          writings.push({ word, activityType: wType.name, render: wType.render });
        }
      }
    }

    // ─── Interleave for variety ───
    // Exposures must come before quizzes/writing for the same word.
    // Strategy: place exposures first (max 2 in a row), then evenly
    // distribute quizzes and writings so no category repeats 3+ times.
    shuffle(quizzes);
    shuffle(writings);

    // Phase A: exposures, broken up by quizzes every 2
    let exposureCount = 0;
    for (const exp of exposures) {
      plan.push(exp);
      exposureCount++;
      if (exposureCount >= 2 && quizzes.length > 0) {
        plan.push(quizzes.shift());
        exposureCount = 0;
      }
    }

    // Phase B: merge remaining quizzes and writings evenly
    // Calculate ratio to spread writings throughout the remaining quizzes
    const remaining = [...quizzes, ...writings];
    // Tag each item with its category for interleaving
    const tagged = remaining.map(item => ({
      ...item,
      _cat: WRITING_NAMES.has(item.activityType) ? 'w' : 'q',
    }));

    // Spread items so no category appears 3+ times in a row
    const merged = [];
    const pools = { q: tagged.filter(t => t._cat === 'q'), w: tagged.filter(t => t._cat === 'w') };
    let lastCat = null;
    let catStreak = 0;

    while (pools.q.length > 0 || pools.w.length > 0) {
      // Determine which pool to pull from
      let pick = null;
      const qRatio = pools.q.length / (pools.q.length + pools.w.length || 1);

      if (pools.q.length === 0) pick = 'w';
      else if (pools.w.length === 0) pick = 'q';
      else if (lastCat && catStreak >= 2) pick = lastCat === 'q' ? 'w' : 'q'; // force switch
      else pick = Math.random() < qRatio ? 'q' : 'w';

      const item = pools[pick].shift();
      merged.push(item);
      if (pick === lastCat) catStreak++;
      else { lastCat = pick; catStreak = 1; }
    }

    // Remove the temporary _cat tag
    for (const item of merged) delete item._cat;
    plan.push(...merged);

    // ─── Phase 12: Confusion pair interleaving ───
    // When 2+ characters from the same confusion group appear in quizzes/writings,
    // force them adjacent and alternating: 大 quiz → 太 quiz → 大 write → 太 write.
    // Only applies to non-exposure items for words that aren't brand new.
    const newCharSet = new Set(pickedNew.map(w => w.character));
    const quizWriteStart = exposures.length; // index where quizzes/writings begin
    const quizWriteItems = plan.slice(quizWriteStart);

    // Find confusion pairs present in this session (excluding new words)
    const sessionChars = [...new Set(quizWriteItems.map(p => p.word.character).filter(ch => !newCharSet.has(ch)))];
    const pairGroups = new Map(); // groupIdx → [chars in session]
    for (const ch of sessionChars) {
      const groups = CONFUSION_MAP[ch];
      if (!groups) continue;
      for (const gIdx of groups) {
        if (!pairGroups.has(gIdx)) pairGroups.set(gIdx, []);
        if (!pairGroups.get(gIdx).includes(ch)) pairGroups.get(gIdx).push(ch);
      }
    }

    // For groups with 2+ session chars, pull those items out and interleave them
    const interleavedChars = new Set();
    const interleaved = [];
    for (const [, chars] of pairGroups) {
      if (chars.length < 2) continue;
      // Pull items for these chars from quizWriteItems
      const pairItems = [];
      for (let i = quizWriteItems.length - 1; i >= 0; i--) {
        if (chars.includes(quizWriteItems[i].word.character)) {
          pairItems.unshift(quizWriteItems.splice(i, 1)[0]);
          interleavedChars.add(quizWriteItems[i]?.word?.character);
        }
      }
      // Sort: alternate characters, same activity type groups together
      // e.g., 大-quiz, 太-quiz, 大-write, 太-write
      const byChar = {};
      for (const item of pairItems) {
        const ch = item.word.character;
        if (!byChar[ch]) byChar[ch] = [];
        byChar[ch].push(item);
      }
      const charKeys = Object.keys(byChar);
      const maxLen = Math.max(...charKeys.map(k => byChar[k].length));
      for (let round = 0; round < maxLen; round++) {
        for (const ch of charKeys) {
          if (byChar[ch][round]) interleaved.push(byChar[ch][round]);
        }
      }
    }

    // Rebuild plan: exposures + interleaved pairs + remaining quiz/write items
    const finalPlan = plan.slice(0, quizWriteStart);
    finalPlan.push(...interleaved, ...quizWriteItems);

    // Fix consecutive same-word collisions (skip interleaved section)
    for (let i = 1; i < finalPlan.length; i++) {
      if (finalPlan[i].word.character === finalPlan[i-1].word.character) {
        for (let j = i + 1; j < Math.min(i + 6, finalPlan.length); j++) {
          if (finalPlan[j].word.character !== finalPlan[i-1].word.character) {
            [finalPlan[i], finalPlan[j]] = [finalPlan[j], finalPlan[i]];
            break;
          }
        }
      }
    }

    plan.length = 0;
    plan.push(...finalPlan);

    // ─── Phase 9: Same-day second exposure ───
    // New words get a fast MC quiz at the end of the session for overnight retention.
    // Uses a different quiz type than the one already in the plan for variety.
    for (const word of pickedNew) {
      const quiz = MC_QUIZ_TYPES[Math.floor(Math.random() * MC_QUIZ_TYPES.length)];
      plan.push({ word, activityType: quiz.name, render: quiz.render, isSecondExposure: true });
    }

    // ─── Multi-word activities: Matching games ───
    // Insert a matching game every ~8 activities using 4 review/known words.
    // Alternate between meaning-match and pinyin-match modes.
    const matchCandidates = picked.filter(w => (w.box || 1) >= 1 && w.meaning);
    if (matchCandidates.length >= 4) {
      const matchGroups = [];
      const shuffledCandidates = shuffle([...matchCandidates]);
      for (let i = 0; i + 3 < shuffledCandidates.length; i += 4) {
        matchGroups.push(shuffledCandidates.slice(i, i + 4));
      }
      // Insert matching games at intervals through the plan
      const insertInterval = Math.max(6, Math.floor(plan.length / (matchGroups.length + 1)));
      let insertIdx = insertInterval;
      for (let g = 0; g < matchGroups.length && insertIdx <= plan.length; g++) {
        const mode = g % 2 === 0 ? 'meaning' : 'pinyin';
        plan.splice(insertIdx, 0, {
          words: matchGroups[g],
          activityType: mode === 'meaning' ? 'matchingMeaning' : 'matchingPinyin',
          mode,
        });
        insertIdx += insertInterval + 1;
      }
    }

    // ─── Timed writing challenge ───
    // Add as a final bonus activity if there are enough writable characters (5+).
    const writableWords = picked.filter(w => w.hasStrokeData !== false && w.character.length === 1);
    if (writableWords.length >= 5) {
      plan.push({
        words: writableWords,
        activityType: 'timedChallenge',
      });
    }

    sessionPlan = plan;
    saveSessionState();
  }

  // Try to restore a saved session; if none, build a fresh one
  let isRestored = false;
  if (!restoreSession()) {
    buildSessionPlan();
  } else {
    isRestored = true;
  }

  /** Abort current activity audio */
  function abortCurrentActivity() {
    const container = app.querySelector('#activity-container');
    if (container?._abortExposure) container._abortExposure();
    window.speechSynthesis?.cancel();
  }

  /**
   * Phase 8: Upgrade remaining activities to harder types after a fast streak.
   * MC quizzes → writing, easy writing → harder writing.
   */
  function upgradeRemainingActivities() {
    const upgradeMap = {
      strokeWriting: WRITING_TYPES.freeTrace,
      freeTrace: WRITING_TYPES.flashWrite,
      flashWrite: WRITING_TYPES.freeWrite,
    };
    let upgraded = 0;
    for (let i = currentIndex + 1; i < sessionPlan.length && upgraded < 3; i++) {
      const entry = sessionPlan[i];
      if (!entry.word) continue; // skip multi-word activities
      if (entry.word.hasStrokeData === false) continue;

      // Upgrade MC quizzes to writing
      if (MC_QUIZ_TYPES.some(q => q.name === entry.activityType)) {
        const box = entry.word.box || 1;
        let wType;
        if (box <= 1) wType = WRITING_TYPES.freeTrace;
        else if (box <= 2) wType = WRITING_TYPES.flashWrite;
        else wType = WRITING_TYPES.freeWrite;
        entry.activityType = wType.name;
        entry.render = wType.render;
        upgraded++;
      }
      // Upgrade easier writing to harder writing
      else if (upgradeMap[entry.activityType]) {
        const up = upgradeMap[entry.activityType];
        entry.activityType = up.name;
        entry.render = up.render;
        upgraded++;
      }
    }
    if (upgraded > 0) {
      console.log(`[xxg] Fast streak! Upgraded ${upgraded} remaining activities`);
      saveSessionState();
    }
  }

  /** Give credit for current word (used by arrow key skip) */
  function giveCredit() {
    if (currentIndex >= sessionPlan.length) return;
    const entry = sessionPlan[currentIndex];
    // Multi-word activities: credit all words
    const words = entry.words || (entry.word ? [entry.word] : []);
    for (const word of words) {
      const newBox = Math.min((word.box || 1) + 1, 5);
      storage.updateWordInProfile(profileId, word.character, {
        box: newBox,
        lastSeen: Date.now(),
      });
      word.box = newBox;
    }
  }

  // Keyboard arrows for testing
  function onKeyDown(e) {
    if (e.key === 'ArrowLeft' && currentIndex > 0) {
      abortCurrentActivity();
      currentIndex--;
      render();
    } else if (e.key === 'ArrowRight' && currentIndex <= sessionPlan.length - 1) {
      abortCurrentActivity();
      giveCredit();
      currentIndex++;
      render();
    }
  }
  window.addEventListener('keydown', onKeyDown);
  function cleanupKeyboard() { window.removeEventListener('keydown', onKeyDown); }

  let prevIndex = currentIndex; // Start at current so first render doesn't animate

  /**
   * Check if a word's advancement triggers a pack milestone (50% or 100%).
   * Sets pendingMilestone if a new milestone is crossed.
   */
  function checkPackMilestone(word, oldBox, newBox) {
    // Only care when a word newly reaches mastered (box 4+)
    if (newBox < 4 || oldBox >= 4) return;
    if (!word.packIds || word.packIds.length === 0) return;

    const freshProfile = storage.getProfile(profileId);
    const importedPacks = storage.getImportedPacks(profileId);

    for (const packId of word.packIds) {
      const packMeta = importedPacks.find(p => p.id === packId);
      if (!packMeta) continue;

      // Count words in this pack
      const packWords = freshProfile.wordBank.filter(w => w.packIds?.includes(packId));
      const total = packWords.length;
      if (total === 0) continue;

      const mastered = packWords.filter(w => (w.box || 1) >= 4).length;
      const pct = mastered / total;

      // Check milestones: track which milestones have been shown
      if (!packMeta.milestones) packMeta.milestones = {};

      if (pct >= 1 && !packMeta.milestones['100']) {
        packMeta.milestones['100'] = Date.now();
        storage.saveImportedPacks(profileId, importedPacks);
        pendingMilestone = { packName: packMeta.name, pct: 100, total };
        return;
      }
      if (pct >= 0.5 && !packMeta.milestones['50']) {
        packMeta.milestones['50'] = Date.now();
        storage.saveImportedPacks(profileId, importedPacks);
        pendingMilestone = { packName: packMeta.name, pct: 50, total };
        return;
      }
    }
  }

  /** Show a pack milestone celebration overlay, then continue to next activity. */
  function renderPackMilestone(milestone) {
    pendingMilestone = null;
    playCelebration();

    const is100 = milestone.pct === 100;
    const emoji = is100 ? '🏆' : '🎉';
    const title = is100 ? t('milestone.complete') : t('milestone.halfway');
    const desc = is100
      ? t('milestone.completeDesc', milestone.packName)
      : t('milestone.halfwayDesc', milestone.packName);

    app.innerHTML = `
      <div class="screen milestone-celebration">
        <div class="milestone-celebration__confetti" id="milestone-confetti"></div>
        <div class="milestone-celebration__content">
          <div class="milestone-celebration__emoji ${is100 ? 'milestone-celebration__emoji--big' : ''}">${emoji}</div>
          <h1 class="milestone-celebration__title">${title}</h1>
          <p class="milestone-celebration__pack">${milestone.packName}</p>
          <p class="milestone-celebration__desc">${desc}</p>
          <div class="milestone-celebration__bar">
            <div class="milestone-celebration__bar-fill" style="width: ${milestone.pct}%"></div>
          </div>
          <p class="milestone-celebration__pct">${milestone.pct}%</p>
          <button class="btn btn--primary" id="btn-milestone-continue">${t('milestone.continue')}</button>
        </div>
      </div>
    `;

    // Confetti burst
    const confettiContainer = app.querySelector('#milestone-confetti');
    const count = is100 ? 60 : 30;
    const colors = is100
      ? ['#FFD700','#FF6B6B','#4A90D9','#4CAF50','#FF9800','#9C27B0','#E91E63','#00BCD4']
      : ['#FFD700','#4A90D9','#4CAF50','#FF9800'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDelay = Math.random() * 2 + 's';
      p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confettiContainer.appendChild(p);
    }

    app.querySelector('#btn-milestone-continue').addEventListener('click', () => {
      playClick();
      render();
    });
  }

  // Guard against activity result callbacks firing twice (see Bug 2).
  // Reset each time render() sets up a new activity; checked by all callbacks.
  let resultHandled = false;

  function render() {
    // Reset the double-fire guard for the new activity
    resultHandled = false;

    // Show pack milestone celebration if one is queued
    if (pendingMilestone) {
      renderPackMilestone(pendingMilestone);
      return;
    }

    if (currentIndex >= sessionPlan.length) {
      clearSessionState();
      renderCelebration();
      return;
    }

    // Persist progress so page refresh resumes here
    saveSessionState();

    const entry = sessionPlan[currentIndex];
    const { activityType, render: renderActivity } = entry;
    const word = entry.word || null;  // null for multi-word activities
    const total = sessionPlan.length;
    const freshProfile = storage.getProfile(profileId);
    const prevPct = (prevIndex / total) * 100;
    const newPct = (currentIndex / total) * 100;

    app.innerHTML = `
      <div class="screen session">
        <div class="session__header">
          <button class="session__close" id="btn-session-close">×</button>
          <div class="session__progress">
            <div class="session__progress-bar">
              <div class="session__progress-fill" id="progress-fill" style="width: ${prevPct}%"></div>
            </div>
            <span class="session__progress-text">${currentIndex + 1} / ${total}</span>
          </div>
        </div>
        <div id="activity-container" class="session__activity"></div>
      </div>
    `;

    // Animate progress bar and play level-up sound.
    // Double-rAF ensures browser paints the "before" width first,
    // then the CSS transition animates to the "after" width.
    if (currentIndex > prevIndex) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const fill = app.querySelector('#progress-fill');
          if (fill) {
            fill.style.width = newPct + '%';
            fill.classList.add('session__progress-fill--pop');
          }
        });
      });
      playLevelUp();
    } else {
      requestAnimationFrame(() => {
        const fill = app.querySelector('#progress-fill');
        if (fill) fill.style.width = newPct + '%';
      });
    }
    prevIndex = currentIndex;

    app.querySelector('#btn-session-close').addEventListener('click', () => {
      abortCurrentActivity();
      cleanupKeyboard();
      recordSessionQuit();
      navigate('profiles');
    });

    const container = app.querySelector('#activity-container');

    /** Log activity result to console */
    function logActivity(w, type, result, updates, speed) {
      console.log(
        `[xxg] ${w.character} | ${type} | ` +
        `correct: ${result?.correct ?? 'n/a'} | ` +
        `time: ${result?.responseTimeMs ?? '-'}ms | ` +
        `speed: ${speed || '-'} | ` +
        `attempts: ${result?.attempts ?? '-'} | ` +
        `box: ${w.box || 1} → ${updates.box} | ` +
        `streak: ${updates.consecutiveCorrect ?? '-'} | ` +
        `pinyin: ${w.pinyinMarked || w.pinyin || '-'} | ` +
        `meaning: ${w.meaning || w.meanings?.[0] || '-'}`
      );
    }

    // ─── Multi-word activities ───
    if (activityType === 'matchingMeaning' || activityType === 'matchingPinyin') {
      const words = entry.words;
      const mode = entry.mode || (activityType === 'matchingPinyin' ? 'pinyin' : 'meaning');
      renderMatchingGame(container, words, mode, (result) => {
        if (resultHandled) return;
        resultHandled = true;
        // Update all words involved — give credit if no mistakes
        for (const w of words) {
          const correct = result.totalMistakes === 0;
          const oldBox = w.box || 1;
          const cc = correct ? (w.consecutiveCorrect || 0) + 1 : 0;
          const shouldAdvance = cc >= 2;
          const updates = {
            consecutiveCorrect: shouldAdvance ? 0 : cc,
            box: correct
              ? (shouldAdvance ? Math.min((w.box || 1) + 1, 5) : (w.box || 1))
              : Math.max(1, (w.box || 1) - 1),
            lastSeen: Date.now(),
            totalAttempts: (w.totalAttempts || 0) + 1,
          };
          storage.updateWordInProfile(profileId, w.character, updates);
          w.box = updates.box;
          w.consecutiveCorrect = updates.consecutiveCorrect;
          w.totalAttempts = updates.totalAttempts;
          checkPackMilestone(w, oldBox, updates.box);
        }
        console.log(
          `[xxg] Matching (${mode}) | mistakes: ${result.totalMistakes} | ` +
          `time: ${result.responseTimeMs}ms | words: ${words.map(w => w.character).join(',')}`
        );
        currentIndex++;
        render();
      });
      return;
    }

    if (activityType === 'timedChallenge') {
      const words = entry.words;
      renderTimedChallenge(container, words, (result) => {
        if (resultHandled) return;
        resultHandled = true;
        // Give credit to all completed words
        console.log(
          `[xxg] Timed Challenge | completed: ${result.wordsCompleted}/${result.wordsAttempted} | ` +
          `words: ${words.map(w => w.character).join(',')}`
        );
        // Mark all words in pool as seen
        for (const w of words) {
          storage.updateWordInProfile(profileId, w.character, { lastSeen: Date.now() });
        }
        currentIndex++;
        render();
      });
      return;
    }

    if (activityType === 'exposure') {
      // Phase 14: Check if this is a compound word eligible for compound discovery
      const isCompound = word.character.length === 2;
      let useCompoundDiscovery = false;
      let comp1 = null, comp2 = null;
      if (isCompound) {
        const chars = word.character.split('');
        comp1 = freshProfile.wordBank.find(w => w.character === chars[0] && (w.box || 1) >= 2);
        comp2 = freshProfile.wordBank.find(w => w.character === chars[1] && (w.box || 1) >= 2);
        useCompoundDiscovery = !!(comp1 && comp2);
      }

      const onExposureComplete = () => {
        if (resultHandled) return;
        resultHandled = true;
        const newBox = Math.min((word.box || 1) + 1, 5);
        const updates = { box: newBox, lastSeen: Date.now() };
        logActivity(word, useCompoundDiscovery ? 'compoundDiscovery' : 'exposure', null, updates);
        storage.updateWordInProfile(profileId, word.character, updates);
        word.box = newBox;
        currentIndex++;
        render();
      };

      if (useCompoundDiscovery) {
        renderCompoundDiscovery(container, word, comp1, comp2, onExposureComplete);
      } else {
        renderExposure(container, word, onExposureComplete);
      }
    } else {
      // Quiz activity
      const isWriting = WRITING_NAMES.has(activityType);
      const distractors = isWriting ? [] : pickDistractors(word, freshProfile.wordBank);

      // Need at least 1 distractor for MC quizzes; fall back to stroke writing
      if (!isWriting && distractors.length === 0) {
        if (word.hasStrokeData !== false) {
          // Fall back to guided stroke writing instead of exposure
          renderStrokeWriting(container, word, [], (result) => {
            if (resultHandled) return;
            resultHandled = true;
            const newBox = Math.min((word.box || 1) + 1, 5);
            const updates = { box: newBox, lastSeen: Date.now() };
            logActivity(word, 'strokeWriting(fallback)', result, updates);
            storage.updateWordInProfile(profileId, word.character, updates);
            currentIndex++;
            render();
          }, profile.level);
        } else {
          renderExposure(container, word, () => {
            if (resultHandled) return;
            resultHandled = true;
            const newBox = Math.min((word.box || 1) + 1, 5);
            const updates = { box: newBox, lastSeen: Date.now() };
            logActivity(word, 'exposure(fallback)', null, updates);
            storage.updateWordInProfile(profileId, word.character, updates);
            currentIndex++;
            render();
          });
        }
        return;
      }

      renderActivity(container, word, distractors, (result) => {
        if (resultHandled) return;
        resultHandled = true;
        // ─── Response time modulation (Phase 8) ───
        const responseMs = result.responseTimeMs;
        const maxIdle = WRITING_NAMES.has(activityType) ? 30000 : 10000;

        // Record response time (skip if distracted/idle)
        if (responseMs && responseMs <= maxIdle) {
          recordResponseTime(storage, profileId, activityType, responseMs);
        }

        // Classify speed against personal median
        const median = getMedianResponseTime(storage, profileId, activityType);
        const speed = classifyResponseTime(responseMs, median);

        let updates;
        if (result.correct) {
          if (speed === 'slow') {
            const newConsecutiveSlow = (word.consecutiveSlow || 0) + 1;
            if (newConsecutiveSlow >= 2) {
              // Two slow in a row: hold position, reset streak
              updates = {
                consecutiveCorrect: 0,
                consecutiveSlow: newConsecutiveSlow,
                box: word.box || 1,
                lastSeen: Date.now(),
              };
            } else {
              // First slow: treat as noise, count normally
              const cc = (word.consecutiveCorrect || 0) + 1;
              const shouldAdvance = cc >= 2;
              updates = {
                consecutiveCorrect: shouldAdvance ? 0 : cc,
                consecutiveSlow: newConsecutiveSlow,
                box: shouldAdvance ? Math.min((word.box || 1) + 1, 5) : (word.box || 1),
                lastSeen: Date.now(),
              };
            }
          } else if (speed === 'fast') {
            // Fast: counts double (+2) toward advancement
            const cc = (word.consecutiveCorrect || 0) + 2;
            const shouldAdvance = cc >= 2;
            updates = {
              consecutiveCorrect: shouldAdvance ? 0 : cc,
              consecutiveSlow: 0,
              box: shouldAdvance ? Math.min((word.box || 1) + 1, 5) : (word.box || 1),
              lastSeen: Date.now(),
            };
            sessionFastStreak++;
          } else {
            // Normal speed
            const cc = (word.consecutiveCorrect || 0) + 1;
            const shouldAdvance = cc >= 2;
            updates = {
              consecutiveCorrect: shouldAdvance ? 0 : cc,
              consecutiveSlow: 0,
              box: shouldAdvance ? Math.min((word.box || 1) + 1, 5) : (word.box || 1),
              lastSeen: Date.now(),
            };
          }

          if (speed !== 'fast') sessionFastStreak = 0;
        } else {
          // Wrong: regress box, reset streak
          sessionFastStreak = 0;
          updates = {
            consecutiveCorrect: 0,
            consecutiveSlow: 0,
            box: Math.max(1, (word.box || 1) - 1),
            lastSeen: Date.now(),
          };
        }

        // Track total attempts
        updates.totalAttempts = (word.totalAttempts || 0) + 1;

        // Phase 10: record interaction signal for auto-bump
        recordInteractionSignal(storage, profileId, { correct: result.correct, hintUsed: result.hintUsed });

        logActivity(word, activityType, result, updates, speed);
        const oldBox = word.box || 1;
        storage.updateWordInProfile(profileId, word.character, updates);
        word.box = updates.box;
        word.consecutiveCorrect = updates.consecutiveCorrect;
        word.consecutiveSlow = updates.consecutiveSlow || 0;
        word.totalAttempts = updates.totalAttempts;

        // Check for pack milestone celebrations
        checkPackMilestone(word, oldBox, updates.box);

        // ─── Fast-streak upgrade (Phase 8d) ───
        // After 3+ fast answers in a row, upgrade remaining activities to harder types
        if (sessionFastStreak >= 3) {
          upgradeRemainingActivities();
          sessionFastStreak = 0;
        }

        currentIndex++;
        render();
      }, profile.level);
    }
  }

  function renderCelebration() {
    const count = new Set(sessionPlan.flatMap(p => p.words ? p.words.map(w => w.character) : p.word ? [p.word.character] : [])).size;

    const cheers = [
      { emoji: '🐉', title: '加油', desc: t('celebrate.dragonEffort', count) },
      { emoji: '🏮', title: '厉害', desc: t('celebrate.practiced', count) },
      { emoji: '🎋', title: '坚持', desc: t('celebrate.stuckWithIt', count) },
      { emoji: '🧧', title: '进步', desc: t('celebrate.growing', count) },
      { emoji: '🎑', title: '用心', desc: t('celebrate.focused', count) },
      { emoji: '🐼', title: '棒棒哒', desc: t('celebrate.brainGrew', count) },
      { emoji: '🎆', title: '努力', desc: t('celebrate.hardWork', count) },
      { emoji: '🌟', title: '认真', desc: t('celebrate.neverGaveUp', count) },
      { emoji: '🚀', title: '飞速', desc: t('celebrate.blastOff', count) },
      { emoji: '🌈', title: '开心', desc: t('celebrate.colorful', count) },
      { emoji: '🦁', title: '勇敢', desc: t('celebrate.brave', count) },
      { emoji: '🎨', title: '用功', desc: t('celebrate.artist', count) },
      { emoji: '🌻', title: '成长', desc: t('celebrate.blooming', count) },
      { emoji: '⭐', title: '闪亮', desc: t('celebrate.shining', count) },
      { emoji: '🎵', title: '好听', desc: t('celebrate.rhythm', count) },
      { emoji: '🧩', title: '聪明', desc: t('celebrate.puzzle', count) },
      { emoji: '🏔️', title: '攀登', desc: t('celebrate.climbing', count) },
      { emoji: '🐢', title: '稳扎稳打', desc: t('celebrate.steady', count) },
      { emoji: '💪', title: '有力量', desc: t('celebrate.stronger', count) },
      { emoji: '🎯', title: '专注', desc: t('celebrate.focused2', count) },
    ];
    const cheer = cheers[Math.floor(Math.random() * cheers.length)];

    app.innerHTML = `
      <div class="screen session-celebration">
        <div class="session-celebration__confetti" id="confetti-container"></div>
        <div class="session-celebration__content">
          <div class="session-celebration__emoji">${cheer.emoji}</div>
          <h1 class="session-celebration__title">${cheer.title}</h1>
          <p class="session-celebration__desc">${cheer.desc}</p>
          <div class="session-celebration__progress-bar">
            <div class="session-celebration__progress-fill" id="celebration-progress"></div>
          </div>
          <div class="session-celebration__sticker" id="sticker-reward"></div>
          <div class="session-celebration__words">
            ${[...new Set(sessionPlan.flatMap(p => p.words ? p.words.map(w => w.character) : p.word ? [p.word.character] : []))].map(ch =>
              `<span class="session-celebration__word">${ch}</span>`
            ).join('')}
          </div>
        </div>
        <div class="session-celebration__actions">
          <button class="btn btn--primary" id="btn-again" style="width: 100%;">
            ${t('session.keepPracticing')}
          </button>
          <button class="btn btn--secondary" id="btn-done">
            ${t('session.allDone')}
          </button>
        </div>
      </div>
    `;

    // Spawn confetti particles
    const confettiContainer = app.querySelector('#confetti-container');
    for (let i = 0; i < 40; i++) {
      const particle = document.createElement('div');
      particle.className = 'confetti-particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDelay = Math.random() * 2 + 's';
      particle.style.backgroundColor = ['#FF6B6B','#4A90D9','#4CAF50','#FF9800','#9C27B0','#FFD700'][Math.floor(Math.random()*6)];
      confettiContainer.appendChild(particle);
    }

    // Animate progress bar to 100%
    const progressFill = app.querySelector('#celebration-progress');
    if (progressFill) {
      requestAnimationFrame(() => {
        progressFill.style.width = '100%';
      });
    }

    playCelebration();
    recordSessionComplete();
    checkAutoBump(storage, profileId);

    // Award a collectible sticker if session had 5+ activities
    if (sessionPlan.length >= 5) {
      const profiles = storage.getProfiles();
      const p = profiles.find(pr => pr.id === profileId);
      if (p) {
        if (!p.stickers) p.stickers = [];
        const sticker = STICKERS[Math.floor(Math.random() * STICKERS.length)];
        p.stickers.push({ ...sticker, earnedAt: Date.now() });
        storage.saveProfiles(profiles);
      }
    }

    // Show earned sticker on celebration screen
    const stickerEl = app.querySelector('#sticker-reward');
    if (stickerEl && sessionPlan.length >= 5) {
      const p = storage.getProfile(profileId);
      const latest = p?.stickers?.[p.stickers.length - 1];
      if (latest) {
        stickerEl.innerHTML = `
          <div class="sticker-earned">
            <span class="sticker-earned__emoji">${latest.emoji}</span>
            <span class="sticker-earned__label">+ ${latest.name}</span>
          </div>
        `;
      }
    }

    // Say the title in Chinese
    setTimeout(() => speakChinese(cheer.title, 0.6), 800);

    app.querySelector('#btn-again').addEventListener('click', () => {
      playClick();
      buildSessionPlan();
      currentIndex = 0;
      prevIndex = 0;
      render();
    });
    app.querySelector('#btn-done').addEventListener('click', () => {
      playClick();
      cleanupKeyboard();
      navigate('profiles');
    });
  }

  // On restored sessions, show a resume prompt so the user taps first.
  // This user gesture unlocks audio on mobile browsers.
  if (isRestored) {
    const resumeEntry = sessionPlan[currentIndex];
    const resumeChar = resumeEntry?.word?.character || resumeEntry?.words?.[0]?.character || '📝';
    app.innerHTML = `
      <div class="screen session-resume">
        <div class="session-resume__content">
          <div class="session-resume__emoji">${resumeChar}</div>
          <p class="session-resume__text">${t('session.resume')}</p>
          <div class="session-resume__buttons">
            <button class="btn btn--primary" id="btn-resume">${t('session.continue')}</button>
            <button class="btn btn--secondary" id="btn-quit">${t('session.quit')}</button>
          </div>
        </div>
      </div>
    `;
    app.querySelector('#btn-resume').addEventListener('click', () => {
      playClick();
      isRestored = false;
      render();
    });
    app.querySelector('#btn-quit').addEventListener('click', () => {
      playClick();
      clearSessionState();
      cleanupKeyboard();
      recordSessionQuit();
      navigate('profiles');
    });
  } else {
    render();
  }
}
