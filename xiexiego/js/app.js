/**
 * XieXieGo — App initialization and hash-based routing.
 */

import { StorageAdapter } from './storage.js';
import { enrichCharacter } from './enrichment.js';
import { renderProfilePicker } from './components/profile-picker.js';
import { renderOnboarding } from './components/onboarding.js';
import { renderWordEditor } from './components/word-editor.js';
import { renderSession } from './session.js';

const storage = new StorageAdapter();
const app = document.getElementById('app');

// One-time migration: re-enrich words with bad/missing meanings from the
// corrected cedict index. Runs in background, doesn't block rendering.
(async function migrateWordMeanings() {
  const MIGRATION_KEY = 'migration_meanings_v1';
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
  document.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });
  document.addEventListener('touchmove', () => { touchMoved = true; }, { passive: true });
  document.addEventListener('click', (e) => {
    if (touchMoved) { e.preventDefault(); e.stopPropagation(); touchMoved = false; }
  }, true); // capture phase so it fires before any handler
})();

/** Navigate to a named screen by updating the hash. */
function navigate(screen) {
  window.location.hash = screen;
}

/** Route to the correct screen based on current hash. */
function route() {
  // Stop any in-progress speech when navigating away
  window.speechSynthesis?.cancel();
  const hash = window.location.hash.slice(1) || '';

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
