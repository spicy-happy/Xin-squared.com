/**
 * Word Bank Editor — parent-facing word list management.
 * Add, delete, star words. Auto-enrichment on add.
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
  let enrichPreview = null;
  let addInput = '';
  let manualMeaning = '';
  let isEnriching = false;
  let deleteConfirm = null; // character pending delete

  function render() {
    const profile = storage.getProfile(profileId); // re-read for fresh data
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
            + Add Word
          </button>
        `}

        ${words.length === 0 && !showAddForm ? `
          <div class="empty-state" style="padding-top: var(--space-2xl);">
            <div class="empty-state__emoji">📝</div>
            <div class="empty-state__title">No words yet</div>
            <div class="empty-state__desc">Tap "+ Add Word" to add characters for practice.</div>
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
                 type="text" placeholder="Type a character (e.g. 学)"
                 value="${addInput}" autocomplete="off" lang="zh">
          <button class="btn btn--secondary add-word-form__cancel" id="btn-cancel-add">Cancel</button>
        </div>

        ${isEnriching ? `
          <div class="add-word-form__preview add-word-form__preview--loading">
            Looking up character...
          </div>
        ` : ''}

        ${enrichPreview && !isEnriching ? `
          <div class="add-word-form__preview">
            <div class="add-word-form__char">${enrichPreview.character}</div>
            <div class="add-word-form__details">
              ${enrichPreview.meanings.length > 0 ? `
                <div class="add-word-form__meaning">${enrichPreview.meanings[0]}</div>
              ` : ''}
              ${enrichPreview.pinyin ? `
                <div class="add-word-form__pinyin">${enrichPreview.pinyinMarked || enrichPreview.pinyin}</div>
              ` : ''}
              ${enrichPreview.strokeCount ? `
                <div class="add-word-form__meta">${enrichPreview.strokeCount} strokes${enrichPreview.radical ? ' · radical: ' + enrichPreview.radical : ''}</div>
              ` : ''}
              ${enrichPreview.enrichmentStatus === 'manual' ? `
                <div class="add-word-form__manual">
                  <label class="form-group__label">Character not found — enter meaning:</label>
                  <input class="form-group__input" id="manual-meaning" type="text"
                         placeholder="English meaning" value="${manualMeaning}" autocomplete="off">
                </div>
              ` : ''}
            </div>
            <button class="btn btn--primary add-word-form__confirm" id="btn-confirm-add"
              ${enrichPreview.enrichmentStatus === 'manual' && !manualMeaning ? 'disabled' : ''}>
              Add
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
          <span class="word-row__meaning">${word.meaning || word.meanings?.[0] || ''}</span>
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
      enrichPreview = null;
      addInput = '';
      manualMeaning = '';
      render();
      app.querySelector('#add-input')?.focus();
    });

    // Cancel add
    app.querySelector('#btn-cancel-add')?.addEventListener('click', () => {
      showAddForm = false;
      enrichPreview = null;
      addInput = '';
      render();
    });

    // Add input — debounced enrichment
    let enrichTimer = null;
    app.querySelector('#add-input')?.addEventListener('input', (e) => {
      addInput = e.target.value.trim();
      clearTimeout(enrichTimer);
      enrichPreview = null;
      isEnriching = false;

      if (!addInput) { render(); return; }

      // Take the last character entered (in case they type multiple)
      const char = addInput.slice(-1);
      // Only enrich if it looks like a CJK character
      if (char.charCodeAt(0) < 0x4E00 || char.charCodeAt(0) > 0x9FFF) return;

      isEnriching = true;
      render();
      // Re-grab input since render replaces DOM
      const input = app.querySelector('#add-input');
      if (input) { input.value = addInput; input.focus(); }

      enrichTimer = setTimeout(async () => {
        try {
          enrichPreview = await enrichCharacter(char);
          addInput = char; // Normalize to single char
        } catch (err) {
          console.error('Enrichment error:', err);
          enrichPreview = { character: char, meanings: [], enrichmentStatus: 'manual' };
        }
        isEnriching = false;
        render();
      }, 400);
    });

    // Manual meaning input
    app.querySelector('#manual-meaning')?.addEventListener('input', (e) => {
      manualMeaning = e.target.value.trim();
      const btn = app.querySelector('#btn-confirm-add');
      if (btn) btn.disabled = !manualMeaning;
    });

    // Confirm add
    app.querySelector('#btn-confirm-add')?.addEventListener('click', () => {
      if (!enrichPreview) return;

      const meaning = enrichPreview.enrichmentStatus === 'manual'
        ? manualMeaning
        : enrichPreview.meanings[0] || '';

      const wordData = {
        ...enrichPreview,
        meaning,
      };

      storage.addWordsToProfile(profileId, [wordData]);
      showAddForm = false;
      enrichPreview = null;
      addInput = '';
      manualMeaning = '';
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

    // Delete confirm yes
    app.querySelectorAll('.word-row__confirm-yes').forEach(btn => {
      btn.addEventListener('click', () => {
        storage.removeWordFromProfile(profileId, btn.dataset.char);
        deleteConfirm = null;
        render();
      });
    });

    // Delete confirm no
    app.querySelectorAll('.word-row__confirm-no').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteConfirm = null;
        render();
      });
    });
  }

  render();
}
