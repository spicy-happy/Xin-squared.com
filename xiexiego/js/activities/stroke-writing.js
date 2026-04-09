/**
 * Stroke Writing Activity — 4 difficulty modes:
 *   1. guided:     Outline + highlighted next stroke, trace stroke by stroke
 *   2. outline:    Outline only, write with no guide strokes
 *   3. flash:      Flash the character briefly, then write from memory
 *   4. memory:     Hear it, write from scratch (no visual help)
 *
 * For compound words, all characters shown side by side,
 * one active writing area at a time.
 */

import { speakChinese, speakEnglish } from '../enrichment.js';
import { playSparkle, playChime, playClick } from '../sounds.js';

function formatMeaning(m) {
  return (m || '').replace(/\s*\/\s*/g, ' or ');
}

/**
 * Pick writing mode based on Leitner box.
 */
function pickMode(word) {
  const box = word.box || 1;
  if (box <= 1) return 'guided';
  if (box <= 2) return 'outline';
  if (box <= 3) return 'flash';
  // Memory mode requires box 5 — kids need lots of practice before
  // writing with zero visual help. Box 4 still gets flash mode.
  if (box <= 4) return 'flash';
  return 'memory';
}

/**
 * Render the stroke writing activity.
 */
export async function renderStrokeWriting(container, word, distractors, onResult) {
  const mode = pickMode(word);
  const meaning = formatMeaning(word.meaning || word.meanings?.[0] || '');
  const chars = word.character.split('');
  const isCompound = chars.length > 1;
  let totalMistakes = 0;
  let aborted = false;
  let resolved = false;

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
    flash: 'Write from memory',
    memory: 'Write from memory',
  };

  container.innerHTML = `
    <div class="activity activity--stroke">
      <div class="activity__body">
        <p class="quiz__instruction">${modeLabels[mode]}</p>
        <button class="quiz__speaker quiz__speaker--small" id="stroke-speaker">
          <svg class="quiz__speaker-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        </button>
        ${meaning && mode !== 'memory' ? `<p class="stroke__meaning">${meaning}</p>` : ''}
        <div class="stroke__area" id="stroke-area">
          ${chars.map((_, i) => `
            <div class="stroke__slot ${i === 0 ? 'stroke__slot--active' : ''}" id="stroke-slot-${i}">
              <div id="stroke-writer-${i}" class="stroke__writer"></div>
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
        <div class="quiz__feedback" id="stroke-feedback"></div>
      </div>
    </div>
  `;

  container._abortExposure = abort;

  const speakerBtn = container.querySelector('#stroke-speaker');
  const feedbackEl = container.querySelector('#stroke-feedback');
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
      // Update drawing color on all writers
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

  // HanziWriter quiz options per mode
  const quizOpts = {
    guided: {
      showOutline: true,
      showCharacter: true,
      showHintAfterMisses: 0, // Always show the blue next-stroke hint
      highlightOnComplete: true,
      leniency: 1.5,
      strokeHighlightSpeed: 0.5,
    },
    outline: {
      showOutline: true,
      showCharacter: false,
      showHintAfterMisses: 3,
      highlightOnComplete: true,
      leniency: 1.2,
    },
    flash: {
      showOutline: true,
      showCharacter: false,
      showHintAfterMisses: 3,
      highlightOnComplete: true,
      leniency: 1.0,
    },
    memory: {
      // Show outline so the screen is never blank — kid still needs
      // to recall stroke order but has the shape as a guide
      showOutline: true,
      showCharacter: false,
      showHintAfterMisses: 3,
      highlightOnComplete: true,
      leniency: 1.0,
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

  // Guided mode: character stays visible (showCharacter: true),
  // no need for a show/hide dance — just go straight to quiz.

  // Flash mode: show character briefly then hide
  if (mode === 'flash') {
    writers.forEach(w => { if (w) w.showCharacter(); });
    await new Promise(r => setTimeout(r, 2000));
    if (aborted) return;
    writers.forEach(w => { if (w) w.hideCharacter(); });
    await new Promise(r => setTimeout(r, 300));
    if (aborted) return;
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
        onMistake: () => {
          totalMistakes++;
        },
        onComplete: () => {
          resolve();
        }
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
  resolved = true;

  // Mark all slots done
  container.querySelectorAll('.stroke__slot').forEach(slot => {
    slot.classList.remove('stroke__slot--active');
    slot.classList.add('stroke__slot--done');
  });

  // Celebration
  playSparkle();
  feedbackEl.textContent = totalMistakes === 0 ? 'Perfect!' : 'Well done!';

  await new Promise(r => setTimeout(r, 400));
  if (!aborted) await speakChinese(word.character, 0.5);
  await new Promise(r => setTimeout(r, 1200));
  if (!aborted) onResult({ correct: totalMistakes === 0, attempts: totalMistakes });
}
