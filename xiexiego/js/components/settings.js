/**
 * Settings page — language toggle, export/import data.
 */

import { t, getLang, setLang } from '../i18n.js';
import { playClick } from '../sounds.js';

const THEME_KEY = 'xxg_theme';

export function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) return saved;
  // Auto-detect system preference
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

export function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute('data-theme', theme);
}

// Apply saved theme on load
export function initTheme() {
  const theme = getTheme();
  document.documentElement.setAttribute('data-theme', theme);
}

function renderGate(app, storage, navigate) {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;

  app.innerHTML = `
    <div class="screen settings">
      <div class="word-editor__header">
        <button class="word-editor__back" id="btn-back">←</button>
        <span class="word-editor__name">${t('settings.title')}</span>
      </div>
      <div class="settings__gate">
        <p class="settings__gate-prompt">${t('settings.gatePrompt', a, b)}</p>
        <input type="number" id="gate-answer" class="settings__gate-input" inputmode="numeric" pattern="[0-9]*">
        <button class="btn btn--primary" id="btn-gate-check">${t('settings.gateCheck')}</button>
        <p class="settings__gate-hint" id="gate-hint"></p>
      </div>
    </div>
  `;

  app.querySelector('#btn-back').addEventListener('click', () => {
    playClick();
    navigate('profiles');
  });

  const checkAnswer = () => {
    const input = app.querySelector('#gate-answer');
    const val = parseInt(input.value, 10);
    if (val === a + b) {
      try { sessionStorage.setItem('xxg_settings_unlocked', '1'); } catch {}
      renderSettingsPage(app, storage, navigate);
    } else {
      app.querySelector('#gate-hint').textContent = t('settings.gateWrong');
      input.value = '';
      // Generate new problem
      setTimeout(() => renderGate(app, storage, navigate), 800);
    }
  };

  app.querySelector('#btn-gate-check').addEventListener('click', () => {
    playClick();
    checkAnswer();
  });

  app.querySelector('#gate-answer').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      playClick();
      checkAnswer();
    }
  });
}

export function renderSettings(app, storage, navigate) {
  // Require math gate once per visit to Parents area
  let unlocked = false;
  try { unlocked = sessionStorage.getItem('xxg_settings_unlocked') === '1'; } catch {}

  if (!unlocked) {
    renderGate(app, storage, navigate);
  } else {
    renderSettingsPage(app, storage, navigate);
  }
}

function renderSettingsPage(app, storage, navigate) {
  const lang = getLang();
  const theme = getTheme();

  app.innerHTML = `
    <div class="screen settings">
      <div class="word-editor__header">
        <button class="word-editor__back" id="btn-back">←</button>
        <span class="word-editor__name">${t('settings.title')}</span>
      </div>

      ${(() => {
        const profiles = storage.getProfiles();
        if (profiles.length === 0) return '';
        return `
          <div class="settings__section">
            <label class="form-group__label">${t('settings.dashboard')}</label>
            <div class="settings__profiles-list">
              ${profiles.map(p => `
                <button class="settings__profile-row settings__profile-row--clickable" data-dashboard-id="${p.id}">
                  <span class="settings__profile-name">${p.avatar} ${p.name}</span>
                  <span class="pack-section__chevron">›</span>
                </button>
              `).join('')}
            </div>
          </div>
        `;
      })()}

      <div class="settings__section">
        <label class="form-group__label">${t('settings.language')}</label>
        <div class="settings__lang-row">
          <button class="settings__lang-btn ${lang === 'en' ? 'settings__lang-btn--active' : ''}" data-lang="en">English</button>
          <button class="settings__lang-btn ${lang === 'zh' ? 'settings__lang-btn--active' : ''}" data-lang="zh">中文</button>
        </div>
      </div>

      <div class="settings__section">
        <label class="form-group__label">${t('settings.theme')}</label>
        <div class="settings__lang-row">
          <button class="settings__lang-btn ${theme === 'light' ? 'settings__lang-btn--active' : ''}" data-theme="light">${t('settings.light')}</button>
          <button class="settings__lang-btn ${theme === 'dark' ? 'settings__lang-btn--active' : ''}" data-theme="dark">${t('settings.dark')}</button>
        </div>
      </div>

      <div class="settings__section">
        <label class="form-group__label">${t('settings.export')}</label>
        <p class="settings__desc">${t('settings.exportDesc')}</p>
        <button class="btn btn--secondary" id="btn-export">${t('settings.export')}</button>
      </div>

      <div class="settings__section">
        <label class="form-group__label">${t('settings.import')}</label>
        <p class="settings__desc">${t('settings.importDesc')}</p>
        <p class="settings__desc settings__desc--warn">${t('settings.importMerge')}</p>
        <label class="btn btn--secondary settings__import-label">
          ${t('settings.import')}
          <input type="file" accept=".json" id="import-file" class="settings__file-input">
        </label>
      </div>

      <div class="settings__status" id="settings-status"></div>
    </div>
  `;

  // Dashboard navigation
  app.querySelectorAll('[data-dashboard-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      playClick();
      storage.setActiveProfileId(btn.dataset.dashboardId);
      navigate('dashboard');
    });
  });

  app.querySelector('#btn-back').addEventListener('click', () => {
    playClick();
    try { sessionStorage.removeItem('xxg_settings_unlocked'); } catch {}
    navigate('profiles');
  });

  // Language toggle
  app.querySelectorAll('[data-lang]').forEach(btn => {
    btn.addEventListener('click', () => {
      playClick();
      setLang(btn.dataset.lang);
      renderSettingsPage(app, storage, navigate);
    });
  });

  // Theme toggle
  app.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      playClick();
      setTheme(btn.dataset.theme);
      renderSettingsPage(app, storage, navigate);
    });
  });

  // Export
  app.querySelector('#btn-export').addEventListener('click', () => {
    playClick();
    const profiles = storage.getProfiles();
    const exportData = {
      version: 1,
      app: 'XieXie',
      exportedAt: new Date().toISOString(),
      profiles: profiles.map(p => ({
        ...p,
        packs: storage.getImportedPacks(p.id),
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xiexie-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const statusEl = app.querySelector('#settings-status');
    statusEl.textContent = t('settings.exported');
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  });

  // Import
  app.querySelector('#import-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const statusEl = app.querySelector('#settings-status');
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);

        // Validate
        if (!data.app || (data.app !== 'XieXie' && data.app !== 'XieXieGo') || !Array.isArray(data.profiles)) {
          statusEl.textContent = t('settings.importError');
          statusEl.classList.add('settings__status--error');
          return;
        }

        const existingProfiles = storage.getProfiles();
        const existingByName = {};
        for (const p of existingProfiles) existingByName[p.name] = p;
        let newProfiles = 0;
        let mergedProfiles = 0;

        for (const profile of data.profiles) {
          const packs = profile.packs || [];
          delete profile.packs;

          const existing = existingByName[profile.name];
          if (existing) {
            // Merge into existing profile: add new words, keep most advanced state
            const wordMap = {};
            for (const w of existing.wordBank) wordMap[w.character] = w;

            for (const w of profile.wordBank || []) {
              const ex = wordMap[w.character];
              if (!ex) {
                // New word — add it
                wordMap[w.character] = w;
              } else {
                // Existing word — keep the most advanced state
                if ((w.box || 1) > (ex.box || 1)) ex.box = w.box;
                if ((w.consecutiveCorrect || 0) > (ex.consecutiveCorrect || 0)) ex.consecutiveCorrect = w.consecutiveCorrect;
                if ((w.totalAttempts || 0) > (ex.totalAttempts || 0)) ex.totalAttempts = w.totalAttempts;
                if (w.lastSeen && (!ex.lastSeen || w.lastSeen > ex.lastSeen)) ex.lastSeen = w.lastSeen;
                // Merge pack IDs
                if (w.packIds) {
                  ex.packIds = [...new Set([...(ex.packIds || []), ...w.packIds])];
                }
              }
            }
            existing.wordBank = Object.values(wordMap);

            // Merge packs — add any new ones
            const existingPacks = storage.getImportedPacks(existing.id);
            const existingPackIds = new Set(existingPacks.map(p => p.id));
            for (const pack of packs) {
              if (!existingPackIds.has(pack.id)) {
                existingPacks.push(pack);
              }
            }
            storage.saveImportedPacks(existing.id, existingPacks);
            mergedProfiles++;
          } else {
            // New profile — add it
            const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
            profile.id = newId;
            existingProfiles.push(profile);
            existingByName[profile.name] = profile;
            storage.saveImportedPacks(newId, packs);
            newProfiles++;
          }
        }

        storage.saveProfiles(existingProfiles);
        const total = newProfiles + mergedProfiles;
        statusEl.textContent = t('settings.importSuccess', total);
        statusEl.classList.remove('settings__status--error');
      } catch (err) {
        console.error('Import error:', err);
        statusEl.textContent = t('settings.importError');
        statusEl.classList.add('settings__status--error');
      }
    };

    reader.readAsText(file);
  });
}
