/**
 * Word Bank Editor — parent-facing word list management.
 * Organized by packs. Each pack shows its words, phrases, sentences.
 * Parents can import packs from the catalog, add custom words, or delete packs.
 */

import { parseAndEnrich } from '../enrichment.js';
import { playClick } from '../sounds.js';
import { renderPhotoImport } from './photo-import.js';
import { t } from '../i18n.js';

/** Strip tone marks from pinyin to get plain letter for sorting/grouping. */
function pinyinToLetter(p) {
  if (!p) return '';
  const stripped = p.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z]/g, '');
  return stripped.charAt(0).toUpperCase();
}

function MASTERY(box) {
  if (box >= 4) return { label: t('mastery.mastered'), color: '#4CAF50', cls: 'mastery--mastered' };
  if (box === 3) return { label: t('mastery.practicing'), color: '#4A90D9', cls: 'mastery--practicing' };
  if (box === 2) return { label: t('mastery.practicing'), color: '#4A90D9', cls: 'mastery--practicing' };
  return { label: t('mastery.learning'), color: '#FF9800', cls: 'mastery--learning' };
}

// ─── Toast helper ───
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
  requestAnimationFrame(() => el.classList.add('toast--visible'));
  const dismiss = () => {
    el.classList.remove('toast--visible');
    setTimeout(() => el.remove(), 300);
  };
  el.querySelector('.toast__dismiss').addEventListener('click', dismiss);
  if (undoFn) el.querySelector('.toast__undo').addEventListener('click', () => { undoFn(); dismiss(); });
  toastTimer = setTimeout(dismiss, 8000);
}

let packIndex = null;
async function loadPackIndex() {
  if (packIndex) return packIndex;
  const resp = await fetch('./js/data/packs/index.json');
  packIndex = await resp.json();
  return packIndex;
}

async function loadPackFile(filename) {
  const resp = await fetch(`./js/data/packs/${filename}`);
  return resp.json();
}

export function renderWordEditor(app, storage, navigate) {
  const profileId = storage.getActiveProfileId();
  const profile = storage.getProfile(profileId);
  if (!profile) { navigate('profiles'); return; }

  let view = 'list';  // list, pack-detail, add-pack, add-custom, add-custom-words, add-confirm, detail, photo-import
  let addInput = '';
  let enrichedQueue = [];
  let duplicates = [];
  let detailChar = null;
  let detailPackId = null;
  let customPackName = '';
  let customPackDesc = '';
  let customPackSequenced = false;

  function render() {
    switch (view) {
      case 'pack-detail': renderPackDetailView(); break;
      case 'add-pack': renderAddPackView(); break;
      case 'add-custom': renderAddCustomView(); break;
      case 'add-custom-words': renderAddCustomWordsView(); break;
      case 'add-confirm': renderAddConfirmView(); break;
      case 'photo-import': renderPhotoImportView(); break;
      case 'worksheet-builder': renderWorksheetBuilder(); break;
      case 'detail': renderDetailView(); break;
      default: renderListView(); break;
    }
  }

  // ─── MAIN LIST VIEW — pack rows, tap to enter ───
  function renderListView() {
    const p = storage.getProfile(profileId);
    const words = p.wordBank || [];
    const importedPacks = storage.getImportedPacks(profileId);

    // Words not in any pack
    const customWords = words.filter(w => !w.packIds || w.packIds.length === 0);

    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-back">←</button>
          <span class="word-editor__avatar">${p.avatar}</span>
          <span class="word-editor__name">${t('words.title', p.name)}</span>
        </div>

        ${words.length === 0 && importedPacks.length === 0 ? `
          <div class="empty-state" style="padding-top: var(--space-2xl);">
            <div class="empty-state__emoji">📝</div>
            <div class="empty-state__title">${t('words.noWords')}</div>
            <div class="empty-state__desc">${t('words.noWordsDesc')}</div>
          </div>
        ` : `
          <div class="word-editor__packs">
            ${importedPacks.map(pack => {
              const packWords = words.filter(w => w.packIds?.includes(pack.id));
              const mastered = packWords.filter(w => w.box >= 4).length;
              const pct = packWords.length ? Math.round((mastered / packWords.length) * 100) : 0;

              return `
                <button class="pack-section__header ${pack.inactive ? 'pack-section__header--inactive' : ''}" data-open-pack="${pack.id}">
                  <div class="pack-section__title-row">
                    <div class="pack-section__title-info">
                      <strong class="pack-section__name">${pack.title}</strong>
                      <span class="pack-section__stats">${packWords.length} ${t('words.words')} · ${pct}% ${t('words.mastered')}${pack.inactive ? ' · ' + t('words.paused') : ''}</span>
                    </div>
                  </div>
                  <span class="pack-section__chevron">›</span>
                </button>
              `;
            }).join('')}

            ${customWords.length > 0 ? `
              <button class="pack-section__header" data-open-pack="__custom">
                <div class="pack-section__title-row">
                  <div class="pack-section__title-info">
                    <strong class="pack-section__name">${t('words.customWords')}</strong>
                    <span class="pack-section__stats">${customWords.length} ${t('words.words')}</span>
                  </div>
                </div>
                <span class="pack-section__chevron">›</span>
              </button>
            ` : ''}
          </div>
        `}

        <div class="word-editor__bottom">
          <div class="word-editor__btn-row">
            <button class="btn btn--primary word-editor__add-btn" id="btn-add-pack">
              ${t('words.addPack')}
            </button>
          </div>
          ${words.length > 0 ? `
          <div class="word-editor__btn-row">
            <button class="btn btn--secondary" id="btn-print" style="flex:1">
              ${t('dashboard.print')}
            </button>
          </div>
          ` : ''}
        </div>
      </div>
    `;

    app.querySelector('#btn-back').addEventListener('click', () => navigate('profiles'));
    app.querySelector('#btn-add-pack').addEventListener('click', () => { view = 'add-pack'; render(); });

    // Print practice sheets button → opens worksheet builder
    app.querySelector('#btn-print')?.addEventListener('click', () => {
      playClick();
      view = 'worksheet-builder';
      render();
    });

    // Tap pack → navigate into it
    app.querySelectorAll('[data-open-pack]').forEach(btn => {
      btn.addEventListener('click', () => {
        playClick();
        detailPackId = btn.dataset.openPack;
        view = 'pack-detail';
        render();
      });
    });
  }

  // ─── PACK DETAIL VIEW — shows words inside a pack ───
  function renderPackDetailView() {
    const p = storage.getProfile(profileId);
    const words = p.wordBank || [];
    const importedPacks = storage.getImportedPacks(profileId);

    const sortBySequence = (a, b) => (a.sequence || 999) - (b.sequence || 999);
    const sortByPinyin = (a, b) => (a.pinyinMarked || a.pinyin || '').localeCompare(b.pinyinMarked || b.pinyin || '');

    const isCustom = detailPackId === '__custom';
    const pack = isCustom ? null : importedPacks.find(pk => pk.id === detailPackId);

    if (!isCustom && !pack) { view = 'list'; render(); return; }

    const isSequenced = pack?.sequenced || false;
    const packWords = isCustom
      ? words.filter(w => !w.packIds || w.packIds.length === 0).sort(sortByPinyin)
      : words.filter(w => w.packIds?.includes(pack.id)).sort(isSequenced ? sortBySequence : sortByPinyin);

    const sentences = pack?.lessons?.flatMap(l => l.sentences || []) || [];

    const title = isCustom ? t('words.customWords') : pack.title;
    const isInactive = pack?.inactive || false;

    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-back">←</button>
          <span class="word-editor__name">${title}</span>
          ${!isCustom ? `<button class="word-editor__header-action pack-detail__delete-icon" id="btn-delete-pack" title="${t('packDetail.removePack')}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : `<span class="word-editor__count">${packWords.length} ${t('words.words')}</span>`}
        </div>

        ${!isCustom ? `
          <div class="pack-detail__settings">
            <div class="form-group form-group--compact">
              <label class="form-group__label">${t('packDetail.name')}</label>
              <input class="form-group__input form-group__input--sm" id="pack-edit-name" type="text"
                     value="${pack.title}" autocomplete="off">
            </div>
            <div class="form-group form-group--compact">
              <label class="form-group__label">${t('packDetail.desc')}</label>
              <textarea class="form-group__input form-group__input--sm pack-detail__textarea" id="pack-edit-desc"
                     placeholder="${t('packDetail.noDesc')}" autocomplete="off">${pack.description || ''}</textarea>
            </div>
            <div class="pack-detail__toggles">
              <label class="form-toggle">
                <input type="checkbox" id="pack-edit-sequenced" ${pack.sequenced ? 'checked' : ''}>
                <span class="form-toggle__label">${t('packDetail.learnInOrder')}</span>
              </label>
              <label class="form-toggle">
                <input type="checkbox" id="pack-edit-inactive" ${isInactive ? 'checked' : ''}>
                <span class="form-toggle__label">${t('packDetail.stopPracticing')}</span>
              </label>
            </div>
            <button class="btn btn--secondary" id="btn-share-pack" style="margin-top:var(--space-sm);width:100%">
              ${t('words.share')}
            </button>
          </div>
        ` : ''}

        <div class="pack-section__body">
          ${packWords.length > 0 ? `
            <div class="word-list">
              ${packWords.map(w => renderWordRow(w)).join('')}
            </div>
          ` : ''}

          ${sentences.length > 0 ? `
            <div class="pack-subsection__label">Sentences (${sentences.length})</div>
            <div class="word-list">
              ${sentences.map(s => `
                <div class="word-row sentence-row">
                  <span class="word-row__char sentence-row__zh">${s.chinese}</span>
                  <span class="word-row__desc">${s.english || ''}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;

    app.querySelector('#btn-back').addEventListener('click', () => {
      savePackEdits(pack);
      view = 'list';
      render();
    });

    // Word row taps
    app.querySelectorAll('.word-row-wrap').forEach(wrap => {
      wrap.addEventListener('click', () => {
        detailChar = wrap.dataset.char;
        view = 'detail';
        render();
      });
    });

    // Share pack
    app.querySelector('#btn-share-pack')?.addEventListener('click', async () => {
      playClick();
      const shareData = {
        title: pack.title,
        chars: packWords.map(w => ({
          c: w.character,
          p: w.pinyinMarked || w.pinyin || '',
          m: (w.meaning || w.meanings?.[0] || '').split(';')[0].trim(),
        })),
      };
      const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(shareData));
      const shareUrl = `${window.location.origin}${window.location.pathname}#import=${compressed}`;

      // Try native share API first (mobile), fall back to clipboard
      if (navigator.share) {
        try {
          await navigator.share({ title: `${pack.title} — XieXie`, url: shareUrl });
          return;
        } catch {}
      }
      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast(t('toast.linkCopied'));
      } catch {
        // Fallback: select in a temp input
        const input = document.createElement('input');
        input.value = shareUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast(t('toast.linkCopied'));
      }
    });

    // Delete pack
    const deleteBtn = app.querySelector('#btn-delete-pack');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (deleteBtn.dataset.confirmDelete) {
          storage.removePack(profileId, detailPackId);
          view = 'list';
          render();
          showToast(t('toast.removed', pack.title));
        } else {
          deleteBtn.dataset.confirmDelete = 'true';
          deleteBtn.textContent = t('packDetail.confirmRemove');
          setTimeout(() => {
            deleteBtn.textContent = t('packDetail.removePack');
            delete deleteBtn.dataset.confirmDelete;
          }, 3000);
        }
      });
    }
  }

  /** Save edits made on pack detail page (name, description, toggles) */
  function savePackEdits(pack) {
    if (!pack) return;
    const nameInput = app.querySelector('#pack-edit-name');
    const descInput = app.querySelector('#pack-edit-desc');
    const seqCheck = app.querySelector('#pack-edit-sequenced');
    const inactiveCheck = app.querySelector('#pack-edit-inactive');
    if (!nameInput) return;

    const importedPacks = storage.getImportedPacks(profileId);
    const p = importedPacks.find(pk => pk.id === pack.id);
    if (!p) return;

    p.title = nameInput.value.trim() || p.title;
    p.description = descInput?.value.trim() || '';
    p.sequenced = seqCheck?.checked || false;
    p.inactive = inactiveCheck?.checked || false;
    storage.saveImportedPacks(profileId, importedPacks);
  }

  function renderWordRow(word) {
    const mastery = MASTERY(word.box);
    const pinyin = word.pinyinMarked || word.pinyin || '';
    const meaning = word.meaning || word.meanings?.[0] || '';
    const isStarred = word.starFlag && word.starFlag.expiresAt > Date.now();

    return `
      <div class="word-row-wrap" data-char="${word.character}">
        <div class="word-row ${mastery.cls}">
          <span class="word-row__char">${word.character}</span>
          <span class="word-row__desc">${pinyin ? pinyin + ' · ' : ''}${meaning}</span>
          ${isStarred ? '<span class="word-row__star-icon">★</span>' : ''}
          <span class="word-row__chevron">›</span>
        </div>
      </div>
    `;
  }

  // ─── ADD PACK VIEW — browse catalog ───
  async function renderAddPackView() {
    const index = await loadPackIndex();
    const allPacks = index.packs;
    const importedPacks = storage.getImportedPacks(profileId);
    const importedIds = new Set(importedPacks.map(p => p.id));

    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-back">←</button>
          <span class="word-editor__name">${t('addPack.title')}</span>
        </div>

        <div class="pack-catalog">
          <button class="pack-catalog__card" id="btn-create-custom">
            <div class="pack-catalog__info">
              <strong>${t('addPack.createOwn')}</strong>
              <span class="pack-catalog__desc">${t('addPack.createOwnDesc')}</span>
            </div>
            <span class="pack-catalog__btn">${t('addPack.add')}</span>
          </button>

          ${allPacks.map(p => {
            const imported = importedIds.has(p.id);
            return `
              <div class="pack-catalog__card ${imported ? 'pack-catalog__card--imported' : ''}" data-pack-id="${p.id}" data-pack-file="${p.file}">
                <div class="pack-catalog__info">
                  <strong>${p.title}</strong>
                  <span class="pack-catalog__desc">${p.description}</span>
                </div>
                <button class="pack-catalog__btn ${imported ? 'pack-catalog__btn--done' : ''}"
                        data-import-pack="${p.id}" data-import-file="${p.file}"
                        ${imported ? 'disabled' : ''}>
                  ${imported ? t('addPack.added') : t('addPack.add')}
                </button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    app.querySelector('#btn-back').addEventListener('click', () => { view = 'list'; render(); });
    app.querySelector('#btn-create-custom').addEventListener('click', () => {
      playClick();
      customPackName = '';
      customPackDesc = '';
      view = 'add-custom';
      render();
    });
    // Import pack buttons
    app.querySelectorAll('[data-import-pack]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const packId = btn.dataset.importPack;
        const file = btn.dataset.importFile;
        if (!file) return;

        btn.textContent = 'Loading...';
        btn.disabled = true;

        try {
          const packData = await loadPackFile(file);
          const words = preparePackWords(packData);
          const result = storage.importPack(profileId, packData, words);
          btn.textContent = t('addPack.added');
          btn.classList.add('pack-catalog__btn--done');
          showToast(t('toast.added', packData.title, result.added, result.skipped));
        } catch (err) {
          console.error('Import error:', err);
          btn.textContent = 'Error';
          setTimeout(() => { btn.textContent = '+ Add'; btn.disabled = false; }, 2000);
        }
      });
    });
  }

  /**
   * Convert pack words to word objects — uses pack-provided pinyin/meaning directly.
   * Enrichment for stroke data happens lazily during activities.
   */
  function preparePackWords(packData) {
    return (packData.words || []).filter(w => w.character).map(w => ({
      character: w.character,
      meaning: w.meaning || '',
      pinyin: w.pinyin || '',
      pinyinMarked: w.pinyin || '',
      sequence: w.sequence || null,
      subset: w.subset || null,
      isCompound: w.character.length > 1,
      components: w.character.length > 1 ? [...w.character] : undefined,
      hasStrokeData: true,
    }));
  }

  // ─── ADD CUSTOM PACK — name + description ───
  function renderAddCustomView() {
    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-cancel">←</button>
          <span class="word-editor__name">${t('custom.createTitle')}</span>
        </div>
        <div class="add-word-form">
          <div class="form-group">
            <label class="form-group__label">${t('custom.packName')}</label>
            <input class="form-group__input" id="pack-name" type="text"
                   placeholder="${t('custom.packNamePlaceholder')}" value="${customPackName}" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-group__label">${t('custom.descLabel')}</label>
            <input class="form-group__input" id="pack-desc" type="text"
                   placeholder="${t('custom.descPlaceholder')}" value="${customPackDesc}" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-toggle">
              <input type="checkbox" id="pack-sequenced" ${customPackSequenced ? 'checked' : ''}>
              <span class="form-toggle__label">${t('custom.learnInOrder')}</span>
              <span class="form-toggle__hint">${t('custom.learnInOrderHint')}</span>
            </label>
          </div>
        </div>
        <div style="margin-top: auto; padding: var(--space-md) 0 var(--space-xl);">
          <div class="onboarding__nav-row">
            <button class="btn btn--secondary" id="btn-cancel-bottom">${t('custom.cancel')}</button>
            <button class="btn btn--primary" id="btn-next" disabled>${t('custom.next')}</button>
          </div>
        </div>
      </div>
    `;

    const nameInput = app.querySelector('#pack-name');
    const btnNext = app.querySelector('#btn-next');
    nameInput.focus();

    nameInput.addEventListener('input', () => {
      btnNext.disabled = !nameInput.value.trim();
    });
    btnNext.disabled = !nameInput.value.trim();

    const cancel = () => { view = 'add-pack'; addInput = ''; render(); };
    app.querySelector('#btn-cancel').addEventListener('click', cancel);
    app.querySelector('#btn-cancel-bottom').addEventListener('click', cancel);

    btnNext.addEventListener('click', () => {
      customPackName = nameInput.value.trim();
      customPackDesc = app.querySelector('#pack-desc').value.trim();
      customPackSequenced = app.querySelector('#pack-sequenced').checked;
      addInput = '';
      view = 'add-custom-words';
      render();
    });
  }

  // ─── ADD CUSTOM WORDS (textarea) ───
  function renderAddCustomWordsView() {
    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-back">←</button>
          <span class="word-editor__name">${customPackName}</span>
        </div>
        <div class="add-word-form">
          <p class="add-word-form__hint">${t('addWords.hint')}</p>
          <textarea class="add-word-form__textarea" id="add-input"
                    placeholder="大\n山\n水\n学校\n蝴蝶" lang="zh">${addInput}</textarea>
        </div>
        <div style="margin-top: auto; padding: var(--space-md) 0 var(--space-xl);">
          <div class="onboarding__nav-row">
            <button class="btn btn--secondary" id="btn-back-bottom">Back</button>
            <button class="btn btn--primary" id="btn-next">Next</button>
          </div>
        </div>
      </div>
    `;

    app.querySelector('#add-input')?.focus();
    const goBack = () => { addInput = app.querySelector('#add-input').value; view = 'add-custom'; render(); };
    app.querySelector('#btn-back').addEventListener('click', goBack);
    app.querySelector('#btn-back-bottom').addEventListener('click', goBack);

    app.querySelector('#btn-next').addEventListener('click', async () => {
      addInput = app.querySelector('#add-input').value;
      const hasCJK = [...addInput].some(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF);
      if (!hasCJK) return;

      const btn = app.querySelector('#btn-next');
      btn.textContent = t('addWords.lookingUp');
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

  // ─── PHOTO IMPORT VIEW ───
  function renderPhotoImportView() {
    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-back">←</button>
          <span class="word-editor__name">${t('photo.title')}</span>
        </div>
        <div id="photo-import-container"></div>
      </div>
    `;

    app.querySelector('#btn-back').addEventListener('click', () => { view = 'add-pack'; render(); });

    const container = app.querySelector('#photo-import-container');
    renderPhotoImport(container, (results) => {
      // Results arrived — filter duplicates, go to confirm
      const existing = new Set((storage.getProfile(profileId)?.wordBank || []).map(w => w.character));
      duplicates = results.filter(e => existing.has(e.character)).map(e => e.character);
      enrichedQueue = results.filter(e => !existing.has(e.character));
      customPackName = customPackName || 'Photo Import';
      customPackDesc = '';
      customPackSequenced = false;
      view = 'add-confirm';
      render();
    }, () => {
      view = 'add-pack';
      render();
    });
  }

  // ─── ADD CONFIRM VIEW ───
  function renderAddConfirmView() {
    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-back">←</button>
          <span class="word-editor__name">${t('confirm.title')}</span>
        </div>

        ${enrichedQueue.length > 0 ? `
          <div class="add-word-form__queue">
            ${enrichedQueue.map((e, i) => `
              <div class="add-word-form__queue-item">
                <span class="add-word-form__queue-char">${e.character}</span>
                <div class="add-word-form__queue-fields add-word-form__queue-fields--inline">
                  <input class="add-word-form__queue-input" data-field="pinyin" data-idx="${i}"
                         type="text" value="${e.pinyinMarked || ''}" placeholder="${t('confirm.pinyin')}" autocomplete="off">
                  <input class="add-word-form__queue-input" data-field="meaning" data-idx="${i}"
                         type="text" value="${e.meaning || ''}" placeholder="${t('confirm.meaning')}" autocomplete="off">
                </div>
                <button class="add-word-form__queue-remove" data-remove-idx="${i}">×</button>
              </div>
            `).join('')}
          </div>
        ` : `<div class="add-word-form__hint">${t('confirm.noNew')}</div>`}

        ${duplicates.length > 0 ? `
          <div class="add-word-form__hint add-word-form__hint--warn">${t('confirm.alreadyIn')} ${duplicates.join(' ')}</div>
        ` : ''}

        <div style="margin-top: auto; padding: var(--space-md) 0 var(--space-xl);">
          <div class="onboarding__nav-row">
            <button class="btn btn--secondary" id="btn-back-bottom">Back</button>
            <button class="btn btn--primary" id="btn-confirm" ${enrichedQueue.length === 0 ? 'disabled' : ''}>
              ${t('confirm.addN', enrichedQueue.length)}
            </button>
          </div>
        </div>
      </div>
    `;

    const backToInput = () => { view = 'add-custom-words'; render(); };
    app.querySelector('#btn-back').addEventListener('click', backToInput);
    app.querySelector('#btn-back-bottom').addEventListener('click', backToInput);

    // Editable pinyin/meaning fields
    app.querySelectorAll('.add-word-form__queue-input').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx);
        const field = input.dataset.field;
        if (field === 'pinyin') {
          enrichedQueue[idx].pinyinMarked = input.value.trim();
          enrichedQueue[idx].pinyin = input.value.trim();
        } else if (field === 'meaning') {
          enrichedQueue[idx].meaning = input.value.trim();
        }
      });
    });

    app.querySelectorAll('[data-remove-idx]').forEach(btn => {
      btn.addEventListener('click', () => { enrichedQueue.splice(parseInt(btn.dataset.removeIdx), 1); render(); });
    });

    app.querySelector('#btn-confirm')?.addEventListener('click', async () => {
      if (enrichedQueue.length === 0) return;
      const btn = app.querySelector('#btn-confirm');
      btn.disabled = true;
      btn.textContent = t('confirm.adding');

      // Create a custom pack with name and words
      const packId = 'custom_' + Date.now();
      const packData = {
        id: packId,
        title: customPackName || 'Custom Words',
        description: customPackDesc || '',
        sequenced: customPackSequenced,
        totalWords: enrichedQueue.length,
        words: enrichedQueue.map((w, i) => ({
          character: w.character,
          pinyin: w.pinyinMarked || w.pinyin || '',
          meaning: w.meaning || '',
          sequence: i + 1,
        })),
      };
      const words = enrichedQueue.map((w, i) => ({
        ...w,
        sequence: i + 1,
        hasStrokeData: true,
      }));
      storage.importPack(profileId, packData, words);
      const count = enrichedQueue.length;
      showToast(t('toast.created', packData.title, count));
      view = 'list'; enrichedQueue = []; addInput = '';
      customPackName = ''; customPackDesc = ''; customPackSequenced = false;
      render();
    });
  }

  // ─── WORKSHEET BUILDER ───
  function renderWorksheetBuilder() {
    const p = storage.getProfile(profileId);
    if (!p) { view = 'list'; render(); return; }
    const allWords = p.wordBank || [];
    const packs = storage.getImportedPacks(profileId);
    const now = Date.now();
    const wsSelected = new Set();

    // Pre-select words that need practice (box 1-2)
    for (const w of allWords) {
      if ((w.box || 1) <= 2) wsSelected.add(w.character);
    }

    let wsGridSize = 'medium';
    let wsRepeat = 8;
    let wsStrokes = true;
    let wsTitle = `${p.name} — ${t('worksheet.title')}`;

    function renderWsBuilder() {
      const needsPractice = allWords.filter(w => (w.box || 1) <= 2).length;

      app.innerHTML = `
        <div class="screen worksheet-builder">
          <div class="word-editor__header">
            <button class="word-editor__back" id="btn-ws-back">←</button>
            <span class="word-editor__name">${t('dashboard.print')}</span>
          </div>

          <div class="worksheet-builder__settings">
            <div class="form-group form-group--compact">
              <label class="form-group__label">${t('worksheet.heading')}</label>
              <input class="form-group__input form-group__input--sm" id="ws-title" type="text" value="${wsTitle}">
            </div>

            <div class="worksheet-builder__options">
              <div class="form-group form-group--compact">
                <label class="form-group__label">${t('worksheet.gridSize')}</label>
                <div class="test-builder__filters">
                  <button class="test-builder__pill ${wsGridSize === 'small' ? 'test-builder__pill--active' : ''}" data-grid="small">${t('worksheet.small')}</button>
                  <button class="test-builder__pill ${wsGridSize === 'medium' ? 'test-builder__pill--active' : ''}" data-grid="medium">${t('worksheet.medium')}</button>
                  <button class="test-builder__pill ${wsGridSize === 'large' ? 'test-builder__pill--active' : ''}" data-grid="large">${t('worksheet.large')}</button>
                </div>
              </div>

              <div class="form-group form-group--compact">
                <label class="form-group__label">${t('worksheet.repeatCount')}</label>
                <div class="test-builder__filters">
                  ${[4, 6, 8, 10].map(n => `
                    <button class="test-builder__pill ${wsRepeat === n ? 'test-builder__pill--active' : ''}" data-repeat="${n}">${n}</button>
                  `).join('')}
                </div>
              </div>

              <label class="dashboard__lock-label" style="margin-top:var(--space-xs)">
                <input type="checkbox" id="ws-strokes" ${wsStrokes ? 'checked' : ''}>
                ${t('worksheet.includeStrokes')}
              </label>
            </div>
          </div>

          <div class="test-builder__filters" style="margin-top:var(--space-sm)">
            <button class="test-builder__pill" data-ws-filter="needs-practice">
              ${t('worksheet.needsPractice')} (${needsPractice})
            </button>
            <button class="test-builder__pill" data-ws-filter="all">
              ${t('test.selectAll')} (${allWords.length})
            </button>
            ${packs.map(pack => {
              const count = allWords.filter(w => w.packIds?.includes(pack.id)).length;
              if (!count) return '';
              return `<button class="test-builder__pill" data-ws-filter="pack:${pack.id}">${pack.title} (${count})</button>`;
            }).join('')}
            <button class="test-builder__pill" data-ws-filter="none">${t('test.selectNone')}</button>
          </div>

          <div class="test-builder__words" id="ws-words">
            ${allWords.map(w => `
              <button class="test-builder__word ${wsSelected.has(w.character) ? 'test-builder__word--selected' : ''}" data-ws-char="${w.character}">
                <span class="test-builder__word-char">${w.character}</span>
              </button>
            `).join('')}
          </div>

          <div class="test-builder__footer">
            <button class="btn btn--primary" id="btn-ws-print" ${wsSelected.size === 0 ? 'disabled' : ''}>
              ${t('dashboard.print')} (${wsSelected.size})
            </button>
          </div>
        </div>
      `;

      app.querySelector('#btn-ws-back').addEventListener('click', () => {
        playClick();
        view = 'list';
        render();
      });

      // Grid size
      app.querySelectorAll('[data-grid]').forEach(btn => {
        btn.addEventListener('click', () => {
          playClick();
          wsGridSize = btn.dataset.grid;
          renderWsBuilder();
        });
      });

      // Repeat count
      app.querySelectorAll('[data-repeat]').forEach(btn => {
        btn.addEventListener('click', () => {
          playClick();
          wsRepeat = parseInt(btn.dataset.repeat);
          renderWsBuilder();
        });
      });

      // Strokes toggle
      app.querySelector('#ws-strokes')?.addEventListener('change', (e) => {
        wsStrokes = e.target.checked;
      });

      // Title input
      app.querySelector('#ws-title')?.addEventListener('input', (e) => {
        wsTitle = e.target.value;
      });

      // Filter pills
      app.querySelectorAll('[data-ws-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          playClick();
          const filter = btn.dataset.wsFilter;
          wsSelected.clear();
          if (filter === 'all') {
            for (const w of allWords) wsSelected.add(w.character);
          } else if (filter === 'needs-practice') {
            for (const w of allWords) {
              if ((w.box || 1) <= 2) wsSelected.add(w.character);
            }
          } else if (filter.startsWith('pack:')) {
            const packId = filter.slice(5);
            for (const w of allWords) {
              if (w.packIds?.includes(packId)) wsSelected.add(w.character);
            }
          }
          renderWsBuilder();
        });
      });

      // Toggle individual words
      app.querySelectorAll('[data-ws-char]').forEach(btn => {
        btn.addEventListener('click', () => {
          playClick();
          const ch = btn.dataset.wsChar;
          if (wsSelected.has(ch)) {
            wsSelected.delete(ch);
            btn.classList.remove('test-builder__word--selected');
          } else {
            wsSelected.add(ch);
            btn.classList.add('test-builder__word--selected');
          }
          const printBtn = app.querySelector('#btn-ws-print');
          printBtn.disabled = wsSelected.size === 0;
          printBtn.textContent = `${t('dashboard.print')} (${wsSelected.size})`;
        });
      });

      // Print
      app.querySelector('#btn-ws-print').addEventListener('click', async () => {
        playClick();
        const { generateWorksheet } = await import('./worksheets.js');
        const printWords = allWords.filter(w => wsSelected.has(w.character));
        await generateWorksheet(printWords, {
          title: wsTitle,
          gridSize: wsGridSize,
          repeatCount: wsRepeat,
          showStrokes: wsStrokes,
        });
      });
    }

    renderWsBuilder();
  }

  // ─── DETAIL VIEW ───
  function renderDetailView() {
    const p = storage.getProfile(profileId);
    const word = p.wordBank.find(w => w.character === detailChar);
    if (!word) { view = 'list'; render(); return; }

    const mastery = MASTERY(word.box);
    const isStarred = word.starFlag && word.starFlag.expiresAt > Date.now();
    const defaultMeaning = word.meanings?.[0] || '';
    const defaultPinyin = word.pinyinMarked || '';
    const addedDate = word.addedAt ? new Date(word.addedAt).toLocaleDateString() : '—';
    const lastPracticed = word.lastSeen ? new Date(word.lastSeen).toLocaleDateString() : t('wordDetail.never');
    const timesPracticed = word.totalAttempts || 0;
    const box = word.box || 1;

    app.innerHTML = `
      <div class="screen word-editor">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-back">←</button>
          <span class="word-editor__name"></span>
          <div class="word-detail__top-actions">
            <button class="word-detail__action-btn" id="btn-star">${isStarred ? '★' : '☆'}</button>
            <button class="word-detail__action-btn word-detail__action-btn--delete" id="btn-delete">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>

        <div class="word-detail">
          <div class="word-detail__char">${word.character}</div>
          <div class="word-detail__stats">
            <div class="word-detail__stat">
              <span class="word-detail__stat-value" style="color: ${mastery.color}">${mastery.label}</span>
              <span class="word-detail__stat-label">${t('wordDetail.status')}</span>
            </div>
            <div class="word-detail__stat">
              <span class="word-detail__stat-value">${t('wordDetail.boxN', box)}</span>
              <span class="word-detail__stat-label">${t('wordDetail.box')}</span>
            </div>
            <div class="word-detail__stat">
              <span class="word-detail__stat-value">${timesPracticed}</span>
              <span class="word-detail__stat-label">${t('wordDetail.practiced')}</span>
            </div>
          </div>
          <div class="word-detail__stats word-detail__stats--secondary">
            <div class="word-detail__stat">
              <span class="word-detail__stat-value">${addedDate}</span>
              <span class="word-detail__stat-label">${t('wordDetail.added')}</span>
            </div>
            <div class="word-detail__stat">
              <span class="word-detail__stat-value">${lastPracticed}</span>
              <span class="word-detail__stat-label">${t('wordDetail.lastPracticed')}</span>
            </div>
          </div>

          <div class="form-group">
            <label class="form-group__label">${t('wordDetail.definition')}</label>
            <input class="form-group__input" id="edit-meaning" type="text"
                   value="${word.meaning || defaultMeaning}" autocomplete="off">
          </div>

          <div class="form-group">
            <label class="form-group__label">${t('wordDetail.pinyin')}</label>
            <input class="form-group__input" id="edit-pinyin" type="text"
                   value="${word.pinyinMarked || word.pinyin || ''}" autocomplete="off">
          </div>

          <div class="form-group">
            <label class="form-group__label">${t('wordDetail.example')}</label>
            <input class="form-group__input" id="edit-example" type="text"
                   value="${word.example ? word.example.zh + ', ' + word.example.en : ''}"
                   placeholder="${t('wordDetail.examplePlaceholder')}" autocomplete="off">
          </div>

          ${word.isRadical ? `
            <div class="word-detail__meta word-detail__meta--radical">
              <span>${t('activity.radical')}</span>
            </div>
          ` : ''}
          ${word.radical || word.strokeCount ? `
            <div class="word-detail__meta">
              ${word.radical ? `<span>${t('wordDetail.radical')} ${word.radical}</span>` : ''}
              ${word.strokeCount ? `<span>· ${word.strokeCount} ${t('wordDetail.strokes')}</span>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;

    app.querySelector('#btn-back').addEventListener('click', () => {
      saveDetailEdits();
      view = detailPackId ? 'pack-detail' : 'list';
      render();
    });

    app.querySelector('#btn-star').addEventListener('click', () => {
      const isNowStarred = storage.toggleStarWord(profileId, detailChar);
      app.querySelector('#btn-star').textContent = isNowStarred ? '★' : '☆';
      showToast(isNowStarred ? t('toast.starred', detailChar) : t('toast.unstarred', detailChar));
    });

    app.querySelector('#btn-delete').addEventListener('click', () => {
      const wordCopy = { ...word };
      storage.removeWordFromProfile(profileId, detailChar);
      view = 'list'; render();
      showToast(t('toast.deleted', detailChar), () => {
        storage.addWordsToProfile(profileId, [wordCopy]);
        render();
      });
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

    const exInput = app.querySelector('#edit-example');
    if (exInput) {
      const val = exInput.value.trim();
      if (val) {
        const commaIdx = val.indexOf(',');
        updates.example = commaIdx > 0
          ? { zh: val.slice(0, commaIdx).trim(), en: val.slice(commaIdx + 1).trim() }
          : { zh: val, en: '' };
      }
    }

    if (Object.keys(updates).length > 0) {
      storage.updateWordInProfile(profileId, detailChar, updates);
    }
  }

  render();
}
