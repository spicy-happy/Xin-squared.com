/**
 * Word Bank Editor — parent-facing word list management.
 * Views: list, add (multi-char), detail (edit/star/delete per word).
 */

import { enrichCharacter } from '../enrichment.js';

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
          <span class="word-row__desc">${meaning}${pinyin ? ' · ' + pinyin : ''}</span>
          ${isStarred ? '<span class="word-row__star-dot">★</span>' : ''}
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

    const stats = {
      correct: word.consecutiveCorrect || 0,
      total: word.totalAttempts || 0,
      added: word.addedAt ? new Date(word.addedAt).toLocaleDateString() : '—',
    };

    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-detail-back">←</button>
          <div class="word-editor__profile">
            <span class="word-editor__name">${word.character}</span>
          </div>
        </div>

        <div class="word-detail">
          <div class="word-detail__char">${word.character}</div>

          <div class="word-detail__section">
            <div class="word-detail__section-title">Progress</div>
            <div class="word-detail__stats">
              <div class="word-detail__stat">
                <span class="word-detail__stat-value" style="color: ${mastery.color}">${mastery.label}</span>
                <span class="word-detail__stat-label">Status</span>
              </div>
              <div class="word-detail__stat">
                <span class="word-detail__stat-value">${stats.correct}</span>
                <span class="word-detail__stat-label">In a row</span>
              </div>
              <div class="word-detail__stat">
                <span class="word-detail__stat-value">${stats.added}</span>
                <span class="word-detail__stat-label">Added</span>
              </div>
            </div>
          </div>

          <div class="word-detail__section">
            <div class="word-detail__section-title">Details</div>
            <div class="form-group">
              <label class="form-group__label">Definition</label>
              <input class="form-group__input" id="edit-meaning" type="text"
                     value="${word.meaning || defaultMeaning}" autocomplete="off">
            </div>
            <div class="form-group">
              <label class="form-group__label">Pinyin</label>
              <input class="form-group__input" id="edit-pinyin" type="text"
                     value="${word.pinyinMarked || word.pinyin || ''}" autocomplete="off">
            </div>
            ${word.radical || word.etymology?.hint ? `
              <div class="word-detail__meta">
                ${word.radical ? `<span>Radical: ${word.radical}</span>` : ''}
                ${word.strokeCount ? `<span>Strokes: ${word.strokeCount}</span>` : ''}
                ${word.etymology?.hint ? `<span>${word.etymology.hint}</span>` : ''}
              </div>
            ` : ''}
          </div>

          <div class="word-detail__actions">
            ${defaultMeaning || defaultPinyin ? `
              <button class="btn btn--outline" id="btn-reset-defaults">
                Reset to defaults
              </button>
            ` : ''}
            <button class="btn btn--outline ${isStarred ? 'btn--star-active' : ''}" id="btn-detail-star">
              ${isStarred ? '★ Starred' : '☆ Star for priority'}
            </button>
            <button class="btn btn--danger" id="btn-detail-delete">
              Delete word
            </button>
          </div>
        </div>
      </div>
    `;

    // Back — save changes
    app.querySelector('#btn-detail-back').addEventListener('click', () => {
      saveDetailEdits();
      view = 'list';
      render();
    });

    // Reset to defaults
    app.querySelector('#btn-reset-defaults')?.addEventListener('click', () => {
      if (defaultMeaning) app.querySelector('#edit-meaning').value = defaultMeaning;
      if (defaultPinyin) app.querySelector('#edit-pinyin').value = defaultPinyin;
    });

    // Star toggle
    app.querySelector('#btn-detail-star').addEventListener('click', () => {
      const isNowStarred = storage.toggleStarWord(profileId, detailChar);
      const btn = app.querySelector('#btn-detail-star');
      btn.textContent = isNowStarred ? '★ Starred' : '☆ Star for priority practice';
      btn.classList.toggle('word-detail__star-btn--active', isNowStarred);
    });

    // Delete
    let deleteClicked = false;
    app.querySelector('#btn-detail-delete').addEventListener('click', () => {
      const btn = app.querySelector('#btn-detail-delete');
      if (!deleteClicked) {
        deleteClicked = true;
        btn.textContent = 'Tap again to confirm delete';
        btn.classList.add('word-detail__delete-btn--confirm');
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
                 type="text" placeholder="Type characters (e.g. 学花鸟)"
                 value="${addInput}" autocomplete="off" lang="zh">

          ${isEnriching ? `
            <div class="add-word-form__preview add-word-form__preview--loading">
              Looking up characters...
            </div>
          ` : ''}

          ${enrichedQueue.length > 0 && !isEnriching ? `
            <div class="add-word-form__queue">
              ${enrichedQueue.map((e, i) => `
                <div class="add-word-form__queue-item">
                  <span class="add-word-form__queue-char">${e.character}</span>
                  <div class="add-word-form__queue-details">
                    <span class="add-word-form__queue-meaning">${e.meaning || e.meanings?.[0] || '?'}</span>
                    ${e.pinyinMarked ? `<span class="add-word-form__queue-pinyin">${e.pinyinMarked}</span>` : ''}
                  </div>
                  <button class="add-word-form__queue-remove" data-remove-idx="${i}">×</button>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${duplicates.length > 0 ? `
            <div class="add-word-form__hint add-word-form__hint--warn">
              Already in list: ${duplicates.join(' ')}
            </div>
          ` : ''}

          ${!addInput && !isEnriching ? `
            <div class="add-word-form__hint">
              Type Chinese characters — meaning and pinyin will appear automatically.
            </div>
          ` : ''}
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

    // Input — debounced enrichment
    let enrichTimer = null;
    app.querySelector('#add-input').addEventListener('input', (e) => {
      addInput = e.target.value;
      clearTimeout(enrichTimer);

      const chars = [...addInput].filter(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF);
      if (chars.length === 0) {
        enrichedQueue = [];
        isEnriching = false;
        return;
      }

      const existingChars = new Set((storage.getProfile(profileId)?.wordBank || []).map(w => w.character));
      const uniqueChars = [...new Set(chars)];
      duplicates = uniqueChars.filter(c => existingChars.has(c));
      const newChars = uniqueChars.filter(c => !existingChars.has(c));

      if (newChars.length === 0) {
        enrichedQueue = [];
        isEnriching = false;
        render();
        return;
      }

      isEnriching = true;
      enrichTimer = setTimeout(async () => {
        try {
          const results = await Promise.all(newChars.map(c => enrichCharacter(c)));
          enrichedQueue = results.map(e => ({ ...e, meaning: e.meanings?.[0] || '' }));
        } catch (err) {
          console.error('Enrichment error:', err);
          enrichedQueue = newChars.map(c => ({ character: c, meanings: [], meaning: '', enrichmentStatus: 'manual' }));
        }
        isEnriching = false;
        render();
      }, 400);
    });

    // Remove from queue
    app.querySelectorAll('[data-remove-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        enrichedQueue.splice(parseInt(btn.dataset.removeIdx), 1);
        if (enrichedQueue.length === 0) addInput = '';
        render();
      });
    });

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
