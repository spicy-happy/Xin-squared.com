/**
 * Exposure Activity — Stage 1 introduction to a character.
 * Shows character large, animates strokes slowly, plays audio sequence,
 * shows meaning + pinyin + example. Each part reveals as narrator reads it.
 */

import { playAudio, speakChinese, speakEnglish, enrichCharacter, getIllustration } from '../enrichment.js';
import { playPop, playChime, playWhoosh, playClick } from '../sounds.js';

/**
 * Format meaning for display: replace " / " with " or ".
 */
function formatMeaning(meaning) {
  if (!meaning) return '';
  return meaning.replace(/\s*\/\s*/g, ' or ');
}

/**
 * Render the exposure activity for a single word.
 */
export async function renderExposure(container, word, onComplete) {
  // If no example, try to enrich on-the-fly to get one
  if (!word.example && word.character.length === 1) {
    try {
      const enriched = await enrichCharacter(word.character);
      if (enriched.example) word.example = enriched.example;
    } catch {}
  }

  const meaning = formatMeaning(word.meaning || word.meanings?.[0] || '');
  const spokenMeaning = (word.meaning || word.meanings?.[0] || '').replace(/\s*\/\s*/g, ' or ');
  const pinyin = word.pinyinMarked || word.pinyin || '';
  const example = word.example;
  const illustration = getIllustration(word.character);

  container.innerHTML = `
    <div class="activity activity--exposure">
      <div class="activity__body">
        <div class="activity__character-area" id="exposure-char-area">
          <div id="hanzi-target"></div>
        </div>

        <div class="activity__info">
          ${illustration ? `<div class="activity__illustration activity__reveal" id="exposure-illustration">${illustration}</div>` : ''}
          ${pinyin ? `<div class="activity__pinyin activity__reveal" id="exposure-pinyin">${pinyin}</div>` : ''}
          <div class="activity__meaning activity__reveal" id="exposure-meaning">${meaning}</div>
          ${example ? `
            <div class="activity__example activity__reveal" id="exposure-example">
              <span class="activity__example-zh">${example.zh}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="activity__actions">
        <button class="activity__skip" id="btn-skip">skip ›</button>
        <div class="activity__btn-row">
          <button class="btn btn--secondary activity__replay" id="btn-replay" style="visibility: hidden;">
            ↻ Replay
          </button>
          <button class="btn btn--primary activity__continue" id="btn-continue" style="visibility: hidden;">
            Continue
          </button>
        </div>
      </div>
    </div>
  `;

  // Grab all elements
  let writer = null;      // Single HanziWriter (single-char words)
  let writers = [];        // Array of HanziWriters (compound words)
  let playing = false; // Lock to prevent tap interruptions during sequence
  const target = container.querySelector('#hanzi-target');
  const charArea = container.querySelector('#exposure-char-area');
  const skipBtn = container.querySelector('#btn-skip');
  const replayBtn = container.querySelector('#btn-replay');
  const continueBtn = container.querySelector('#btn-continue');
  const illustrationEl = container.querySelector('#exposure-illustration');
  const pinyinEl = container.querySelector('#exposure-pinyin');
  const meaningEl = container.querySelector('#exposure-meaning');
  const exampleEl = container.querySelector('#exposure-example');

  let aborted = false; // Set to true when leaving this activity

  /** Stop all audio and abort any running sequences */
  function abort() {
    aborted = true;
    playing = false;
    window.speechSynthesis?.cancel();
  }

  /** Show an element with fade-in + sound (skips if already visible) */
  function reveal(el, sound = true) {
    if (!el) return;
    if (el.classList.contains('activity__reveal--visible')) return; // already shown
    el.classList.add('activity__reveal--visible');
    if (sound) playPop();
  }

  /** Show all elements instantly (no sound, no animation) */
  function revealAll() {
    [illustrationEl, pinyinEl, meaningEl, exampleEl].forEach(el => {
      if (el) el.classList.add('activity__reveal--visible');
    });
  }

  /** Hide all info elements */
  function hideAll() {
    [illustrationEl, pinyinEl, meaningEl, exampleEl].forEach(el => {
      if (el) el.classList.remove('activity__reveal--visible');
    });
  }

  /** Highlight an element briefly */
  function highlight(el) {
    if (!el) return;
    el.classList.add('activity__highlight');
    setTimeout(() => el.classList.remove('activity__highlight'), 1500);
  }

  /** Show buttons and hide skip */
  function showButtons() {
    if (skipBtn) skipBtn.style.visibility = 'hidden';
    if (replayBtn) {
      replayBtn.style.visibility = 'visible';
      replayBtn.style.opacity = '1';
    }
    if (continueBtn) {
      continueBtn.style.visibility = 'visible';
      continueBtn.style.opacity = '1';
    }
  }

  /** Skip: stop playback, reveal everything, show buttons.
   *  If already stopped (buttons visible), acts as Continue. */
  function skipSequence() {
    if (!playing) {
      // Already stopped — treat as Continue
      abort();
      if (writer) { try { writer.hideCharacter(); } catch {} }
      writers.forEach(w => { if (w) try { w.hideCharacter(); } catch {} });
      onComplete();
      return;
    }
    window.speechSynthesis?.cancel();
    playing = false;
    // Show the character(s) immediately
    if (writer) { try { writer.showCharacter(); } catch {} }
    writers.forEach(w => { if (w) try { w.showCharacter(); } catch {} });
    revealAll();
    showButtons();
  }

  /** Animate a single HanziWriter: hide → animate → show + chime */
  async function animateOneWriter(w) {
    if (!w) return;
    w.hideCharacter();
    await new Promise(resolve => {
      w.animateCharacter({
        onComplete: () => {
          w.showCharacter();
          resolve();
        }
      });
    });
  }

  /** Animate character: say word, draw strokes, say word again. */
  async function playCharacterAnimation() {
    window.speechSynthesis?.cancel();

    if (writers.length > 0) {
      // Compound word: say it, draw each char + say it individually, then say whole word
      await speakChinese(word.character, 0.5);
      if (aborted) return;
      await new Promise(r => setTimeout(r, 150));
      if (aborted) return;

      const chars = word.character.split('');
      for (let i = 0; i < writers.length; i++) {
        if (aborted) return;
        await animateOneWriter(writers[i]);
        if (aborted) return;
        await speakChinese(chars[i], 0.5);
        if (aborted) return;
        await new Promise(r => setTimeout(r, 100));
        if (aborted) return;
      }
      if (!aborted) playChime();
      charArea.classList.remove('activity__character-area--pop');
      void charArea.offsetWidth;
      charArea.classList.add('activity__character-area--pop');
      if (aborted) return;

      await new Promise(r => setTimeout(r, 150));
      if (aborted) return;
      await speakChinese(word.character, 0.5);
    } else if (writer) {
      await speakChinese(word.character, 0.5);
      if (aborted) return;
      await new Promise(r => setTimeout(r, 150));
      if (aborted) return;

      await animateOneWriter(writer);
      if (!aborted) playChime();
      charArea.classList.remove('activity__character-area--pop');
      void charArea.offsetWidth;
      charArea.classList.add('activity__character-area--pop');
      if (aborted) return;

      await new Promise(r => setTimeout(r, 150));
      if (aborted) return;
      await speakChinese(word.character, 0.5);
    } else {
      await speakChinese(word.character, 0.5);
    }
  }

  /**
   * Full narrated sequence — reveals each part as narrator reads it.
   * @param {boolean} hideFirst - Whether to hide all parts first (initial load)
   */
  async function runNarratedSequence(hideFirst) {
    if (playing) return; // Prevent overlapping sequences
    playing = true;
    window.speechSynthesis?.cancel();

    if (hideFirst) {
      hideAll();
      if (replayBtn) replayBtn.style.visibility = 'hidden';
      if (continueBtn) continueBtn.style.visibility = 'hidden';
    }

    try {
      // 1. Character animation (say → draw → say again)
      await playCharacterAnimation();
      if (aborted) return;

      // 2. Reveal illustration
      reveal(illustrationEl);
      await new Promise(r => setTimeout(r, 150));
      if (aborted) return;

      // 3. Reveal pinyin + meaning, speak meaning
      playWhoosh();
      reveal(pinyinEl, false);
      reveal(meaningEl, false);
      highlight(meaningEl);
      if (spokenMeaning) {
        await speakEnglish(spokenMeaning);
        if (aborted) return;
      }

      // 4. Reveal example, speak it
      if (example?.zh) {
        await new Promise(r => setTimeout(r, 200));
        if (aborted) return;
        reveal(exampleEl);
        highlight(exampleEl);
        await speakChinese(example.zh, 0.6);
        if (aborted) return;
      }

      showButtons();
    } finally {
      playing = false;
    }
  }

  // --- Setup HanziWriter ---
  if (word.character.length > 1) {
    // Compound word: create a HanziWriter for each character side by side
    target.innerHTML = `<div class="activity__compound-writers">${
      word.character.split('').map((_, i) => `<div id="hanzi-compound-${i}"></div>`).join('')
    }</div>`;
    const charSize = word.character.length <= 2 ? 160 : word.character.length <= 3 ? 120 : 100;
    word.character.split('').forEach((ch, i) => {
      try {
        const w = HanziWriter.create(target.querySelector(`#hanzi-compound-${i}`), ch, {
          width: charSize,
          height: charSize,
          padding: 5,
          strokeAnimationSpeed: 2.0,
          delayBetweenStrokes: 60,
          strokeColor: '#2D3436',
          radicalColor: '#2D3436',
          showOutline: true,
          showCharacter: false,
        });
        writers.push(w);
      } catch (err) {
        console.error('HanziWriter error for', ch, err);
        target.querySelector(`#hanzi-compound-${i}`).innerHTML =
          `<span class="activity__fallback-char" style="font-size:${charSize * 0.6}px">${ch}</span>`;
        writers.push(null);
      }
    });
  } else if (word.hasStrokeData !== false) {
    try {
      writer = HanziWriter.create(target, word.character, {
        width: 220,
        height: 220,
        padding: 10,
        strokeAnimationSpeed: 1.5,
        delayBetweenStrokes: 100,
        strokeColor: '#2D3436',
        radicalColor: '#2D3436',
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

  // --- Tap handlers (blocked during initial sequence) ---

  // Tap character → say + draw + say
  charArea.addEventListener('click', () => {
    if (playing) return;
    playCharacterAnimation();
  });

  // Tap pinyin → say character
  if (pinyinEl) {
    pinyinEl.addEventListener('click', (e) => {
      if (playing) return;
      e.stopPropagation();
      window.speechSynthesis?.cancel();
      highlight(pinyinEl);
      speakChinese(word.character, 0.5);
    });
  }

  // Tap meaning → say character
  if (meaningEl) {
    meaningEl.addEventListener('click', (e) => {
      if (playing) return;
      e.stopPropagation();
      window.speechSynthesis?.cancel();
      highlight(meaningEl);
      speakChinese(word.character, 0.5);
    });
  }

  // Tap example → say example Chinese + English
  if (exampleEl) {
    exampleEl.addEventListener('click', async (e) => {
      if (playing) return;
      e.stopPropagation();
      window.speechSynthesis?.cancel();
      highlight(exampleEl);
      if (word.example?.zh) {
        await speakChinese(word.example.zh, 0.6);
      }
    });
  }

  // Expose abort so parent (session.js) can stop audio on navigation
  container._abortExposure = abort;

  // --- Auto-play on load ---
  setTimeout(() => runNarratedSequence(true), 200);

  // Skip — tap to jump past the narrated sequence
  skipBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    skipSequence();
  });

  // Replay — replay full narration, keep buttons
  replayBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (playing) return;
    playClick();
    runNarratedSequence(false);
  });

  // Continue — always works, even during playback
  continueBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    playClick();
    abort();
    if (writer) { try { writer.hideCharacter(); } catch {} }
    writers.forEach(w => { if (w) try { w.hideCharacter(); } catch {} });
    onComplete();
  });
}
