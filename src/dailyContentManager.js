import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DECO } from './content.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, '..', 'data');

const loadJson = (filename) => {
  try {
    const filePath = path.join(dataPath, filename);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    console.error(`Error loading ${filename}:`, error);
    return null;
  }
};

export const prophetsStories = loadJson('prophets_stories.json') || [];
export const seerahData = loadJson('seerah.json') || [];
export const quranVerseData = loadJson('quran_verse.json') || [];
export const fiqhData = loadJson('fiqh.json') || [];
export const gamesData = loadJson('games.json') || { complete_verse: [], who_am_i: [] };

export const getDayIndex = (startDateStr) => {
  const start = new Date(startDateStr);
  const now = new Date();
  const diffTime = Math.abs(now - start);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// Fix 4 & 6: each content type uses its own DECO style; frame only on title line
export const getProphetsStory = (dayIndex) => {
  if (!prophetsStories.length) return null;
  const story = prophetsStories[dayIndex % prophetsStories.length];
  return `${DECO.STORY(`📚 قصص الأنبياء — ${story.episode}`)}\n\n` +
    `✨ *${story.title}*\n\n` +
    `${story.content}\n\n` +
    `💡 *العبرة والحكمة:*\n_${story.lesson}_\n\n` +
    `🤲 _اللهم اجعلنا ممن يتعلم من سير الأنبياء ويقتدي بهم_`;
};

export const getSeerahInfo = (dayIndex) => {
  if (!seerahData.length) return null;
  const info = seerahData[dayIndex % seerahData.length];
  return `${DECO.SEERAH('📜 من السيرة النبوية الشريفة')}\n\n` +
    `📅 *${info.date}*\n` +
    `📍 *${info.event}*\n\n` +
    `${info.info}\n\n` +
    `_المصدر: ${info.source}_\n\n` +
    `🤲 _اللهم صلِّ وسلم وبارك على سيدنا محمد ﷺ_`;
};

export const getQuranVerse = (dayIndex) => {
  if (!quranVerseData.length) return null;
  const item = quranVerseData[dayIndex % quranVerseData.length];
  return `${DECO.QURAN('📖 آية وتفسير')}\n\n` +
    `*${item.verse}*\n` +
    `_${item.surah}_\n\n` +
    `📝 *التفسير:*\n${item.interpretation}\n\n` +
    `🔍 *معاني الكلمات:*\n_${item.meanings}_\n\n` +
    `🤲 _اللهم اجعل القرآن ربيع قلوبنا ونور صدورنا_`;
};

export const getFiqhIssue = (dayIndex) => {
  if (!fiqhData.length) return null;
  const item = fiqhData[dayIndex % fiqhData.length];
  return `${DECO.FIQH('⚖️ فقه سريع')}\n\n` +
    `❓ *المسألة:*\n${item.issue}\n\n` +
    `✅ *الحكم:* ${item.ruling}\n\n` +
    `📖 *الدليل:*\n_${item.evidence}_\n\n` +
    `💡 _علم الفقه نور يضيء طريق المؤمن_`;
};

export const isThursdayNight = () => {
  const now = new Date();
  return now.getDay() === 4 && now.getHours() >= 18;
};

export const isFridayNight = () => {
  const now = new Date();
  return now.getDay() === 4 && now.getHours() >= 18;
};

// Legacy stub — real Dhul Hijjah logic is now in src/dhulHijjah.js
export const getDhuAlHijjahReminder = () => null;
