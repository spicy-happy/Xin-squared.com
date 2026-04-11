/**
 * Test Mode — Phase 13
 * Mimics classroom 听写 format: audio plays, kid writes using HanziWriter
 * quiz mode which auto-grades strokes. Results feed back into Leitner box state.
 */

import { speakChinese, localCharDataLoader } from '../enrichment.js';
import { playClick, playCelebration, playSparkle, playBoop, playChime } from '../sounds.js';
import { t } from '../i18n.js';

function getStrokeColor() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? '#E8E8F0' : '#2D3436';
}

/** HanziWriter leniency for test mode — generous for kids */
const TEST_LENIENCY = 1.8;
const TEST_HINT_AFTER_MISSES = 3;
const MAX_MISTAKES_TO_PASS = 4; // per character

/**
 * Test builder — select words for a dictation test.
 */
export function renderTestBuilder(app, storage, navigate) {
  const profileId = storage.getActiveProfileId();
  const profile = storage.getProfile(profileId);
  if (!profile || !profile.wordBank.length) {
    navigate('words');
    return;
  }

  const words = profile.wordBank;
  const now = Date.now();
  const allWords = [...words];
  const packs = storage.getImportedPacks(profileId);
  const selected = new Set();
  let activeFilter = 'starred'; // 'all' | 'starred' | 'learning' | 'mastered' | 'pack:ID'

  // Pre-select starred words, or all if none starred
  const starredWords = allWords.filter(w => w.starFlag && w.starFlag.expiresAt > now);
  if (starredWords.length > 0) {
    for (const w of starredWords) selected.add(w.character);
  } else {
    activeFilter = 'all';
    for (const w of allWords) selected.add(w.character);
  }

  /** Sort words: starred on top, then by box level */
  function sortedWords(filterFn) {
    let list = filterFn ? allWords.filter(filterFn) : [...allWords];
    return list.sort((a, b) => {
      const aStar = a.starFlag && a.starFlag.expiresAt > now ? 1 : 0;
      const bStar = b.starFlag && b.starFlag.expiresAt > now ? 1 : 0;
      if (bStar !== aStar) return bStar - aStar;
      return (a.box || 1) - (b.box || 1);
    });
  }

  /** Get visible words based on active filter */
  function getVisibleWords() {
    if (activeFilter.startsWith('pack:')) {
      const packId = activeFilter.slice(5);
      return sortedWords(w => w.packIds?.includes(packId));
    }
    return sortedWords();
  }

  function applyFilter(filter) {
    selected.clear();
    activeFilter = filter;
    if (filter === 'none') {
      // clear all
    } else if (filter === 'all') {
      for (const w of allWords) selected.add(w.character);
    } else if (filter === 'starred') {
      for (const w of allWords) {
        if (w.starFlag && w.starFlag.expiresAt > now) selected.add(w.character);
      }
    } else if (filter === 'learning') {
      for (const w of allWords) {
        if ((w.box || 1) < 4) selected.add(w.character);
      }
    } else if (filter === 'mastered') {
      for (const w of allWords) {
        if ((w.box || 1) >= 4) selected.add(w.character);
      }
    } else if (filter.startsWith('pack:')) {
      const packId = filter.slice(5);
      for (const w of allWords) {
        if (w.packIds?.includes(packId)) selected.add(w.character);
      }
    }
  }

  function render() {
    const visible = getVisibleWords();
    const starCount = allWords.filter(w => w.starFlag && w.starFlag.expiresAt > now).length;
    const learningCount = allWords.filter(w => (w.box || 1) < 4).length;
    const masteredCount = allWords.filter(w => (w.box || 1) >= 4).length;

    app.innerHTML = `
      <div class="screen test-builder">
        <div class="word-editor__header">
          <button class="word-editor__back" id="btn-back">←</button>
          <span class="word-editor__name">${t('test.title')}</span>
        </div>

        <p class="test-builder__desc">${t('test.builderDesc')}</p>

        <div class="test-builder__filters">
          <button class="test-builder__pill ${activeFilter === 'all' ? 'test-builder__pill--active' : ''}" data-filter="all">
            ${t('test.selectAll')} (${allWords.length})
          </button>
          <button class="test-builder__pill ${activeFilter === 'starred' ? 'test-builder__pill--active' : ''}" data-filter="starred">
            ★ ${t('test.selectStarred')} (${starCount})
          </button>
          <button class="test-builder__pill ${activeFilter === 'learning' ? 'test-builder__pill--active' : ''}" data-filter="learning">
            ${t('test.filterLearning')} (${learningCount})
          </button>
          <button class="test-builder__pill ${activeFilter === 'mastered' ? 'test-builder__pill--active' : ''}" data-filter="mastered">
            ${t('test.filterMastered')} (${masteredCount})
          </button>
          ${packs.map(pack => {
            const packWordCount = allWords.filter(w => w.packIds?.includes(pack.id)).length;
            if (packWordCount === 0) return '';
            return `<button class="test-builder__pill ${activeFilter === 'pack:' + pack.id ? 'test-builder__pill--active' : ''}" data-filter="pack:${pack.id}">
              ${pack.title} (${packWordCount})
            </button>`;
          }).join('')}
          <button class="test-builder__pill" data-filter="none">
            ${t('test.selectNone')}
          </button>
        </div>

        <div class="test-builder__words" id="test-words">
          ${visible.map(w => {
            const isStar = w.starFlag && w.starFlag.expiresAt > now;
            return `
            <button class="test-builder__word ${selected.has(w.character) ? 'test-builder__word--selected' : ''}" data-char="${w.character}">
              <span class="test-builder__word-char">${w.character}</span>
              <span class="test-builder__word-star-toggle ${isStar ? 'test-builder__word-star-toggle--active' : ''}" data-star="${w.character}">★</span>
            </button>
          `}).join('')}
        </div>

        <div class="test-builder__footer">
          <button class="btn btn--primary" id="btn-start-test" ${selected.size === 0 ? 'disabled' : ''}>
            ${t('test.start', selected.size)}
          </button>
        </div>
      </div>
    `;

    // Back
    app.querySelector('#btn-back').addEventListener('click', () => { playClick(); navigate('words'); });

    // Filter pills
    app.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        playClick();
        applyFilter(btn.dataset.filter);
        render();
      });
    });

    // Star toggle — long press or tap the star icon
    app.querySelectorAll('[data-star]').forEach(starBtn => {
      starBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playClick();
        const ch = starBtn.dataset.star;
        const isNowStarred = storage.toggleStarWord(profileId, ch);
        // Update the in-memory word object
        const w = allWords.find(w => w.character === ch);
        if (w) {
          w.starFlag = isNowStarred ? { starredAt: now, expiresAt: now + 7 * 24 * 60 * 60 * 1000 } : null;
        }
        starBtn.classList.toggle('test-builder__word-star-toggle--active', isNowStarred);
      });
    });

    // Toggle individual words — update in-place without full re-render
    app.querySelectorAll('.test-builder__word').forEach(btn => {
      btn.addEventListener('click', () => {
        playClick();
        const ch = btn.dataset.char;
        if (selected.has(ch)) {
          selected.delete(ch);
          btn.classList.remove('test-builder__word--selected');
        } else {
          selected.add(ch);
          btn.classList.add('test-builder__word--selected');
        }
        const startBtn = app.querySelector('#btn-start-test');
        startBtn.disabled = selected.size === 0;
        startBtn.textContent = t('test.start', selected.size);
      });
    });

    // Start test
    app.querySelector('#btn-start-test').addEventListener('click', () => {
      playClick();
      const testWords = allWords.filter(w => selected.has(w.character));
      for (let i = testWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [testWords[i], testWords[j]] = [testWords[j], testWords[i]];
      }
      runTest(app, storage, navigate, testWords);
    });
  }

  render();
}

/**
 * Run the dictation test with HanziWriter auto-grading.
 */
function runTest(app, storage, navigate, testWords) {
  const profileId = storage.getActiveProfileId();
  let currentIndex = 0;
  const results = []; // { word, grade: 'correct' | 'wrong', mistakes }

  function renderWord() {
    if (currentIndex >= testWords.length) {
      renderResults();
      return;
    }

    const word = testWords[currentIndex];
    const total = testWords.length;
    const chars = word.character.split('');
    const isCompound = chars.length > 1;
    const writerSize = isCompound ? (chars.length <= 2 ? 160 : 120) : 240;

    app.innerHTML = `
      <div class="screen test-session">
        <div class="session__header">
          <button class="session__close" id="btn-test-close">×</button>
          <div class="session__progress">
            <div class="session__progress-bar">
              <div class="session__progress-fill" style="width: ${(currentIndex / total) * 100}%"></div>
            </div>
            <span class="session__progress-text">${currentIndex + 1} / ${total}</span>
          </div>
        </div>

        <div class="test-session__content">
          <div class="test-session__listen">
            <button class="test-session__play-btn" id="btn-play">🔊</button>
            <p class="test-session__hint">${t('test.listenAndWrite')}</p>
          </div>
          <div class="test-session__writers" id="writer-area">
            ${chars.map((ch, i) => `
              <div class="test-session__writer-slot" id="test-slot-${i}">
                <div id="test-writer-${i}" class="stroke__writer stroke__writer--grid"></div>
              </div>
            `).join('')}
          </div>
          <div class="test-session__progress-dots" id="test-dots">
            ${isCompound ? chars.map((_, i) => `<span class="stroke__dot" id="test-dot-${i}"></span>`).join('') : ''}
          </div>
        </div>
      </div>
    `;

    app.querySelector('#btn-test-close').addEventListener('click', () => {
      playClick();
      navigate('words');
    });

    // Play audio twice with a pause
    const playBtn = app.querySelector('#btn-play');
    let audioPlaying = false;
    async function playAudio() {
      if (audioPlaying) return;
      audioPlaying = true;
      await speakChinese(word.character, 0.5);
      await new Promise(r => setTimeout(r, 1500));
      await speakChinese(word.character, 0.5);
      audioPlaying = false;
    }
    playAudio();
    playBtn.addEventListener('click', () => playAudio());

    // Track duplicate chars (same char shown statically after first write)
    const seenChars = new Set();
    const isDuplicate = chars.map(ch => {
      if (seenChars.has(ch)) return true;
      seenChars.add(ch);
      return false;
    });

    // Create HanziWriter instances
    const writers = [];
    for (let i = 0; i < chars.length; i++) {
      if (isDuplicate[i]) {
        // Show as static text for duplicate chars
        const slot = app.querySelector(`#test-writer-${i}`);
        slot.innerHTML = `<span style="font-size:${writerSize * 0.55}px; display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:var(--color-text)">${chars[i]}</span>`;
        writers.push(null);
        continue;
      }

      try {
        const w = HanziWriter.create(
          app.querySelector(`#test-writer-${i}`),
          chars[i],
          {
            charDataLoader: localCharDataLoader,
            width: writerSize,
            height: writerSize,
            padding: 10,
            showOutline: false,
            showCharacter: false,
            strokeColor: getStrokeColor(),
            highlightColor: '#4A90D9',
            drawingColor: getStrokeColor(),
            drawingWidth: 36,
            acceptBackwardsStrokes: true,
            showHintAfterMisses: TEST_HINT_AFTER_MISSES,
            highlightOnComplete: true,
            leniency: TEST_LENIENCY,
          }
        );
        writers.push(w);
      } catch (err) {
        console.error('HanziWriter error for', chars[i], err);
        writers.push(null);
      }
    }

    // Run quiz for each character sequentially
    runCharQuizzes(word, chars, writers, isDuplicate, isCompound);
  }

  async function runCharQuizzes(word, chars, writers, isDuplicate, isCompound) {
    let totalMistakes = 0;

    for (let i = 0; i < chars.length; i++) {
      if (isDuplicate[i]) {
        const dot = app.querySelector(`#test-dot-${i}`);
        if (dot) dot.classList.add('stroke__dot--done');
        continue;
      }

      const w = writers[i];
      if (!w) continue;

      // Highlight active slot
      app.querySelectorAll('.test-session__writer-slot').forEach((slot, j) => {
        slot.classList.toggle('stroke__slot--active', j === i);
        slot.classList.toggle('stroke__slot--done', j < i);
      });

      // Run HanziWriter quiz
      let charMistakes = 0;
      await new Promise((resolve) => {
        w.quiz({
          onMistake: () => { charMistakes++; totalMistakes++; },
          onComplete: () => { resolve(); }
        });
      });

      // Mark done
      const dot = app.querySelector(`#test-dot-${i}`);
      if (dot) dot.classList.add('stroke__dot--done');
      playChime();

      if (isCompound) {
        await speakChinese(chars[i], 0.5);
        await new Promise(r => setTimeout(r, 200));
      }
    }

    // Mark all slots done
    app.querySelectorAll('.test-session__writer-slot').forEach(slot => {
      slot.classList.remove('stroke__slot--active');
      slot.classList.add('stroke__slot--done');
    });

    // Auto-grade: pass if average mistakes per unique char <= threshold
    const uniqueChars = chars.filter((_, i) => !isDuplicate[i]).length;
    const avgMistakes = uniqueChars > 0 ? totalMistakes / uniqueChars : 0;
    const passed = avgMistakes <= MAX_MISTAKES_TO_PASS;

    // Show result briefly
    const meaning = word.meaning || word.meanings?.[0] || '';
    if (passed) {
      playSparkle();
    } else {
      playBoop();
    }

    // Show the correct character + meaning briefly
    const content = app.querySelector('.test-session__content');
    if (content) {
      const resultDiv = document.createElement('div');
      resultDiv.className = 'test-session__result';
      resultDiv.innerHTML = `
        <span class="test-session__result-icon">${passed ? '✓' : '✗'}</span>
        <span class="test-session__result-char">${word.character}</span>
        <span class="test-session__result-meaning">${meaning}</span>
      `;
      resultDiv.classList.add(passed ? 'test-session__result--correct' : 'test-session__result--wrong');
      content.appendChild(resultDiv);
    }

    await speakChinese(word.character, 0.5);
    await new Promise(r => setTimeout(r, 1200));

    results.push({ word, grade: passed ? 'correct' : 'wrong', mistakes: totalMistakes });
    currentIndex++;
    renderWord();
  }

  function renderResults() {
    const correct = results.filter(r => r.grade === 'correct');
    const wrong = results.filter(r => r.grade === 'wrong');
    const total = results.length;
    const pct = total > 0 ? Math.round((correct.length / total) * 100) : 0;

    // Update Leitner box state based on results
    // Passing = mastered (box 5), failing = box 1
    for (const r of results) {
      let updates;
      if (r.grade === 'correct') {
        updates = {
          box: 5,
          lastSeen: Date.now(),
          consecutiveCorrect: (r.word.consecutiveCorrect || 0) + 1,
        };
      } else {
        updates = {
          box: 1,
          lastSeen: Date.now(),
          consecutiveCorrect: 0,
        };
      }
      storage.updateWordInProfile(profileId, r.word.character, updates);
    }

    // Save test history
    const profiles = storage.getProfiles();
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      if (!profile.testHistory) profile.testHistory = [];
      profile.testHistory.push({
        date: Date.now(),
        total,
        correct: correct.length,
        wrong: wrong.length,
        pct,
        words: results.map(r => ({ character: r.word.character, grade: r.grade })),
      });
      if (profile.testHistory.length > 20) {
        profile.testHistory = profile.testHistory.slice(-20);
      }
      storage.saveProfiles(profiles);
    }

    playCelebration();

    app.innerHTML = `
      <div class="screen test-results">
        <div class="test-results__header">
          <h1 class="test-results__score">${pct}%</h1>
          <p class="test-results__summary">${t('test.resultSummary', correct.length, total)}</p>
        </div>

        ${correct.length > 0 ? `
          <div class="test-results__section">
            <h3 class="test-results__label">${t('test.gotThese')} ✓</h3>
            <div class="test-results__words">
              ${correct.map(r => `<span class="test-results__word test-results__word--correct">${r.word.character}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        ${wrong.length > 0 ? `
          <div class="test-results__section">
            <h3 class="test-results__label">${t('test.practiceThese')} ✗</h3>
            <div class="test-results__words">
              ${wrong.map(r => `<span class="test-results__word test-results__word--wrong">${r.word.character}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <div class="test-results__actions">
          <button class="btn btn--primary" id="btn-practice-wrong" ${wrong.length === 0 ? 'style="display:none"' : ''}>
            ${t('test.practiceWrong')}
          </button>
          <button class="btn btn--secondary" id="btn-done-test">${t('test.backToWords')}</button>
        </div>
      </div>
    `;

    app.querySelector('#btn-done-test').addEventListener('click', () => {
      playClick();
      navigate('words');
    });

    const practiceBtn = app.querySelector('#btn-practice-wrong');
    if (practiceBtn) {
      practiceBtn.addEventListener('click', () => {
        playClick();
        const now = Date.now();
        for (const r of wrong) {
          storage.updateWordInProfile(profileId, r.word.character, {
            starFlag: { starredAt: now, expiresAt: now + 7 * 24 * 60 * 60 * 1000 },
          });
        }
        navigate('session');
      });
    }
  }

  renderWord();
}
