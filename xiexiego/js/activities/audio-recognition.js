/**
 * Audio Recognition Activity — "Hear it, tap it"
 * Plays a word aloud, kid picks the correct character from choices.
 */

import { speakChinese, speakEnglish } from '../enrichment.js';
import { playSparkle, playBoop, playClick } from '../sounds.js';

/**
 * Render the audio recognition quiz.
 * @param {HTMLElement} container
 * @param {Object} word - Target word
 * @param {Object[]} distractors - Wrong-answer words
 * @param {Function} onResult - Called with { correct, attempts }
 */
export async function renderAudioRecognition(container, word, distractors, onResult) {
  const options = shuffle([word, ...distractors]);
  const meaning = (word.meaning || word.meanings?.[0] || '').replace(/\s*\/\s*/g, ' or ');
  let attempts = 0;
  let resolved = false;
  let aborted = false;

  function abort() {
    aborted = true;
    window.speechSynthesis?.cancel();
  }

  container.innerHTML = `
    <div class="activity activity--quiz">
      <div class="activity__body">
        <p class="quiz__instruction">Which character did you hear?</p>
        <button class="quiz__speaker" id="quiz-speaker">
          <svg class="quiz__speaker-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
        </button>
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

  const speakerBtn = container.querySelector('#quiz-speaker');
  const feedbackEl = container.querySelector('#quiz-feedback');
  const optionBtns = container.querySelectorAll('.quiz__option');

  // Play audio on load
  setTimeout(async () => {
    if (!aborted) await speakChinese(word.character, 0.5);
  }, 300);

  // Tap speaker to replay
  speakerBtn.addEventListener('click', () => {
    if (aborted || resolved) return;
    playClick();
    window.speechSynthesis?.cancel();
    speakChinese(word.character, 0.5);
  });

  // Tap an option
  optionBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (resolved || aborted) return;
      const chosen = btn.dataset.char;

      if (chosen === word.character) {
        // Correct!
        resolved = true;
        btn.classList.add('quiz__option--correct');
        playSparkle();
        await new Promise(r => setTimeout(r, 300));
        if (!aborted) await speakChinese(word.character, 0.5);
        if (!aborted && meaning) { await new Promise(r => setTimeout(r, 300)); await speakEnglish(meaning); }
        await new Promise(r => setTimeout(r, 1200));
        if (!aborted) onResult({ correct: attempts === 0, attempts });
      } else {
        // Wrong
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
