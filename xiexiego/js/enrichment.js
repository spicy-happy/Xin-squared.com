/**
 * Enrichment pipeline — looks up character data from pre-built indices.
 *
 * Indices are lazy-loaded on first call and cached in memory.
 * cedict-index.json: single-character CC-CEDICT lookup (~0.9 MB)
 * mmah-index.json: Make Me a Hanzi lookup (~1.6 MB)
 *
 * Key format in cedict-index.json:
 *   { t: traditional, p: pinyin, m: marked pinyin, n: tone, d: [definitions],
 *     ex: example word, r: kangxi radical number (if char IS a radical),
 *     rv: radical variant (traditional form) }
 *
 * Key format in mmah-index.json:
 *   { c: char, r: radical, k: strokeCount, d: decomposition,
 *     o: [components], e: {type, hint}, f: definition }
 */

let cedictIndex = null;
let mmahIndex = null;
let compoundsIndex = null;

/**
 * Fix malformed pinyin marked strings like "lu:4 sè" → "lǜ sè".
 * CEDICT uses "u:" for ü and sometimes leaves tone numbers unconverted.
 */
const U_TONE_MAP = { 'u:1': 'ǖ', 'u:2': 'ǘ', 'u:3': 'ǚ', 'u:4': 'ǜ', 'u:5': 'ü', 'u:': 'ü' };
function fixPinyinMarked(s) {
  if (!s) return s;
  // Replace u: + tone number patterns
  return s.replace(/u:[1-5]?/g, match => U_TONE_MAP[match] || match);
}

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

// Block vulgar/inappropriate content — this is a kids' app
const INAPPROPRIATE = /\bpenis\b|\bvagina\b|\bvulva\b|\bfuck\b|\bshit\b|\bdick\b|\bcock\b|\bprostitut\b|\bcopulat\b|\btesticle\b|\borgasm\b|\bmasturbat\b|\bejaculat\b|\bsemen\b|\bscrotum\b|\bphallus\b|\bclitoris\b|\bslut\b|\bwhore\b|\berotic\b|\bpornograph\b/i;

/**
 * Clean a CC-CEDICT definition string.
 * Removes: CL classifiers, bracketed pinyin refs, "variant of", "surname", etc.
 * Also filters out vulgar/inappropriate content.
 */
function cleanDefinition(def) {
  if (!def) return '';
  if (INAPPROPRIATE.test(def)) return '';
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
  if (!cleaned) return '';
  return cleaned;
}

/**
 * Generate a simple example usage for a character/word.
 * Uses common patterns kids would recognize.
 */
/**
 * Emoji illustrations for common characters.
 * Shown during exposure to make the experience more visual and fun.
 */
const ILLUSTRATIONS = {
  '大': '🐘', '小': '🐱', '人': '🧑', '口': '👄', '山': '⛰️',
  '水': '💧', '日': '☀️', '月': '🌙', '火': '🔥', '木': '🌳',
  '天': '🌤️', '中': '🇨🇳', '学': '📚', '花': '🌸', '鸟': '🐦',
  '一': '☝️', '二': '✌️', '三': '🤟', '上': '⬆️', '下': '⬇️',
  '白': '☁️', '红': '❤️', '手': '✋', '目': '👀', '马': '🐴',
  '牛': '🐄', '风': '🌬️', '雨': '🌧️', '云': '☁️', '土': '🌍',
  '是': '✅', '我': '🙋', '你': '👋', '好': '👍', '家': '🏠',
  '鱼': '🐟', '猫': '🐱', '狗': '🐕', '虫': '🐛', '草': '🌿',
  '果': '🍎', '瓜': '🍉', '米': '🍚', '田': '🌾', '石': '🪨',
  '金': '🥇', '车': '🚗', '门': '🚪', '书': '📖', '笔': '✏️',
  '星': '⭐', '心': '❤️', '眼': '👁️', '耳': '👂', '足': '🦶',
  '爸': '👨', '妈': '👩', '哥': '👦', '姐': '👧', '弟': '👦',
  '妹': '👧', '朋': '🤝', '友': '🤝', '老': '👴', '师': '👩‍🏫',
  '飞': '✈️', '走': '🚶', '跑': '🏃', '吃': '🍽️', '喝': '🥤',
  '看': '👀', '听': '👂', '说': '💬', '笑': '😊', '哭': '😢',
  '蝴蝶': '🦋', '谢谢': '🙏', '你好': '👋', '学校': '🏫',
  '再见': '👋', '爸爸': '👨', '妈妈': '👩', '老师': '👩‍🏫',
  '朋友': '🤝', '苹果': '🍎', '西瓜': '🍉', '太阳': '☀️',
  '月亮': '🌙', '星星': '⭐', '大象': '🐘', '小鸟': '🐦',
};

/** Get emoji illustration for a character/word. */
export function getIllustration(char) {
  return ILLUSTRATIONS[char] || null;
}

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
  '四': { zh: '四月', en: 'April' },
  '五': { zh: '五个', en: 'five (of something)' },
  '六': { zh: '六月', en: 'June' },
  '七': { zh: '七月', en: 'July' },
  '八': { zh: '八月', en: 'August' },
  '九': { zh: '九月', en: 'September' },
  '十': { zh: '十个', en: 'ten (of something)' },
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
  '耳': { zh: '耳朵', en: 'ear' },
  // Body & appearance
  '脸': { zh: '洗脸', en: 'wash face' },
  '头': { zh: '头发', en: 'hair' },
  '眼': { zh: '眼睛', en: 'eyes' },
  '鼻': { zh: '鼻子', en: 'nose' },
  '嘴': { zh: '嘴巴', en: 'mouth' },
  '牙': { zh: '牙齿', en: 'teeth' },
  '身': { zh: '身体', en: 'body' },
  '发': { zh: '头发', en: 'hair' },
  '足': { zh: '手足', en: 'hands and feet' },
  // Animals
  '猫': { zh: '小猫', en: 'kitten' },
  '狗': { zh: '小狗', en: 'puppy' },
  '鱼': { zh: '小鱼', en: 'little fish' },
  '羊': { zh: '小羊', en: 'little lamb' },
  '虫': { zh: '小虫', en: 'little bug' },
  '草': { zh: '小草', en: 'little grass' },
  // Colors
  '黑': { zh: '黑色', en: 'black color' },
  '黄': { zh: '黄色', en: 'yellow color' },
  '蓝': { zh: '蓝色', en: 'blue color' },
  '绿': { zh: '绿色', en: 'green color' },
  '紫': { zh: '紫色', en: 'purple color' },
  // Food
  '饭': { zh: '吃饭', en: 'eat rice' },
  '米': { zh: '米饭', en: 'rice' },
  '肉': { zh: '鸡肉', en: 'chicken meat' },
  '蛋': { zh: '鸡蛋', en: 'egg' },
  '茶': { zh: '喝茶', en: 'drink tea' },
  '奶': { zh: '牛奶', en: 'milk' },
  // Nature
  '石': { zh: '石头', en: 'rock' },
  '田': { zh: '田地', en: 'field' },
  '树': { zh: '大树', en: 'big tree' },
  // Actions
  '走': { zh: '走路', en: 'walk' },
  '跑': { zh: '跑步', en: 'run' },
  '飞': { zh: '飞机', en: 'airplane' },
  '看': { zh: '看书', en: 'read a book' },
  '听': { zh: '听话', en: 'listen well' },
  '吃': { zh: '吃饭', en: 'eat' },
  '喝': { zh: '喝水', en: 'drink water' },
  '写': { zh: '写字', en: 'write characters' },
  '读': { zh: '读书', en: 'study' },
  '画': { zh: '画画', en: 'draw pictures' },
  '玩': { zh: '玩耍', en: 'play' },
  '睡': { zh: '睡觉', en: 'sleep' },
  '坐': { zh: '坐下', en: 'sit down' },
  '站': { zh: '站起来', en: 'stand up' },
  '开': { zh: '开门', en: 'open the door' },
  '关': { zh: '关门', en: 'close the door' },
  '买': { zh: '买东西', en: 'buy things' },
  '穿': { zh: '穿衣服', en: 'put on clothes' },
  '洗': { zh: '洗手', en: 'wash hands' },
  // Feelings
  '笑': { zh: '大笑', en: 'laugh' },
  '哭': { zh: '哭了', en: 'cried' },
  '爱': { zh: '爱你', en: 'love you' },
  '想': { zh: '想你', en: 'miss you' },
  // Family
  '爸': { zh: '爸爸', en: 'dad' },
  '妈': { zh: '妈妈', en: 'mom' },
  '哥': { zh: '哥哥', en: 'big brother' },
  '姐': { zh: '姐姐', en: 'big sister' },
  '弟': { zh: '弟弟', en: 'little brother' },
  '妹': { zh: '妹妹', en: 'little sister' },
  '爷': { zh: '爷爷', en: 'grandpa' },
  // School
  '书': { zh: '看书', en: 'read a book' },
  '笔': { zh: '铅笔', en: 'pencil' },
  '课': { zh: '上课', en: 'class time' },
  '校': { zh: '学校', en: 'school' },
  // Misc
  '门': { zh: '开门', en: 'open the door' },
  '车': { zh: '汽车', en: 'car' },
  '路': { zh: '走路', en: 'walk on the road' },
  '星': { zh: '星星', en: 'stars' },
  '心': { zh: '开心', en: 'happy' },
  '春': { zh: '春天', en: 'spring' },
  '夏': { zh: '夏天', en: 'summer' },
  '秋': { zh: '秋天', en: 'autumn' },
  '冬': { zh: '冬天', en: 'winter' },
  '雪': { zh: '下雪', en: 'snowing' },
  '晴': { zh: '晴天', en: 'sunny day' },
};

// Blocklist for violent/inappropriate/weird compound words — kids' app
const BLOCKED_EXAMPLES = new Set([
  '耳光', '打人', '杀', '死', '杀人', '打死', '杀死',
  '脸厚', '厚脸', '脸红', '脸皮', '牙疼', '头疼', '肚疼',
  '打架', '吵架', '骂人', '恨', '怒', '毒', '血', '伤',
  '醉', '酒', '烟', '赌', '偷', '抢', '骗',
]);

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
      if (key.startsWith(char) && key.length === 2 && !BLOCKED_EXAMPLES.has(key)) {
        const comp = compoundsIndex[key];
        const meaning = (comp.d || []).map(cleanDefinition).filter(Boolean)[0];
        if (meaning && !INAPPROPRIATE.test(meaning)) return { zh: key, en: meaning };
      }
    }
    // Look for compounds ending with this char
    for (const key of Object.keys(compoundsIndex)) {
      if (key.endsWith(char) && key.length === 2 && !BLOCKED_EXAMPLES.has(key)) {
        const comp = compoundsIndex[key];
        const meaning = (comp.d || []).map(cleanDefinition).filter(Boolean)[0];
        if (meaning && !INAPPROPRIATE.test(meaning)) return { zh: key, en: meaning };
      }
    }
  }
  return null;
}

/**
 * Check if HanziWriter has stroke data for a character.
 * Tries local bundle first, then CDN. Caches results.
 */
const strokeCache = {};
async function checkStrokeData(char) {
  if (char in strokeCache) return strokeCache[char];

  // Try local stroke data first
  try {
    const localResp = await fetch(`./js/data/strokes/${encodeURIComponent(char)}.json`, { method: 'HEAD' });
    if (localResp.ok) { strokeCache[char] = true; return true; }
  } catch {}

  // Fall back to CDN
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
 * Trigger stroke pre-caching for new characters via service worker.
 */
export function precacheNewStrokes(characters) {
  if (navigator.serviceWorker?.controller && characters.length > 0) {
    navigator.serviceWorker.controller.postMessage({
      type: 'PRECACHE_STROKES',
      characters,
    });
  }
}

/**
 * Custom charDataLoader for HanziWriter — tries local stroke data first,
 * then falls back to CDN. Use this in all HanziWriter.create() calls.
 */
export function localCharDataLoader(char) {
  return fetch(`./js/data/strokes/${encodeURIComponent(char)}.json`)
    .then(r => { if (r.ok) return r.json(); throw new Error('not local'); })
    .catch(() =>
      fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2/${encodeURIComponent(char)}.json`)
        .then(r => r.json())
    );
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
    pinyinMarked: fixPinyinMarked(cedict?.m) || null,
    tone: cedict?.n || null,
    traditional: cedict?.t || null,
    radical: mmah?.r || null,
    strokeCount: mmah?.k || null,
    decomposition: mmah?.d || null,
    components: mmah?.o || null,
    etymology: mmah?.e || null,
    isRadical: cedict?.r != null,
    radicalNumber: cedict?.r || null,
    radicalVariant: cedict?.rv || null,
    hasStrokeData,
    enrichmentStatus,
    example: getExample(char) || (cedict?.ex ? { zh: cedict.ex, en: '' } : null),
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
/**
 * Detect if a token looks like pinyin (romanized Chinese with optional tone marks/numbers).
 * Matches: dà, xué, xiào, da4, xue2, nǐ, hǎo, lǜ, etc.
 */
const PINYIN_RE = /^[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+[1-5]?$/;
const TONE_CHARS = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
function isPinyinToken(token) {
  if (!token || token.length > 10) return false;
  return PINYIN_RE.test(token) && (TONE_CHARS.test(token) || /[1-5]$/.test(token));
}

/**
 * Parse a line that may contain CJK + pinyin + English.
 * E.g. "大 dà big" → { chars: "大", pinyin: "dà", meaning: "big" }
 * E.g. "学校 xué xiào school" → { chars: "学校", pinyin: "xué xiào", meaning: "school" }
 * Returns null if no CJK found.
 */
function parseAnnotatedLine(line) {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length === 0) return null;

  // Collect CJK runs, pinyin tokens, and remaining English
  let chars = '';
  const pinyinParts = [];
  const meaningParts = [];

  for (const token of tokens) {
    const hasCJK = [...token].some(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF);
    if (hasCJK) {
      chars += [...token].filter(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF).join('');
    } else if (isPinyinToken(token)) {
      pinyinParts.push(token);
    } else if (/[a-zA-Z]/.test(token)) {
      meaningParts.push(token);
    }
  }

  if (!chars) return null;
  return {
    chars,
    pinyin: pinyinParts.join(' ') || null,
    meaning: meaningParts.join(' ') || null,
  };
}

export async function parseAndEnrich(text) {
  // Sanitize: limit length, strip anything dangerous
  if (!text || typeof text !== 'string') return [];
  text = text.slice(0, 5000); // Cap at 5000 chars to prevent abuse

  await ensureIndices();
  await ensureCompounds();

  // Try line-by-line annotated parsing first (e.g. "大 dà big")
  const lines = text.split(/[\n\r]+/).filter(l => l.trim());
  const hasAnnotations = lines.some(line => {
    const parsed = parseAnnotatedLine(line);
    return parsed && (parsed.pinyin || parsed.meaning);
  });

  // Store user-provided overrides per character
  const overrides = {};

  if (hasAnnotations) {
    // Parse each line as potentially annotated
    const words = [];
    for (const line of lines) {
      const parsed = parseAnnotatedLine(line);
      if (!parsed) continue;
      const cjk = parsed.chars;

      // Check if it's a known compound
      if (cjk.length >= 2 && cjk.length <= 4 && compoundsIndex[cjk]) {
        words.push(cjk);
        if (parsed.pinyin || parsed.meaning) overrides[cjk] = parsed;
      } else {
        // Greedy compound detection within the chars
        const chars = [...cjk];
        let i = 0;
        while (i < chars.length) {
          if (i + 1 < chars.length) {
            const pair = chars[i] + chars[i + 1];
            if (compoundsIndex[pair]) {
              words.push(pair);
              i += 2;
              continue;
            }
          }
          words.push(chars[i]);
          i++;
        }
        // Apply overrides to single chars or detected compounds
        if (parsed.pinyin || parsed.meaning) {
          if (words.length > 0) overrides[words[words.length - 1]] = parsed;
        }
      }
    }

    // Deduplicate
    const seen = new Set();
    const unique = words.filter(w => { if (seen.has(w)) return false; seen.add(w); return true; });

    return Promise.all(unique.map(w => enrichWord(w, overrides[w])));
  }

  // Fallback: original CJK-only parsing (no annotations detected)
  const segments = text.split(/[\n\r,，、;；\s]+/).filter(Boolean);

  const words = [];
  for (const segment of segments) {
    const cjk = [...segment].filter(c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF);
    if (cjk.length === 0) continue;

    const cjkStr = cjk.join('');
    if (cjk.length >= 2 && cjk.length <= 4 && compoundsIndex[cjkStr]) {
      words.push(cjkStr);
      continue;
    }

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

  const seen = new Set();
  const unique = words.filter(w => { if (seen.has(w)) return false; seen.add(w); return true; });

  return Promise.all(unique.map(w => enrichWord(w)));
}

/**
 * Enrich a word (single char or compound), optionally applying user overrides.
 */
async function enrichWord(w, override) {
  let result;
  if (w.length === 1) {
    result = await enrichCharacter(w);
  } else {
    const compound = compoundsIndex[w];
    const meanings = (compound?.d || []).map(cleanDefinition).filter(Boolean);
    const hasStrokeData = await checkStrokeData(w[0]);
    result = {
      character: w,
      meanings,
      pinyin: compound?.p || null,
      pinyinMarked: fixPinyinMarked(compound?.m) || null,
      tone: compound?.n || null,
      traditional: compound?.t || null,
      isCompound: true,
      components: [...w],
      hasStrokeData,
      enrichmentStatus: compound ? 'complete' : 'manual',
      example: getExample(w),
      audioFile: compound ? `./audio/${compound.p}.mp3` : null,
    };
  }

  // Apply user-provided overrides (pinyin/meaning from pasted text)
  if (override) {
    if (override.pinyin) {
      result.pinyinMarked = override.pinyin;
      result.pinyin = override.pinyin;
    }
    if (override.meaning) {
      result.meanings = [override.meaning, ...(result.meanings || [])];
    }
  }

  return result;
}

/**
 * Speak a character using Web Speech API.
 * Used as fallback when pre-generated audio is not available.
 *
 * @param {string} text - Chinese text to speak
 * @returns {Promise<void>}
 */
/**
 * Ensure voices are loaded (they load async in some browsers).
 * Resolves immediately if voices are already available.
 */
let voicesReady = false;
function waitForVoices() {
  if (voicesReady) return Promise.resolve();
  return new Promise(resolve => {
    const voices = window.speechSynthesis?.getVoices() || [];
    if (voices.length > 0) { voicesReady = true; resolve(); return; }
    // Some browsers fire voiceschanged when voices become available
    window.speechSynthesis?.addEventListener('voiceschanged', () => {
      voicesReady = true;
      resolve();
    }, { once: true });
    // Fallback timeout — don't block forever
    setTimeout(() => { voicesReady = true; resolve(); }, 1000);
  });
}

/** Find a female Chinese voice if available. */
function getChineseVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  const female = voices.find(v => v.lang.startsWith('zh') && /female|ting|xiaoxiao/i.test(v.name));
  const any = voices.find(v => v.lang.startsWith('zh'));
  return female || any || null;
}

/** Find a female English voice if available. */
function getEnglishVoice() {
  const voices = window.speechSynthesis?.getVoices() || [];
  // Prefer female English voice — common names across platforms
  const female = voices.find(v =>
    v.lang.startsWith('en') && /female|samantha|karen|victoria|zira|hazel|susan|fiona/i.test(v.name)
  );
  // Fallback: any English voice
  const any = voices.find(v => v.lang.startsWith('en'));
  return female || any || null;
}

export function speakChinese(text, rate = 0.65) {
  return new Promise(async (resolve) => {
    if (!('speechSynthesis' in window)) { resolve(); return; }
    await waitForVoices();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = rate;
    const voice = getChineseVoice();
    if (voice) utterance.voice = voice;
    utterance.onend = resolve;
    utterance.onerror = resolve; // don't block on error
    // Safety timeout — some browsers never fire onend/onerror
    const timeout = setTimeout(resolve, 5000);
    utterance.onend = () => { clearTimeout(timeout); resolve(); };
    utterance.onerror = () => { clearTimeout(timeout); resolve(); };
    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Speak an exposure sequence: character... pause... meaning... example.
 * E.g. "大" ... "big" ... "大象" ... "big elephant"
 *
 * @param {Object} word - Enriched word object
 * @param {Object} [opts] - Optional callbacks for highlighting
 * @param {Function} [opts.highlightMeaning] - Called when meaning is spoken
 * @param {Function} [opts.highlightExample] - Called when example is spoken
 */
export async function speakExposureSequence(word, opts = {}) {
  // Say the character slowly (unless already said)
  if (!opts.skipCharacter) {
    await speakChinese(word.character, 0.5);
  }

  // Pause, then say English meaning
  await new Promise(r => setTimeout(r, 500));
  const rawMeaning = word.meaning || word.meanings?.[0] || '';
  const meaning = rawMeaning.replace(/\s*\/\s*/g, ' or ');
  if (meaning) {
    opts.highlightMeaning?.();
    await speakEnglish(meaning);
  }

  // Pause, then say example if available
  if (word.example?.zh) {
    await new Promise(r => setTimeout(r, 500));
    opts.highlightExample?.();
    await speakChinese(word.example.zh, 0.6);
    if (word.example.en) {
      await new Promise(r => setTimeout(r, 300));
      await speakEnglish(word.example.en);
    }
  }
}

/** Speak English text using Web Speech API with female voice. */
export function speakEnglish(text) {
  return new Promise(async (resolve) => {
    if (!('speechSynthesis' in window)) { resolve(); return; }
    await waitForVoices();

    // Lowercase so speech synthesis doesn't say "capital I" for standalone "I"
    const utterance = new SpeechSynthesisUtterance(text.toLowerCase());
    utterance.lang = 'en-US';
    utterance.rate = 0.85;
    const voice = getEnglishVoice();
    if (voice) utterance.voice = voice;
    // Safety timeout — some browsers never fire onend/onerror
    const timeout = setTimeout(resolve, 5000);
    utterance.onend = () => { clearTimeout(timeout); resolve(); };
    utterance.onerror = () => { clearTimeout(timeout); resolve(); };
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
