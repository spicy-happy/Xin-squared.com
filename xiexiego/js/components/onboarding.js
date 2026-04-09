/**
 * Onboarding — four-screen flow:
 *   1. Welcome + testing warning
 *   2. Create profile (name, avatar, age)
 *   3. Pick a word pack
 *   4. Select categories from the pack
 */

import { enrichCharacters, parseAndEnrich } from '../enrichment.js';
import { playClick } from '../sounds.js';

const AVATARS = ['🐼', '🐉', '🌸', '🎋', '🏮', '🦊', '🐯', '🐰', '🌈', '🦋', '🐬', '🌻'];
const AGES = ['<4', '4', '5', '6', '7', '8', '9', '10+'];

let packsData = null;

async function loadWordPacks() {
  if (packsData) return packsData;
  const resp = await fetch('./js/data/word-packs.json');
  packsData = await resp.json();
  return packsData;
}

export function renderOnboarding(app, storage, navigate, { skipWelcome = false } = {}) {
  let step = skipWelcome ? 1 : 0;
  let profileData = { name: '', avatar: AVATARS[0], age: null };
  let selectedPack = null;
  let selectedCategories = new Set();

  function render() {
    switch (step) {
      case 0: renderWelcome(); break;
      case 1: renderCreateProfile(); break;
      case 2: renderPickPack(); break;
      case 3: renderPickCategories(); break;
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
                <strong>Pick a word pack</strong>
                <span>Choose from curated packs or add your own words</span>
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
    app.querySelector('#btn-next').addEventListener('click', () => {
      playClick();
      step = 1;
      render();
    });
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

    app.querySelectorAll('.avatar-option').forEach(btn => {
      btn.addEventListener('click', () => {
        playClick();
        profileData.avatar = btn.dataset.avatar;
        app.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('avatar-option--selected'));
        btn.classList.add('avatar-option--selected');
      });
    });

    app.querySelectorAll('.age-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        playClick();
        profileData.age = btn.dataset.age;
        app.querySelectorAll('.age-chip').forEach(b => b.classList.remove('age-chip--selected'));
        btn.classList.add('age-chip--selected');
        updateNextState();
      });
    });

    btnNext.addEventListener('click', () => {
      playClick();
      step = 2;
      render();
    });
    app.querySelector('#btn-back').addEventListener('click', () => {
      playClick();
      if (skipWelcome) { navigate('profiles'); } else { step = 0; render(); }
    });
  }

  async function renderPickPack() {
    const data = await loadWordPacks();
    const packs = data.packs;

    app.innerHTML = `
      <div class="screen onboarding">
        <div class="onboarding__content">
          <h1 class="onboarding__title">Pick a word pack</h1>
          <p class="onboarding__desc">
            Choose a starting pack for ${profileData.name || 'your child'}.
            You can always add more words later.
          </p>

          <div class="pack-grid">
            ${packs.map(p => `
              <button class="pack-card ${selectedPack?.id === p.id ? 'pack-card--selected' : ''}" data-pack-id="${p.id}">
                <span class="pack-card__icon">${p.icon}</span>
                <div class="pack-card__info">
                  <strong class="pack-card__name">${p.name}</strong>
                  <span class="pack-card__desc">${p.description}</span>
                  <span class="pack-card__meta">Ages ${p.ageRange} · ${p.categories.length} categories</span>
                </div>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="onboarding__actions">
          <div class="onboarding__nav-row">
            <button class="btn btn--secondary" id="btn-back">Back</button>
            <button class="btn btn--primary" id="btn-next" ${!selectedPack ? 'disabled' : ''}>Next</button>
          </div>
        </div>
      </div>
    `;

    const btnNext = app.querySelector('#btn-next');

    app.querySelectorAll('.pack-card').forEach(card => {
      card.addEventListener('click', () => {
        playClick();
        const packId = card.dataset.packId;
        selectedPack = packs.find(p => p.id === packId);
        selectedCategories = new Set();
        app.querySelectorAll('.pack-card').forEach(c => c.classList.remove('pack-card--selected'));
        card.classList.add('pack-card--selected');
        btnNext.disabled = false;
      });
    });

    btnNext.addEventListener('click', () => {
      playClick();
      step = 3;
      render();
    });
    app.querySelector('#btn-back').addEventListener('click', () => {
      playClick();
      step = 1;
      render();
    });
  }

  async function renderPickCategories() {
    if (!selectedPack) { step = 2; render(); return; }

    // Pre-select first 3 categories if nothing selected yet
    if (selectedCategories.size === 0) {
      selectedPack.categories.slice(0, 3).forEach(c => selectedCategories.add(c.name));
    }

    const totalWords = selectedPack.categories
      .filter(c => selectedCategories.has(c.name))
      .reduce((sum, c) => sum + c.words.length, 0);

    app.innerHTML = `
      <div class="screen onboarding">
        <div class="onboarding__content">
          <h1 class="onboarding__title">${selectedPack.icon} ${selectedPack.name}</h1>
          <p class="onboarding__desc">
            Pick categories for ${profileData.name || 'your child'} to start with.
            <strong id="word-count">${totalWords} words selected</strong>
          </p>

          <div class="category-list">
            ${selectedPack.categories.map(cat => `
              <button class="category-chip ${selectedCategories.has(cat.name) ? 'category-chip--selected' : ''}"
                      data-category="${cat.name}">
                <span class="category-chip__name">${cat.name}</span>
                <span class="category-chip__count">${cat.words.length}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="onboarding__actions">
          <div class="onboarding__nav-row">
            <button class="btn btn--secondary" id="btn-back">Back</button>
            <button class="btn btn--primary" id="btn-start" ${selectedCategories.size === 0 ? 'disabled' : ''}>
              Let's Start!
            </button>
          </div>
        </div>
      </div>
    `;

    const startBtn = app.querySelector('#btn-start');
    const wordCountEl = app.querySelector('#word-count');

    function updateCount() {
      const count = selectedPack.categories
        .filter(c => selectedCategories.has(c.name))
        .reduce((sum, c) => sum + c.words.length, 0);
      wordCountEl.textContent = `${count} words selected`;
      startBtn.disabled = selectedCategories.size === 0;
    }

    app.querySelectorAll('.category-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        playClick();
        const name = chip.dataset.category;
        if (selectedCategories.has(name)) {
          selectedCategories.delete(name);
          chip.classList.remove('category-chip--selected');
        } else {
          selectedCategories.add(name);
          chip.classList.add('category-chip--selected');
        }
        updateCount();
      });
    });

    // Start — collect words from selected categories, enrich, and save
    startBtn.addEventListener('click', async () => {
      if (selectedCategories.size === 0) return;
      playClick();

      startBtn.textContent = 'Setting up...';
      startBtn.disabled = true;

      try {
        const profile = storage.addProfile(profileData);

        // Collect all words from selected categories (deduplicated)
        const seen = new Set();
        const allWords = [];
        for (const cat of selectedPack.categories) {
          if (!selectedCategories.has(cat.name)) continue;
          for (const w of cat.words) {
            if (!seen.has(w)) {
              seen.add(w);
              allWords.push(w);
            }
          }
        }

        // Enrich all words via parseAndEnrich (handles compounds + single chars)
        const enriched = await parseAndEnrich(allWords.join('\n'));

        storage.addWordsToProfile(profile.id, enriched);
        storage.setActiveProfileId(profile.id);
        navigate('session');
      } catch (err) {
        console.error('Enrichment failed:', err);
        // Fallback: save words without enrichment
        const profile = storage.addProfile(profileData);
        const words = [];
        const seen = new Set();
        for (const cat of selectedPack.categories) {
          if (!selectedCategories.has(cat.name)) continue;
          for (const w of cat.words) {
            if (!seen.has(w)) {
              seen.add(w);
              words.push({ character: w });
            }
          }
        }
        storage.addWordsToProfile(profile.id, words);
        storage.setActiveProfileId(profile.id);
        navigate('session');
      }
    });

    app.querySelector('#btn-back').addEventListener('click', () => {
      playClick();
      step = 2;
      render();
    });
  }

  render();
}
