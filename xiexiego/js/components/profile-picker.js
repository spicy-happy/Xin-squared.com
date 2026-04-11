/**
 * Profile Picker — launch screen.
 * Shows profiles as horizontal rows with stats and action buttons.
 */

import { t, getLang, setLang } from '../i18n.js';

export function renderProfilePicker(app, storage, navigate) {
  const profiles = storage.getProfiles();

  if (profiles.length === 0) {
    const lang = getLang();
    app.innerHTML = `
      <div class="screen empty-state">
        <div class="empty-state__emoji">✏️</div>
        <h1 class="empty-state__title">${t('empty.title')}</h1>
        <p class="empty-state__desc">
          ${t('empty.desc')} ${t('empty.warning')}
        </p>
        <div class="welcome-lang-toggle">
          <button class="welcome-lang-btn ${lang === 'en' ? 'welcome-lang-btn--active' : ''}" data-lang="en">English</button>
          <button class="welcome-lang-btn ${lang === 'zh' ? 'welcome-lang-btn--active' : ''}" data-lang="zh">中文</button>
        </div>
        <button class="btn btn--primary btn--large" id="btn-start">
          ${t('empty.start')}
        </button>
      </div>
    `;
    // Language toggle
    app.querySelectorAll('.welcome-lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setLang(btn.dataset.lang);
        renderProfilePicker(app, storage, navigate);
      });
    });
    app.querySelector('#btn-start').addEventListener('click', () => {
      navigate('onboarding');
    });
    return;
  }

  app.innerHTML = `
    <div class="screen profile-picker">
      <div class="profile-picker__top-bar">
        <h1 class="profile-picker__title">${t('app.title')}</h1>
        <button class="profile-picker__settings" id="btn-settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span class="profile-picker__settings-label">${t('settings.title')}</span>
        </button>
      </div>
      <div class="profile-list">
        ${profiles.map(p => {
          const words = p.wordBank || [];
          const totalWords = words.length;
          const mastered = words.filter(w => (w.box || 1) >= 4).length;
          const pct = totalWords ? Math.round((mastered / totalWords) * 100) : 0;
          return `
          <div class="profile-row" data-id="${p.id}">
            <div class="profile-row__top">
              <div class="profile-row__info">
                <span class="profile-row__avatar">${p.avatar}</span>
                <span class="profile-row__name">${p.name}</span>
              </div>
              <span class="profile-row__stats">${totalWords} ${t('app.wordsLearned')} · ${pct}% ${t('app.mastered')}</span>
            </div>
            ${(p.stickers?.length > 0) ? `<span class="profile-row__stickers" data-stickers="${p.id}">${p.stickers.slice(-5).map(s => s.emoji).join('')} (${p.stickers.length})</span>` : ''}
            <div class="profile-row__actions">
              <button class="profile-row__btn profile-row__btn--practice" data-practice="${p.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                ${t('app.practice')}
              </button>
              <button class="profile-row__btn profile-row__btn--test" data-test="${p.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                ${t('app.test')}
              </button>
              <button class="profile-row__btn profile-row__btn--edit" data-edit="${p.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                ${t('app.editWords')}
              </button>
            </div>
          </div>
        `;}).join('')}
        <button class="profile-row profile-row--add" id="btn-add-profile">
          <span class="profile-row__add-text">${t('app.addChild')}</span>
        </button>
      </div>
      <footer class="profile-picker__footer">
        <p class="profile-picker__footer-note">${t('app.footer.warning')}</p>
        <p>${t('app.footer.madeBy')} <a href="https://ko-fi.com/spicyhappy" target="_blank" rel="noopener">${t('app.footer.tipBoba')}</a> <a href="mailto:xin@xin-squared.com">${t('app.footer.feedback')}</a></p>
      </footer>
    </div>
  `;

  // Settings
  app.querySelector('#btn-settings').addEventListener('click', () => {
    navigate('settings');
  });

  // Practice — start a session
  app.querySelectorAll('[data-practice]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      storage.setActiveProfileId(btn.dataset.practice);
      navigate('session');
    });
  });

  // Test mode
  app.querySelectorAll('[data-test]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      storage.setActiveProfileId(btn.dataset.test);
      navigate('test');
    });
  });

  // Edit words for a profile
  app.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      storage.setActiveProfileId(btn.dataset.edit);
      navigate('words');
    });
  });

  // Sticker album toggle
  app.querySelectorAll('[data-stickers]').forEach(badge => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = badge.dataset.stickers;
      const existing = badge.parentElement.querySelector('.sticker-album');
      if (existing) { existing.remove(); return; }
      const prof = profiles.find(pr => pr.id === pid);
      if (!prof?.stickers?.length) return;
      const album = document.createElement('div');
      album.className = 'sticker-album';
      album.innerHTML = prof.stickers.map(s =>
        `<span class="sticker-album__item" title="${s.name}">${s.emoji}</span>`
      ).join('');
      badge.parentElement.appendChild(album);
    });
  });

  // Add new profile
  app.querySelector('#btn-add-profile').addEventListener('click', () => {
    navigate('add-profile');
  });
}
