/**
 * Matching Game — multi-word activity.
 * Shows 4 characters on the left and 4 meanings/pinyin on the right.
 * Kids tap a character then tap its match. Correct pairs disappear.
 *
 * Two modes: 'meaning' (match character → definition) and 'pinyin' (match character → pinyin).
 */

import { playSparkle, playBoop, playPop } from '../sounds.js';
import { t } from '../i18n.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatMeaning(m) {
  if (!m) return '?';
  // Shorten long meanings: take first part before semicolon
  const short = m.split(';')[0].split('/')[0].trim();
  return short || m;
}

/**
 * Render a matching game.
 * @param {HTMLElement} container
 * @param {Object[]} words - Array of 4 word objects (with character, meaning, pinyinMarked/pinyin)
 * @param {'meaning'|'pinyin'} mode - What to match against
 * @param {Function} onResult - Called with { correct, totalMistakes, responseTimeMs }
 */
function drawMatchLines(container) {
  const svg = container.querySelector('#matching-lines');
  const board = container.querySelector('#matching-board');
  if (!svg || !board) return;
  const boardRect = board.getBoundingClientRect();
  svg.setAttribute('width', boardRect.width);
  svg.setAttribute('height', boardRect.height);
  svg.style.width = boardRect.width + 'px';
  svg.style.height = boardRect.height + 'px';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.innerHTML = '';
  // Draw lines for matched pairs
  const matchedLeft = container.querySelectorAll('.matching__col--left .matching__tile--matched');
  matchedLeft.forEach(leftTile => {
    const idx = leftTile.dataset.idx;
    const rightTile = container.querySelector(`.matching__col--right .matching__tile--matched[data-idx="${idx}"]`);
    if (!rightTile) return;
    const lr = leftTile.getBoundingClientRect();
    const rr = rightTile.getBoundingClientRect();
    const x1 = lr.right - boardRect.left;
    const y1 = lr.top + lr.height / 2 - boardRect.top;
    const x2 = rr.left - boardRect.left;
    const y2 = rr.top + rr.height / 2 - boardRect.top;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    svg.appendChild(line);
  });
}

export function renderMatchingGame(container, words, mode, onResult) {
  const startTime = Date.now();
  let mistakes = 0;
  let matched = 0;
  let selected = null; // { side: 'left'|'right', index }
  let aborted = false;
  const total = words.length;

  // Build pairs
  const pairs = words.map((w, i) => ({
    id: i,
    character: w.character,
    match: mode === 'pinyin'
      ? (w.pinyinMarked || w.pinyin || '?')
      : formatMeaning(w.meaning || w.meanings?.[0] || '?'),
    matched: false,
  }));

  // Shuffle both sides independently
  const leftOrder = shuffle([...Array(total).keys()]);
  const rightOrder = shuffle([...Array(total).keys()]);

  function renderBoard() {
    const instruction = mode === 'pinyin'
      ? t('matching.matchPinyin')
      : t('matching.matchMeaning');

    container.innerHTML = `
      <div class="activity activity--matching">
        <div class="activity__body">
          <p class="matching__instruction">${instruction}</p>
          <div class="matching__board" id="matching-board">
            <div class="matching__col matching__col--left">
              ${leftOrder.map(idx => {
                const p = pairs[idx];
                return `
                  <button class="matching__tile matching__tile--char ${p.matched ? 'matching__tile--matched' : ''}"
                    data-side="left" data-idx="${idx}" ${p.matched ? 'disabled' : ''}>
                    ${p.character}
                  </button>
                `;
              }).join('')}
            </div>
            <svg class="matching__line" id="matching-lines"></svg>
            <div class="matching__col matching__col--right">
              ${rightOrder.map(idx => {
                const p = pairs[idx];
                return `
                  <button class="matching__tile matching__tile--text ${p.matched ? 'matching__tile--matched' : ''}"
                    data-side="right" data-idx="${idx}" ${p.matched ? 'disabled' : ''}>
                    ${p.match}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    // Draw lines between matched pairs
    requestAnimationFrame(() => drawMatchLines(container));

    container._abortExposure = () => { aborted = true; };

    // Attach click handlers
    container.querySelectorAll('.matching__tile:not([disabled])').forEach(tile => {
      tile.addEventListener('click', () => handleTap(tile));
    });

    // Re-apply selected state
    if (selected) {
      const sel = container.querySelector(
        `.matching__tile[data-side="${selected.side}"][data-idx="${selected.index}"]`
      );
      if (sel) sel.classList.add('matching__tile--selected');
    }
  }

  function handleTap(tile) {
    if (aborted) return;
    const side = tile.dataset.side;
    const idx = parseInt(tile.dataset.idx);

    if (!selected) {
      // First selection
      selected = { side, index: idx };
      tile.classList.add('matching__tile--selected');
      playPop();
      return;
    }

    if (selected.side === side) {
      // Same side — switch selection
      container.querySelectorAll('.matching__tile--selected').forEach(t => t.classList.remove('matching__tile--selected'));
      selected = { side, index: idx };
      tile.classList.add('matching__tile--selected');
      playPop();
      return;
    }

    // Different sides — check match
    const leftIdx = side === 'left' ? idx : selected.index;
    const rightIdx = side === 'right' ? idx : selected.index;

    if (leftIdx === rightIdx) {
      // Correct match!
      pairs[leftIdx].matched = true;
      matched++;
      playSparkle();
      selected = null;

      if (matched === total) {
        // All matched — brief pause then complete
        renderBoard();
        setTimeout(() => {
          if (!aborted) {
            onResult({
              correct: mistakes === 0,
              totalMistakes: mistakes,
              responseTimeMs: Date.now() - startTime,
            });
          }
        }, 600);
      } else {
        renderBoard();
      }
    } else {
      // Wrong match
      mistakes++;
      playBoop();

      // Flash wrong
      const leftTile = container.querySelector(`.matching__tile[data-side="left"][data-idx="${leftIdx}"]`);
      const rightTile = container.querySelector(`.matching__tile[data-side="right"][data-idx="${rightIdx}"]`);
      const selTile = container.querySelector(`.matching__tile[data-side="${selected.side}"][data-idx="${selected.index}"]`);

      [leftTile, rightTile, selTile].forEach(t => {
        if (t) {
          t.classList.add('matching__tile--wrong');
          t.classList.remove('matching__tile--selected');
        }
      });

      selected = null;

      setTimeout(() => {
        container.querySelectorAll('.matching__tile--wrong').forEach(t => t.classList.remove('matching__tile--wrong'));
      }, 500);
    }
  }

  renderBoard();
}
