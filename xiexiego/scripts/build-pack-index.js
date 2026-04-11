#!/usr/bin/env node
/**
 * build-pack-index.js — Scans js/data/packs/*.json, reads each pack's metadata,
 * and writes js/data/packs/index.json.
 *
 * Run from the xiexiego directory:
 *   node scripts/build-pack-index.js
 *
 * Adding a new pack is one file — drop it into js/data/packs/ and re-run.
 */

const fs = require('fs');
const path = require('path');

const PACKS_DIR = path.join(__dirname, '..', 'js', 'data', 'packs');
const OUTPUT = path.join(PACKS_DIR, 'index.json');

const files = fs.readdirSync(PACKS_DIR)
  .filter(f => f.endsWith('.json') && f !== 'index.json')
  .sort();

const packs = [];

for (const file of files) {
  const raw = fs.readFileSync(path.join(PACKS_DIR, file), 'utf8');
  const data = JSON.parse(raw);

  // Determine category from pack structure
  let category = 'frequency';
  if (data.lessons) category = 'textbook';
  else if (data.subsets) category = 'curriculum';

  // Count words
  const totalWords = data.totalWords || (data.words ? data.words.length : 0);

  // Check if it has sentences (SWKD-style)
  const hasSentences = !!(data.lessons?.some(l => l.sentences?.length > 0));
  const hasLessons = !!(data.lessons?.length > 0);

  packs.push({
    id: data.id,
    file: file,
    title: data.title,
    titleZh: data.titleZh || '',
    description: data.description || '',
    totalWords,
    category,
    sequenced: data.sequenced || false,
    hasSubsets: !!(data.subsets?.length),
    hasLessons,
    hasSentences,
    subsetCount: data.subsets?.length || 0,
    lessonCount: data.lessons?.length || 0,
  });
}

const index = {
  generatedAt: new Date().toISOString(),
  packCount: packs.length,
  packs,
};

fs.writeFileSync(OUTPUT, JSON.stringify(index, null, 2) + '\n');
console.log(`✅ Built index.json with ${packs.length} packs:`);
packs.forEach(p => console.log(`   ${p.id}: ${p.totalWords} words (${p.category}) — ${p.file}`));
