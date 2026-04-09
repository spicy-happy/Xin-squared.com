/**
 * Onboarding — three-screen flow:
 *   1. Welcome
 *   2. Create profile (name, avatar, age)
 *   3. Add first words from starter list
 */

const AVATARS = ['🐼', '🐉', '🌸', '🎋', '🏮', '🦊', '🐯', '🐰', '🌈', '🦋', '🐬', '🌻'];
const AGES = [4, 5, 6, 7, 8, 9, 10];

let starterWords = null;

async function loadStarterWords() {
  if (starterWords) return starterWords;
  const resp = await fetch('./js/data/starter-words.json');
  starterWords = await resp.json();
  return starterWords;
}

export function renderOnboarding(app, storage, navigate) {
  let step = 0;
  let profileData = { name: '', avatar: AVATARS[0], age: 5 };
  let selectedWords = new Set();

  function render() {
    switch (step) {
      case 0: renderWelcome(); break;
      case 1: renderCreateProfile(); break;
      case 2: renderAddWords(); break;
    }
  }

  function renderWelcome() {
    app.innerHTML = `
      <div class="screen onboarding">
        <div class="onboarding__content">
          <div class="onboarding__emoji">✏️</div>
          <h1 class="onboarding__title">XieXie Go helps your child practice their weekly Chinese dictation list</h1>
          <p class="onboarding__desc">
            5 minutes a day so they're ready for the test by Friday.
          </p>
        </div>
        <div class="onboarding__actions">
          ${renderDots()}
          <button class="btn btn--primary btn--large" id="btn-next">
            Let's set up your first kid
          </button>
        </div>
      </div>
    `;
    app.querySelector('#btn-next').addEventListener('click', () => { step = 1; render(); });
  }

  function renderCreateProfile() {
    app.innerHTML = `
      <div class="screen onboarding">
        <div class="onboarding__content" style="justify-content: flex-start; padding-top: var(--space-xl);">
          <h1 class="onboarding__title" style="margin-bottom: var(--space-lg);">Create a profile</h1>

          <div class="form-group">
            <label class="form-group__label">Name</label>
            <input class="form-group__input" id="input-name" type="text"
                   placeholder="Your child's name" value="${profileData.name}" autocomplete="off">
          </div>

          <div class="form-group">
            <label class="form-group__label">Pick an avatar</label>
            <div class="avatar-grid">
              ${AVATARS.map(a => `
                <button class="avatar-option ${a === profileData.avatar ? 'avatar-option--selected' : ''}"
                        data-avatar="${a}">${a}</button>
              `).join('')}
            </div>
          </div>

          <div class="form-group">
            <label class="form-group__label">Age</label>
            <div class="age-chips">
              ${AGES.map(a => `
                <button class="age-chip ${a === profileData.age ? 'age-chip--selected' : ''}"
                        data-age="${a}">${a}</button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="onboarding__actions">
          ${renderDots()}
          <button class="btn btn--primary btn--large" id="btn-next">Next</button>
          <button class="btn btn--secondary" id="btn-back">Back</button>
        </div>
      </div>
    `;

    // Name input
    const nameInput = app.querySelector('#input-name');
    nameInput.addEventListener('input', () => { profileData.name = nameInput.value.trim(); });

    // Avatar selection
    app.querySelectorAll('.avatar-option').forEach(btn => {
      btn.addEventListener('click', () => {
        profileData.avatar = btn.dataset.avatar;
        app.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('avatar-option--selected'));
        btn.classList.add('avatar-option--selected');
      });
    });

    // Age selection
    app.querySelectorAll('.age-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        profileData.age = parseInt(btn.dataset.age);
        app.querySelectorAll('.age-chip').forEach(b => b.classList.remove('age-chip--selected'));
        btn.classList.add('age-chip--selected');
      });
    });

    // Navigation
    app.querySelector('#btn-next').addEventListener('click', () => {
      if (!profileData.name) {
        nameInput.style.borderColor = 'var(--color-warning)';
        nameInput.focus();
        return;
      }
      step = 2;
      render();
    });
    app.querySelector('#btn-back').addEventListener('click', () => { step = 0; render(); });
  }

  async function renderAddWords() {
    const words = await loadStarterWords();
    // Pre-select all starter words
    if (selectedWords.size === 0) {
      words.forEach(w => selectedWords.add(w.character));
    }

    app.innerHTML = `
      <div class="screen onboarding">
        <div class="onboarding__content" style="justify-content: flex-start; padding-top: var(--space-xl);">
          <h1 class="onboarding__title" style="margin-bottom: var(--space-sm);">Add first words</h1>
          <p class="onboarding__desc" style="margin-bottom: var(--space-lg);">
            Tap to select starter characters for ${profileData.name || 'your child'}.
            You can always add more later.
          </p>

          <div class="starter-words">
            <div class="starter-words__list">
              ${words.map(w => `
                <button class="word-chip ${selectedWords.has(w.character) ? 'word-chip--selected' : ''}"
                        data-char="${w.character}">
                  <span class="word-chip__char">${w.character}</span>
                  <span class="word-chip__meaning">${w.emoji} ${w.meaning}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="onboarding__actions">
          ${renderDots()}
          <button class="btn btn--primary btn--large" id="btn-start">
            Start Practicing!
          </button>
          <button class="btn btn--secondary" id="btn-back">Back</button>
        </div>
      </div>
    `;

    // Word selection toggles
    app.querySelectorAll('.word-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const char = chip.dataset.char;
        if (selectedWords.has(char)) {
          selectedWords.delete(char);
          chip.classList.remove('word-chip--selected');
        } else {
          selectedWords.add(char);
          chip.classList.add('word-chip--selected');
        }
      });
    });

    // Start
    app.querySelector('#btn-start').addEventListener('click', () => {
      if (selectedWords.size === 0) return;

      const profile = storage.addProfile(profileData);
      const chosenWords = words.filter(w => selectedWords.has(w.character));
      storage.addWordsToProfile(profile.id, chosenWords);
      storage.setActiveProfileId(profile.id);
      navigate('session');
    });

    app.querySelector('#btn-back').addEventListener('click', () => { step = 1; render(); });
  }

  function renderDots() {
    return `
      <div class="progress-dots">
        ${[0, 1, 2].map(i => `
          <div class="progress-dots__dot ${i === step ? 'progress-dots__dot--active' : ''}"></div>
        `).join('')}
      </div>
    `;
  }

  render();
}
