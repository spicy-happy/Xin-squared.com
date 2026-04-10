/**
 * Session Planner — Phase 5
 * Picks words, selects activity types (exposure vs quiz),
 * picks distractors, runs activities, updates Leitner state.
 */

import { renderExposure } from './activities/exposure.js';
import { renderAudioRecognition } from './activities/audio-recognition.js';
import { renderMeaningMatch } from './activities/meaning-match.js';
import { renderPinyinMatch } from './activities/pinyin-match.js';
import { renderReverseMeaning } from './activities/reverse-meaning.js';
import { renderStrokeWriting, renderFreeTrace, renderFlashWrite, renderFreeWrite } from './activities/stroke-writing.js';
import { speakChinese } from './enrichment.js';
import { playCelebration, playClick, playLevelUp } from './sounds.js';

/** Shuffle array in place (Fisher-Yates) */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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
  const others = wordBank.filter(w => w.character !== targetWord.character && w.meaning);
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
  const writeChance = box <= 1 ? 0.3 : box <= 2 ? 0.4 : 0.5;

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

  // Session size scales with age/level
  // Level 1 (age 4-5): 8 activities, Level 2 (age 6): 10, Level 3 (age 7-8): 12, Level 4 (age 9+): 15
  const SESSION_SIZES = { 1: 8, 2: 10, 3: 12, 4: 15 };
  const sessionSize = SESSION_SIZES[profile.level] || 10;
  const MAX_EXPOSURES = Math.min(3, Math.ceil(sessionSize / 3));

  let sessionPlan = []; // Array of { word, activityType, render }
  let currentIndex = 0;

  // Session persistence key
  const SESSION_KEY = 'session_' + profileId;

  /** Save current session state so it survives page refresh */
  function saveSessionState() {
    storage.set(SESSION_KEY, {
      currentIndex,
      plan: sessionPlan.map(p => ({
        character: p.word.character,
        activityType: p.activityType,
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

    const freshProfile = storage.getProfile(profileId);
    const wordMap = {};
    for (const w of freshProfile.wordBank) wordMap[w.character] = w;

    // Rebuild plan from saved state
    const plan = [];
    for (const entry of saved.plan) {
      const word = wordMap[entry.character];
      if (!word) continue; // word was deleted since session was saved
      plan.push({
        word,
        activityType: entry.activityType,
        render: getRenderer(entry.activityType),
      });
    }

    if (plan.length === 0) return false;

    sessionPlan = plan;
    currentIndex = Math.min(saved.currentIndex || 0, plan.length - 1);
    return true;
  }

  /** Pick fresh session words and build a session plan */
  function buildSessionPlan() {
    const now = Date.now();
    const freshProfile = storage.getProfile(profileId);
    const words = freshProfile.wordBank;
    const starred = words.filter(w => w.starFlag && w.starFlag.expiresAt > now);

    // New words never seen
    const newWords = words.filter(w => !w.lastSeen && (!w.starFlag || w.starFlag.expiresAt <= now));
    shuffle(newWords);

    // Review words (seen before), oldest first
    const review = words
      .filter(w => w.lastSeen && (!w.starFlag || w.starFlag.expiresAt <= now))
      .sort((a, b) => (a.lastSeen || 0) - (b.lastSeen || 0));

    // Prioritize starred, fill with new + review
    const nonStarred = [...newWords, ...review];
    const starCount = Math.min(starred.length, sessionSize);
    const fillCount = sessionSize - starCount;
    const picked = [...starred, ...nonStarred.slice(0, fillCount)];
    shuffle(picked);

    if (picked.length === 0) {
      picked.push(...words.slice(0, Math.min(sessionSize, words.length)));
      shuffle(picked);
    }

    // Build plan: exposure for new words, box-level-appropriate quiz for seen words
    const plan = [];
    let exposureCount = 0;

    for (const word of picked) {
      const isNew = !word.lastSeen;
      if (isNew && exposureCount < MAX_EXPOSURES) {
        plan.push({ word, activityType: 'exposure', render: null });
        exposureCount++;
      } else {
        const quiz = pickQuizForWord(word);
        plan.push({ word, activityType: quiz.name, render: quiz.render });
      }
    }

    // Avoid 3+ of the same activity type in a row — swap with an MC quiz
    for (let i = 2; i < plan.length; i++) {
      if (plan[i].activityType === plan[i-1].activityType &&
          plan[i].activityType === plan[i-2].activityType &&
          plan[i].activityType !== 'exposure') {
        const mc = MC_QUIZ_TYPES.filter(q => q.name !== plan[i].activityType);
        const alt = mc[Math.floor(Math.random() * mc.length)];
        plan[i].activityType = alt.name;
        plan[i].render = alt.render;
      }
    }

    sessionPlan = plan;
    saveSessionState();
  }

  // Try to restore a saved session; if none, build a fresh one
  if (!restoreSession()) {
    buildSessionPlan();
  }

  /** Abort current activity audio */
  function abortCurrentActivity() {
    const container = app.querySelector('#activity-container');
    if (container?._abortExposure) container._abortExposure();
    window.speechSynthesis?.cancel();
  }

  /** Give credit for current word (used by arrow key skip) */
  function giveCredit() {
    if (currentIndex >= sessionPlan.length) return;
    const { word } = sessionPlan[currentIndex];
    const newBox = Math.min((word.box || 1) + 1, 5);
    storage.updateWordInProfile(profileId, word.character, {
      box: newBox,
      lastSeen: Date.now(),
    });
    word.box = newBox;
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

  let prevIndex = 0; // Track previous index for progress animation

  function render() {
    if (currentIndex >= sessionPlan.length) {
      clearSessionState();
      renderCelebration();
      return;
    }

    // Persist progress so page refresh resumes here
    saveSessionState();

    const { word, activityType, render: renderActivity } = sessionPlan[currentIndex];
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
      navigate('profiles');
    });

    const container = app.querySelector('#activity-container');

    if (activityType === 'exposure') {
      // Exposure activity — simple onComplete
      renderExposure(container, word, () => {
        const newBox = Math.min((word.box || 1) + 1, 5);
        storage.updateWordInProfile(profileId, word.character, {
          box: newBox,
          lastSeen: Date.now(),
        });
        word.box = newBox;
        currentIndex++;
        render();
      });
    } else {
      // Quiz activity
      const isWriting = WRITING_NAMES.has(activityType);
      const distractors = isWriting ? [] : pickDistractors(word, freshProfile.wordBank);

      // Need at least 1 distractor for MC quizzes; fall back to exposure
      if (!isWriting && distractors.length === 0) {
        renderExposure(container, word, () => {
          storage.updateWordInProfile(profileId, word.character, {
            box: Math.min((word.box || 1) + 1, 5),
            lastSeen: Date.now(),
          });
          currentIndex++;
          render();
        });
        return;
      }

      renderActivity(container, word, distractors, (result) => {
        // Update Leitner state based on result
        if (result.correct) {
          const cc = (word.consecutiveCorrect || 0) + 1;
          const shouldAdvance = cc >= 2;
          const newBox = shouldAdvance ? Math.min((word.box || 1) + 1, 5) : (word.box || 1);
          storage.updateWordInProfile(profileId, word.character, {
            consecutiveCorrect: shouldAdvance ? 0 : cc,
            box: newBox,
            lastSeen: Date.now(),
          });
          word.box = newBox;
          word.consecutiveCorrect = shouldAdvance ? 0 : cc;
        } else {
          // Wrong: regress box, reset streak
          const newBox = Math.max(1, (word.box || 1) - 1);
          storage.updateWordInProfile(profileId, word.character, {
            consecutiveCorrect: 0,
            box: newBox,
            lastSeen: Date.now(),
          });
          word.box = newBox;
          word.consecutiveCorrect = 0;
        }

        currentIndex++;
        render();
      }, profile.level);
    }
  }

  function renderCelebration() {
    const count = sessionPlan.length;

    const cheers = [
      { emoji: '🐉', title: '厉害', desc: `${count} words down — like a dragon` },
      { emoji: '🏮', title: '太棒了', desc: `You practiced ${count} words today` },
      { emoji: '🎋', title: '加油', desc: `${count} words — keep it up` },
      { emoji: '🧧', title: '很好', desc: `${count} words in the bag` },
      { emoji: '🎑', title: '了不起', desc: `You just tackled ${count} words` },
      { emoji: '🐼', title: '棒棒哒', desc: `${count} words — panda proud` },
      { emoji: '🎆', title: '好极了', desc: `${count} words practiced` },
    ];
    const cheer = cheers[Math.floor(Math.random() * cheers.length)];

    app.innerHTML = `
      <div class="screen session-celebration">
        <div class="session-celebration__confetti" id="confetti-container"></div>
        <div class="session-celebration__content">
          <div class="session-celebration__emoji">${cheer.emoji}</div>
          <h1 class="session-celebration__title">${cheer.title}</h1>
          <p class="session-celebration__desc">${cheer.desc}</p>
          <div class="session-celebration__words">
            ${[...new Set(sessionPlan.map(p => p.word.character))].map(ch =>
              `<span class="session-celebration__word">${ch}</span>`
            ).join('')}
          </div>
        </div>
        <div class="session-celebration__actions">
          <button class="btn btn--primary" id="btn-again" style="width: 100%;">
            Keep practicing
          </button>
          <button class="btn btn--secondary" id="btn-done">
            All done!
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

    playCelebration();
    // Say the title in Chinese
    setTimeout(() => speakChinese(cheer.title, 0.6), 800);

    app.querySelector('#btn-again').addEventListener('click', () => {
      playClick();
      buildSessionPlan();
      currentIndex = 0;
      render();
    });
    app.querySelector('#btn-done').addEventListener('click', () => {
      playClick();
      cleanupKeyboard();
      navigate('profiles');
    });
  }

  render();
}
