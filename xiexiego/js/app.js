/**
 * XieXie — App initialization and hash-based routing.
 */

import { StorageAdapter } from './storage.js';
import { enrichCharacter } from './enrichment.js';
import { renderProfilePicker } from './components/profile-picker.js';
import { renderOnboarding } from './components/onboarding.js';
import { renderWordEditor } from './components/word-editor.js';
import { renderSession } from './session.js';
import { renderSettings, initTheme } from './components/settings.js';
import { renderTestBuilder } from './components/test-mode.js';
import { renderDashboard } from './components/dashboard.js';

initTheme();

const storage = new StorageAdapter();
const app = document.getElementById('app');

// One-time migration: re-enrich words with bad/missing meanings from the
// corrected cedict index. Runs in background, doesn't block rendering.
(async function migrateWordMeanings() {
  const MIGRATION_KEY = 'migration_meanings_v2';
  if (storage.get(MIGRATION_KEY)) return;

  const profiles = storage.getProfiles();
  let changed = false;
  for (const profile of profiles) {
    for (const word of profile.wordBank) {
      const m = word.meaning || word.meanings?.[0] || '';
      const needsFix = !m || m === '?' ||
        /variant of|used in|short name for|ethnic group|penis|dry measure/.test(m);
      if (needsFix && word.character) {
        try {
          const enriched = await enrichCharacter(word.character.charAt(0));
          const newMeaning = enriched.meanings?.[0];
          if (newMeaning) {
            word.meaning = newMeaning;
            word.meanings = enriched.meanings;
            word.pinyin = enriched.pinyin || word.pinyin;
            word.pinyinMarked = enriched.pinyinMarked || word.pinyinMarked;
            changed = true;
          }
        } catch {}
      }
    }
  }
  if (changed) storage.saveProfiles(profiles);
  storage.set(MIGRATION_KEY, true);
})();

// Prevent scroll-ending touches from triggering clicks on mobile.
// Tracks whether a touch involved significant movement (scrolling);
// if so, swallows the synthetic click the browser fires after touchend.
(function installScrollClickGuard() {
  let touchMoved = false;
  let startY = 0;
  document.addEventListener('touchstart', (e) => {
    touchMoved = false;
    startY = e.touches[0]?.clientY || 0;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    const dy = Math.abs((e.touches[0]?.clientY || 0) - startY);
    if (dy > 10) touchMoved = true; // only count as scroll if moved >10px
  }, { passive: true });
  document.addEventListener('click', (e) => {
    if (touchMoved) { e.preventDefault(); e.stopPropagation(); touchMoved = false; }
  }, true);
})();

/** Navigate to a named screen by updating the hash. */
function navigate(screen) {
  window.location.hash = screen;
}

/** Render import-from-URL prompt screen. */
function renderImportPrompt(app, storage, navigate, importData) {
  const profiles = storage.getProfiles();
  const title = importData.title || 'Shared Words';
  const wordCount = importData.chars.length;

  app.innerHTML = `
    <div class="screen import-prompt">
      <div class="import-prompt__content">
        <div class="import-prompt__icon">📥</div>
        <h2 class="import-prompt__title">${title}</h2>
        <p class="import-prompt__desc">${wordCount} characters to import</p>
        ${profiles.length > 0 ? `
          <p class="import-prompt__label">Import into:</p>
          <div class="import-prompt__profiles">
            ${profiles.map(p => `
              <button class="btn btn--secondary import-prompt__profile" data-id="${p.id}">
                ${p.avatar} ${p.name}
              </button>
            `).join('')}
          </div>
        ` : `
          <p class="import-prompt__label">Create a profile first to import words.</p>
          <button class="btn btn--primary" id="btn-import-create">Create Profile</button>
        `}
        <button class="btn btn--ghost import-prompt__cancel" id="btn-import-cancel">Cancel</button>
      </div>
    </div>
  `;

  // Profile selection
  app.querySelectorAll('[data-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const profileId = btn.dataset.id;
      btn.textContent = 'Importing...';
      btn.disabled = true;
      let added = 0;
      for (const ch of importData.chars) {
        const existing = storage.getProfile(profileId).wordBank.find(w => w.character === ch.c);
        if (existing) continue;

        let enriched;
        try {
          enriched = await enrichCharacter(ch.c);
        } catch {
          enriched = { character: ch.c, meanings: [ch.m], pinyin: ch.p };
        }
        if (!enriched.meaning && ch.m) enriched.meaning = ch.m;
        if (!enriched.pinyinMarked && ch.p) enriched.pinyinMarked = ch.p;

        storage.addWordsToProfile(profileId, [enriched]);
        added++;
      }

      btn.textContent = `Added ${added} words`;
      setTimeout(() => {
        window.location.hash = 'profiles';
      }, 1500);
    });
  });

  app.querySelector('#btn-import-cancel')?.addEventListener('click', () => {
    window.location.hash = 'profiles';
  });

  app.querySelector('#btn-import-create')?.addEventListener('click', () => {
    window.location.hash = 'onboarding';
  });
}

/** Route to the correct screen based on current hash. */
function route() {
  // Stop any in-progress speech when navigating away
  window.speechSynthesis?.cancel();
  const hash = window.location.hash.slice(1) || '';

  // Check for import URL
  if (hash.startsWith('import=')) {
    const compressed = hash.slice(7);
    try {
      const json = LZString.decompressFromEncodedURIComponent(compressed);
      const data = JSON.parse(json);
      if (data && data.chars && Array.isArray(data.chars)) {
        renderImportPrompt(app, storage, navigate, data);
        return;
      }
    } catch (e) {
      console.error('[xxg] Invalid import URL:', e);
    }
    navigate('profiles');
    return;
  }

  switch (hash) {
    case 'onboarding':
      renderOnboarding(app, storage, navigate);
      break;

    case 'add-profile':
      renderOnboarding(app, storage, navigate, { skipWelcome: true });
      break;

    case 'words':
      renderWordEditor(app, storage, navigate);
      break;

    case 'session':
      renderSession(app, storage, navigate);
      break;

    case 'test':
      renderTestBuilder(app, storage, navigate);
      break;

    case 'dashboard':
      renderDashboard(app, storage, navigate);
      break;

    case 'settings':
      renderSettings(app, storage, navigate);
      break;

    case 'profiles':
    default:
      renderProfilePicker(app, storage, navigate);
      break;
  }
}

// Listen for hash changes
window.addEventListener('hashchange', route);

// Debug helper — type resetdata() in console to wipe all data
window.resetdata = () => {
  Object.keys(localStorage).filter(k => k.startsWith('xxg_')).forEach(k => localStorage.removeItem(k));
  location.hash = '';
  location.reload();
};

// Initial route
route();

// Pre-cache stroke data for all known characters (runs in background via service worker)
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  requestIdleCallback?.(() => precacheUserStrokes()) || setTimeout(precacheUserStrokes, 3000);
}
// Also trigger after SW first activates
navigator.serviceWorker?.ready?.then(() => {
  setTimeout(precacheUserStrokes, 2000);
});

function precacheUserStrokes() {
  const profiles = storage.getProfiles();
  const allChars = new Set();
  for (const p of profiles) {
    for (const w of p.wordBank || []) {
      for (const ch of w.character) allChars.add(ch);
    }
  }
  if (allChars.size > 0 && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'PRECACHE_STROKES',
      characters: [...allChars],
    });
  }
}
