/**
 * Enrichment pipeline — looks up character data from pre-built indices.
 *
 * Indices are lazy-loaded on first call and cached in memory.
 * cedict-index.json: single-character CC-CEDICT lookup (~0.9 MB)
 * mmah-index.json: Make Me a Hanzi lookup (~1.6 MB)
 *
 * Key format in cedict-index.json:
 *   { t: traditional, p: pinyin, m: marked pinyin, n: tone, d: [definitions] }
 *
 * Key format in mmah-index.json:
 *   { c: char, r: radical, k: strokeCount, d: decomposition,
 *     o: [components], e: {type, hint}, f: definition }
 */

let cedictIndex = null;
let mmahIndex = null;

/** Load an index JSON file. Returns the parsed object. */
async function loadIndex(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load ${url}: ${resp.status}`);
  return resp.json();
}

/** Ensure both indices are loaded. */
async function ensureIndices() {
  if (cedictIndex && mmahIndex) return;

  const [cedict, mmah] = await Promise.all([
    cedictIndex || loadIndex('./js/data/cedict-index.json'),
    mmahIndex || loadIndex('./js/data/mmah-index.json'),
  ]);
  cedictIndex = cedict;
  mmahIndex = mmah;
}

/**
 * Check if HanziWriter has stroke data for a character on the CDN.
 * Caches results to avoid repeated network requests.
 */
const strokeCache = {};
async function checkStrokeData(char) {
  if (char in strokeCache) return strokeCache[char];

  try {
    const resp = await fetch(
      `https://cdn.jsdelivr.net/npm/hanzi-writer-data@2/${encodeURIComponent(char)}.json`,
      { method: 'HEAD' }
    );
    strokeCache[char] = resp.ok;
  } catch {
    strokeCache[char] = false;
  }
  return strokeCache[char];
}

/**
 * Enrich a single character with data from CC-CEDICT and Make Me a Hanzi.
 *
 * @param {string} char - A single Chinese character
 * @returns {Promise<Object>} Enriched character data
 */
export async function enrichCharacter(char) {
  await ensureIndices();

  const cedict = cedictIndex[char];
  const mmah = mmahIndex[char];
  const hasStrokeData = await checkStrokeData(char);

  const enrichmentStatus =
    cedict && mmah && hasStrokeData ? 'complete' :
    cedict || mmah ? 'partial' : 'manual';

  return {
    character: char,
    meanings: cedict?.d || [],
    pinyin: cedict?.p || null,
    pinyinMarked: cedict?.m || null,
    tone: cedict?.n || null,
    traditional: cedict?.t || null,
    radical: mmah?.r || null,
    strokeCount: mmah?.k || null,
    decomposition: mmah?.d || null,
    components: mmah?.o || null,
    etymology: mmah?.e || null,
    hasStrokeData,
    enrichmentStatus,
    // Audio: check for pre-generated MP3, fall back to Web Speech API
    audioFile: cedict ? `./audio/${cedict.p}.mp3` : null,
  };
}

/**
 * Enrich multiple characters in parallel.
 *
 * @param {string[]} chars - Array of single Chinese characters
 * @returns {Promise<Object[]>} Array of enriched character data
 */
export async function enrichCharacters(chars) {
  await ensureIndices();
  return Promise.all(chars.map(c => enrichCharacter(c)));
}

/**
 * Speak a character using Web Speech API.
 * Used as fallback when pre-generated audio is not available.
 *
 * @param {string} text - Chinese text to speak
 * @returns {Promise<void>}
 */
export function speakChinese(text) {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('Speech synthesis not supported'));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.8; // Slightly slower for children
    utterance.onend = resolve;
    utterance.onerror = reject;
    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Play audio for a character. Tries pre-generated MP3 first,
 * falls back to Web Speech API.
 *
 * @param {string} character - Chinese character to speak
 * @param {string|null} audioFile - Path to pre-generated MP3 (or null)
 * @returns {Promise<void>}
 */
export async function playAudio(character, audioFile) {
  if (audioFile) {
    try {
      const audio = new Audio(audioFile);
      await audio.play();
      return;
    } catch {
      // MP3 not found or failed to play, fall through to TTS
    }
  }
  await speakChinese(character);
}
