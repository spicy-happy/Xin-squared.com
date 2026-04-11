/**
 * Pinyin Match Activity — "See the character, pick the pinyin"
 * Shows a character, kid picks the correct pinyin. Hint reveals English meaning.
 */

import { speakChinese, speakEnglish } from '../enrichment.js';
import { playSparkle, playBoop, playClick } from '../sounds.js';
import { t } from '../i18n.js';

function formatMeaning(meaning) {
  if (!meaning) return '';
  return meaning.replace(/\s*\/\s*/g, ' or ');
}

/**
 * Render the pinyin match quiz.
 */
export async function renderPinyinMatch(container, word, distractors, onResult) {
  const correctPinyin = word.pinyinMarked || word.pinyin || '';
  const meaning = formatMeaning(word.meaning || word.meanings?.[0] || '');
  const options = shuffle([
    { character: word.character, pinyin: correctPinyin, correct: true },
    ...distractors.map(d => ({
      character: d.character,
      pinyin: d.pinyinMarked || d.pinyin || '',
      correct: false,
    }))
  ]).filter(o => o.pinyin); // skip empty pinyin

  let attempts = 0;
  let resolved = false;
  let aborted = false;
  let hintShown = false;
  const startTime = Date.now();

  function abort() {
    aborted = true;
    window.speechSynthesis?.cancel();
  }

  container.innerHTML = `
    <div class="activity activity--quiz">
      ${meaning ? `<button class="quiz__hint-toggle" id="quiz-hint">${t('activity.hint')}</button>` : ''}
      <div class="activity__body">
        <p class="quiz__instruction">${t('quiz.whichPinyin')}</p>
        <div class="quiz__prompt">
          <span class="quiz__prompt-char">${word.character}</span>
        </div>
        <div class="quiz__options quiz__options--meanings" id="quiz-options">
          ${options.map((o, i) => `
            <button class="quiz__option quiz__option--text" data-index="${i}" data-correct="${o.correct}">
              ${o.pinyin}
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

  // Hint: reveal English meaning + speak it (can re-press to hear again)
  if (hintBtn) {
    hintBtn.addEventListener('click', () => {
      if (aborted || resolved) return;
      playClick();
      hintShown = true;
      hintBtn.textContent = meaning;
      hintBtn.classList.add('quiz__hint-toggle--revealed');
      window.speechSynthesis?.cancel();
      speakEnglish(meaning);
    });
  }

  optionBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (resolved || aborted) return;
      const isCorrect = btn.dataset.correct === 'true';

      if (isCorrect) {
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
        if (!aborted) onResult({ correct: attempts === 0 && !hintShown, attempts, hintUsed: hintShown, responseTimeMs: Date.now() - startTime });
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
