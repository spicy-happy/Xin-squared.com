/**
 * Printable worksheets — opens a print-friendly HTML page in a new window.
 * Uses browser print dialog (supports CJK characters natively).
 */

import { t } from '../i18n.js';

/**
 * Generate a practice worksheet and open print dialog.
 * @param {Object[]} words - Array of word objects (character, pinyinMarked, meaning)
 * @param {Object} [options] - { title, gridSize, repeatCount, showStrokes }
 */
export async function generateWorksheet(words, options = {}) {
  const title = options.title || t('worksheet.title');
  const gridSize = options.gridSize || 'medium'; // 'small' | 'medium' | 'large'
  const repeatCount = options.repeatCount || 8;
  const showStrokes = options.showStrokes !== false;

  const cellSizes = { small: 32, medium: 44, large: 56 };
  const cellPx = cellSizes[gridSize] || 44;
  const refSize = Math.round(cellPx * 1.4);

  const rows = words.map((word, i) => {
    const char = word.character;
    const pinyin = word.pinyinMarked || word.pinyin || '';
    const meaning = (word.meaning || word.meanings?.[0] || '').split(';')[0].trim();

    const cells = [];
    for (let g = 0; g < repeatCount; g++) {
      const isTrace = g < 2 && showStrokes;
      cells.push(`<td class="grid-cell${isTrace ? ' trace-cell' : ''}" style="width:${cellPx}px;height:${cellPx}px;">
        ${isTrace ? `<span class="trace-char">${char}</span>` : ''}
      </td>`);
    }

    return `
      <tr class="word-row ${i % 2 === 0 ? 'alt-row' : ''}">
        <td class="ref-cell" style="width:${refSize}px;">
          <div class="ref-num">${i + 1}</div>
          <div class="ref-pinyin">${pinyin}</div>
          <div class="ref-char" style="font-size:${Math.round(cellPx * 0.8)}px;">${char}</div>
          <div class="ref-meaning">${meaning}</div>
        </td>
        ${cells.join('')}
      </tr>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @page { margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', -apple-system, sans-serif;
    color: #333;
  }
  .sheet-title { text-align: center; font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  .sheet-date { text-align: center; font-size: 10px; color: #999; margin-bottom: 12px; }
  table { border-collapse: collapse; margin: 0 auto; }
  .word-row td { border: none; vertical-align: middle; }
  .alt-row { background: #f9f9f9; }

  .ref-cell {
    text-align: center; padding: 4px 8px; position: relative;
  }
  .ref-num { position: absolute; top: 2px; left: 4px; font-size: 8px; color: #bbb; }
  .ref-pinyin { font-size: 11px; color: #666; margin-bottom: 2px; }
  .ref-char { font-weight: 700; line-height: 1.2; margin-bottom: 2px; }
  .ref-meaning { font-size: 9px; color: #888; max-width: ${refSize}px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .grid-cell {
    border: 1px solid #bbb;
    position: relative;
    background:
      linear-gradient(to right, transparent calc(50% - 0.5px), #ddd calc(50% - 0.5px), #ddd calc(50% + 0.5px), transparent calc(50% + 0.5px)),
      linear-gradient(to bottom, transparent calc(50% - 0.5px), #ddd calc(50% - 0.5px), #ddd calc(50% + 0.5px), transparent calc(50% + 0.5px));
  }
  .trace-cell .trace-char {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: ${Math.round(cellPx * 0.7)}px;
    color: #e0e0e0;
    font-weight: 400;
    pointer-events: none;
  }

  .sheet-footer {
    text-align: center; font-size: 8px; color: #bbb; margin-top: 16px;
    page-break-inside: avoid;
  }

  @media print {
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="sheet-title">${title}</div>
  <div class="sheet-date">${new Date().toLocaleDateString()}</div>
  <table>
    <tbody>${rows}</tbody>
  </table>
  <div class="sheet-footer">XieXie — xiexie.app</div>
  <script>
    // Auto-print then allow closing
    window.onload = () => { window.print(); };
  </script>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}
