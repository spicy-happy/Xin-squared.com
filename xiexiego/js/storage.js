/**
 * StorageAdapter — localStorage backend for XieXie.
 * All keys are prefixed with `xxg_` to avoid collisions.
 *
 * TODO: Add Firebase Firestore backend for optional sharing features.
 */

const PREFIX = 'xxg_';

export class StorageAdapter {
  /** Read a value from storage, parsed from JSON. Returns fallback if missing. */
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  /** Write a value to storage as JSON. */
  set(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }

  /** Remove a key from storage. */
  remove(key) {
    localStorage.removeItem(PREFIX + key);
  }

  // --- Profile helpers ---

  /** Get all profiles. Returns an array. */
  getProfiles() {
    return this.get('profiles', []);
  }

  /** Save the profiles array. */
  saveProfiles(profiles) {
    this.set('profiles', profiles);
  }

  /** Add a new profile. Returns the created profile object. */
  removeProfile(profileId) {
    const profiles = this.getProfiles().filter(p => p.id !== profileId);
    this.saveProfiles(profiles);
    // Clean up pack metadata
    this.remove('packs_' + profileId);
    // Clear active profile if it was this one
    if (this.getActiveProfileId() === profileId) {
      this.remove('activeProfileId');
    }
  }

  addProfile({ name, avatar, age }) {
    const profiles = this.getProfiles();
    const profile = {
      id: this._generateId(),
      name,
      avatar,
      age,
      level: this._levelFromAge(age),
      createdAt: Date.now(),
      wordBank: [],
    };
    profiles.push(profile);
    this.saveProfiles(profiles);
    return profile;
  }

  /** Get a single profile by ID. */
  getProfile(id) {
    return this.getProfiles().find(p => p.id === id) || null;
  }

  /** Get/set the last active profile ID. */
  getActiveProfileId() {
    return this.get('activeProfileId', null);
  }

  setActiveProfileId(id) {
    this.set('activeProfileId', id);
  }

  /** Delete a profile by ID. */
  deleteProfile(id) {
    const profiles = this.getProfiles().filter(p => p.id !== id);
    this.saveProfiles(profiles);
    if (this.getActiveProfileId() === id) {
      this.set('activeProfileId', null);
    }
  }

  /** Add words to a profile's word bank. Preserves existing box/progress state. */
  addWordsToProfile(profileId, words) {
    const profiles = this.getProfiles();
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    for (const word of words) {
      if (!profile.wordBank.some(w => w.character === word.character)) {
        profile.wordBank.push({
          ...word,
          stage: 1,
          box: 1,
          consecutiveCorrect: 0,
          addedAt: Date.now(),
        });
      }
    }
    this.saveProfiles(profiles);

    // Pre-cache stroke data for new characters
    this._precacheStrokes(words.map(w => w.character));
  }

  /** Trigger stroke pre-caching via service worker */
  _precacheStrokes(characters) {
    const allChars = [];
    for (const word of characters) {
      for (const ch of word) allChars.push(ch);
    }
    if (allChars.length > 0 && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'PRECACHE_STROKES',
        characters: [...new Set(allChars)],
      });
    }
  }

  // --- Pack management ---

  /** Get imported packs for a profile. Returns array of pack metadata objects. */
  getImportedPacks(profileId) {
    return this.get(`packs_${profileId}`, []);
  }

  /** Save imported packs for a profile. */
  saveImportedPacks(profileId, packs) {
    this.set(`packs_${profileId}`, packs);
  }

  /**
   * Import a pack into a profile.
   * - Adds all words to the word bank (preserving existing progress)
   * - Stores pack metadata so we can organize by pack later
   * - For SWKD: stores lessons data on the pack metadata
   * @param {string} profileId
   * @param {Object} packData - The full pack JSON
   * @param {Object[]} enrichedWords - Pre-enriched word objects to add
   * @returns {{ added: number, skipped: number }}
   */
  importPack(profileId, packData, enrichedWords) {
    const profiles = this.getProfiles();
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return { added: 0, skipped: 0 };

    // Track which words belong to this pack
    const packWordChars = enrichedWords.map(w => w.character);

    // Add words, preserving existing box state
    let added = 0, skipped = 0;
    for (const word of enrichedWords) {
      const existing = profile.wordBank.find(w => w.character === word.character);
      if (existing) {
        // Word already exists — preserve progress, just ensure it's tagged with this pack
        if (!existing.packIds) existing.packIds = [];
        if (!existing.packIds.includes(packData.id)) existing.packIds.push(packData.id);
        // Update sequence if the pack provides one and this is the primary pack
        if (word.sequence != null && !existing.sequence) {
          existing.sequence = word.sequence;
        }
        skipped++;
      } else {
        profile.wordBank.push({
          ...word,
          stage: 1,
          box: 1,
          consecutiveCorrect: 0,
          addedAt: Date.now(),
          packIds: [packData.id],
        });
        added++;
      }
    }
    this.saveProfiles(profiles);

    // Store pack metadata (for organizing the word list view)
    const importedPacks = this.getImportedPacks(profileId);
    const existingPack = importedPacks.find(p => p.id === packData.id);
    if (!existingPack) {
      const packMeta = {
        id: packData.id,
        title: packData.title,
        titleZh: packData.titleZh || '',
        description: packData.description || '',
        totalWords: packData.totalWords,
        sequenced: packData.sequenced || false,
        importedAt: Date.now(),
        wordCharacters: packWordChars,
      };

      // Store subsets if present
      if (packData.subsets) {
        packMeta.subsets = packData.subsets;
      }

      // SWKD special: store full lessons data (生字→词语→句子)
      if (packData.lessons) {
        packMeta.lessons = packData.lessons;
      }

      importedPacks.push(packMeta);
      this.saveImportedPacks(profileId, importedPacks);
    }

    return { added, skipped };
  }

  /** Remove an imported pack from a profile (removes pack metadata + untags words). */
  removePack(profileId, packId) {
    // Remove pack metadata
    const importedPacks = this.getImportedPacks(profileId);
    const packMeta = importedPacks.find(p => p.id === packId);
    this.saveImportedPacks(profileId, importedPacks.filter(p => p.id !== packId));

    // Remove pack tag from words; delete words that have no other pack and no progress
    const profiles = this.getProfiles();
    const profile = profiles.find(p => p.id === profileId);
    if (!profile || !packMeta) return;

    profile.wordBank = profile.wordBank.filter(w => {
      if (!w.packIds || !w.packIds.includes(packId)) return true;
      w.packIds = w.packIds.filter(id => id !== packId);
      // Keep word if it belongs to another pack or has progress
      if (w.packIds.length > 0) return true;
      if (w.box > 1 || w.lastSeen) return true;
      return false; // Remove: no other pack, no progress
    });
    this.saveProfiles(profiles);
  }

  // --- Word management helpers ---

  /** Remove a word from a profile's word bank. */
  removeWordFromProfile(profileId, character) {
    const profiles = this.getProfiles();
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    profile.wordBank = profile.wordBank.filter(w => w.character !== character);
    this.saveProfiles(profiles);
  }

  /** Toggle star flag on a word. Returns the new star state. */
  toggleStarWord(profileId, character) {
    const profiles = this.getProfiles();
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return false;

    const word = profile.wordBank.find(w => w.character === character);
    if (!word) return false;

    if (word.starFlag) {
      word.starFlag = null;
    } else {
      word.starFlag = {
        starredAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      };
    }
    this.saveProfiles(profiles);
    return !!word.starFlag;
  }

  /** Update specific fields on a word in a profile. */
  updateWordInProfile(profileId, character, updates) {
    const profiles = this.getProfiles();
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    const word = profile.wordBank.find(w => w.character === character);
    if (!word) return;

    Object.assign(word, updates);
    this.saveProfiles(profiles);
  }

  // --- Internal ---

  _generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Map age to initial difficulty level per spec Section 2. */
  _levelFromAge(age) {
    const n = parseInt(age) || 4; // '<4' → NaN → 4 (defaults to youngest)
    if (age === '<4' || n <= 5) return 1;
    if (n <= 6) return 2;
    if (n <= 8) return 3;
    return 4; // 10+
  }
}
