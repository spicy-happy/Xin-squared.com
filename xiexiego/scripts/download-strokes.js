#!/usr/bin/env node
/**
 * Download stroke data JSON files from hanzi-writer-data CDN
 * for all unique characters found in pack files.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PACKS_DIR = path.join(__dirname, '..', 'js', 'data', 'packs');
const STROKES_DIR = path.join(__dirname, '..', 'js', 'data', 'strokes');
const CDN_BASE = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2/';
const BATCH_SIZE = 20;

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  // Collect all unique characters from pack files
  const chars = new Set();
  const files = fs.readdirSync(PACKS_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, file), 'utf8'));
    if (Array.isArray(data.words)) {
      for (const w of data.words) {
        if (w.character) {
          // Handle multi-character words by splitting into individual chars
          for (const ch of w.character) {
            chars.add(ch);
          }
        }
      }
    }
  }

  const charList = [...chars];
  console.log(`Found ${charList.length} unique characters across ${files.length} pack files`);

  fs.mkdirSync(STROKES_DIR, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let totalBytes = 0;

  // Process in batches
  for (let i = 0; i < charList.length; i += BATCH_SIZE) {
    const batch = charList.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (ch) => {
        const outPath = path.join(STROKES_DIR, `${ch}.json`);
        if (fs.existsSync(outPath)) {
          skipped++;
          const size = fs.statSync(outPath).size;
          totalBytes += size;
          return;
        }
        const url = CDN_BASE + encodeURIComponent(ch) + '.json';
        const buf = await fetch(url);
        fs.writeFileSync(outPath, buf);
        totalBytes += buf.length;
        downloaded++;
      })
    );

    for (const r of results) {
      if (r.status === 'rejected') {
        failed++;
        console.error('  FAIL:', r.reason.message);
      }
    }

    const done = Math.min(i + BATCH_SIZE, charList.length);
    process.stdout.write(`\r  Progress: ${done}/${charList.length} (downloaded: ${downloaded}, skipped: ${skipped}, failed: ${failed})`);
  }

  console.log('');
  console.log(`\nDone!`);
  console.log(`  Downloaded: ${downloaded}`);
  console.log(`  Skipped (already existed): ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total characters: ${downloaded + skipped}`);
  console.log(`  Total size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(err => { console.error(err); process.exit(1); });
