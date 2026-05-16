/**
 * Fix 7: Daily Wird as a single PDF document.
 *
 * Fetches the day's juz from Al Quran Cloud, renders it with pdfkit
 * using the Amiri Arabic font, and returns { buffer, filename }.
 */

import PDFDocument from 'pdfkit';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FONT_PATH = path.join(__dirname, '..', 'assets', 'fonts', 'Amiri-Regular.ttf');
const API_BASE = 'https://api.alquran.cloud/v1/juz';

export async function fetchJuzAyahs(juzNumber) {
  const res = await fetch(`${API_BASE}/${juzNumber}/ar.alafasy`);
  if (!res.ok) throw new Error(`Al Quran Cloud error ${res.status}`);
  const data = await res.json();
  return data?.data?.ayahs || [];
}

/**
 * Build a PDF buffer for the given juz.
 * Returns a Buffer.
 */
export function buildJuzPdf(juzNumber, ayahs) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 60, right: 60 },
      info: { Title: `الجزء ${juzNumber} — ورد يومي`, Author: 'البوت الإسلامي' },
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Register Amiri font
    doc.registerFont('Amiri', FONT_PATH);

    // ── Title page ───────────────────────────────────────────────
    doc.font('Amiri').fontSize(26)
      .text(`الجزء ${juzNumber}`, { align: 'center', features: ['rtla'] });
    doc.moveDown(0.3);
    doc.fontSize(14).fillColor('#555555')
      .text('ورد اليوم القرآني', { align: 'center', features: ['rtla'] });
    doc.moveDown(0.5);
    doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(1);
    doc.fillColor('#000000');

    // ── Ayahs ────────────────────────────────────────────────────
    let lastSurah = '';
    for (const ayah of ayahs) {
      const surahName = ayah.surah?.name || '';

      // Surah header when surah changes
      if (surahName && surahName !== lastSurah) {
        lastSurah = surahName;
        if (doc.y > doc.page.height - 120) doc.addPage();
        doc.moveDown(0.6);
        doc.font('Amiri').fontSize(16).fillColor('#1a5276')
          .text(`― ${surahName} ―`, { align: 'center', features: ['rtla'] });
        doc.fillColor('#000000').moveDown(0.4);
      }

      // Ayah line: text + number
      const line = `${ayah.text}  ﴿${ayah.numberInSurah}﴾`;
      doc.font('Amiri').fontSize(13)
        .text(line, {
          align: 'right',
          features: ['rtla', 'calt', 'liga'],
          lineGap: 6,
        });
      doc.moveDown(0.3);
    }

    doc.end();
  });
}

/**
 * Main export: fetch juz and return { buffer, filename }.
 * Falls back gracefully on fetch errors.
 */
export async function generateWirdPdf(juzNumber) {
  const ayahs = await fetchJuzAyahs(juzNumber);
  if (!ayahs.length) throw new Error(`No ayahs returned for juz ${juzNumber}`);
  const buffer = await buildJuzPdf(juzNumber, ayahs);
  const filename = `wird-juz-${juzNumber}.pdf`;
  return { buffer, filename };
}
