/**
 * Word Bank Editor — parent-facing word list management.
 * Add (multiple at once), delete, star words. Auto-enrichment on add.
 */

import { enrichCharacter } from '../enrichment.js';

const MASTERY_LABELS = {
  1: { text: 'Learning', cls: 'mastery-badge--learning' },
  2: { text: 'Practicing', cls: 'mastery-badge--practicing' },
  3: { text: 'Mastered', cls: 'mastery-badge--mastered' },
};

export function renderWordEditor(app, storage, navigate) {
  const profileId = storage.getActiveProfileId();
  const profile = storage.getProfile(profileId);
  if (!profile) { navigate('profiles'); return; }

  let showAddForm = false;
  let addInput = '';
  let enrichedQueue = [];   // array of enriched chars ready to add
  let isEnriching = false;
  let deleteConfirm = null;

  function render() {
    const profile = storage.getProfile(profileId);
    const words = profile.wordBank || [];

    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-back">←</button>
          <div class="word-editor__profile">
            <span class="word-editor__avatar">${profile.avatar}</span>
            <span class="word-editor__name">${profile.name}'s Words</span>
          </div>
          <span class="word-editor__count">${words.length}</span>
        </div>

        ${showAddForm ? renderAddForm() : `
          <button class="btn btn--primary word-editor__add-btn" id="btn-show-add">
            + Add Words
          </button>
        `}

        ${words.length === 0 && !showAddForm ? `
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
      </div>
    `;

    bindEvents();
  }

  function renderAddForm() {
    return `
      <div class="add-word-form">
        <div class="add-word-form__input-row">
          <input class="form-group__input add-word-form__input" id="add-input"
                 type="text" placeholder="Type characters (e.g. 学花鸟)"
                 value="${addInput}" autocomplete="off" lang="zh">
          <button class="btn btn--secondary add-word-form__cancel" id="btn-cancel-add">Cancel</button>
        </div>

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
            <button class="btn btn--primary" id="btn-confirm-add" style="width:100%; margin-top: var(--space-sm);">
              Add ${enrichedQueue.length} word${enrichedQueue.length > 1 ? 's' : ''}
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderWordRow(word) {
    const mastery = MASTERY_LABELS[word.box] || MASTERY_LABELS[1];
    const isStarred = word.starFlag && word.starFlag.expiresAt > Date.now();
    const isDeleting = deleteConfirm === word.character;
    const pinyin = word.pinyinMarked || word.pinyin || '';

    if (isDeleting) {
      return `
        <div class="word-row word-row--deleting">
          <span class="word-row__char">${word.character}</span>
          <span class="word-row__confirm-text">Remove?</span>
          <button class="btn word-row__confirm-yes" data-char="${word.character}">Yes</button>
          <button class="btn word-row__confirm-no" data-char="${word.character}">No</button>
        </div>
      `;
    }

    return `
      <div class="word-row" data-char="${word.character}">
        <button class="word-row__star ${isStarred ? 'word-row__star--active' : ''}"
                data-star="${word.character}">${isStarred ? '★' : '☆'}</button>
        <div class="word-row__info">
          <span class="word-row__char">${word.character}</span>
          <div class="word-row__text">
            <span class="word-row__meaning">${word.meaning || word.meanings?.[0] || ''}</span>
            ${pinyin ? `<span class="word-row__pinyin">${pinyin}</span>` : ''}
          </div>
        </div>
        <span class="mastery-badge ${mastery.cls}">${mastery.text}</span>
        <button class="word-row__delete" data-delete="${word.character}">×</button>
      </div>
    `;
  }

  function bindEvents() {
    // Back button
    app.querySelector('#btn-back')?.addEventListener('click', () => navigate('session'));

    // Show add form
    app.querySelector('#btn-show-add')?.addEventListener('click', () => {
      showAddForm = true;
      enrichedQueue = [];
      addInput = '';
      render();
      app.querySelector('#add-input')?.focus();
    });

    // Cancel add
    app.querySelector('#btn-cancel-add')?.addEventListener('click', () => {
      showAddForm = false;
      enrichedQueue = [];
      addInput = '';
      render();
    });

    // Add input — extract CJK chars and enrich all of them
    let enrichTimer = null;
    app.querySelector('#add-input')?.addEventListener('input', (e) => {
      addInput = e.target.value;
      clearTimeout(enrichTimer);

      // Extract all CJK characters from input
      const chars = [...addInput].filter(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF);
      if (chars.length === 0) {
        enrichedQueue = [];
        isEnriching = false;
        return;
      }

      // Filter out chars already in word bank or already in queue
      const existingChars = new Set((storage.getProfile(profileId)?.wordBank || []).map(w => w.character));
      const newChars = [...new Set(chars)].filter(c => !existingChars.has(c));

      if (newChars.length === 0) {
        enrichedQueue = [];
        isEnriching = false;
        return;
      }

      isEnriching = true;
      // Don't re-render here to avoid losing focus — just show loading on next render
      enrichTimer = setTimeout(async () => {
        try {
          const results = await Promise.all(newChars.map(c => enrichCharacter(c)));
          enrichedQueue = results.map(e => ({
            ...e,
            meaning: e.meanings?.[0] || '',
          }));
        } catch (err) {
          console.error('Enrichment error:', err);
          enrichedQueue = newChars.map(c => ({
            character: c, meanings: [], meaning: '', enrichmentStatus: 'manual'
          }));
        }
        isEnriching = false;
        render();
      }, 400);
    });

    // Remove item from queue
    app.querySelectorAll('[data-remove-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        enrichedQueue.splice(parseInt(btn.dataset.removeIdx), 1);
        if (enrichedQueue.length === 0) addInput = '';
        render();
      });
    });

    // Confirm add all
    app.querySelector('#btn-confirm-add')?.addEventListener('click', () => {
      if (enrichedQueue.length === 0) return;
      storage.addWordsToProfile(profileId, enrichedQueue);
      showAddForm = false;
      enrichedQueue = [];
      addInput = '';
      render();
    });

    // Star toggles
    app.querySelectorAll('[data-star]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        storage.toggleStarWord(profileId, btn.dataset.star);
        render();
      });
    });

    // Delete buttons
    app.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteConfirm = btn.dataset.delete;
        render();
      });
    });

    // Delete confirm yes/no
    app.querySelectorAll('.word-row__confirm-yes').forEach(btn => {
      btn.addEventListener('click', () => {
        storage.removeWordFromProfile(profileId, btn.dataset.char);
        deleteConfirm = null;
        render();
      });
    });
    app.querySelectorAll('.word-row__confirm-no').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteConfirm = null;
        render();
      });
    });
  }

  render();
}
