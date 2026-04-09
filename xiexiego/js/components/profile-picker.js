/**
 * Profile Picker — launch screen.
 * Shows a grid of profile cards, or empty state routing to onboarding.
 */

export function renderProfilePicker(app, storage, navigate) {
  const profiles = storage.getProfiles();

  if (profiles.length === 0) {
    app.innerHTML = `
      <div class="screen empty-state">
        <div class="empty-state__emoji">✏️</div>
        <h1 class="empty-state__title">Welcome to XieXieGo!</h1>
        <p class="empty-state__desc">
          A handy app to help kids ace their 听写 test.
        </p>
        <button class="btn btn--primary btn--large" id="btn-start">
          Let's go!
        </button>
      </div>
    `;
    app.querySelector('#btn-start').addEventListener('click', () => {
      navigate('onboarding');
    });
    return;
  }

  app.innerHTML = `
    <div class="screen profile-picker">
      <h1 class="profile-picker__title">XieXieGo</h1>
      <p class="profile-picker__subtitle">Who's practicing today?</p>
      <div class="profile-grid">
        ${profiles.map(p => `
          <div class="profile-card-wrap">
            <button class="profile-card" data-id="${p.id}">
              <span class="profile-card__avatar">${p.avatar}</span>
              <span class="profile-card__name">${p.name}</span>
            </button>
            <button class="profile-card__edit" data-edit="${p.id}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          </div>
        `).join('')}
        <button class="profile-card profile-card--add" id="btn-add-profile">
          <span class="profile-card__avatar">+</span>
          <span class="profile-card__name">Add kid</span>
        </button>
      </div>
      <footer class="profile-picker__footer">
        <p>Made by Xin for my 2 kids. <a href="https://ko-fi.com/spicyhappy" target="_blank" rel="noopener">Tip me a boba 🧋</a> <a href="mailto:xin@xin-squared.com">Give feedback ✉️</a></p>
      </footer>
    </div>
  `;

  // Select a profile
  app.querySelectorAll('.profile-card[data-id]').forEach(card => {
    card.addEventListener('click', () => {
      storage.setActiveProfileId(card.dataset.id);
      navigate('session');
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

  // Add new profile
  app.querySelector('#btn-add-profile').addEventListener('click', () => {
    navigate('add-profile');
  });
}
