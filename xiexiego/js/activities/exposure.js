/**
 * Exposure Activity — Stage 1 introduction to a character.
 * Shows character large, animates strokes slowly, plays audio sequence,
 * shows meaning + pinyin + example. Replay button to repeat.
 */

import { playAudio, speakExposureSequence } from '../enrichment.js';

/**
 * Render the exposure activity for a single word.
 *
 * @param {HTMLElement} container - DOM element to render into
 * @param {Object} word - Enriched word object from word bank
 * @param {Function} onComplete - Called when user taps Continue
 */
export function renderExposure(container, word, onComplete) {
  const meaning = word.meaning || word.meanings?.[0] || '';
  const pinyin = word.pinyinMarked || word.pinyin || '';
  const example = word.example;
  const hasComponents = word.components && word.components.length > 0;

  container.innerHTML = `
    <div class="activity activity--exposure">
      <div class="activity__body">
        <div class="activity__character-area" id="exposure-char-area">
          <div id="hanzi-target"></div>
        </div>

        <div class="activity__info">
          ${pinyin ? `<div class="activity__pinyin">${pinyin}</div>` : ''}
          <div class="activity__meaning">${meaning}</div>
          ${example ? `
            <div class="activity__example">
              <span class="activity__example-zh">${example.zh}</span>
              ${example.en ? `<span class="activity__example-en">${example.en}</span>` : ''}
            </div>
          ` : ''}
          ${hasComponents && word.etymology?.hint ? `
            <div class="activity__etymology">${word.etymology.hint}</div>
          ` : ''}
        </div>
      </div>

      <div class="activity__actions">
        <div class="activity__btn-row">
          <button class="btn btn--secondary activity__replay" id="btn-replay">
            ↻ Replay
          </button>
          <button class="btn btn--primary activity__continue" id="btn-continue" style="visibility: hidden;">
            Continue
          </button>
        </div>
      </div>
    </div>
  `;

  // Initialize HanziWriter
  let writer = null;
  const target = container.querySelector('#hanzi-target');
  const charArea = container.querySelector('#exposure-char-area');

  function runAnimation() {
    if (word.character.length > 1) {
      // Compound: pulse animation
      charArea.classList.remove('activity__character-area--pulse');
      void charArea.offsetWidth; // force reflow
      charArea.classList.add('activity__character-area--pulse');
      speakExposureSequence(word);
    } else if (writer) {
      writer.hideCharacter();
      writer.animateCharacter({
        onComplete: () => {
          writer.showCharacter();
          // Grow animation for fun
          charArea.classList.remove('activity__character-area--pop');
          void charArea.offsetWidth;
          charArea.classList.add('activity__character-area--pop');
        }
      });
      speakExposureSequence(word);
    } else {
      speakExposureSequence(word);
    }
  }

  // For compound words, show characters as text
  if (word.character.length > 1) {
    target.innerHTML = `<span class="activity__compound-chars">${word.character}</span>`;
  } else if (word.hasStrokeData !== false) {
    try {
      writer = HanziWriter.create(target, word.character, {
        width: 220,
        height: 220,
        padding: 10,
        strokeAnimationSpeed: 0.5,       // Slower strokes
        delayBetweenStrokes: 300,        // More pause between strokes
        strokeColor: '#2D3436',
        radicalColor: '#4A90D9',
        showOutline: true,
        showCharacter: false,
      });
    } catch (err) {
      console.error('HanziWriter error:', err);
      target.innerHTML = `<span class="activity__fallback-char">${word.character}</span>`;
    }
  } else {
    target.innerHTML = `<span class="activity__fallback-char">${word.character}</span>`;
  }

  // Tap character area → replay
  charArea.addEventListener('click', () => runAnimation());

  // Auto-play on load
  setTimeout(() => runAnimation(), 400);

  // Show Continue button after delay
  setTimeout(() => {
    const btn = container.querySelector('#btn-continue');
    if (btn) {
      btn.style.visibility = 'visible';
      btn.style.animation = 'fadeIn 0.3s ease-out';
    }
  }, 3000);

  // Replay button
  container.querySelector('#btn-replay')?.addEventListener('click', () => {
    runAnimation();
  });

  // Continue button
  container.querySelector('#btn-continue')?.addEventListener('click', () => {
    if (writer) { try { writer.hideCharacter(); } catch {} }
    window.speechSynthesis?.cancel();
    onComplete();
  });
}
