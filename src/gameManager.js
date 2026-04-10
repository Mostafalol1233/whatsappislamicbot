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

const gamesData = loadJson('games.json') || { complete_verse: [], who_am_i: [] };

export const activeGames = new Map(); // chatJid -> { type, data, startTime }

export const startTriviaGame = (chatJid, questionData) => {
  activeGames.set(chatJid, { type: 'trivia', data: questionData, startTime: Date.now() });
};

export const startCompleteVerseGame = (chatJid, dayIndex) => {
  if (!gamesData.complete_verse.length) return null;
  const game = gamesData.complete_verse[dayIndex % gamesData.complete_verse.length];
  activeGames.set(chatJid, { type: 'complete_verse', data: game, startTime: Date.now() });
  return `✨ *المسابقات الدينية — أكمل الآية* ✨\n\n📖 ${game.partial_verse}\n\n📝 *المطلوب:* إكمال الآية الكريمة.\n\n⏳ سيتم عرض الجواب الصحيح بعد ساعة واحدة إن شاء الله.\n\n#مسابقات_دينية #أكمل_الآية`;
};

export const revealCompleteVerseAnswer = (chatJid) => {
  const game = activeGames.get(chatJid);
  if (!game || game.type !== 'complete_verse') return null;
  activeGames.delete(chatJid);
  return `✅ *الإجابة الصحيحة:* ✅\n\n📖 ${game.data.full_verse}\n📍 *${game.data.surah}*\n\nبارك الله فيكم جميعاً على المشاركة! ✨`;
};

export const startWhoAmIGame = (chatJid, dayIndex) => {
  if (!gamesData.who_am_i.length) return null;
  const game = gamesData.who_am_i[dayIndex % gamesData.who_am_i.length];
  activeGames.set(chatJid, { type: 'who_am_i', data: game, startTime: Date.now() });
  return `✨ *المسابقات الدينية — من أنا؟* ✨\n\n🤔 *الوصف:* ${game.description}\n\n📝 *المطلوب:* تخمين اسم الصحابي.\n\n⏳ سيتم عرض الجواب الصحيح بعد ساعة واحدة إن شاء الله.\n\n#مسابقات_دينية #من_أنا`;
};

export const revealWhoAmIAnswer = (chatJid) => {
  const game = activeGames.get(chatJid);
  if (!game || game.type !== 'who_am_i') return null;
  activeGames.delete(chatJid);
  return `✅ *الإجابة الصحيحة:* ✅\n\n👤 الصحابي هو: *${game.data.answer}*\n\nبارك الله فيكم جميعاً على المشاركة! ✨`;
};

export const checkGameAnswer = (chatJid, userText, userJid, userName) => {
  const game = activeGames.get(chatJid);
  if (!game) return null;

  let isCorrect = false;
  if (game.type === 'trivia') {
    // Check if user answer is the correct option (number) or the text itself
    const normalizedUserText = userText.trim().toLowerCase();
    const normalizedAnswer = game.data.answer.toLowerCase();
    
    // Check if user typed the option number (1, 2, 3, 4)
    const optionIdx = game.data.options.findIndex(opt => opt.toLowerCase() === normalizedAnswer);
    const correctOptionNumber = (optionIdx + 1).toString();
    
    isCorrect = normalizedUserText === correctOptionNumber || normalizedUserText.includes(normalizedAnswer);
  } else if (game.type === 'who_am_i') {
    isCorrect = userText.includes(game.data.answer);
  } else if (game.type === 'complete_verse') {
    // Basic check for verse completion (if user text contains a key part of the answer)
    // Extracting the part the user needs to complete
    const answer = game.data.full_verse.replace(game.data.partial_verse.replace('...', ''), '').replace(/﴿|﴾/g, '').trim();
    isCorrect = userText.includes(answer) || userText.length > 10 && game.data.full_verse.includes(userText);
  }

  if (isCorrect) {
    // Points system logic would go here
    return {
      userName,
      userJid,
      correct: true,
      points: 10
    };
  }
  return null;
};
