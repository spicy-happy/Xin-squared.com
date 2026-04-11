/**
 * Reverse Meaning Activity — "See the meaning, pick the character"
 * Shows an English meaning (+ illustration), kid picks the correct character.
 */

import { speakChinese, speakEnglish } from '../enrichment.js';
import { playSparkle, playBoop, playClick } from '../sounds.js';
import { t } from '../i18n.js';

function formatMeaning(meaning) {
  if (!meaning) return '';
  return meaning.replace(/\s*\/\s*/g, ' or ');
}

/**
 * Render the reverse meaning quiz.
 */
export async function renderReverseMeaning(container, word, distractors, onResult) {
  const meaning = formatMeaning(word.meaning || word.meanings?.[0] || '');
  const options = shuffle([word, ...distractors]);

  let attempts = 0;
  let resolved = false;
  let aborted = false;
  let hintUsed = false;
  const startTime = Date.now();

  function abort() {
    aborted = true;
    window.speechSynthesis?.cancel();
  }

  container.innerHTML = `
    <div class="activity activity--quiz">
      <button class="quiz__hint-toggle" id="quiz-hint">${t('activity.hintAudio')}</button>
      <div class="activity__body">
        <p class="quiz__instruction">${t('quiz.whichCharMeans')}</p>
        <div class="quiz__prompt quiz__prompt--meaning">
          <span class="quiz__prompt-meaning-text">${meaning}</span>
        </div>
        <div class="quiz__options" id="quiz-options">
          ${options.map((o, i) => `
            <button class="quiz__option" data-index="${i}" data-char="${o.character}">
              ${o.character}
            </button>
          `).join('')}
        </div>
        <div class="quiz__feedback" id="quiz-feedback"></div>
      </div>
    </div>
  `;

  container._abortExposure = abort;

  const feedbackEl = container.querySelector('#quiz-feedback');
  const optionBtns = container.querySelectorAll('.quiz__option');
  const hintBtn = container.querySelector('#quiz-hint');

  // Hint: say the Chinese word (penalty — only partial credit, can re-press)
  if (hintBtn) {
    hintBtn.addEventListener('click', () => {
      if (aborted || resolved) return;
      playClick();
      hintUsed = true;
      hintBtn.classList.add('quiz__hint-toggle--revealed');
      hintBtn.textContent = t('activity.hintAudio');
      window.speechSynthesis?.cancel();
      speakChinese(word.character, 0.5);
    });
  }

  // Speak the meaning on load
  setTimeout(async () => {
    if (!aborted && meaning) await speakEnglish(meaning);
  }, 300);

  optionBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (resolved || aborted) return;
      const chosen = btn.dataset.char;

      if (chosen === word.character) {
        resolved = true;
        // Disable all buttons immediately
        optionBtns.forEach(b => { b.disabled = true; });
        if (hintBtn) hintBtn.disabled = true;
        btn.classList.add('quiz__option--correct');
        playSparkle();
        await new Promise(r => setTimeout(r, 300));
        if (!aborted) await speakChinese(word.character, 0.5);
        if (!aborted && meaning) { await new Promise(r => setTimeout(r, 300)); await speakEnglish(meaning); }
        await new Promise(r => setTimeout(r, 1200));
        if (!aborted) onResult({ correct: attempts === 0 && !hintUsed, attempts, hintUsed, responseTimeMs: Date.now() - startTime });
      } else {
        attempts++;
        btn.classList.add('quiz__option--wrong');
        playBoop();
        btn.disabled = true;

        const encouragements = [t('quiz.tryAgain'), t('quiz.almost'), t('quiz.keepTrying')];
        feedbackEl.textContent = encouragements[Math.min(attempts - 1, 2)];

        // After 2 wrong attempts, hint the correct answer with a subtle glow
        if (attempts >= 2) {
          optionBtns.forEach(b => {
            if (b.dataset.char === word.character) {
              b.classList.add('quiz__option--hint');
            }
          });
        }
      }
    });
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
