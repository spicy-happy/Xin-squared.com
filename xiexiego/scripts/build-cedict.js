#!/usr/bin/env node
/**
 * build-cedict.js — Parse CC-CEDICT into a JSON lookup keyed by simplified character.
 *
 * Input:  scripts/sources/cedict_ts.u8
 * Output: js/data/cedict-index.json
 *
 * Run: node scripts/build-cedict.js
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'sources', 'cedict_ts.u8');
const OUTPUT = path.join(__dirname, '..', 'js', 'data', 'cedict-index.json');
const OUTPUT_COMPOUNDS = path.join(__dirname, '..', 'js', 'data', 'cedict-compounds.json');

// Tone number → combining diacritical mark placement
const TONE_MARKS = {
  'a': 'āáǎà', 'e': 'ēéěè', 'i': 'īíǐì',
  'o': 'ōóǒò', 'u': 'ūúǔù', 'ü': 'ǖǘǚǜ',
};

/**
 * Convert numbered pinyin (e.g. "xue2") to tone-marked (e.g. "xué").
 * Handles multi-syllable pinyin separated by spaces.
 */
function numberedToMarked(numbered) {
  return numbered.split(' ').map(syllable => {
    const match = syllable.match(/^([a-züÜ]+?)([1-4])$/i);
    if (!match) return syllable; // neutral tone or non-standard

    let [, letters, tone] = match;
    tone = parseInt(tone) - 1; // 0-indexed
    letters = letters.replace(/v/g, 'ü').replace(/V/g, 'Ü');

    // Pinyin tone placement rule: a/e always get the mark,
    // otherwise the second vowel in a pair gets it (e.g. "ou" → "o" gets it).
    const vowels = 'aeiouü';
    let markIndex = -1;

    if (letters.includes('a')) markIndex = letters.indexOf('a');
    else if (letters.includes('e')) markIndex = letters.indexOf('e');
    else if (letters.includes('ou')) markIndex = letters.indexOf('o');
    else {
      // Find the last vowel
      for (let i = letters.length - 1; i >= 0; i--) {
        if (vowels.includes(letters[i])) { markIndex = i; break; }
      }
    }

    if (markIndex === -1) return letters;

    const ch = letters[markIndex];
    const marked = TONE_MARKS[ch]?.[tone];
    if (!marked) return letters;

    return letters.slice(0, markIndex) + marked + letters.slice(markIndex + 1);
  }).join(' ');
}

// --- Main ---
const raw = fs.readFileSync(INPUT, 'utf8');
const lines = raw.split('\n');
const index = {};
const compounds = {};
let count = 0;
let compoundCount = 0;

for (const line of lines) {
  if (line.startsWith('#') || !line.trim()) continue;

  // Format: Traditional Simplified [pinyin] /def1/def2/.../
  const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.+)\/\s*$/);
  if (!match) continue;

  const [, traditional, simplified, pinyinRaw, defsRaw] = match;
  const pinyin = pinyinRaw.toLowerCase();
  const definitions = defsRaw.split('/').map(d => d.trim()).filter(Boolean);

  // Extract tone from first syllable
  const toneMatch = pinyin.match(/[1-5]/);
  const tone = toneMatch ? parseInt(toneMatch[0]) : 0;

  // Skip entries longer than 2 characters
  if (simplified.length > 2) continue;

  const entry = {
    t: traditional,
    p: pinyin,
    m: numberedToMarked(pinyin),
    n: tone,
    d: definitions.slice(0, 3),
  };

  if (simplified.length === 1) {
    if (!index[simplified]) {
      index[simplified] = entry; count++;
    } else {
      // If existing entry's first definition is a surname/abbreviation,
      // replace with this entry if it has a better definition
      const existing = index[simplified];
      const isSurname = d => /^(surname |abbr\. for )/.test(d);
      if (isSurname(existing.d[0]) && !isSurname(entry.d[0])) {
        index[simplified] = entry;
      }
    }
  } else {
    // 2-char compounds: only CJK pairs
    const isCJK = c => c.charCodeAt(0) >= 0x4E00 && c.charCodeAt(0) <= 0x9FFF;
    if (isCJK(simplified[0]) && isCJK(simplified[1]) && !compounds[simplified]) {
      compounds[simplified] = entry;
      compoundCount++;
    }
  }
}

// Single-char index (always loaded, ~1.5MB)
fs.writeFileSync(OUTPUT, JSON.stringify(index));
console.log(`✓ cedict-index.json: ${count} entries (${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1)} MB)`);

// Compound index (loaded on demand for compound discovery)
fs.writeFileSync(OUTPUT_COMPOUNDS, JSON.stringify(compounds));
console.log(`✓ cedict-compounds.json: ${compoundCount} entries (${(fs.statSync(OUTPUT_COMPOUNDS).size / 1024 / 1024).toFixed(1)} MB)`);
