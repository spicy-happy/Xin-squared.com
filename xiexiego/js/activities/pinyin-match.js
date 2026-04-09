/**
 * Pinyin Match Activity — "See the character, pick the pinyin"
 * Shows a character, kid picks the correct pinyin. Hint reveals English meaning.
 */

import { speakChinese, speakEnglish } from '../enrichment.js';
import { playSparkle, playBoop, playClick } from '../sounds.js';

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

  function abort() {
    aborted = true;
    window.speechSynthesis?.cancel();
  }

  container.innerHTML = `
    <div class="activity activity--quiz">
      ${meaning ? `<button class="quiz__hint-toggle" id="quiz-hint">Hint</button>` : ''}
      <div class="activity__body">
        <p class="quiz__instruction">Which pinyin matches?</p>
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

  // Hint: reveal English meaning
  if (hintBtn) {
    hintBtn.addEventListener('click', () => {
      if (aborted || resolved) return;
      playClick();
      hintShown = true;
      hintBtn.textContent = meaning;
      hintBtn.classList.add('quiz__hint-toggle--revealed');
      speakEnglish(meaning);
    });
  }

  optionBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (resolved || aborted) return;
      const isCorrect = btn.dataset.correct === 'true';

      if (isCorrect) {
        resolved = true;
        btn.classList.add('quiz__option--correct');
        playSparkle();
        await new Promise(r => setTimeout(r, 300));
        if (!aborted) await speakChinese(word.character, 0.5);
        if (!aborted && meaning) { await new Promise(r => setTimeout(r, 300)); await speakEnglish(meaning); }
        await new Promise(r => setTimeout(r, 1200));
        if (!aborted) onResult({ correct: attempts === 0, attempts });
      } else {
        attempts++;
        btn.classList.add('quiz__option--wrong');
        playBoop();
        btn.disabled = true;

        const encouragements = ['Try again!', 'Almost!', 'Keep trying!'];
        feedbackEl.textContent = encouragements[Math.min(attempts - 1, 2)];
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
