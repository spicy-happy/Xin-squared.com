/**
 * Exposure Activity — Stage 1 introduction to a character.
 * Shows character large, animates strokes, plays audio, shows meaning.
 * No assessment — purely introduction.
 */

import { playAudio } from '../enrichment.js';

/**
 * Render the exposure activity for a single word.
 *
 * @param {HTMLElement} container - DOM element to render into
 * @param {Object} word - Enriched word object from word bank
 * @param {Function} onComplete - Called when user taps Continue
 */
export function renderExposure(container, word, onComplete) {
  const meaning = word.meaning || word.meanings?.[0] || '';
  const example = word.example;
  const hasComponents = word.components && word.components.length > 0;

  container.innerHTML = `
    <div class="activity activity--exposure">
      <div class="activity__body">
        <div class="activity__character-area" id="exposure-char-area">
          <div id="hanzi-target"></div>
        </div>

        <div class="activity__info">
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
        <button class="btn btn--primary activity__continue" id="btn-continue" style="visibility: hidden;">
          Continue
        </button>
      </div>
    </div>
  `;

  // Initialize HanziWriter
  let writer = null;
  const target = container.querySelector('#hanzi-target');

  // For compound words, show characters side by side without HanziWriter animation
  if (word.character.length > 1) {
    target.innerHTML = `<span class="activity__compound-chars">${word.character}</span>`;
    target.querySelector('.activity__compound-chars').addEventListener('click', () => {
      playAudio(word.character, word.audioFile);
    });
  } else if (word.hasStrokeData !== false) {
    try {
      writer = HanziWriter.create(target, word.character, {
        width: 200,
        height: 200,
        padding: 10,
        strokeAnimationSpeed: 1,
        delayBetweenStrokes: 150,
        strokeColor: '#2D3436',
        radicalColor: '#4A90D9',
        showOutline: true,
        showCharacter: false,
      });

      // Animate strokes on load
      setTimeout(() => {
        writer.animateCharacter({
          onComplete: () => {
            // Show full character after animation
            writer.showCharacter();
          }
        });
      }, 300);

      // Tap to replay animation + audio
      target.addEventListener('click', () => {
        writer.hideCharacter();
        writer.animateCharacter({
          onComplete: () => writer.showCharacter()
        });
        playAudio(word.character, word.audioFile);
      });
    } catch (err) {
      console.error('HanziWriter error:', err);
      // Fallback: show character as text
      target.innerHTML = `<span class="activity__fallback-char">${word.character}</span>`;
    }
  } else {
    // No stroke data available
    target.innerHTML = `<span class="activity__fallback-char">${word.character}</span>`;
    target.addEventListener('click', () => {
      playAudio(word.character, word.audioFile);
    });
  }

  // Auto-play audio
  setTimeout(() => {
    playAudio(word.character, word.audioFile);
  }, 500);

  // Show Continue button after delay
  setTimeout(() => {
    const btn = container.querySelector('#btn-continue');
    if (btn) {
      btn.style.visibility = 'visible';
      btn.style.animation = 'fadeIn 0.3s ease-out';
    }
  }, 3000);

  // Continue button
  container.querySelector('#btn-continue')?.addEventListener('click', () => {
    // Clean up HanziWriter
    if (writer) {
      try { writer.hideCharacter(); } catch {}
    }
    onComplete();
  });
}
