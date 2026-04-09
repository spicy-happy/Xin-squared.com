/**
 * Word Bank Editor — parent-facing word list management.
 * Add (multiple at once), delete, star words. Auto-enrichment on add.
 */

import { enrichCharacter } from '../enrichment.js';

const MASTERY_ICONS = {
  1: { icon: '🌱', label: 'Learning' },
  2: { icon: '🌿', label: 'Practicing' },
  3: { icon: '🌸', label: 'Mastered' },
};

export function renderWordEditor(app, storage, navigate) {
  const profileId = storage.getActiveProfileId();
  const profile = storage.getProfile(profileId);
  if (!profile) { navigate('profiles'); return; }

  let showAddForm = false;
  let addInput = '';
  let enrichedQueue = [];   // array of enriched chars ready to add
  let isEnriching = false;
  let duplicates = [];      // chars already in word bank
  let deleteConfirm = null;

  function render() {
    if (showAddForm) {
      renderAddView();
    } else {
      renderListView();
    }
    bindEvents();
  }

  function renderListView() {
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

        <button class="btn btn--primary word-editor__add-btn" id="btn-show-add">
          + Add Words
        </button>

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
      </div>
    `;
  }

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
    const mastery = MASTERY_ICONS[word.box] || MASTERY_ICONS[1];
    const isStarred = word.starFlag && word.starFlag.expiresAt > Date.now();
    const pinyin = word.pinyinMarked || word.pinyin || '';
    const meaning = word.meaning || word.meanings?.[0] || '';

    return `
      <div class="word-row" data-char="${word.character}">
        <button class="word-row__star ${isStarred ? 'word-row__star--active' : ''}"
                data-star="${word.character}">${isStarred ? '★' : '☆'}</button>
        <span class="word-row__char">${word.character}</span>
        <span class="word-row__desc">${meaning}${pinyin ? ' · ' + pinyin : ''}</span>
        <span class="word-row__mastery" title="${mastery.label}">${mastery.icon}</span>
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

    // Cancel add (header back button or bottom cancel)
    const cancelAdd = () => {
      showAddForm = false;
      enrichedQueue = [];
      addInput = '';
      render();
    };
    app.querySelector('#btn-cancel-add')?.addEventListener('click', cancelAdd);
    app.querySelector('#btn-cancel-add-bottom')?.addEventListener('click', cancelAdd);

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

      // Filter out chars already in word bank
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

    // Delete buttons — swap row content in-place instead of full re-render
    app.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const char = btn.dataset.delete;
        const row = btn.closest('.word-row');
        row.classList.add('word-row--deleting');
        row.innerHTML = `
          <span class="word-row__char">${char}</span>
          <span class="word-row__confirm-text">Remove?</span>
          <button class="btn word-row__confirm-yes">Yes</button>
          <button class="btn word-row__confirm-no">No</button>
        `;
        row.querySelector('.word-row__confirm-yes').addEventListener('click', () => {
          storage.removeWordFromProfile(profileId, char);
          row.style.height = row.offsetHeight + 'px';
          row.style.overflow = 'hidden';
          row.style.transition = 'height 0.2s ease, opacity 0.2s ease';
          requestAnimationFrame(() => {
            row.style.height = '0px';
            row.style.opacity = '0';
            row.style.marginBottom = '0';
            row.style.padding = '0';
            row.style.border = 'none';
          });
          setTimeout(() => render(), 250);
        });
        row.querySelector('.word-row__confirm-no').addEventListener('click', () => {
          deleteConfirm = null;
          render();
        });
      });
    });
  }

  render();
}
