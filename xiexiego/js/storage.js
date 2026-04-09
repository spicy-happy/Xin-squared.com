/**
 * StorageAdapter — localStorage backend for XieXieGo.
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

  /** Add words to a profile's word bank. */
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
