/**
 * Onboarding — three-screen flow:
 *   1. Welcome + testing warning
 *   2. Create profile (name, avatar, age)
 *   3. Pick a word pack → imports it
 */

import { playClick } from '../sounds.js';
import { t, getLang, setLang } from '../i18n.js';

const AVATARS = ['🐼', '🐉', '🌸', '🎋', '🏮', '🦊', '🐯', '🐰', '🌈', '🦋', '🐬', '🌻'];
const AGES = ['<4', '4', '5', '6', '7', '8', '9', '10+'];

let packIndex = null;

async function loadPackIndex() {
  if (packIndex) return packIndex;
  const resp = await fetch('./js/data/packs/index.json');
  packIndex = await resp.json();
  return packIndex;
}

async function loadPackFile(filename) {
  const resp = await fetch(`./js/data/packs/${filename}`);
  return resp.json();
}

export function renderOnboarding(app, storage, navigate, { skipWelcome = false } = {}) {
  let step = skipWelcome ? 1 : 0;
  let profileData = { name: '', avatar: AVATARS[0], age: null };
  let selectedPackMetas = []; // multiple pack selection

  function render() {
    switch (step) {
      case 0: renderWelcome(); break;
      case 1: renderCreateProfile(); break;
      case 2: renderPickPack(); break;
    }
  }

  function renderWelcome() {
    const lang = getLang();
    app.innerHTML = `
      <div class="screen onboarding">
        <div class="onboarding__content">
          <h1 class="onboarding__title" style="font-size: 1.5rem;">${t('onboarding.howItWorks')}</h1>
          <div class="how-it-works">
            <div class="how-step">
              <span class="how-step__icon">📝</span>
              <div class="how-step__text">
                <strong>${t('onboarding.step1.title')}</strong>
                <span>${t('onboarding.step1.desc')}</span>
              </div>
            </div>
            <div class="how-step">
              <span class="how-step__icon">🎧</span>
              <div class="how-step__text">
                <strong>${t('onboarding.step2.title')}</strong>
                <span>${t('onboarding.step2.desc')}</span>
              </div>
            </div>
            <div class="how-step">
              <span class="how-step__icon">🧠</span>
              <div class="how-step__text">
                <strong>${t('onboarding.step3.title')}</strong>
                <span>${t('onboarding.step3.desc')}</span>
              </div>
            </div>
            <div class="how-step">
              <span class="how-step__icon">✍️</span>
              <div class="how-step__text">
                <strong>${t('onboarding.step4.title')}</strong>
                <span>${t('onboarding.step4.desc')}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="onboarding__actions">
          <button class="btn btn--primary btn--large" id="btn-next">
            ${t('onboarding.letsGo')}
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
          <h1 class="onboarding__title">${t('profile.create')}</h1>

          <div class="form-group">
            <label class="form-group__label">${t('profile.name')}</label>
            <input class="form-group__input" id="input-name" type="text"
                   placeholder="${t('profile.namePlaceholder')}" value="${profileData.name}" autocomplete="off">
          </div>

          <div class="form-group">
            <label class="form-group__label">${t('profile.pickAvatar')}</label>
            <div class="avatar-grid">
              ${AVATARS.map(a => `
                <button class="avatar-option ${a === profileData.avatar ? 'avatar-option--selected' : ''}"
                        data-avatar="${a}">${a}</button>
              `).join('')}
            </div>
          </div>

          <div class="form-group">
            <label class="form-group__label">${t('profile.age')}</label>
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
            <button class="btn btn--secondary" id="btn-back">${t('profile.back')}</button>
            <button class="btn btn--primary" id="btn-next" disabled>${t('profile.next')}</button>
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
    const index = await loadPackIndex();
    const packs = index.packs;

    app.innerHTML = `
      <div class="screen onboarding">
        <div class="onboarding__content">
          <h1 class="onboarding__title">${t('pack.pickTitle')}</h1>
          <p class="onboarding__desc">
            ${t('pack.pickDesc', profileData.name || 'your child')}
          </p>

          <div class="pack-grid">
            ${packs.map(p => {
              const isSelected = selectedPackMetas.some(s => s.id === p.id);
              return `
              <button class="pack-card ${isSelected ? 'pack-card--selected' : ''}" data-pack-id="${p.id}" data-pack-file="${p.file}">
                <div class="pack-card__info">
                  <strong class="pack-card__name">${p.title}</strong>
                  <span class="pack-card__desc">${p.description}</span>
                </div>
              </button>
            `}).join('')}
          </div>
        </div>

        <div class="onboarding__actions">
          <div class="onboarding__nav-row">
            <button class="btn btn--secondary" id="btn-back">${t('profile.back')}</button>
            <button class="btn btn--primary" id="btn-start" ${selectedPackMetas.length === 0 ? 'disabled' : ''}>${t('pack.letsStart')}</button>
          </div>
        </div>
      </div>
    `;

    const startBtn = app.querySelector('#btn-start');

    app.querySelectorAll('.pack-card').forEach(card => {
      card.addEventListener('click', () => {
        playClick();
        const packId = card.dataset.packId;
        const packMeta = packs.find(p => p.id === packId);
        const idx = selectedPackMetas.findIndex(s => s.id === packId);
        if (idx >= 0) {
          // Deselect
          selectedPackMetas.splice(idx, 1);
          card.classList.remove('pack-card--selected');
        } else {
          // Select
          selectedPackMetas.push(packMeta);
          card.classList.add('pack-card--selected');
        }
        startBtn.disabled = selectedPackMetas.length === 0;
      });
    });

    startBtn.addEventListener('click', async () => {
      if (selectedPackMetas.length === 0) return;
      playClick();

      startBtn.textContent = t('pack.settingUp');
      startBtn.disabled = true;

      try {
        // Create profile
        const profile = storage.addProfile(profileData);

        // Import all selected packs
        for (const meta of selectedPackMetas) {
          const packData = await loadPackFile(meta.file);

          const words = (packData.words || []).filter(w => w.character).map(w => ({
            character: w.character,
            meaning: w.meaning || '',
            pinyin: w.pinyin || '',
            pinyinMarked: w.pinyin || '',
            sequence: w.sequence || null,
            subset: w.subset || null,
            isCompound: w.character.length > 1,
            components: w.character.length > 1 ? [...w.character] : undefined,
            hasStrokeData: true,
          }));

          storage.importPack(profile.id, packData, words);
        }

        storage.setActiveProfileId(profile.id);
        navigate('profiles');
      } catch (err) {
        console.error('Pack import failed:', err);
        startBtn.textContent = t('pack.errorRetry');
        startBtn.disabled = false;
      }
    });

    app.querySelector('#btn-back').addEventListener('click', () => {
      playClick();
      step = 1;
      render();
    });
  }

  render();
}
