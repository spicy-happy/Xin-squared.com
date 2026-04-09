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
        <h1 class="empty-state__title">Welcome to XieXie Go!</h1>
        <p class="empty-state__desc">
          Practice weekly Chinese dictation lists so your child is ready for the test.
        </p>
        <button class="btn btn--primary btn--large" id="btn-start">
          Let's get started
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
      <h1 class="profile-picker__title">XieXie Go</h1>
      <p class="profile-picker__subtitle">Who's practicing today?</p>
      <div class="profile-grid">
        ${profiles.map(p => `
          <button class="profile-card" data-id="${p.id}">
            <span class="profile-card__avatar">${p.avatar}</span>
            <span class="profile-card__name">${p.name}</span>
          </button>
        `).join('')}
        <button class="profile-card profile-card--add" id="btn-add-profile">
          <span class="profile-card__avatar">+</span>
          <span class="profile-card__name">Add kid</span>
        </button>
      </div>
    </div>
  `;

  // Select a profile
  app.querySelectorAll('.profile-card[data-id]').forEach(card => {
    card.addEventListener('click', () => {
      storage.setActiveProfileId(card.dataset.id);
      navigate('session');
    });
  });

  // Add new profile
  app.querySelector('#btn-add-profile').addEventListener('click', () => {
    navigate('onboarding');
  });
}
