#!/usr/bin/env node
/**
 * build-mmah.js — Parse Make Me a Hanzi into a JSON lookup keyed by character.
 *
 * Input:  scripts/sources/dictionary.txt (one JSON object per line)
 * Output: js/data/mmah-index.json
 *
 * Run: node scripts/build-mmah.js
 */

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'sources', 'dictionary.txt');
const OUTPUT = path.join(__dirname, '..', 'js', 'data', 'mmah-index.json');

const raw = fs.readFileSync(INPUT, 'utf8');
const lines = raw.split('\n').filter(Boolean);
const index = {};
let count = 0;

for (const line of lines) {
  let entry;
  try { entry = JSON.parse(line); } catch { continue; }

  const char = entry.character;
  if (!char) continue;

  // Extract component characters from decomposition
  // Decomposition uses IDS operators (⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻) and ？
  // Components are the actual character codepoints that aren't operators
  const components = [];
  if (entry.decomposition) {
    for (const ch of entry.decomposition) {
      if (ch !== '？' && !/[\u2FF0-\u2FFF]/.test(ch) && ch !== char) {
        components.push(ch);
      }
    }
  }

  // Stroke count derived from matches array length
  const strokeCount = Array.isArray(entry.matches) ? entry.matches.length : null;

  index[char] = {
    c: char,
    r: entry.radical || null,
    k: strokeCount,
    d: entry.decomposition || null,
    o: components.length > 0 ? components : null,
    e: entry.etymology || null,
    f: entry.definition || null,
  };
  count++;
}

fs.writeFileSync(OUTPUT, JSON.stringify(index));
console.log(`✓ mmah-index.json: ${count} entries (${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1)} MB)`);
