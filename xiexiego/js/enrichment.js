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
  if (!def) return '';
  let cleaned = def
    .replace(/\s*\(CL:[^)]*\)/g, '')           // Remove (CL:...) classifiers
    .replace(/\s*\[[\w\d\s]+\]/g, '')           // Remove [pinyin] refs
    .replace(/\s*\([^)]*\)/g, '')               // Remove all parenthetical notes
    .replace(/[\u4E00-\u9FFF\u3400-\u4DBF]+/g, '') // Remove Chinese characters
    .replace(/\|/g, '')                         // Remove pipe separators
    .replace(/^(used in|variant of|see also|see|cf\.)\s*/i, '')
    .replace(/^(surname|abbr\. for|old variant of)\s*.*/i, '')
    .replace(/^(and|or)\s+$/i, '')              // Remove lonely conjunctions
    .trim();
  // Take only the first meaning if semicolon-separated
  if (cleaned.includes(';')) cleaned = cleaned.split(';')[0].trim();
  // Skip if result is empty or too short to be useful
  if (cleaned.length < 2) return '';
  return cleaned;
}

/**
 * Generate a simple example usage for a character/word.
 * Uses common patterns kids would recognize.
 */
const EXAMPLES = {
  '大': { zh: '大象', en: 'big elephant' },
  '小': { zh: '小猫', en: 'small cat' },
  '人': { zh: '大人', en: 'adult' },
  '口': { zh: '入口', en: 'entrance' },
  '山': { zh: '山上', en: 'on the mountain' },
  '水': { zh: '喝水', en: 'drink water' },
  '日': { zh: '日出', en: 'sunrise' },
  '月': { zh: '月亮', en: 'moon' },
  '火': { zh: '火车', en: 'train' },
  '木': { zh: '木头', en: 'wood' },
  '天': { zh: '天气', en: 'weather' },
  '中': { zh: '中国', en: 'China' },
  '学': { zh: '学校', en: 'school' },
  '花': { zh: '花园', en: 'garden' },
  '鸟': { zh: '小鸟', en: 'little bird' },
  '一': { zh: '一个', en: 'one (of something)' },
  '二': { zh: '二月', en: 'February' },
  '三': { zh: '三个', en: 'three (of something)' },
  '上': { zh: '上学', en: 'go to school' },
  '下': { zh: '下雨', en: 'rain' },
  '白': { zh: '白云', en: 'white cloud' },
  '红': { zh: '红花', en: 'red flower' },
  '手': { zh: '洗手', en: 'wash hands' },
  '目': { zh: '目光', en: 'gaze' },
  '马': { zh: '小马', en: 'pony' },
  '牛': { zh: '牛奶', en: 'milk' },
  '风': { zh: '大风', en: 'strong wind' },
  '雨': { zh: '下雨', en: 'rain' },
  '云': { zh: '白云', en: 'white cloud' },
  '土': { zh: '土地', en: 'land' },
  '是': { zh: '是的', en: 'yes' },
  '我': { zh: '我的', en: 'mine' },
  '你': { zh: '你好', en: 'hello' },
  '好': { zh: '好吃', en: 'delicious' },
  '谢谢': { zh: '谢谢你', en: 'thank you' },
  '你好': { zh: '你好吗', en: 'how are you' },
  '学校': { zh: '去学校', en: 'go to school' },
  '蝴蝶': { zh: '小蝴蝶', en: 'little butterfly' },
  '再见': { zh: '说再见', en: 'say goodbye' },
  '家': { zh: '回家', en: 'go home' },
};

/**
 * Get an example for a character. Tries hardcoded table first,
 * then auto-generates from compounds index.
 */
function getExample(char) {
  if (EXAMPLES[char]) return EXAMPLES[char];

  // Auto-generate: find a common 2-char compound containing this character
  if (compoundsIndex && char.length === 1) {
    // Look for compounds starting with this char
    for (const key of Object.keys(compoundsIndex)) {
      if (key.startsWith(char) && key.length === 2) {
        const comp = compoundsIndex[key];
        const meaning = (comp.d || []).map(cleanDefinition).filter(Boolean)[0];
        if (meaning) return { zh: key, en: meaning };
      }
    }
    // Look for compounds ending with this char
    for (const key of Object.keys(compoundsIndex)) {
      if (key.endsWith(char) && key.length === 2) {
        const comp = compoundsIndex[key];
        const meaning = (comp.d || []).map(cleanDefinition).filter(Boolean)[0];
        if (meaning) return { zh: key, en: meaning };
      }
    }
  }
  return null;
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
  await ensureCompounds(); // needed for auto-generating examples

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
    example: getExample(char),
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
  // Sanitize: limit length, strip anything dangerous
  if (!text || typeof text !== 'string') return [];
  text = text.slice(0, 5000); // Cap at 5000 chars to prevent abuse

  await ensureIndices();
  await ensureCompounds();

  // Split by lines/commas/spaces — each segment is treated as a separate word group
  const segments = text.split(/[\n\r,，、;；\s]+/).filter(Boolean);

  const words = [];
  for (const segment of segments) {
    // Extract only CJK characters from this segment
    const cjk = [...segment].filter(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF);
    if (cjk.length === 0) continue;

    // If entire segment is CJK (e.g. 蝴蝶 on its own line), treat as one word
    // if it's a known compound OR has 2+ chars with no non-CJK separators
    const cjkStr = cjk.join('');
    if (cjk.length >= 2 && cjk.length <= 4 && compoundsIndex[cjkStr]) {
      words.push(cjkStr);
      continue;
    }

    // Otherwise: greedy left-to-right compound detection within segment
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
      example: getExample(w),
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
