/**
 * Compound Discovery Activity — Phase 14
 * Triggered when a new 2-character compound word has both components
 * already at Box 2+ in the profile. Shows components side-by-side,
 * then animates them snapping together into the compound.
 */

import { speakChinese, speakEnglish } from '../enrichment.js';
import { playPop, playChime, playWhoosh, playClick } from '../sounds.js';
import { t } from '../i18n.js';

/**
 * Render compound discovery for a 2-char word.
 * @param {HTMLElement} container
 * @param {Object} word - The compound word (e.g. 学校)
 * @param {Object} comp1 - First component word object (e.g. 学)
 * @param {Object} comp2 - Second component word object (e.g. 校)
 * @param {Function} onComplete - Called when activity finishes
 */
export async function renderCompoundDiscovery(container, word, comp1, comp2, onComplete) {
  const meaning = word.meaning || word.meanings?.[0] || '';
  const m1 = comp1.meaning || comp1.meanings?.[0] || '';
  const m2 = comp2.meaning || comp2.meanings?.[0] || '';

  container.innerHTML = `
    <div class="activity activity--compound">
      <div class="compound__stage" id="compound-stage">
        <div class="compound__parts">
          <div class="compound__part compound__part--left" id="part-left">
            <span class="compound__char">${comp1.character}</span>
            <span class="compound__meaning" id="meaning-left">${m1}</span>
          </div>
          <div class="compound__plus" id="compound-plus">+</div>
          <div class="compound__part compound__part--right" id="part-right">
            <span class="compound__char">${comp2.character}</span>
            <span class="compound__meaning" id="meaning-right">${m2}</span>
          </div>
        </div>
        <div class="compound__result" id="compound-result" style="opacity: 0;">
          <span class="compound__result-char">${word.character}</span>
          <span class="compound__result-meaning">${meaning}</span>
        </div>
      </div>

      <div class="activity__actions">
        <button class="activity__skip" id="btn-skip">${t('activity.skip')}</button>
        <button class="btn btn--primary activity__continue" id="btn-continue" style="visibility: hidden;">
          ${t('activity.continue')}
        </button>
      </div>
    </div>
  `;

  let aborted = false;
  const skipBtn = container.querySelector('#btn-skip');
  const continueBtn = container.querySelector('#btn-continue');
  const partLeft = container.querySelector('#part-left');
  const partRight = container.querySelector('#part-right');
  const plusSign = container.querySelector('#compound-plus');
  const resultEl = container.querySelector('#compound-result');

  function abort() { aborted = true; window.speechSynthesis?.cancel(); }
  container._abortExposure = abort;

  async function runSequence() {
    // 1. Say first component + meaning
    partLeft.classList.add('compound__part--glow');
    await speakChinese(comp1.character, 0.5);
    if (aborted) return;
    await new Promise(r => setTimeout(r, 300));
    if (aborted) return;
    await speakEnglish(m1);
    if (aborted) return;
    await new Promise(r => setTimeout(r, 400));
    if (aborted) return;

    // 2. Say second component + meaning
    partLeft.classList.remove('compound__part--glow');
    partRight.classList.add('compound__part--glow');
    await speakChinese(comp2.character, 0.5);
    if (aborted) return;
    await new Promise(r => setTimeout(r, 300));
    if (aborted) return;
    await speakEnglish(m2);
    if (aborted) return;
    await new Promise(r => setTimeout(r, 600));
    if (aborted) return;

    // 3. Animate parts snapping together
    partRight.classList.remove('compound__part--glow');
    plusSign.style.opacity = '0';
    partLeft.classList.add('compound__part--merge-left');
    partRight.classList.add('compound__part--merge-right');
    playWhoosh();
    await new Promise(r => setTimeout(r, 500));
    if (aborted) return;

    // 4. Hide parts, show result
    partLeft.style.opacity = '0';
    partRight.style.opacity = '0';
    plusSign.style.display = 'none';
    resultEl.style.opacity = '1';
    resultEl.classList.add('compound__result--pop');
    playChime();

    await new Promise(r => setTimeout(r, 300));
    if (aborted) return;

    // 5. Say the compound word + meaning
    await speakChinese(word.character, 0.5);
    if (aborted) return;
    await new Promise(r => setTimeout(r, 300));
    if (aborted) return;
    await speakEnglish(meaning);
    if (aborted) return;

    // Show continue
    if (skipBtn) skipBtn.style.visibility = 'hidden';
    continueBtn.style.visibility = 'visible';
    continueBtn.style.opacity = '1';
  }

  skipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    playClick();
    window.speechSynthesis?.cancel();
    // Show everything immediately
    plusSign.style.display = 'none';
    partLeft.style.opacity = '0';
    partRight.style.opacity = '0';
    resultEl.style.opacity = '1';
    skipBtn.style.visibility = 'hidden';
    continueBtn.style.visibility = 'visible';
    continueBtn.style.opacity = '1';
    aborted = true;
  });

  continueBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    playClick();
    abort();
    onComplete();
  });

  setTimeout(() => runSequence(), 300);
}
