/**
 * XieXieGo — App initialization and hash-based routing.
 */

import { StorageAdapter } from './storage.js';
import { renderProfilePicker } from './components/profile-picker.js';
import { renderOnboarding } from './components/onboarding.js';
import { renderWordEditor } from './components/word-editor.js';

const storage = new StorageAdapter();
const app = document.getElementById('app');

/** Navigate to a named screen by updating the hash. */
function navigate(screen) {
  window.location.hash = screen;
}

/** Route to the correct screen based on current hash. */
function route() {
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
      renderPlaceholderSession();
      break;

    case 'profiles':
    default:
      renderProfilePicker(app, storage, navigate);
      break;
  }
}

/** Placeholder session screen — activities not yet built. */
function renderPlaceholderSession() {
  const profile = storage.getProfile(storage.getActiveProfileId());
  const name = profile ? profile.name : 'there';

  app.innerHTML = `
    <div class="screen placeholder-session">
      <div class="placeholder-session__emoji">🚧</div>
      <h1 class="placeholder-session__title">Coming soon — practice screen</h1>
      <p class="placeholder-session__desc">
        ${name}'s words are saved and ready to go.<br>
        Activities will be built in the next phase!
      </p>
      <button class="btn btn--primary" id="btn-edit-words" style="width:100%">
        Edit Words
      </button>
      <button class="btn btn--secondary" id="btn-back-profiles">
        ← Back to profiles
      </button>
    </div>
  `;

  app.querySelector('#btn-edit-words').addEventListener('click', () => {
    navigate('words');
  });
  app.querySelector('#btn-back-profiles').addEventListener('click', () => {
    navigate('profiles');
  });
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
