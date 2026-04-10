import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.join(__dirname, '..', 'data');
const LEADERBOARD_FILE = path.join(dataPath, 'leaderboard.json');

const ensureFile = () => {
  if (!fs.existsSync(LEADERBOARD_FILE)) {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify({ scores: {} }, null, 2));
  }
};

export const addPoints = (userJid, userName, points) => {
  ensureFile();
  const data = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf-8'));
  if (!data.scores[userJid]) {
    data.scores[userJid] = { name: userName, points: 0 };
  }
  data.scores[userJid].points += points;
  data.scores[userJid].name = userName; // Keep name updated
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2));
};

export const getLeaderboard = (limit = 10) => {
  ensureFile();
  const data = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf-8'));
  const list = Object.values(data.scores)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
  
  if (!list.length) return "🏆 *قائمة المتصدرين فارغة حالياً.* 🏆";

  let text = "🏆 *قائمة متصدري المسابقات الدينية* 🏆\n\n";
  list.forEach((u, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "👤";
    text += `${medal} *${u.name}*: ${u.points} نقطة\n`;
  });
  text += "\nبارك الله فيكم جميعاً! ✨";
  return text;
};
