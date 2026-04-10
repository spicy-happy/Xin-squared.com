/**
 * Writing Activities — Phase 11
 * Four writing modes, each exported as a separate renderer:
 *   1. renderStrokeWriting  — Guided: outline + highlighted next stroke (Stage 3)
 *   2. renderFreeTrace      — Outline only, write freely (Stage 3-4)
 *   3. renderFlashWrite     — Flash character with stroke animation, write from memory (Stage 4)
 *   4. renderFreeWrite      — Audio only, blank canvas dictation (Stage 4-5)
 *
 * All renderers share the signature:
 *   (container, word, distractors, onResult, level)
 * where level (1-4) adjusts HanziWriter leniency and hint thresholds per spec Section 9.
 */

import { speakChinese } from '../enrichment.js';
import { playSparkle, playChime, playClick } from '../sounds.js';

function formatMeaning(m) {
  return (m || '').replace(/\s*\/\s*/g, ' or ');
}

/** Level-specific HanziWriter settings per spec Section 9. */
const LEVEL_SETTINGS = {
  1: { leniency: 1.5, hintAfterMisses: 2 },
  2: { leniency: 1.4, hintAfterMisses: 2 },
  3: { leniency: 1.3, hintAfterMisses: 3 },
  4: { leniency: 1.2, hintAfterMisses: 3 },
};

/** Pass criteria per mode (max mistakes to count as correct). */
const PASS_CRITERIA = {
  guided: 3,   // Stroke tracing: ≤3 mistakes
  outline: 2,  // Free trace: ≤2 mistakes, no hints
  flash: 2,    // Flash and write: ≤2 mistakes
  memory: 1,   // Free write: ≤1 mistake, no hints
};

/**
 * Core writing activity renderer shared by all modes.
 */
async function renderWrite(container, word, mode, level, onResult) {
  const lvl = LEVEL_SETTINGS[level] || LEVEL_SETTINGS[2];
  const meaning = formatMeaning(word.meaning || word.meanings?.[0] || '');
  const chars = word.character.split('');
  const isCompound = chars.length > 1;
  let totalMistakes = 0;
  let hintUsed = false;
  let aborted = false;

  function abort() {
    aborted = true;
    window.speechSynthesis?.cancel();
  }

  // Sizing
  const singleSize = 280;
  const compoundSize = chars.length <= 2 ? 180 : chars.length <= 3 ? 140 : 110;
  const writerSize = isCompound ? compoundSize : singleSize;

  const modeLabels = {
    guided: 'Trace the strokes',
    outline: 'Write the character',
    flash: 'Watch, then write!',
    memory: 'Listen and write',
  };

  // Memory mode: no meaning shown — audio only per spec
  const showMeaning = mode !== 'memory' && meaning;

  container.innerHTML = `
    <div class="activity activity--stroke">
      <div class="activity__body">
        <p class="quiz__instruction">${modeLabels[mode]}</p>
        <button class="quiz__speaker quiz__speaker--small" id="stroke-speaker">
          <svg class="quiz__speaker-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        </button>
        ${showMeaning ? `<p class="stroke__meaning">${meaning}</p>` : ''}
        <div class="stroke__area" id="stroke-area">
          ${chars.map((_, i) => `
            <div class="stroke__slot ${i === 0 ? 'stroke__slot--active' : ''}" id="stroke-slot-${i}">
              <div id="stroke-writer-${i}" class="stroke__writer stroke__writer--grid"></div>
            </div>
          `).join('')}
        </div>
        <div class="stroke__progress" id="stroke-progress">
          ${isCompound ? chars.map((_, i) => `<span class="stroke__dot" id="stroke-dot-${i}"></span>`).join('') : ''}
        </div>
        <div class="stroke__pencils" id="stroke-pencils">
          ${['#2D3436','#E53935','#E91E63','#4CAF50','#FF9800','#9C27B0'].map((c, i) => `
            <button class="stroke__pencil ${i === 0 ? 'stroke__pencil--selected' : ''}" data-color="${c}" style="background:${c}"></button>
          `).join('')}
        </div>
        ${mode === 'memory' ? `
          <button class="btn btn--secondary stroke__hint-btn" id="stroke-hint">
            Show hint
          </button>
        ` : ''}
        <div class="quiz__feedback" id="stroke-feedback"></div>
      </div>
    </div>
  `;

  container._abortExposure = abort;

  const speakerBtn = container.querySelector('#stroke-speaker');
  const feedbackEl = container.querySelector('#stroke-feedback');
  const hintBtn = container.querySelector('#stroke-hint');
  let drawingColor = '#2D3436';

  // Speaker button
  speakerBtn.addEventListener('click', () => {
    if (aborted) return;
    playClick();
    window.speechSynthesis?.cancel();
    speakChinese(word.character, 0.5);
  });

  // Pencil color picker
  const pencilBtns = container.querySelectorAll('.stroke__pencil');
  pencilBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      drawingColor = btn.dataset.color;
      pencilBtns.forEach(b => b.classList.remove('stroke__pencil--selected'));
      btn.classList.add('stroke__pencil--selected');
      playClick();
      writers.forEach(w => {
        if (w) {
          try { w.updateColor('drawingColor', drawingColor); } catch {}
        }
      });
    });
  });

  // Say the word on load
  setTimeout(() => {
    if (!aborted) speakChinese(word.character, 0.5);
  }, 300);

  // HanziWriter quiz options per mode, adjusted for level
  const quizOpts = {
    guided: {
      showOutline: true,
      showCharacter: true,
      showHintAfterMisses: 0, // Always show blue next-stroke hint
      highlightOnComplete: true,
      leniency: lvl.leniency,
      strokeHighlightSpeed: 0.5,
    },
    outline: {
      showOutline: true,
      showCharacter: false,
      showHintAfterMisses: lvl.hintAfterMisses,
      highlightOnComplete: true,
      leniency: lvl.leniency,
    },
    flash: {
      // Per spec: showOutline: false after flash — kid writes on blank canvas
      showOutline: false,
      showCharacter: false,
      showHintAfterMisses: lvl.hintAfterMisses,
      highlightOnComplete: true,
      leniency: lvl.leniency,
    },
    memory: {
      // Per spec: completely blank canvas with only grid
      showOutline: false,
      showCharacter: false,
      showHintAfterMisses: lvl.hintAfterMisses,
      highlightOnComplete: true,
      leniency: lvl.leniency,
    },
  };

  const opts = quizOpts[mode];

  // Create HanziWriter instances
  const writers = [];
  for (let i = 0; i < chars.length; i++) {
    try {
      const w = HanziWriter.create(
        container.querySelector(`#stroke-writer-${i}`),
        chars[i],
        {
          width: writerSize,
          height: writerSize,
          padding: 10,
          showOutline: opts.showOutline,
          showCharacter: opts.showCharacter,
          strokeColor: '#2D3436',
          radicalColor: '#2D3436',
          highlightColor: '#4A90D9',
          drawingColor: drawingColor,
          drawingWidth: 30,
          showHintAfterMisses: opts.showHintAfterMisses,
          highlightOnComplete: opts.highlightOnComplete,
          strokeHighlightSpeed: opts.strokeHighlightSpeed || 1,
        }
      );
      writers.push(w);
    } catch (err) {
      console.error('HanziWriter error for', chars[i], err);
      writers.push(null);
    }
  }

  // Flash mode: animate stroke order, keep visible ~3s total, then hide
  if (mode === 'flash') {
    // Show character first, then animate stroke order
    writers.forEach(w => { if (w) w.showCharacter(); });
    const animations = writers.map(w => {
      if (!w) return Promise.resolve();
      return new Promise(resolve => {
        w.animateCharacter({ onComplete: resolve });
      });
    });
    await Promise.all(animations);
    if (aborted) return;

    // Brief pause after animation completes (~3s total display)
    await new Promise(r => setTimeout(r, 1000));
    if (aborted) return;

    // Hide character — canvas becomes blank (outline already off)
    writers.forEach(w => { if (w) w.hideCharacter(); });
    await new Promise(r => setTimeout(r, 300));
    if (aborted) return;
  }

  // Hint button for memory/dictation mode — reveals outline briefly
  if (hintBtn) {
    hintBtn.addEventListener('click', () => {
      if (aborted) return;
      hintUsed = true;
      playClick();
      writers.forEach(w => { if (w) w.showOutline(); });
      hintBtn.disabled = true;
      hintBtn.textContent = 'Hint used';
      setTimeout(() => {
        if (!aborted) writers.forEach(w => { if (w) w.hideOutline(); });
      }, 1500);
    });
  }

  // Quiz each character sequentially
  for (let i = 0; i < chars.length; i++) {
    if (aborted) return;
    const w = writers[i];

    // Highlight active slot
    container.querySelectorAll('.stroke__slot').forEach((slot, j) => {
      slot.classList.toggle('stroke__slot--active', j === i);
      slot.classList.toggle('stroke__slot--done', j < i);
    });

    if (!w) {
      const dot = container.querySelector(`#stroke-dot-${i}`);
      if (dot) dot.classList.add('stroke__dot--done');
      continue;
    }

    // Run HanziWriter quiz for this character
    await new Promise((resolve) => {
      w.quiz({
        onMistake: () => { totalMistakes++; },
        onComplete: () => { resolve(); }
      });
    });

    if (aborted) return;

    // Mark this character done
    const dot = container.querySelector(`#stroke-dot-${i}`);
    if (dot) dot.classList.add('stroke__dot--done');
    playChime();

    // For compounds, say the individual character
    if (isCompound) {
      await speakChinese(chars[i], 0.5);
      if (aborted) return;
      await new Promise(r => setTimeout(r, 200));
      if (aborted) return;
    }
  }

  if (aborted) return;

  // Mark all slots done
  container.querySelectorAll('.stroke__slot').forEach(slot => {
    slot.classList.remove('stroke__slot--active');
    slot.classList.add('stroke__slot--done');
  });

  // Determine pass based on mode-specific criteria
  const maxMistakes = PASS_CRITERIA[mode];
  const noHintRequired = mode === 'outline' || mode === 'memory';
  const passed = totalMistakes <= maxMistakes && (!noHintRequired || !hintUsed);

  // Feedback
  playSparkle();
  if (passed && totalMistakes === 0) {
    feedbackEl.textContent = 'Perfect!';
  } else if (passed) {
    feedbackEl.textContent = 'Well done!';
  } else {
    feedbackEl.textContent = 'Good effort! Keep practicing!';
  }

  await new Promise(r => setTimeout(r, 400));
  if (!aborted) await speakChinese(word.character, 0.5);
  await new Promise(r => setTimeout(r, 1200));
  if (!aborted) onResult({ correct: passed, attempts: totalMistakes });
}

// --- Exported renderers ---
// All share (container, word, distractors, onResult, level) signature.
// distractors is unused by writing activities but kept for uniform interface.

/** Guided stroke tracing — Stage 3. Outline + next-stroke highlight. */
export async function renderStrokeWriting(container, word, distractors, onResult, level) {
  return renderWrite(container, word, 'guided', level || 2, onResult);
}

/** Free trace — Stage 3-4. Faded outline only, no stroke highlighting. */
export async function renderFreeTrace(container, word, distractors, onResult, level) {
  return renderWrite(container, word, 'outline', level || 2, onResult);
}

/** Flash and write — Stage 4. Animated stroke order for 3s, then write from memory. */
export async function renderFlashWrite(container, word, distractors, onResult, level) {
  return renderWrite(container, word, 'flash', level || 2, onResult);
}

/** Free write / dictation — Stage 4-5. Audio only, blank canvas with hint button. */
export async function renderFreeWrite(container, word, distractors, onResult, level) {
  return renderWrite(container, word, 'memory', level || 2, onResult);
}
