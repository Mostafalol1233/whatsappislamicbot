import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decorateTitle } from './content.js';

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

export const getProphetsStory = (dayIndex) => {
  if (!prophetsStories.length) return null;
  const story = prophetsStories[dayIndex % prophetsStories.length];
  return `${decorateTitle('📚', `قصص الأنبياء — ${story.episode}`)}\n\n` +
    `✨ *${story.title}*\n\n` +
    `${story.content}\n\n` +
    `💡 *العبرة والحكمة:*\n_${story.lesson}_\n\n` +
    `🤲 _اللهم اجعلنا ممن يتعلم من سير الأنبياء ويقتدي بهم_`;
};

export const getSeerahInfo = (dayIndex) => {
  if (!seerahData.length) return null;
  const info = seerahData[dayIndex % seerahData.length];
  return `${decorateTitle('📜', 'من السيرة النبوية الشريفة')}\n\n` +
    `📅 *${info.date}*\n` +
    `📍 *${info.event}*\n\n` +
    `${info.info}\n\n` +
    `_المصدر: ${info.source}_\n\n` +
    `🤲 _اللهم صلِّ وسلم وبارك على سيدنا محمد ﷺ_`;
};

export const getQuranVerse = (dayIndex) => {
  if (!quranVerseData.length) return null;
  const item = quranVerseData[dayIndex % quranVerseData.length];
  return `${decorateTitle('📖', 'آية وتفسير')}\n\n` +
    `*${item.verse}*\n` +
    `_${item.surah}_\n\n` +
    `📝 *التفسير:*\n${item.interpretation}\n\n` +
    `🔍 *معاني الكلمات:*\n_${item.meanings}_\n\n` +
    `🤲 _اللهم اجعل القرآن ربيع قلوبنا ونور صدورنا_`;
};

export const getFiqhIssue = (dayIndex) => {
  if (!fiqhData.length) return null;
  const item = fiqhData[dayIndex % fiqhData.length];
  return `${decorateTitle('⚖️', 'فقه سريع')}\n\n` +
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

export const getDhuAlHijjahReminder = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  if (year === 2026 && month === 5 && day >= 17 && day <= 26) {
    return `${decorateTitle('🌙', 'العشر الأوائل من ذي الحجة')}\n\n` +
      `قال ﷺ: _"ما من أيام العمل الصالح فيها أحب إلى الله من هذه الأيام"_\n\n` +
      `*أبرز الأعمال في هذه الأيام:*\n` +
      `1️⃣ الصيام — خاصة يوم عرفة\n` +
      `2️⃣ التكبير والتهليل والتحميد\n` +
      `3️⃣ الصدقة وصلة الأرحام\n` +
      `4️⃣ قراءة القرآن بتدبر\n\n` +
      `🤲 _اغتنموا هذه الأيام المباركة قبل أن تنقضي_`;
  }
  return null;
};
