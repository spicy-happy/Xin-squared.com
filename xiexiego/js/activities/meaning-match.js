/**
 * Meaning Match Activity — "See it, pick the meaning"
 * Shows a character, kid picks the correct English meaning.
 */

import { speakChinese, speakEnglish } from '../enrichment.js';
import { playSparkle, playBoop, playClick } from '../sounds.js';
import { t } from '../i18n.js';

/**
 * Format meaning: replace " / " with " or ".
 */
function formatMeaning(meaning) {
  if (!meaning) return '';
  return meaning.replace(/\s*\/\s*/g, ' or ');
}

/**
 * Render the meaning match quiz.
 */
export async function renderMeaningMatch(container, word, distractors, onResult) {
  const correctMeaning = formatMeaning(word.meaning || word.meanings?.[0] || '');
  const options = shuffle([
    { character: word.character, meaning: correctMeaning, correct: true },
    ...distractors.map(d => ({
      character: d.character,
      meaning: formatMeaning(d.meaning || d.meanings?.[0] || ''),
      correct: false,
    }))
  ]);

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
        <p class="quiz__instruction">${t('quiz.whatMeans')}</p>
        <div class="quiz__prompt">
          <span class="quiz__prompt-char" id="quiz-char">${word.character}</span>
          <button class="quiz__speaker quiz__speaker--small" id="quiz-speaker">
            <svg class="quiz__speaker-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          </button>
        </div>
        <div class="quiz__options quiz__options--meanings" id="quiz-options">
          ${options.map((o, i) => `
            <button class="quiz__option quiz__option--text" data-index="${i}" data-correct="${o.correct}">
              ${o.meaning}
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
  const speakerBtn = container.querySelector('#quiz-speaker');
  const hintBtn = container.querySelector('#quiz-hint');

  // Hint: say the Chinese word aloud (penalty — only partial credit, can re-press)
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

  // Speak the character on load
  setTimeout(async () => {
    if (!aborted) await speakChinese(word.character, 0.5);
  }, 300);

  // Tap speaker to hear it again
  speakerBtn.addEventListener('click', () => {
    if (aborted) return;
    window.speechSynthesis?.cancel();
    speakChinese(word.character, 0.5);
  });

  // Tap an option
  optionBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (resolved || aborted) return;
      const isCorrect = btn.dataset.correct === 'true';

      if (isCorrect) {
        resolved = true;
        // Disable all buttons immediately
        optionBtns.forEach(b => { b.disabled = true; });
        speakerBtn.disabled = true;
        if (hintBtn) hintBtn.disabled = true;
        btn.classList.add('quiz__option--correct');
        playSparkle();
        await new Promise(r => setTimeout(r, 300));
        if (!aborted) await speakChinese(word.character, 0.5);
        if (!aborted) { await new Promise(r => setTimeout(r, 300)); await speakEnglish(correctMeaning); }
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
            if (b.dataset.correct === 'true') {
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
