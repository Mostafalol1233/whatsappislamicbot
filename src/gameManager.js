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

const gamesData = loadJson('games.json') || { complete_verse: [], who_am_i: [] };

export const activeGames = new Map();
export const questionMsgKeys = new Map();

export const setQuestionMsgKey = (chatJid, msgKey) => {
  if (msgKey) questionMsgKeys.set(chatJid, msgKey);
};

export const getQuestionMsgKey = (chatJid) => {
  return questionMsgKeys.get(chatJid) || null;
};

const difficultyLabel = (difficulty) => {
  if (difficulty === 'hard') return '🔴 _صعب_';
  if (difficulty === 'medium') return '🟡 _متوسط_';
  return '🟢 _سهل_';
};

export const startTriviaGame = (chatJid, questionData) => {
  activeGames.set(chatJid, { type: 'trivia', data: questionData, startTime: Date.now() });
};

export const buildTriviaQuestionText = (q) => {
  const optionsText = q.options.map((opt, i) => `  *${i + 1}.* ${opt}`).join('\n');
  const diff = difficultyLabel(q.difficulty || 'easy');
  return `${decorateTitle('🤔', 'سؤال ديني اليوم')}\n\n` +
    `${diff}\n\n` +
    `*${q.question}*\n\n` +
    `${optionsText}\n\n` +
    `⏳ _الإجابة الصحيحة بعد ساعة إن شاء الله_ 🌸`;
};

export const buildTriviaAnswerText = (q) => {
  const correctIdx = q.options.findIndex(opt => opt === q.answer);
  return `${decorateTitle('✅', 'الإجابة الصحيحة')}\n\n` +
    `*${correctIdx + 1}. ${q.answer}* ✔️\n\n` +
    `📖 *الشرح:*\n_${q.explanation}_\n\n` +
    `🌸 _بارك الله فيكم جميعًا_`;
};

export const startCompleteVerseGame = (chatJid, dayIndex) => {
  if (!gamesData.complete_verse.length) return null;
  const game = gamesData.complete_verse[dayIndex % gamesData.complete_verse.length];
  activeGames.set(chatJid, { type: 'complete_verse', data: game, startTime: Date.now() });
  return `${decorateTitle('📖', 'أكمل الآية الكريمة')}\n\n` +
    `*${game.partial_verse}*\n\n` +
    `✍️ _أكمل الآية في التعليقات_\n` +
    `⏳ _الإجابة بعد ساعة إن شاء الله_ 🌸`;
};

export const revealCompleteVerseAnswer = (chatJid) => {
  const game = activeGames.get(chatJid);
  if (!game || game.type !== 'complete_verse') return null;
  activeGames.delete(chatJid);
  return `${decorateTitle('✅', 'الإجابة الصحيحة')}\n\n` +
    `📖 *${game.data.full_verse}*\n` +
    `_${game.data.surah}_\n\n` +
    `🌸 _بارك الله فيكم ونفعنا وإياكم بكتابه_`;
};

export const startWhoAmIGame = (chatJid, dayIndex) => {
  if (!gamesData.who_am_i.length) return null;
  const game = gamesData.who_am_i[dayIndex % gamesData.who_am_i.length];
  activeGames.set(chatJid, { type: 'who_am_i', data: game, startTime: Date.now() });
  return `${decorateTitle('🕵️', 'من أنا؟')}\n\n` +
    `🔍 *الوصف:*\n${game.description}\n\n` +
    `✍️ _خمّن اسم الشخصية الإسلامية في التعليقات_\n` +
    `⏳ _الإجابة بعد ساعة إن شاء الله_ 🌸`;
};

export const revealWhoAmIAnswer = (chatJid) => {
  const game = activeGames.get(chatJid);
  if (!game || game.type !== 'who_am_i') return null;
  activeGames.delete(chatJid);
  return `${decorateTitle('✅', 'الإجابة الصحيحة')}\n\n` +
    `👤 _الشخصية هي:_ *${game.data.answer}*\n\n` +
    `🌸 _بارك الله فيكم ونفعنا بسير صالحيه_`;
};

export const checkGameAnswer = (chatJid, userText, userJid, userName) => {
  const game = activeGames.get(chatJid);
  if (!game) return null;

  let isCorrect = false;
  if (game.type === 'trivia') {
    const normalizedUserText = userText.trim().toLowerCase();
    const normalizedAnswer = game.data.answer.toLowerCase();
    const optionIdx = game.data.options.findIndex(opt => opt.toLowerCase() === normalizedAnswer);
    const correctOptionNumber = (optionIdx + 1).toString();
    isCorrect = normalizedUserText === correctOptionNumber || normalizedUserText.includes(normalizedAnswer);
  } else if (game.type === 'who_am_i') {
    isCorrect = userText.includes(game.data.answer);
  } else if (game.type === 'complete_verse') {
    const answer = game.data.full_verse.replace(game.data.partial_verse.replace('...', ''), '').replace(/﴿|﴾/g, '').trim();
    isCorrect = userText.includes(answer) || (userText.length > 10 && game.data.full_verse.includes(userText));
  }

  if (isCorrect) {
    return { userName, userJid, correct: true, points: 10 };
  }
  return null;
};
