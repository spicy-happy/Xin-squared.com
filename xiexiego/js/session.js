/**
 * Session Planner — minimal Phase 4 version.
 * Picks words from the profile's word bank, runs exposure activity
 * for each, then shows celebration screen.
 *
 * TODO: Full Leitner logic, interleaving, multiple activity types.
 */

import { renderExposure } from './activities/exposure.js';

/**
 * Run a practice session for the active profile.
 */
export function renderSession(app, storage, navigate) {
  const profileId = storage.getActiveProfileId();
  const profile = storage.getProfile(profileId);
  if (!profile || !profile.wordBank.length) {
    navigate('words');
    return;
  }

  // Pick session words: starred first, then Box 1, limit 5
  const now = Date.now();
  const words = profile.wordBank;
  const starred = words.filter(w => w.starFlag && w.starFlag.expiresAt > now);
  const box1 = words.filter(w => w.box === 1 && (!w.starFlag || w.starFlag.expiresAt <= now));
  const sessionWords = [...starred, ...box1].slice(0, 5);

  // If no eligible words, show all words (light review)
  if (sessionWords.length === 0) {
    sessionWords.push(...words.slice(0, 5));
  }

  let currentIndex = 0;

  function render() {
    if (currentIndex >= sessionWords.length) {
      renderCelebration();
      return;
    }

    const word = sessionWords[currentIndex];
    const total = sessionWords.length;

    app.innerHTML = `
      <div class="screen session">
        <div class="session__header">
          <button class="session__close" id="btn-session-close">×</button>
          <div class="session__progress">
            <div class="session__progress-bar">
              <div class="session__progress-fill" style="width: ${((currentIndex) / total) * 100}%"></div>
            </div>
            <span class="session__progress-text">${currentIndex + 1} / ${total}</span>
          </div>
        </div>
        <div id="activity-container" class="session__activity"></div>
      </div>
    `;

    // Close button
    app.querySelector('#btn-session-close').addEventListener('click', () => {
      navigate('profiles');
    });

    // Render the exposure activity into the container
    const container = app.querySelector('#activity-container');
    renderExposure(container, word, () => {
      currentIndex++;
      render();
    });
  }

  function renderCelebration() {
    const count = sessionWords.length;

    app.innerHTML = `
      <div class="screen session-celebration">
        <div class="session-celebration__content">
          <div class="session-celebration__emoji">🎉</div>
          <h1 class="session-celebration__title">Great job!</h1>
          <p class="session-celebration__desc">
            You practiced ${count} word${count !== 1 ? 's' : ''} today!
          </p>
          <div class="session-celebration__words">
            ${sessionWords.map(w => `<span class="session-celebration__word">${w.character}</span>`).join('')}
          </div>
        </div>
        <div class="session-celebration__actions">
          <button class="btn btn--primary" id="btn-again" style="width: 100%;">
            Keep practicing
          </button>
          <button class="btn btn--secondary" id="btn-done">
            All done!
          </button>
        </div>
      </div>
    `;

    app.querySelector('#btn-again').addEventListener('click', () => {
      currentIndex = 0;
      render();
    });
    app.querySelector('#btn-done').addEventListener('click', () => {
      navigate('profiles');
    });
  }

  render();
}
