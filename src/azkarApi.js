import { athkar } from './content.js';

const HISN_BASE = 'https://www.hisnmuslim.com/api/ar';
const AZKAR_DB_URL = 'https://raw.githubusercontent.com/osamayy/azkar-db/master/azkar.json';

async function safeJsonFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${url}: ${res.status}`);
  return res.json();
}

function mapHisnItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => {
      const text = i.zekr || i.content || i.zikr || '';
      const count = Number(i.repeat || i.count || 1) || 1;
      return text ? { text, count } : null;
    })
    .filter(Boolean);
}

function pickAzkarDbCategory(db, keys) {
  if (!db) return [];
  for (const key of keys) {
    const section = db[key];
    if (Array.isArray(section) && section.length) {
      return section
        .map((i) => {
          const text = i.content || i.zekr || i.zikr || i.text || '';
          const count = Number(i.repeat || i.count || 1) || 1;
          return text ? { text, count } : null;
        })
        .filter(Boolean);
    }
  }
  return [];
}

export async function getMorningAzkar() {
  try {
    const data = await safeJsonFetch(`${HISN_BASE}/1.json`);
    const items = mapHisnItems(data?.content || data?.array || data?.items || []);
    if (items.length) return items;
  } catch {}
  try {
    const db = await safeJsonFetch(AZKAR_DB_URL);
    const items = pickAzkarDbCategory(db, ['sabah', 'morning']);
    if (items.length) return items;
  } catch {}
  return athkar.morning;
}

export async function getEveningAzkar() {
  try {
    const data = await safeJsonFetch(`${HISN_BASE}/2.json`);
    const items = mapHisnItems(data?.content || data?.array || data?.items || []);
    if (items.length) return items;
  } catch {}
  try {
    const db = await safeJsonFetch(AZKAR_DB_URL);
    const items = pickAzkarDbCategory(db, ['masaa', 'evening']);
    if (items.length) return items;
  } catch {}
  return athkar.evening;
}

export async function getAfterPrayerAzkar() {
  try {
    const db = await safeJsonFetch(AZKAR_DB_URL);
    const items = pickAzkarDbCategory(db, ['after_prayer', 'after_salah']);
    if (items.length) return items;
  } catch {}
  return athkar.afterPrayer;
}

