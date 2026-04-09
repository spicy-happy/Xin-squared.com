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
let compoundsIndex = null;

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

/** Lazy-load compounds index on demand. */
async function ensureCompounds() {
  if (compoundsIndex) return;
  try {
    compoundsIndex = await loadIndex('./js/data/cedict-compounds.json');
  } catch {
    compoundsIndex = {};
  }
}

/**
 * Clean a CC-CEDICT definition string.
 * Removes: CL classifiers, bracketed pinyin refs, "variant of", "surname", etc.
 */
function cleanDefinition(def) {
  if (!def) return def;
  return def
    .replace(/\s*\(CL:[^)]*\)/g, '')           // Remove (CL:...) classifiers
    .replace(/\s*\[[\w\d\s]+\]/g, '')           // Remove [pinyin] refs like [hu2 die2]
    .replace(/^(used in|variant of|see also)\s+\S+\s*/i, '') // Remove "used in X" prefixes
    .replace(/^(surname|abbr\. for)\s+.*/i, '') // Remove surname/abbr entries
    .trim();
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

  const rawMeanings = cedict?.d || [];
  const meanings = rawMeanings.map(cleanDefinition).filter(Boolean);

  return {
    character: char,
    meanings,
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
 * Parse a string of Chinese text into words (detecting compounds)
 * and enrich each word. E.g. "蝴蝶大" → [蝴蝶 (butterfly), 大 (big)].
 *
 * Greedy left-to-right: tries 2-char compound first, falls back to single char.
 *
 * @param {string} text - Raw Chinese text input
 * @returns {Promise<Object[]>} Array of enriched word objects
 */
export async function parseAndEnrich(text) {
  await ensureIndices();
  await ensureCompounds();

  // Extract only CJK characters
  const cjk = [...text].filter(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF);
  if (cjk.length === 0) return [];

  // Greedy left-to-right compound detection
  const words = [];
  let i = 0;
  while (i < cjk.length) {
    if (i + 1 < cjk.length) {
      const pair = cjk[i] + cjk[i + 1];
      if (compoundsIndex[pair]) {
        words.push(pair);
        i += 2;
        continue;
      }
    }
    words.push(cjk[i]);
    i++;
  }

  // Deduplicate while preserving order
  const seen = new Set();
  const unique = words.filter(w => { if (seen.has(w)) return false; seen.add(w); return true; });

  // Enrich each word
  return Promise.all(unique.map(async (w) => {
    if (w.length === 1) {
      return enrichCharacter(w);
    }
    // Compound: use compounds index for definition/pinyin
    const compound = compoundsIndex[w];
    const meanings = (compound?.d || []).map(cleanDefinition).filter(Boolean);
    // Check stroke data for first character (compounds use HanziWriter per-char)
    const hasStrokeData = await checkStrokeData(w[0]);
    return {
      character: w,
      meanings,
      pinyin: compound?.p || null,
      pinyinMarked: compound?.m || null,
      tone: compound?.n || null,
      traditional: compound?.t || null,
      isCompound: true,
      components: [...w],
      hasStrokeData,
      enrichmentStatus: compound ? 'complete' : 'manual',
      audioFile: compound ? `./audio/${compound.p}.mp3` : null,
    };
  }));
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
