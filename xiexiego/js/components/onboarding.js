/**
 * Onboarding — three-screen flow:
 *   1. Welcome
 *   2. Create profile (name, avatar, age)
 *   3. Add first words from starter list
 */

import { enrichCharacters } from '../enrichment.js';

const AVATARS = ['🐼', '🐉', '🌸', '🎋', '🏮', '🦊', '🐯', '🐰', '🌈', '🦋', '🐬', '🌻'];
const AGES = ['<4', '4', '5', '6', '7', '8', '9', '10+'];

let starterData = null;

async function loadStarterWords() {
  if (starterData) return starterData;
  const resp = await fetch('./js/data/starter-words.json');
  starterData = await resp.json();
  return starterData;
}

/** Pick word tier based on age and return { words, preSelectCount }. */
function getWordsForAge(data, age) {
  const n = parseInt(age) || 5;
  if (age === '<4' || n <= 5) return { words: data.easy, preSelectCount: 6 };
  if (n <= 7) return { words: data.medium, preSelectCount: 6 };
  return { words: data.hard, preSelectCount: 6 };
}

export function renderOnboarding(app, storage, navigate, { skipWelcome = false } = {}) {
  let step = skipWelcome ? 1 : 0;
  let profileData = { name: '', avatar: AVATARS[0], age: null };
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
          <h1 class="onboarding__title" style="font-size: 1.5rem;">How it works</h1>
          <div class="how-it-works">
            <div class="how-step">
              <span class="how-step__icon">📝</span>
              <div class="how-step__text">
                <strong>Add words to practice list</strong>
                <span>Type words, pinyin and meaning autoadded</span>
              </div>
            </div>
            <div class="how-step">
              <span class="how-step__icon">🎧</span>
              <div class="how-step__text">
                <strong>Practice daily</strong>
                <span>5 min sessions — hear, match, trace, and write</span>
              </div>
            </div>
            <div class="how-step">
              <span class="how-step__icon">✅</span>
              <div class="how-step__text">
                <strong>Test when ready</strong>
                <span>Mock dictation test just like in class</span>
              </div>
            </div>
            <div class="how-step">
              <span class="how-step__icon">🌟</span>
              <div class="how-step__text">
                <strong>Ace the test</strong>
                <span>Words they struggle with get extra practice</span>
              </div>
            </div>
          </div>
        </div>
        <div class="onboarding__actions">
          <button class="btn btn--primary btn--large" id="btn-next">
            Let's go!
          </button>
        </div>
      </div>
    `;
    app.querySelector('#btn-next').addEventListener('click', () => { step = 1; render(); });
  }

  function renderCreateProfile() {
    app.innerHTML = `
      <div class="screen onboarding">
        <div class="onboarding__content">
          <h1 class="onboarding__title">Create a profile</h1>

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
          <div class="onboarding__nav-row">
            <button class="btn btn--secondary" id="btn-back">Back</button>
            <button class="btn btn--primary" id="btn-next" disabled>Next</button>
          </div>
        </div>
      </div>
    `;

    // Name input + validation
    const nameInput = app.querySelector('#input-name');
    const btnNext = app.querySelector('#btn-next');

    function updateNextState() {
      btnNext.disabled = !profileData.name || !profileData.age;
    }

    nameInput.addEventListener('input', () => {
      profileData.name = nameInput.value.trim();
      updateNextState();
    });
    updateNextState();

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
        profileData.age = btn.dataset.age;
        app.querySelectorAll('.age-chip').forEach(b => b.classList.remove('age-chip--selected'));
        btn.classList.add('age-chip--selected');
        updateNextState();
      });
    });

    // Navigation
    btnNext.addEventListener('click', () => {
      step = 2;
      render();
    });
    app.querySelector('#btn-back').addEventListener('click', () => { step = 0; render(); });
  }

  async function renderAddWords() {
    const data = await loadStarterWords();
    const { words, preSelectCount } = getWordsForAge(data, profileData.age);

    // Pre-select the first N words, leave the rest unselected
    if (selectedWords.size === 0) {
      words.slice(0, preSelectCount).forEach(w => selectedWords.add(w.character));
    }

    app.innerHTML = `
      <div class="screen onboarding">
        <div class="onboarding__content">
          <h1 class="onboarding__title">Add first words</h1>
          <p class="onboarding__desc">
            We picked some starters for ${profileData.name || 'your child'}.
            Tap to add or remove. You can always change later.
          </p>

          <div class="starter-words">
            <div class="starter-words__list">
              ${words.map(w => `
                <button class="word-chip ${selectedWords.has(w.character) ? 'word-chip--selected' : ''}"
                        data-char="${w.character}">
                  <span class="word-chip__char">${w.character}</span>
                  <span class="word-chip__meaning">${w.meaning}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="onboarding__actions">
          <div class="onboarding__nav-row">
            <button class="btn btn--secondary" id="btn-back">Back</button>
            <button class="btn btn--primary" id="btn-start">Let's Start!</button>
          </div>
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

    // Start — enrich selected words before saving
    app.querySelector('#btn-start').addEventListener('click', async () => {
      if (selectedWords.size === 0) return;

      const btn = app.querySelector('#btn-start');
      btn.textContent = 'Setting up...';
      btn.disabled = true;

      try {
        const profile = storage.addProfile(profileData);
        const chosenChars = [...selectedWords];

        // Run enrichment pipeline on selected characters
        const enriched = await enrichCharacters(chosenChars);

        // Merge enrichment data with starter-words metadata (emoji, meaning)
        const enrichedWords = enriched.map(e => {
          const starter = words.find(w => w.character === e.character);
          return {
            ...e,
            // Keep starter-words emoji; use enriched meaning if starter is generic
            emoji: starter?.emoji || null,
            meaning: starter?.meaning || e.meanings[0] || null,
          };
        });

        storage.addWordsToProfile(profile.id, enrichedWords);
        storage.setActiveProfileId(profile.id);
        navigate('session');
      } catch (err) {
        console.error('Enrichment failed, saving without enrichment:', err);
        // Fallback: save words without enrichment data
        const profile = storage.addProfile(profileData);
        const chosenWords = words.filter(w => selectedWords.has(w.character));
        storage.addWordsToProfile(profile.id, chosenWords);
        storage.setActiveProfileId(profile.id);
        navigate('session');
      }
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
