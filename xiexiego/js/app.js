/**
 * XieXieGo — App initialization and hash-based routing.
 */

import { StorageAdapter } from './storage.js';
import { renderProfilePicker } from './components/profile-picker.js';
import { renderOnboarding } from './components/onboarding.js';
import { renderWordEditor } from './components/word-editor.js';
import { renderSession } from './session.js';

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
