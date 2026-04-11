/**
 * Photo Import — OCR pipeline using Tesseract.js
 * Lets parents photograph homework/flashcards and extract Chinese characters.
 * Results feed into the existing enrichedQueue → confirm flow.
 */

import { parseAndEnrich } from '../enrichment.js';
import { t } from '../i18n.js';

/**
 * Process images through Tesseract OCR to extract Chinese text.
 * @param {File[]} files - Image files from file input
 * @param {Function} onProgress - Called with { file, index, total, percent }
 * @returns {Promise<string>} Extracted Chinese text (newline-separated words)
 */
export async function processPhotos(files, onProgress) {
  if (!files || files.length === 0) return '';
  if (!window.Tesseract) throw new Error('Tesseract.js not loaded');

  const worker = await Tesseract.createWorker('chi_sim+eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress({
          file: m.workerId,
          index: 0,
          total: files.length,
          percent: Math.round(m.progress * 100),
        });
      }
    },
  });

  const allText = [];

  for (let i = 0; i < files.length; i++) {
    if (onProgress) {
      onProgress({ file: files[i].name, index: i, total: files.length, percent: 0 });
    }

    try {
      const { data } = await worker.recognize(files[i]);
      const cjk = extractCJK(data.text);
      if (cjk) allText.push(cjk);
    } catch (err) {
      console.error('OCR error for', files[i].name, err);
    }
  }

  await worker.terminate();
  return allText.join('\n');
}

/**
 * Extract Chinese characters from OCR output text.
 * Groups consecutive CJK chars, deduplicates, returns newline-separated.
 */
function extractCJK(text) {
  if (!text) return '';
  const matches = text.match(/[\u4E00-\u9FFF\u3400-\u4DBF]+/g);
  if (!matches) return '';

  const seen = new Set();
  const unique = [];
  for (const m of matches) {
    if (!seen.has(m)) {
      seen.add(m);
      unique.push(m);
    }
  }
  return unique.join('\n');
}

/**
 * Render the photo import UI inside a container.
 * @param {HTMLElement} container - Parent element to render into
 * @param {Function} onDone - Called with enriched word array when complete
 * @param {Function} onCancel - Called when user cancels
 */
export function renderPhotoImport(container, onDone, onCancel) {
  container.innerHTML = `
    <div class="photo-import">
      <div class="photo-import__input-area">
        <label class="photo-import__label" id="photo-label">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          <span>${t('photo.tap')}</span>
          <input type="file" accept="image/*" capture="environment" multiple
                 id="photo-file-input" class="photo-import__file-input">
        </label>
      </div>
      <div class="photo-import__thumbs" id="photo-thumbs"></div>
      <div class="photo-import__status" id="photo-status"></div>
      <div class="photo-import__progress" id="photo-progress" style="display:none">
        <div class="photo-import__progress-bar" id="photo-progress-bar"></div>
      </div>
      <div class="photo-import__actions" id="photo-actions" style="display:none">
        <button class="btn btn--primary" id="photo-scan">${t('photo.scan')}</button>
      </div>
    </div>
  `;

  const fileInput = container.querySelector('#photo-file-input');
  const thumbsEl = container.querySelector('#photo-thumbs');
  const statusEl = container.querySelector('#photo-status');
  const progressEl = container.querySelector('#photo-progress');
  const progressBar = container.querySelector('#photo-progress-bar');
  const actionsEl = container.querySelector('#photo-actions');
  const scanBtn = container.querySelector('#photo-scan');

  let selectedFiles = [];

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []).slice(0, 10);
    if (files.length === 0) return;
    selectedFiles = files;

    thumbsEl.innerHTML = files.map((f, i) => {
      const url = URL.createObjectURL(f);
      return `<img class="photo-import__thumb" src="${url}" alt="Photo ${i + 1}">`;
    }).join('');

    statusEl.textContent = t('photo.selected', files.length);
    actionsEl.style.display = '';
  });

  scanBtn.addEventListener('click', async () => {
    if (selectedFiles.length === 0) return;
    scanBtn.disabled = true;
    scanBtn.textContent = t('photo.scanning');
    progressEl.style.display = '';

    try {
      const text = await processPhotos(selectedFiles, ({ index, total, percent }) => {
        const overall = Math.round(((index + percent / 100) / total) * 100);
        progressBar.style.width = overall + '%';
        statusEl.textContent = t('photo.scanningN', index + 1, total, percent);
      });

      progressBar.style.width = '100%';

      if (!text.trim()) {
        statusEl.textContent = t('photo.noChars');
        scanBtn.disabled = false;
        scanBtn.textContent = t('photo.scan');
        progressEl.style.display = 'none';
        return;
      }

      statusEl.textContent = t('photo.lookingUp');
      const enriched = await parseAndEnrich(text);
      const results = enriched.map(e => ({ ...e, meaning: e.meanings?.[0] || '' }));

      if (results.length === 0) {
        statusEl.textContent = t('photo.noChars');
        scanBtn.disabled = false;
        scanBtn.textContent = t('photo.scan');
        progressEl.style.display = 'none';
        return;
      }

      onDone(results);
    } catch (err) {
      console.error('Photo import error:', err);
      statusEl.textContent = t('photo.error');
      scanBtn.disabled = false;
      scanBtn.textContent = t('photo.scan');
      progressEl.style.display = 'none';
    }
  });
}
