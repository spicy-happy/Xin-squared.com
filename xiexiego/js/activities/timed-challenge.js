/**
 * Timed Writing Challenge — write as many characters as you can in 60 seconds.
 * Shows a character with meaning/pinyin, kid writes it with HanziWriter,
 * then immediately moves to the next. Timer counts down. Score shown at end.
 */

import { localCharDataLoader } from '../enrichment.js';
import { playSparkle, playBoop, playPop, playChime } from '../sounds.js';
import { t } from '../i18n.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CHALLENGE_DURATION = 60; // seconds

/**
 * Render a timed writing challenge.
 * @param {HTMLElement} container
 * @param {Object[]} words - Pool of words to cycle through
 * @param {Function} onResult - Called with { wordsCompleted, wordsAttempted, responseTimeMs }
 */
export function renderTimedChallenge(container, words, onResult) {
  const pool = shuffle(words.filter(w => w.hasStrokeData !== false && w.character.length === 1));
  if (pool.length === 0) {
    onResult({ wordsCompleted: 0, wordsAttempted: 0, responseTimeMs: 0 });
    return;
  }

  let currentIdx = 0;
  let completed = 0;
  let attempted = 0;
  let timeLeft = CHALLENGE_DURATION;
  let timerInterval = null;
  let started = false;
  let aborted = false;
  let quizInstance = null;

  function cleanup() {
    aborted = true;
    if (timerInterval) clearInterval(timerInterval);
    if (quizInstance) {
      quizInstance.cancelQuiz();
      quizInstance = null;
    }
  }

  container._abortExposure = cleanup;

  // Show countdown intro
  renderIntro();

  function renderIntro() {
    container.innerHTML = `
      <div class="activity activity--timed">
        <div class="activity__body timed__intro">
          <div class="timed__intro-icon">⚡</div>
          <h2 class="timed__intro-title">${t('timed.title')}</h2>
          <p class="timed__intro-desc">${t('timed.desc')}</p>
          <button class="btn btn--primary btn--large" id="btn-start-challenge">${t('timed.start')}</button>
        </div>
      </div>
    `;

    container.querySelector('#btn-start-challenge').addEventListener('click', () => {
      playPop();
      started = true;
      startTimer();
      renderChallenge();
    });
  }

  function startTimer() {
    timerInterval = setInterval(() => {
      timeLeft--;
      const timerEl = container.querySelector('#timed-timer');
      if (timerEl) {
        timerEl.textContent = timeLeft;
        if (timeLeft <= 10) timerEl.classList.add('timed__timer--urgent');
      }
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        if (quizInstance) {
          quizInstance.cancelQuiz();
          quizInstance = null;
        }
        renderResults();
      }
    }, 1000);
  }

  function renderChallenge() {
    if (aborted || timeLeft <= 0) return;

    const word = pool[currentIdx % pool.length];
    const meaning = word.meaning || word.meanings?.[0] || '';
    const pinyin = word.pinyinMarked || word.pinyin || '';

    container.innerHTML = `
      <div class="activity activity--timed">
        <div class="timed__header">
          <div class="timed__score">
            <span class="timed__score-num">${completed}</span>
            <span class="timed__score-label">${t('timed.written')}</span>
          </div>
          <div class="timed__timer-wrap">
            <span class="timed__timer ${timeLeft <= 10 ? 'timed__timer--urgent' : ''}" id="timed-timer">${timeLeft}</span>
            <span class="timed__timer-label">s</span>
          </div>
        </div>
        <div class="activity__body timed__body">
          <div class="timed__prompt">
            <span class="timed__prompt-pinyin">${pinyin}</span>
            <span class="timed__prompt-meaning">${meaning}</span>
          </div>
          <div class="timed__writer-area">
            <div id="timed-writer" style="width: 200px; height: 200px; margin: 0 auto;"></div>
          </div>
          <button class="activity__skip timed__skip" id="btn-skip-word">${t('timed.skip')}</button>
        </div>
      </div>
    `;

    // Skip button
    container.querySelector('#btn-skip-word').addEventListener('click', () => {
      if (aborted || timeLeft <= 0) return;
      if (quizInstance) {
        quizInstance.cancelQuiz();
        quizInstance = null;
      }
      attempted++;
      currentIdx++;
      playBoop();
      renderChallenge();
    });

    // Initialize HanziWriter quiz
    const writerEl = container.querySelector('#timed-writer');
    if (window.HanziWriter && writerEl) {
      const writer = window.HanziWriter.create(writerEl, word.character, {
        charDataLoader: localCharDataLoader,
        width: 200,
        height: 200,
        padding: 10,
        showCharacter: false,
        showOutline: true,
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 0,
        leniency: 1.5,
        showHintAfterMisses: 2,
        highlightOnComplete: true,
        drawingWidth: 20,
        outlineColor: '#DDD',
        highlightColor: '#4A90D9',
      });

      quizInstance = writer;
      writer.quiz({
        onComplete: (summaryData) => {
          if (aborted || timeLeft <= 0) return;
          completed++;
          attempted++;
          currentIdx++;
          playSparkle();
          quizInstance = null;
          // Brief flash then next
          setTimeout(() => renderChallenge(), 300);
        },
      });
    }
  }

  function renderResults() {
    if (aborted) return;
    playChime();

    const emoji = completed >= 10 ? '🏆' : completed >= 5 ? '⭐' : '💪';

    container.innerHTML = `
      <div class="activity activity--timed">
        <div class="activity__body timed__results">
          <div class="timed__results-emoji">${emoji}</div>
          <h2 class="timed__results-title">${t('timed.resultsTitle')}</h2>
          <div class="timed__results-score">${completed}</div>
          <p class="timed__results-label">${t('timed.resultsDesc', completed)}</p>
          <button class="btn btn--primary" id="btn-done">${t('timed.done')}</button>
        </div>
      </div>
    `;

    container.querySelector('#btn-done').addEventListener('click', () => {
      onResult({
        wordsCompleted: completed,
        wordsAttempted: attempted,
        responseTimeMs: CHALLENGE_DURATION * 1000,
      });
    });
  }
}
