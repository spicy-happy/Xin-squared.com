#!/usr/bin/env node
/**
 * generate-audio.js — Generate MP3 audio files for starter characters.
 *
 * Uses a free TTS approach. For now, this script documents the audio
 * pipeline but relies on Web Speech API at runtime as the primary
 * audio source. Pre-generated MP3s can be added manually or via
 * Google Cloud TTS when credentials are available.
 *
 * Runtime fallback: js/enrichment.js uses speechSynthesis with
 * lang='zh-CN' for any character without a pre-generated MP3.
 *
 * To add pre-generated audio later:
 *   1. Set GOOGLE_APPLICATION_CREDENTIALS env var
 *   2. npm install @google-cloud/text-to-speech
 *   3. Uncomment the Google Cloud TTS section below
 *   4. Run: node scripts/generate-audio.js
 *
 * Output: audio/{pinyin}.mp3 (e.g., audio/da4.mp3)
 */

const fs = require('fs');
const path = require('path');

const CEDICT = path.join(__dirname, '..', 'js', 'data', 'cedict-index.json');
const STARTER = path.join(__dirname, '..', 'js', 'data', 'starter-words.json');
const AUDIO_DIR = path.join(__dirname, '..', 'audio');

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const cedict = JSON.parse(fs.readFileSync(CEDICT, 'utf8'));
const starters = JSON.parse(fs.readFileSync(STARTER, 'utf8'));

console.log('Audio pipeline status:');
console.log('─'.repeat(40));

for (const word of starters) {
  const entry = cedict[word.character];
  const pinyin = entry?.p || '?';
  const audioFile = `${pinyin}.mp3`;
  const audioPath = path.join(AUDIO_DIR, audioFile);
  const exists = fs.existsSync(audioPath);

  console.log(`  ${word.character} (${pinyin}): ${exists ? '✓ ' + audioFile : '⚠ missing — will use Web Speech API'}`);
}

console.log('─'.repeat(40));
console.log('Runtime fallback: Web Speech API (speechSynthesis, lang=zh-CN)');
console.log('To generate MP3s: configure Google Cloud TTS credentials and re-run.');

/*
// --- Google Cloud TTS (uncomment when credentials available) ---
// npm install @google-cloud/text-to-speech

const textToSpeech = require('@google-cloud/text-to-speech');
const client = new textToSpeech.TextToSpeechClient();

async function generateAudio(character, pinyin) {
  const request = {
    input: { text: character },
    voice: { languageCode: 'cmn-CN', name: 'cmn-CN-Wavenet-A' },
    audioConfig: { audioEncoding: 'MP3' },
  };
  const [response] = await client.synthesizeSpeech(request);
  const outputPath = path.join(AUDIO_DIR, `${pinyin}.mp3`);
  fs.writeFileSync(outputPath, response.audioContent, 'binary');
  console.log(`  ✓ ${character} → ${outputPath}`);
}

(async () => {
  for (const word of starters) {
    const entry = cedict[word.character];
    if (entry) await generateAudio(word.character, entry.p);
  }
})();
*/
