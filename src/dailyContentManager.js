import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  return `📚 *قصص الأنبياء — ${story.episode}* 📚\n\n✨ *${story.title}*\n\n📖 ${story.content}\n\n💡 *الحكمة والعبرة:*\n${story.lesson}\n\n#قصص_الأنبياء #محتوى_يومي`;
};

export const getSeerahInfo = (dayIndex) => {
  if (!seerahData.length) return null;
  const info = seerahData[dayIndex % seerahData.length];
  return `📜 *معلومة من السيرة النبوية* 📜\n\n📅 *التاريخ:* ${info.date}\n📍 *الحدث:* ${info.event}\n\n📖 ${info.info}\n\n📚 *المصدر:* ${info.source}\n\n#السيرة_النبوية #يوم_بيوم`;
};

export const getQuranVerse = (dayIndex) => {
  if (!quranVerseData.length) return null;
  const item = quranVerseData[dayIndex % quranVerseData.length];
  return `📖 *آية وتفسير* 📖\n\n✨ ${item.verse}\n📍 *${item.surah}*\n\n📝 *التفسير المبسط:*\n${item.interpretation}\n\n🔍 *معاني الكلمات:*\n${item.meanings}\n\n#قرآن #آية_وتفسير`;
};

export const getFiqhIssue = (dayIndex) => {
  if (!fiqhData.length) return null;
  const item = fiqhData[dayIndex % fiqhData.length];
  return `⚖️ *فقه سريع* ⚖️\n\n❓ *المسألة:* ${item.issue}\n\n✅ *الحكم:* ${item.ruling}\n\n📖 *الدليل:* ${item.evidence}\n\n#فقه #مسألة_فقهية`;
};

export const isThursdayNight = () => {
  const now = new Date();
  return now.getDay() === 4 && now.getHours() >= 18; // Thursday evening
};

export const isFridayNight = () => {
  const now = new Date();
  return now.getDay() === 4 && now.getHours() >= 18; // Technically Friday starts at sunset Thursday
};

export const getDhuAlHijjahReminder = () => {
  // This would normally use a Hijri library, but we can mock it or check dates for 2026
  // In 2026, 1 Dhu al-Hijjah is approximately May 17
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  if (year === 2026 && month === 5 && day >= 17 && day <= 26) {
    return `✨ *تنبيه: دخلت العشر الأوائل من ذي الحجة* ✨\n\nقال ﷺ: "ما من أيام العمل الصالح فيها أحب إلى الله من هذه الأيام".\n\n💡 *أهم الأعمال:* \n1️⃣ الصيام (خاصة يوم عرفة)\n2️⃣ الإكثار من التحميد والتهليل والتكبير\n3️⃣ الصدقة وصلة الأرحام\n4️⃣ قراءة القرآن\n\nاغتنموا هذه الأيام المباركة! 🌸`;
  }
  return null;
};
