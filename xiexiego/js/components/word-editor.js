/**
 * Word Bank Editor — parent-facing word list management.
 * Views: list, add (multi-char), detail (edit/star/delete per word).
 */

import { enrichCharacter, parseAndEnrich } from '../enrichment.js';

const MASTERY = {
  1: { label: 'Learning', color: '#FF9800', cls: 'mastery--learning' },
  2: { label: 'Practicing', color: '#4A90D9', cls: 'mastery--practicing' },
  3: { label: 'Mastered', color: '#4CAF50', cls: 'mastery--mastered' },
};

export function renderWordEditor(app, storage, navigate) {
  const profileId = storage.getActiveProfileId();
  const profile = storage.getProfile(profileId);
  if (!profile) { navigate('profiles'); return; }

  // View state: 'list' | 'add' | 'detail'
  let view = 'list';
  let addInput = '';
  let enrichedQueue = [];
  let isEnriching = false;
  let duplicates = [];
  let detailChar = null; // character being viewed/edited

  function render() {
    switch (view) {
      case 'add': renderAddView(); break;
      case 'detail': renderDetailView(); break;
      default: renderListView(); break;
    }
  }

  // ─── LIST VIEW ───

  function renderListView() {
    const p = storage.getProfile(profileId);
    const words = p.wordBank || [];

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
            <div class="empty-state__desc">Tap "+ Add Words" to add characters for practice.</div>
          </div>
        ` : `
          <div class="word-list">
            ${words.map(w => renderWordRow(w)).join('')}
          </div>
        `}

        <div class="word-editor__bottom">
          <button class="btn btn--primary word-editor__add-btn" id="btn-show-add">
            + Add Words
          </button>
        </div>
      </div>
    `;

    // Back
    app.querySelector('#btn-back').addEventListener('click', () => navigate('session'));

    // Add button
    app.querySelector('#btn-show-add').addEventListener('click', () => {
      view = 'add';
      enrichedQueue = [];
      addInput = '';
      duplicates = [];
      render();
    });

    // Swipe + tap on word rows
    app.querySelectorAll('.word-row-wrap').forEach(wrap => {
      const row = wrap.querySelector('.word-row');
      const char = wrap.dataset.char;
      let startX = 0, startY = 0, currentX = 0, swiping = false;

      wrap.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        currentX = 0;
        swiping = false;
        row.style.transition = 'none';
      }, { passive: true });

      wrap.addEventListener('touchmove', (e) => {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        // Only swipe if horizontal movement > vertical
        if (!swiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
          swiping = true;
        }
        if (swiping) {
          currentX = Math.max(-100, Math.min(100, dx));
          row.style.transform = `translateX(${currentX}px)`;
        }
      }, { passive: true });

      wrap.addEventListener('touchend', () => {
        row.style.transition = 'transform 0.2s ease';
        if (currentX < -60) {
          // Swipe left → delete
          row.style.transform = 'translateX(-100%)';
          setTimeout(() => {
            storage.removeWordFromProfile(profileId, char);
            render();
          }, 200);
        } else if (currentX > 60) {
          // Swipe right → star
          storage.toggleStarWord(profileId, char);
          row.style.transform = 'translateX(0)';
          render();
        } else if (!swiping) {
          // Tap → detail
          detailChar = char;
          view = 'detail';
          render();
        } else {
          row.style.transform = 'translateX(0)';
        }
      });

      // Mouse fallback for desktop — just tap
      wrap.addEventListener('click', (e) => {
        if (swiping) return;
        // Only handle if no touch events fired
        if (!('ontouchstart' in window)) {
          detailChar = char;
          view = 'detail';
          render();
        }
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
          ${isStarred ? '<span class="word-row__star-dot">★</span>' : ''}
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
          <div class="word-editor__profile">
            <span class="word-editor__name">${word.character}</span>
          </div>
          <div class="word-detail__top-actions">
            <button class="word-detail__action-btn ${isStarred ? 'word-detail__action-btn--star' : ''}" id="btn-detail-star">
              ${isStarred ? '★' : '☆'}
            </button>
            <button class="word-detail__action-btn word-detail__action-btn--delete" id="btn-detail-delete">
              🗑
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

    // Back — save changes
    app.querySelector('#btn-detail-back').addEventListener('click', () => {
      saveDetailEdits();
      view = 'list';
      render();
    });

    // Reset buttons (↺ next to each input)
    app.querySelector('#btn-reset-meaning')?.addEventListener('click', () => {
      app.querySelector('#edit-meaning').value = defaultMeaning;
    });
    app.querySelector('#btn-reset-pinyin')?.addEventListener('click', () => {
      app.querySelector('#edit-pinyin').value = defaultPinyin;
    });

    // Star toggle (in header)
    app.querySelector('#btn-detail-star').addEventListener('click', () => {
      const isNowStarred = storage.toggleStarWord(profileId, detailChar);
      const btn = app.querySelector('#btn-detail-star');
      btn.textContent = isNowStarred ? '★' : '☆';
      btn.classList.toggle('word-detail__action-btn--star', isNowStarred);
    });

    // Delete (in header) — double tap to confirm
    let deleteClicked = false;
    app.querySelector('#btn-detail-delete').addEventListener('click', () => {
      const btn = app.querySelector('#btn-detail-delete');
      if (!deleteClicked) {
        deleteClicked = true;
        btn.textContent = '⚠️';
        btn.classList.add('word-detail__action-btn--confirm');
        setTimeout(() => { deleteClicked = false; btn.textContent = '🗑'; btn.classList.remove('word-detail__action-btn--confirm'); }, 3000);
        return;
      }
      storage.removeWordFromProfile(profileId, detailChar);
      view = 'list';
      render();
    });
  }

  function saveDetailEdits() {
    const meaningInput = app.querySelector('#edit-meaning');
    const pinyinInput = app.querySelector('#edit-pinyin');
    if (!meaningInput || !pinyinInput) return;

    const updates = {};
    const meaning = meaningInput.value.trim();
    const pinyin = pinyinInput.value.trim();

    if (meaning) updates.meaning = meaning;
    if (pinyin) updates.pinyinMarked = pinyin;

    if (Object.keys(updates).length > 0) {
      storage.updateWordInProfile(profileId, detailChar, updates);
    }
  }

  // ─── ADD VIEW ───

  function renderAddView() {
    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-cancel-add">←</button>
          <div class="word-editor__profile">
            <span class="word-editor__name">Add Words</span>
          </div>
        </div>

        <div class="add-word-form">
          <input class="form-group__input add-word-form__input" id="add-input"
                 type="text" placeholder="Type characters (e.g. 学 蝴蝶)"
                 value="${addInput}" autocomplete="off" lang="zh">
          <div id="add-preview">
            <div class="add-word-form__hint">
              Type Chinese characters — meaning and pinyin added automatically.
            </div>
          </div>
        </div>

        <div class="add-word-form__actions" style="margin-top: auto; padding: var(--space-md) 0 var(--space-xl);">
          <div class="onboarding__nav-row">
            <button class="btn btn--secondary" id="btn-cancel-add-bottom">Cancel</button>
            <button class="btn btn--primary" id="btn-confirm-add" ${enrichedQueue.length === 0 ? 'disabled' : ''}>
              Add ${enrichedQueue.length || ''} word${enrichedQueue.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    `;

    app.querySelector('#add-input')?.focus();

    // Cancel
    const cancelAdd = () => { view = 'list'; render(); };
    app.querySelector('#btn-cancel-add').addEventListener('click', cancelAdd);
    app.querySelector('#btn-cancel-add-bottom').addEventListener('click', cancelAdd);

    // Input — debounced enrichment, updates preview without re-rendering input
    let enrichTimer = null;
    const inputEl = app.querySelector('#add-input');
    inputEl.addEventListener('input', (e) => {
      addInput = e.target.value;
      clearTimeout(enrichTimer);

      const hasCJK = [...addInput].some(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF);
      if (!hasCJK) {
        enrichedQueue = [];
        duplicates = [];
        updatePreview();
        return;
      }

      isEnriching = true;
      updatePreview();

      enrichTimer = setTimeout(async () => {
        try {
          const results = await parseAndEnrich(addInput);
          // Filter out words already in bank
          const existing = new Set((storage.getProfile(profileId)?.wordBank || []).map(w => w.character));
          duplicates = results.filter(e => existing.has(e.character)).map(e => e.character);
          enrichedQueue = results
            .filter(e => !existing.has(e.character))
            .map(e => ({ ...e, meaning: e.meanings?.[0] || '' }));
        } catch (err) {
          console.error('Enrichment error:', err);
          enrichedQueue = [];
        }
        isEnriching = false;
        updatePreview();
      }, 500);
    });

    /** Update only the preview area, keeping input focused. */
    function updatePreview() {
      const previewEl = app.querySelector('#add-preview');
      const btnEl = app.querySelector('#btn-confirm-add');
      if (!previewEl) return;

      let html = '';
      if (isEnriching) {
        html = '<div class="add-word-form__preview add-word-form__preview--loading">Looking up words...</div>';
      } else if (enrichedQueue.length > 0) {
        html = '<div class="add-word-form__queue">' +
          enrichedQueue.map((e, i) => `
            <div class="add-word-form__queue-item">
              <span class="add-word-form__queue-char">${e.character}</span>
              <div class="add-word-form__queue-details">
                <span class="add-word-form__queue-meaning">${e.meaning || e.meanings?.[0] || '?'}</span>
                ${e.pinyinMarked ? `<span class="add-word-form__queue-pinyin">${e.pinyinMarked}</span>` : ''}
              </div>
              <button class="add-word-form__queue-remove" data-remove-idx="${i}">×</button>
            </div>
          `).join('') + '</div>';
      }

      if (duplicates.length > 0) {
        html += `<div class="add-word-form__hint add-word-form__hint--warn">Already in list: ${duplicates.join(' ')}</div>`;
      }

      if (!addInput && !isEnriching) {
        html = '<div class="add-word-form__hint">Type Chinese characters — meaning and pinyin added automatically.</div>';
      }

      previewEl.innerHTML = html;

      // Update button state
      if (btnEl) {
        btnEl.disabled = enrichedQueue.length === 0;
        btnEl.textContent = enrichedQueue.length > 0
          ? `Add ${enrichedQueue.length} word${enrichedQueue.length !== 1 ? 's' : ''}`
          : 'Add words';
      }

      // Re-bind remove buttons
      previewEl.querySelectorAll('[data-remove-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
          enrichedQueue.splice(parseInt(btn.dataset.removeIdx), 1);
          if (enrichedQueue.length === 0) addInput = '';
          updatePreview();
        });
      });
    }

    // Confirm add
    app.querySelector('#btn-confirm-add')?.addEventListener('click', () => {
      if (enrichedQueue.length === 0) return;
      storage.addWordsToProfile(profileId, enrichedQueue);
      view = 'list';
      enrichedQueue = [];
      addInput = '';
      render();
    });
  }

  render();
}
