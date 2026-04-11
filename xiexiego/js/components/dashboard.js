/**
 * Parent Dashboard — Phase 15
 * Progress narrative, trouble characters, test history, math gate.
 */

import { playClick } from '../sounds.js';
import { t } from '../i18n.js';
// Worksheet generation moved to word editor

function buildCalendarHtml(words, stats) {
  const dayCounts = {};
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Count words practiced per day from lastSeen
  for (const w of words) {
    if (w.lastSeen) {
      const dayKey = new Date(w.lastSeen).toISOString().slice(0, 10);
      dayCounts[dayKey] = (dayCounts[dayKey] || 0) + 1;
    }
  }

  // Also count from session history if available
  const history = (stats.history || []);
  for (const h of history) {
    if (h.date && h.completed) {
      const dayKey = typeof h.date === 'string' ? h.date.slice(0, 10) : new Date(h.date).toISOString().slice(0, 10);
      dayCounts[dayKey] = (dayCounts[dayKey] || 0) + (h.completed || 0);
    }
  }

  // Generate 30 day cells
  const cells = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const key = d.toISOString().slice(0, 10);
    const count = dayCounts[key] || 0;
    let level = 0;
    if (count >= 16) level = 3;
    else if (count >= 6) level = 2;
    else if (count >= 1) level = 1;
    const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    cells.push('<div class="dashboard__cal-cell' + (level ? ' dashboard__cal-cell--' + level : '') + '" title="' + label + '"></div>');
  }

  return '<div class="dashboard__section">'
    + '<h3 class="dashboard__section-title">' + t('dashboard.calendar') + '</h3>'
    + '<div class="dashboard__calendar">'
    + cells.join('')
    + '</div></div>';
}

function getFlowerEmoji(box) {
  if (box >= 5) return '🌸'; // full bloom
  if (box >= 4) return '🌷'; // blooming
  return '🌱'; // sprouting
}

export function renderDashboard(app, storage, navigate) {
  const profileId = storage.getActiveProfileId();
  const profile = storage.getProfile(profileId);
  if (!profile) { navigate('profiles'); return; }

  const words = profile.wordBank || [];
  const stats = profile.sessionStats || { completed: 0, quit: 0, streak: 0 };
  const level = profile.level || 2;

  // Word stats by box
  const boxCounts = [0, 0, 0, 0, 0, 0]; // index 0 unused, 1-5
  for (const w of words) boxCounts[Math.min(w.box || 1, 5)]++;

  const totalWords = words.length;
  const masteredWords = boxCounts[4] + boxCounts[5];
  const learningWords = boxCounts[1] + boxCounts[2] + boxCounts[3];
  const masteredPct = totalWords > 0 ? Math.round((masteredWords / totalWords) * 100) : 0;

  // Trouble characters: Box 1 with high attempts or low streak
  const troubleWords = words
    .filter(w => (w.box || 1) === 1 && (w.totalAttempts || 0) >= 3)
    .sort((a, b) => (b.totalAttempts || 0) - (a.totalAttempts || 0))
    .slice(0, 10);

  // Recently mastered (Box 3+ reached in last 7 days)
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentlyMastered = words
    .filter(w => (w.box || 1) >= 3 && w.lastSeen && w.lastSeen > weekAgo)
    .slice(0, 10);

  // Test history
  const testHistory = (profile.testHistory || []).slice(-5).reverse();

  // Level history
  const levelHistory = (profile.levelHistory || []).slice(-3).reverse();

  // Progress narrative
  let narrative = '';
  if (totalWords === 0) {
    narrative = t('dashboard.noWords');
  } else if (masteredPct >= 80) {
    narrative = t('dashboard.excellent', profile.name, masteredPct);
  } else if (masteredPct >= 50) {
    narrative = t('dashboard.goodProgress', profile.name, masteredPct);
  } else if (stats.completed >= 3) {
    narrative = t('dashboard.keepGoing', profile.name, learningWords);
  } else {
    narrative = t('dashboard.justStarted', profile.name, totalWords);
  }

  app.innerHTML = `
    <div class="screen dashboard">
      <div class="word-editor__header">
        <button class="word-editor__back" id="btn-back">←</button>
        <span class="word-editor__name">${t('settings.dashboard')}</span>
      </div>

      <div class="dashboard__content">
        <div class="dashboard__narrative">
          <p>${narrative}</p>
        </div>

        <div class="dashboard__stats-grid">
          <div class="dashboard__stat">
            <span class="dashboard__stat-value">${totalWords}</span>
            <span class="dashboard__stat-label">${t('dashboard.totalWords')}</span>
          </div>
          <div class="dashboard__stat">
            <span class="dashboard__stat-value">${masteredPct}%</span>
            <span class="dashboard__stat-label">${t('dashboard.mastered')}</span>
          </div>
          <div class="dashboard__stat">
            <span class="dashboard__stat-value">${stats.completed}</span>
            <span class="dashboard__stat-label">${t('dashboard.sessions')}</span>
          </div>
          <div class="dashboard__stat">
            <span class="dashboard__stat-value">${stats.streak}</span>
            <span class="dashboard__stat-label">${t('dashboard.streak')}</span>
          </div>
        </div>

        ${buildCalendarHtml(words, stats)}

        <div class="dashboard__section">
          <h3 class="dashboard__section-title">${t('dashboard.boxBreakdown')}</h3>
          <div class="dashboard__boxes">
            ${[1,2,3,4,5].map(b => `
              <div class="dashboard__box-row">
                <span class="dashboard__box-label">${t('dashboard.box', b)}</span>
                <div class="dashboard__box-bar">
                  <div class="dashboard__box-fill dashboard__box-fill--${b}" style="width: ${totalWords > 0 ? (boxCounts[b] / totalWords) * 100 : 0}%"></div>
                </div>
                <span class="dashboard__box-count">${boxCounts[b]}</span>
              </div>
            `).join('')}
          </div>
        </div>

        ${troubleWords.length > 0 ? `
          <div class="dashboard__section">
            <h3 class="dashboard__section-title">${t('dashboard.troubleChars')}</h3>
            <div class="dashboard__trouble-words">
              ${troubleWords.map(w => `
                <div class="dashboard__trouble-word">
                  <span class="dashboard__trouble-char">${w.character}</span>
                  <span class="dashboard__trouble-info">${w.meaning || w.meanings?.[0] || ''} · ${w.totalAttempts || 0} ${t('dashboard.attempts')}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${recentlyMastered.length > 0 ? `
          <div class="dashboard__section">
            <h3 class="dashboard__section-title">${t('dashboard.recentlyMastered')}</h3>
            <div class="dashboard__mastered-words">
              ${recentlyMastered.map(w => `<span class="dashboard__mastered-word">${w.character}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        ${testHistory.length > 0 ? `
          <div class="dashboard__section">
            <h3 class="dashboard__section-title">${t('dashboard.testHistory')}</h3>
            <div class="dashboard__tests">
              ${testHistory.map(test => `
                <div class="dashboard__test-row">
                  <span class="dashboard__test-date">${new Date(test.date).toLocaleDateString()}</span>
                  <span class="dashboard__test-score">${test.pct}%</span>
                  <span class="dashboard__test-detail">${test.correct}/${test.total}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="dashboard__section">
          <h3 class="dashboard__section-title">${t('dashboard.levelInfo')}</h3>
          <div class="dashboard__level-info">
            <p>${t('dashboard.currentLevel', level)}</p>
            <p class="dashboard__level-desc">${t('dashboard.levelDesc')}</p>
            <label class="dashboard__lock-label">
              <input type="checkbox" id="level-lock" ${profile.levelLocked ? 'checked' : ''}>
              ${t('dashboard.lockLevel')}
            </label>
            <p class="dashboard__level-desc">${t('dashboard.lockDesc')}</p>
          </div>
          ${levelHistory.length > 0 ? `
            <div class="dashboard__level-history">
              ${levelHistory.map(h => `
                <div class="dashboard__level-change">
                  ${t('dashboard.levelChange', h.from, h.to)} — ${new Date(h.at).toLocaleDateString()}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <div class="dashboard__section">
          <h3 class="dashboard__section-title">${t('dashboard.editProfile')}</h3>
          <div class="dashboard__edit-profile">
            <div class="form-group form-group--compact">
              <label class="form-group__label">${t('profile.name')}</label>
              <input class="form-group__input form-group__input--sm" id="edit-profile-name" type="text" value="${profile.name}" autocomplete="off">
            </div>
            <div class="form-group form-group--compact">
              <label class="form-group__label">${t('profile.pickAvatar')}</label>
              <div class="avatar-grid avatar-grid--small">
                ${['🐼', '🐉', '🌸', '🎋', '🏮', '🦊', '🐯', '🐰', '🌈', '🦋', '🐬', '🌻'].map(a =>
                  `<button class="avatar-option avatar-option--sm ${a === profile.avatar ? 'avatar-option--selected' : ''}" data-avatar="${a}">${a}</button>`
                ).join('')}
              </div>
            </div>
            <div class="form-group form-group--compact">
              <label class="form-group__label">${t('profile.age')}</label>
              <div class="age-chips">
                ${['<4', '4', '5', '6', '7', '8', '9', '10+'].map(a =>
                  `<button class="age-chip age-chip--sm ${a === profile.age ? 'age-chip--selected' : ''}" data-age="${a}">${a}</button>`
                ).join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="dashboard__section dashboard__section--danger">
          <button class="btn btn--danger-text" id="btn-delete-profile">${t('dashboard.deleteProfile')}</button>
        </div>
      </div>
    </div>
  `;

  app.querySelector('#btn-back').addEventListener('click', () => {
    playClick();
    navigate('settings');
  });

  // Delete profile
  const deleteBtn = app.querySelector('#btn-delete-profile');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (deleteBtn.dataset.confirmed) {
        storage.removeProfile(profileId);
        navigate('settings');
      } else {
        deleteBtn.dataset.confirmed = 'true';
        deleteBtn.textContent = t('dashboard.deleteConfirm');
        deleteBtn.classList.add('btn--danger');
        deleteBtn.classList.remove('btn--danger-text');
        setTimeout(() => {
          deleteBtn.textContent = t('dashboard.deleteProfile');
          deleteBtn.classList.remove('btn--danger');
          deleteBtn.classList.add('btn--danger-text');
          delete deleteBtn.dataset.confirmed;
        }, 3000);
      }
    });
  }

  // Edit profile name
  const nameInput = app.querySelector('#edit-profile-name');
  if (nameInput) {
    nameInput.addEventListener('change', () => {
      const newName = nameInput.value.trim();
      if (newName) {
        const profiles = storage.getProfiles();
        const p = profiles.find(pr => pr.id === profileId);
        if (p) { p.name = newName; storage.saveProfiles(profiles); }
      }
    });
  }

  // Edit avatar
  app.querySelectorAll('[data-avatar]').forEach(btn => {
    btn.addEventListener('click', () => {
      playClick();
      const profiles = storage.getProfiles();
      const p = profiles.find(pr => pr.id === profileId);
      if (p) {
        p.avatar = btn.dataset.avatar;
        storage.saveProfiles(profiles);
        app.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('avatar-option--selected'));
        btn.classList.add('avatar-option--selected');
      }
    });
  });

  // Edit age
  app.querySelectorAll('[data-age]').forEach(btn => {
    btn.addEventListener('click', () => {
      playClick();
      const profiles = storage.getProfiles();
      const p = profiles.find(pr => pr.id === profileId);
      if (p) {
        p.age = btn.dataset.age;
        storage.saveProfiles(profiles);
        app.querySelectorAll('.age-chip').forEach(b => b.classList.remove('age-chip--selected'));
        btn.classList.add('age-chip--selected');
      }
    });
  });

  // Level lock toggle
  const lockCheckbox = app.querySelector('#level-lock');
  if (lockCheckbox) {
    lockCheckbox.addEventListener('change', () => {
      const profiles = storage.getProfiles();
      const p = profiles.find(pr => pr.id === profileId);
      if (p) {
        p.levelLocked = lockCheckbox.checked;
        storage.saveProfiles(profiles);
      }
    });
  }

}
