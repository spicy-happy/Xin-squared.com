/**
 * Word Bank Editor — parent-facing word list management.
 * Views: list, add (textarea), add-confirm, detail.
 */

import { enrichCharacter, parseAndEnrich } from '../enrichment.js';

/** Strip tone marks from pinyin to get plain letter for sorting/grouping. */
function pinyinToLetter(p) {
  if (!p) return '';
  const stripped = p.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]/g, '');
  return stripped.charAt(0).toUpperCase();
}

const MASTERY = {
  1: { label: 'Learning', color: '#FF9800', cls: 'mastery--learning' },
  2: { label: 'Practicing', color: '#4A90D9', cls: 'mastery--practicing' },
  3: { label: 'Mastered', color: '#4CAF50', cls: 'mastery--mastered' },
};

// ─── Toast helper (footer banner with undo + dismiss) ───
let toastTimer = null;
function showToast(message, undoFn) {
  clearTimeout(toastTimer);
  document.querySelector('.toast')?.remove();

  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `
    <span class="toast__message">${message}</span>
    ${undoFn ? '<button class="toast__undo">Undo</button>' : ''}
    <button class="toast__dismiss">×</button>
  `;
  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.add('toast--visible');
    // Bump fixed bottom elements above the toast
    const toastH = el.offsetHeight;
    document.querySelectorAll('.word-editor__bottom').forEach(b => {
      b.style.transition = 'bottom 0.25s ease';
      b.style.bottom = toastH + 'px';
    });
    // Add bottom padding to page so content isn't hidden behind toast + button
    const screen = document.querySelector('.screen');
    if (screen) screen.style.paddingBottom = (toastH + 80) + 'px';
  });

  const dismiss = () => {
    el.classList.remove('toast--visible');
    document.querySelectorAll('.word-editor__bottom').forEach(b => {
      b.style.bottom = '';
      b.style.transition = '';
    });
    const screen = document.querySelector('.screen');
    if (screen) screen.style.paddingBottom = '';
    setTimeout(() => el.remove(), 300);
  };

  el.querySelector('.toast__dismiss').addEventListener('click', dismiss);

  if (undoFn) {
    el.querySelector('.toast__undo').addEventListener('click', () => {
      undoFn();
      dismiss();
    });
  }

  toastTimer = setTimeout(dismiss, 10000);
}

export function renderWordEditor(app, storage, navigate) {
  const profileId = storage.getActiveProfileId();
  const profile = storage.getProfile(profileId);
  if (!profile) { navigate('profiles'); return; }

  let view = 'list';
  let addInput = '';
  let enrichedQueue = [];    // main words to add
  let componentMap = {};     // compound char → array of enriched component words
  let isEnriching = false;
  let duplicates = [];
  let detailChar = null;

  function render() {
    switch (view) {
      case 'add': renderAddInputView(); break;
      case 'add-confirm': renderAddConfirmView(); break;
      case 'detail': renderDetailView(); break;
      default: renderListView(); break;
    }
  }

  // ─── LIST VIEW ───

  function renderListView() {
    const p = storage.getProfile(profileId);
    const words = p.wordBank || [];

    // Sort: starred first (alphabetical), then rest alphabetical by pinyin
    const sortByPinyin = (a, b) => pinyinToLetter(a.pinyinMarked || a.pinyin).localeCompare(pinyinToLetter(b.pinyinMarked || b.pinyin))
      || (a.pinyinMarked || a.pinyin || '').localeCompare(b.pinyinMarked || b.pinyin || '');
    const now = Date.now();
    const starred = words.filter(w => w.starFlag && w.starFlag.expiresAt > now).sort(sortByPinyin);
    const unstarred = words.filter(w => !w.starFlag || w.starFlag.expiresAt <= now).sort(sortByPinyin);

    // Build alphabet index from all words (plain letters, no tone marks)
    const letters = [...new Set(words.map(w => pinyinToLetter(w.pinyinMarked || w.pinyin)).filter(Boolean))].sort();

    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-back">←</button>
          <div class="word-editor__profile">
            <span class="word-editor__avatar">${p.avatar}</span>
            <span class="word-editor__name">${p.name}'s Words</span>
          </div>
          <span class="word-editor__count">${words.length}</span>
        </div>

        ${words.length === 0 ? `
          <div class="empty-state" style="padding-top: var(--space-2xl);">
            <div class="empty-state__emoji">📝</div>
            <div class="empty-state__title">No words yet</div>
            <div class="empty-state__desc">Tap "+ Add Words" to get started.</div>
          </div>
        ` : `
          ${starred.length > 0 ? `
            <div class="word-list">
              <div class="word-list__section-label">★ Starred</div>
              ${starred.map(w => renderWordRow(w)).join('')}
            </div>
          ` : ''}

          ${letters.length > 3 ? `
            <div class="word-editor__alpha-jump">
              ${letters.map(l => `<button class="alpha-jump__letter" data-letter="${l}">${l}</button>`).join('')}
            </div>
          ` : ''}

          <div class="word-list">
            ${unstarred.map((w, i) => {
              const letter = pinyinToLetter(w.pinyinMarked || w.pinyin);
              const prev = i > 0 ? pinyinToLetter(unstarred[i-1].pinyinMarked || unstarred[i-1].pinyin) : '';
              const anchor = letter && letter !== prev ? `<div id="alpha-${letter}"></div>` : '';
              return anchor + renderWordRow(w);
            }).join('')}
          </div>
        `}

        <div class="word-editor__bottom">
          <button class="btn btn--primary word-editor__add-btn" id="btn-show-add">
            + Add Words
          </button>
        </div>

      </div>
    `;

    app.querySelector('#btn-back').addEventListener('click', () => navigate('session'));
    app.querySelector('#btn-show-add').addEventListener('click', () => {
      view = 'add'; addInput = ''; render();
    });

    // Alphabet jump
    app.querySelectorAll('.alpha-jump__letter').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(`alpha-${btn.dataset.letter}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });


    // Swipe + tap on word rows
    app.querySelectorAll('.word-row-wrap').forEach(wrap => {
      const row = wrap.querySelector('.word-row');
      const char = wrap.dataset.char;
      let startX = 0, startY = 0, currentX = 0, swiping = false;

      wrap.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        currentX = 0; swiping = false;
        row.style.transition = 'none';
      }, { passive: true });

      wrap.addEventListener('touchmove', (e) => {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        if (!swiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) swiping = true;
        if (swiping) {
          currentX = Math.max(-100, Math.min(100, dx));
          row.style.transform = `translateX(${currentX}px)`;
        }
      }, { passive: true });

      wrap.addEventListener('touchend', () => {
        row.style.transition = 'transform 0.2s ease';
        if (currentX < -60) {
          // Swipe left → delete with undo
          row.style.transform = 'translateX(-100%)';
          setTimeout(() => {
            const word = storage.getProfile(profileId).wordBank.find(w => w.character === char);
            storage.removeWordFromProfile(profileId, char);
            render();
            showToast(`Deleted ${char}`, () => {
              if (word) { storage.addWordsToProfile(profileId, [word]); render(); }
            });
          }, 200);
        } else if (currentX > 60) {
          // Swipe right → toggle star with undo
          const wasStarred = storage.getProfile(profileId).wordBank.find(w => w.character === char)?.starFlag;
          const isNowStarred = storage.toggleStarWord(profileId, char);
          row.style.transform = 'translateX(0)';
          render();
          showToast(isNowStarred ? `★ Starred ${char}` : `☆ Unstarred ${char}`, () => {
            storage.toggleStarWord(profileId, char);
            render();
          });
        } else if (!swiping) {
          detailChar = char; view = 'detail'; render();
        } else {
          row.style.transform = 'translateX(0)';
        }
      });

      wrap.addEventListener('click', () => {
        if (swiping) return;
        if (!('ontouchstart' in window)) { detailChar = char; view = 'detail'; render(); }
      });
    });
  }

  function renderWordRow(word) {
    const mastery = MASTERY[word.box] || MASTERY[1];
    const isStarred = word.starFlag && word.starFlag.expiresAt > Date.now();
    const pinyin = word.pinyinMarked || word.pinyin || '';
    const meaning = word.meaning || word.meanings?.[0] || '';

    return `
      <div class="word-row-wrap" data-char="${word.character}">
        <div class="word-row__action word-row__action--star">★ Star</div>
        <div class="word-row__action word-row__action--delete">Delete</div>
        <div class="word-row ${mastery.cls}">
          <span class="word-row__char">${word.character}</span>
          <span class="word-row__desc">${pinyin ? pinyin + ' · ' : ''}${meaning}</span>
          ${isStarred ? '<span class="word-row__star-icon">★</span>' : ''}
          <span class="word-row__chevron">›</span>
        </div>
      </div>
    `;
  }

  // ─── DETAIL VIEW ───

  function renderDetailView() {
    const p = storage.getProfile(profileId);
    const word = p.wordBank.find(w => w.character === detailChar);
    if (!word) { view = 'list'; render(); return; }

    const mastery = MASTERY[word.box] || MASTERY[1];
    const isStarred = word.starFlag && word.starFlag.expiresAt > Date.now();
    const defaultMeaning = word.meanings?.[0] || '';
    const defaultPinyin = word.pinyinMarked || '';
    const addedDate = word.addedAt ? new Date(word.addedAt).toLocaleDateString() : '';

    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-detail-back">←</button>
          <div class="word-editor__profile"></div>
          <div class="word-detail__top-actions">
            <button class="word-detail__action-btn ${isStarred ? 'word-detail__action-btn--star' : ''}" id="btn-detail-star">
              ${isStarred ? '★' : '☆'}
            </button>
            <button class="word-detail__action-btn word-detail__action-btn--delete" id="btn-detail-delete">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>

        <div class="word-detail">
          <div class="word-detail__char">${word.character}</div>

          <div class="word-detail__stats">
            <div class="word-detail__stat">
              <span class="word-detail__stat-value" style="color: ${mastery.color}">${mastery.label}</span>
              <span class="word-detail__stat-label">Status</span>
            </div>
            <div class="word-detail__stat">
              <span class="word-detail__stat-value">${addedDate}</span>
              <span class="word-detail__stat-label">Added</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-group__label">Definition</label>
            <div class="word-detail__input-row">
              <input class="form-group__input" id="edit-meaning" type="text"
                     value="${word.meaning || defaultMeaning}" autocomplete="off">
              ${defaultMeaning ? '<button class="word-detail__reset" id="btn-reset-meaning">↺</button>' : ''}
            </div>
          </div>

          <div class="form-group">
            <label class="form-group__label">Pinyin</label>
            <div class="word-detail__input-row">
              <input class="form-group__input" id="edit-pinyin" type="text"
                     value="${word.pinyinMarked || word.pinyin || ''}" autocomplete="off">
              ${defaultPinyin ? '<button class="word-detail__reset" id="btn-reset-pinyin">↺</button>' : ''}
            </div>
          </div>

          <div class="form-group">
            <label class="form-group__label">Example</label>
            <div class="word-detail__input-row">
              <input class="form-group__input" id="edit-example" type="text"
                     value="${word.example ? word.example.zh + ', ' + word.example.en : ''}"
                     placeholder="e.g. 大象, big elephant" autocomplete="off">
              ${word.example ? '<button class="word-detail__reset" id="btn-reset-example">↺</button>' : ''}
            </div>
          </div>

          ${word.character.length > 1 ? `
            <div class="word-detail__components">
              <label class="form-group__label">Characters in this word</label>
              <div class="word-detail__component-list">
                ${[...new Set(word.character)].map(c => {
                  const comp = p.wordBank.find(w => w.character === c);
                  return `<span class="word-detail__component ${comp ? 'word-detail__component--linked' : ''}"
                    ${comp ? `data-comp="${c}"` : ''}>${c}</span>`;
                }).join('')}
              </div>
            </div>
          ` : ''}

          ${word.radical || word.etymology?.hint ? `
            <div class="word-detail__meta">
              ${word.radical ? `<span>Radical: ${word.radical}</span>` : ''}
              ${word.strokeCount ? `<span>· ${word.strokeCount} strokes</span>` : ''}
              ${word.etymology?.hint ? `<span>· ${word.etymology.hint}</span>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;

    // Back — auto-save
    app.querySelector('#btn-detail-back').addEventListener('click', () => {
      saveDetailEdits();
      view = 'list'; render();
    });

    // Reset buttons
    app.querySelector('#btn-reset-meaning')?.addEventListener('click', () => {
      app.querySelector('#edit-meaning').value = defaultMeaning;
    });
    app.querySelector('#btn-reset-pinyin')?.addEventListener('click', () => {
      app.querySelector('#edit-pinyin').value = defaultPinyin;
    });

    // Reset example
    app.querySelector('#btn-reset-example')?.addEventListener('click', () => {
      const defaultEx = storage.getProfile(profileId)?.wordBank.find(w => w.character === detailChar)?.example?.zh || '';
      app.querySelector('#edit-example').value = defaultEx;
    });

    // Component word links
    app.querySelectorAll('[data-comp]').forEach(el => {
      el.addEventListener('click', () => {
        saveDetailEdits();
        detailChar = el.dataset.comp;
        render();
      });
    });

    // Star — instant with toast + undo
    app.querySelector('#btn-detail-star').addEventListener('click', () => {
      const isNowStarred = storage.toggleStarWord(profileId, detailChar);
      const btn = app.querySelector('#btn-detail-star');
      btn.textContent = isNowStarred ? '★' : '☆';
      btn.classList.toggle('word-detail__action-btn--star', isNowStarred);
      showToast(isNowStarred ? `★ Starred ${detailChar}` : `☆ Unstarred ${detailChar}`, () => {
        storage.toggleStarWord(profileId, detailChar);
        btn.textContent = isNowStarred ? '☆' : '★';
        btn.classList.toggle('word-detail__action-btn--star', !isNowStarred);
      });
    });

    // Delete — instant with toast + undo
    app.querySelector('#btn-detail-delete').addEventListener('click', () => {
      const wordCopy = { ...word };
      storage.removeWordFromProfile(profileId, detailChar);
      view = 'list'; render();
      showToast(`Deleted ${detailChar}`, () => {
        storage.addWordsToProfile(profileId, [wordCopy]);
        render();
      });
    });
  }

  function saveDetailEdits() {
    const meaningInput = app.querySelector('#edit-meaning');
    const pinyinInput = app.querySelector('#edit-pinyin');
    const exZh = app.querySelector('#edit-example-zh');
    const exEn = app.querySelector('#edit-example-en');
    if (!meaningInput || !pinyinInput) return;

    const updates = {};
    const meaning = meaningInput.value.trim();
    const pinyin = pinyinInput.value.trim();
    if (meaning) updates.meaning = meaning;
    if (pinyin) updates.pinyinMarked = pinyin;

    const exInput = app.querySelector('#edit-example');
    if (exInput) {
      const val = exInput.value.trim();
      if (val) {
        const commaIdx = val.indexOf(',');
        if (commaIdx > 0) {
          updates.example = { zh: val.slice(0, commaIdx).trim(), en: val.slice(commaIdx + 1).trim() };
        } else {
          updates.example = { zh: val, en: '' };
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      storage.updateWordInProfile(profileId, detailChar, updates);
    }
  }

  // ─── ADD INPUT VIEW (textarea) ───

  function renderAddInputView() {
    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-cancel-add">←</button>
          <div class="word-editor__profile">
            <span class="word-editor__name">Add Words</span>
          </div>
        </div>

        <div class="add-word-form">
          <p class="add-word-form__hint" style="margin-bottom: var(--space-md);">
            Type or paste Chinese characters. Put different words on separate lines. Compounds like 蝴蝶 are auto-detected.
          </p>
          <textarea class="add-word-form__textarea" id="add-input"
                    placeholder="e.g. 大山水学校蝴蝶" lang="zh">${addInput}</textarea>
        </div>

        <div style="margin-top: auto; padding: var(--space-md) 0 var(--space-xl);">
          <div class="onboarding__nav-row">
            <button class="btn btn--secondary" id="btn-cancel-add-bottom">Cancel</button>
            <button class="btn btn--primary" id="btn-next-add">Next</button>
          </div>
        </div>
      </div>
    `;

    app.querySelector('#add-input')?.focus();

    const cancelAdd = () => { view = 'list'; addInput = ''; render(); };
    app.querySelector('#btn-cancel-add').addEventListener('click', cancelAdd);
    app.querySelector('#btn-cancel-add-bottom').addEventListener('click', cancelAdd);

    app.querySelector('#btn-next-add').addEventListener('click', async () => {
      addInput = app.querySelector('#add-input').value;
      const hasCJK = [...addInput].some(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF);
      if (!hasCJK) return;

      const btn = app.querySelector('#btn-next-add');
      btn.textContent = 'Looking up...';
      btn.disabled = true;

      try {
        const results = await parseAndEnrich(addInput);
        const existing = new Set((storage.getProfile(profileId)?.wordBank || []).map(w => w.character));
        duplicates = results.filter(e => existing.has(e.character)).map(e => e.character);
        enrichedQueue = results
          .filter(e => !existing.has(e.character))
          .map(e => ({ ...e, meaning: e.meanings?.[0] || '' }));
      } catch (err) {
        console.error('Enrichment error:', err);
        enrichedQueue = [];
      }

      view = 'add-confirm';
      render();
    });
  }

  // ─── ADD CONFIRM VIEW ───

  function renderAddConfirmView() {
    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-back-to-input">←</button>
          <div class="word-editor__profile">
            <span class="word-editor__name">Confirm Words</span>
          </div>
        </div>

        ${enrichedQueue.length > 0 ? `
          <div class="add-word-form__queue">
            ${enrichedQueue.map((e, i) => `
              <div class="add-word-form__queue-item">
                <span class="add-word-form__queue-char">${e.character}</span>
                <span class="add-word-form__queue-desc">${e.pinyinMarked || ''} · ${e.meaning || '?'}</span>
                <button class="add-word-form__queue-remove" data-remove-idx="${i}">×</button>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="add-word-form__hint">No new words found.</div>
        `}

        ${duplicates.length > 0 ? `
          <div class="add-word-form__hint add-word-form__hint--warn">
            Already in list: ${duplicates.join(' ')}
          </div>
        ` : ''}

        <div style="margin-top: auto; padding: var(--space-md) 0 var(--space-xl);">
          <div class="onboarding__nav-row">
            <button class="btn btn--secondary" id="btn-back-to-input-bottom">Back</button>
            <button class="btn btn--primary" id="btn-confirm-add" ${enrichedQueue.length === 0 ? 'disabled' : ''}>
              Add ${enrichedQueue.length} word${enrichedQueue.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    `;

    // Back to textarea
    const backToInput = () => { view = 'add'; render(); };
    app.querySelector('#btn-back-to-input').addEventListener('click', backToInput);
    app.querySelector('#btn-back-to-input-bottom').addEventListener('click', backToInput);

    // Remove from queue
    app.querySelectorAll('[data-remove-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        enrichedQueue.splice(parseInt(btn.dataset.removeIdx), 1);
        render();
      });
    });

    // Confirm — also auto-add component characters for compounds
    app.querySelector('#btn-confirm-add')?.addEventListener('click', async () => {
      if (enrichedQueue.length === 0) return;

      const btn = app.querySelector('#btn-confirm-add');
      btn.disabled = true;
      btn.textContent = 'Adding...';

      // Collect component chars from compounds that aren't already in bank or queue
      const existing = new Set((storage.getProfile(profileId)?.wordBank || []).map(w => w.character));
      const queueChars = new Set(enrichedQueue.map(e => e.character));
      const componentChars = new Set();

      for (const word of enrichedQueue) {
        if (word.character.length > 1) {
          for (const c of word.character) {
            if (!existing.has(c) && !queueChars.has(c) && !componentChars.has(c)) {
              componentChars.add(c);
            }
          }
        }
      }

      // Enrich component characters and only add ones with their own distinct meaning
      let allWords = [...enrichedQueue];
      let addedComponents = 0;
      if (componentChars.size > 0) {
        try {
          const { enrichCharacters } = await import('../enrichment.js');
          const components = await enrichCharacters([...componentChars]);
          for (const comp of components) {
            const meaning = comp.meanings?.[0] || '';
            // Skip components with no useful meaning (e.g. 蝴 alone = useless)
            if (!meaning || meaning.length < 2) continue;
            // Skip if meaning is just a reference to the compound itself
            const compoundMeaning = enrichedQueue.find(e => e.character.includes(comp.character))?.meaning || '';
            if (meaning === compoundMeaning) continue;
            allWords.push({ ...comp, meaning });
            addedComponents++;
          }
        } catch (err) {
          console.error('Component enrichment error:', err);
        }
      }

      storage.addWordsToProfile(profileId, allWords);
      const count = allWords.length;
      showToast(`Added ${count} word${count !== 1 ? 's' : ''}${addedComponents > 0 ? ` (+${addedComponents} component${addedComponents !== 1 ? 's' : ''})` : ''}`);
      view = 'list'; enrichedQueue = []; addInput = '';
      render();
    });
  }

  render();
}
