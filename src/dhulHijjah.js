/**
 * Fix 8: First 10 Days of Dhul Hijjah — Special Content Block.
 *
 * Uses moment-hijri to detect the Hijri date.
 * Persists "which events were sent today" via data/dhulhijjah_state.json.
 * Called from bot.js via a scheduled check every minute.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import moment from 'moment-hijri';
import { DECO } from './content.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, '..', 'data', 'dhulhijjah_state.json');

// ── State helpers ──────────────────────────────────────────────

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch { /* ignore */ }
  return {};
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function isDone(state, jid, key) {
  return state?.[jid]?.[key] === true;
}

function markDone(state, jid, key) {
  if (!state[jid]) state[jid] = {};
  state[jid][key] = true;
  saveState(state);
}

// Reset per-JID state at the start of a new day
function refreshDayState(state, jid, todayKey) {
  if (state[jid]?._day !== todayKey) {
    state[jid] = { _day: todayKey };
    saveState(state);
  }
}

// ── Hijri date helpers ─────────────────────────────────────────

/**
 * Returns { hijriDay, hijriMonth } where months are 1-based.
 */
export function getHijriDate() {
  const m = moment();
  return { hijriDay: m.iDate(), hijriMonth: m.iMonth() + 1, hijriYear: m.iYear() };
}

/**
 * Returns 1-10 if today is in the first 10 days of Dhul Hijjah, else null.
 */
export function getDhulHijjahDay() {
  const { hijriDay, hijriMonth } = getHijriDate();
  if (hijriMonth === 12 && hijriDay >= 1 && hijriDay <= 10) return hijriDay;
  return null;
}

// ── Content blocks ─────────────────────────────────────────────

function virtuesMessage(day) {
  return `${DECO.DHU_HIJJAH(`🌙 فضل العشر الأوائل من ذي الحجة`)}\n\n` +
    `قال النبي ﷺ:\n_"ما من أيام العمل الصالح فيها أحب إلى الله من هذه الأيام العشر"\n(رواه البخاري)_\n\n` +
    `*هذا هو اليوم ${day} من أيام العشر المباركة 🌟*\n\n` +
    `أبرز الأعمال المستحبة:\n` +
    `• الإكثار من التكبير والتهليل والتحميد\n` +
    `• الصيام — خاصة يوم عرفة\n` +
    `• الصدقة وصلة الأرحام\n` +
    `• قراءة القرآن بتدبر\n` +
    `• الاستغفار والتوبة\n\n` +
    `🤲 _اللهم بلغنا خير هذه الأيام المباركة_`;
}

function fastingReminder(day) {
  if (day === 9) {
    return `${DECO.DHU_HIJJAH('🌙 يوم عرفة — أعظم أيام السنة')}\n\n` +
      `اليوم هو *يوم عرفة* 🕋\n\n` +
      `قال ﷺ: _"صيام يوم عرفة، أحتسب على الله أن يكفر السنة التي قبله والسنة التي بعده"\n(رواه مسلم)_\n\n` +
      `*الصيام اليوم يكفر سنتين!*\n\n` +
      `أكثروا من هذا الدعاء:\n*لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير*\n\n` +
      `🤲 _اللهم اغفر لنا ذنوبنا وارحمنا في هذا اليوم العظيم_`;
  }
  if (day === 10) {
    return `${DECO.DHU_HIJJAH('🎉 عيد الأضحى المبارك')}\n\n` +
      `*تقبل الله منا ومنكم صالح الأعمال* 🌹\n\n` +
      `اليوم يوم عيد — *لا صيام* فيه.\n\n` +
      `من سنن العيد:\n` +
      `• الاغتسال والتطيب\n` +
      `• الإكثار من التكبير\n` +
      `• صلاة العيد\n` +
      `• الأضحية\n` +
      `• صلة الأرحام\n\n` +
      `🤲 _عيدكم مبارك وكل عام وأنتم بخير_`;
  }
  // Days 1-8
  return `${DECO.DHU_HIJJAH('🌙 تذكير بالصيام')}\n\n` +
    `غداً *اليوم ${day + 1}* من أيام العشر المباركة 🌟\n\n` +
    `الصيام في هذه الأيام مستحب وفيه أجر عظيم.\n\n` +
    `دعاء السحور:\n_"اللهم أعني على صيامي وقيامي وأجرني من عذاب النار"_\n\n` +
    `🤲 _تقبل الله طاعاتكم_`;
}

function dailyUniqueContent(day) {
  const contents = {
    1: `${DECO.DHU_HIJJAH('🌙 اليوم الأول — التكبير')}\n\n` +
       `قال الله تعالى:\n_﴿وَيَذْكُرُوا اسْمَ اللَّهِ فِي أَيَّامٍ مَّعْلُومَاتٍ﴾_\n\n` +
       `*التكبير المطلق:*\nاللهُ أكبر، اللهُ أكبر، لا إله إلا الله،\nاللهُ أكبر، اللهُ أكبر، وللهِ الحمد\n\n` +
       `أكثروا من التكبير في بيوتكم وفي طريقكم وفي كل مكان 🔊\n\n` +
       `🤲 _اللهم اجعلنا من الذاكرين_`,

    2: `${DECO.DHU_HIJJAH('🌙 اليوم الثاني — التوبة والاستغفار')}\n\n` +
       `قال ﷺ: _"من تاب قبل أن تطلع الشمس من مغربها، تاب الله عليه"\n(رواه مسلم)_\n\n` +
       `أكثر من هذا الاستغفار:\n*أستغفر الله العظيم الذي لا إله إلا هو الحي القيوم وأتوب إليه*\n\n` +
       `🤲 _اللهم اغفر لنا وارحمنا وتب علينا_`,

    3: `${DECO.DHU_HIJJAH('🌙 اليوم الثالث — قصة إبراهيم والأضحية')}\n\n` +
       `*إبراهيم عليه السلام — أبو الأنبياء*\n\n` +
       `حين أمره الله بذبح ابنه إسماعيل، لم يتردد لحظة.\nقال إسماعيل لأبيه: _"يا أبتِ افعل ما تؤمر، ستجدني إن شاء الله من الصابرين"_\n\n` +
       `فلما استسلما، نادى الله إبراهيم أن قد صدّق الرؤيا،\nوفداه بذبح عظيم 🐏\n\n` +
       `*العبرة:* الطاعة الكاملة لله هي معنى الإسلام الحقيقي.\n\n` +
       `🤲 _اللهم اجعلنا من المسلمين المنقادين لأمرك_`,

    4: `${DECO.DHU_HIJJAH('🌙 اليوم الرابع — الصدقة')}\n\n` +
       `قال ﷺ: _"الصدقة تطفئ الخطيئة كما يطفئ الماء النار"\n(رواه الترمذي)_\n\n` +
       `*أفضل الصدقات في هذه الأيام:*\n` +
       `• إطعام المساكين\n` +
       `• الصدقة الجارية\n` +
       `• مساعدة الجار\n` +
       `• الكلمة الطيبة\n\n` +
       `🤲 _اللهم تقبل صدقاتنا واجعلها في ميزان حسناتنا_`,

    5: `${DECO.DHU_HIJJAH('🌙 اليوم الخامس — صلة الرحم')}\n\n` +
       `قال ﷺ: _"من أحب أن يُبسط له في رزقه ويُنسأ له في أثره، فليصل رحمه"\n(رواه البخاري)_\n\n` +
       `*اتصل اليوم بمن لم تتصل به منذ فترة:*\n` +
       `📞 والديك — أقاربك — أصدقاءك القدامى\n\n` +
       `الكلمة الطيبة صدقة، والسلام صدقة 🌸\n\n` +
       `🤲 _اللهم وصّل أرحامنا وبارك في أعمارنا_`,

    6: `${DECO.DHU_HIJJAH('🌙 اليوم السادس — قراءة القرآن')}\n\n` +
       `قال ﷺ: _"اقرؤوا القرآن فإنه يأتي يوم القيامة شفيعاً لأصحابه"\n(رواه مسلم)_\n\n` +
       `*تحدي اليوم:*\nاقرأ ورداً من القرآن الكريم ولو صفحة واحدة بتدبر.\n\n` +
       `*أفضل السور في هذه الأيام:*\n• سورة الكهف\n• سورة الإخلاص ×3\n• آية الكرسي بعد كل صلاة\n\n` +
       `🤲 _اللهم اجعل القرآن ربيع قلوبنا_`,

    7: `${DECO.DHU_HIJJAH('🌙 اليوم السابع — الأضحية وأحكامها')}\n\n` +
       `*الأضحية سنة مؤكدة عن النبي ﷺ*\n\n` +
       `*من أراد أن يضحي فلا يأخذ من شعره أو أظفاره شيئاً من أول ذي الحجة.*\n\n` +
       `*أوقات الذبح:* من صلاة عيد الأضحى حتى غروب شمس اليوم الثالث عشر.\n\n` +
       `*من أنواع الأضحية:*\n• الغنم: عن شخص واحد\n• البقر والإبل: تجزئ عن سبعة\n\n` +
       `🤲 _اللهم تقبل منا ضحايانا وطاعاتنا_`,

    8: `${DECO.DHU_HIJJAH('🌙 اليوم الثامن — يوم التروية')}\n\n` +
       `اليوم يوم التروية — وهو اليوم الذي كان الحجاج يتزودون فيه من الماء استعداداً لعرفة.\n\n` +
       `*استعد لليوم التاسع يوم عرفة:*\n` +
       `• أكثر من الدعاء والاستغفار\n` +
       `• نوِ الصيام غداً\n` +
       `• أعد قائمة بأدعيتك الخاصة\n\n` +
       `أفضل الدعاء يوم عرفة:\n*لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير*\n\n` +
       `🤲 _اللهم وفقنا لما تحبه وترضاه_`,

    9: `${DECO.DHU_HIJJAH('🕋 يوم عرفة — أفضل الأيام')}\n\n` +
       `*اليوم يوم عرفة 🕋*\n\n` +
       `أكثر من هذه الأدعية:\n\n` +
       `1⃣ _لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير_\n\n` +
       `2⃣ _اللهم إني أسألك العفو والعافية في الدنيا والآخرة_\n\n` +
       `3⃣ _اللهم اغفر لي وارحمني وتب عليّ، إنك أنت التواب الرحيم_\n\n` +
       `4⃣ _سبحانك اللهم وبحمدك أشهد أن لا إله إلا أنت أستغفرك وأتوب إليك_\n\n` +
       `🤲 _اللهم اغفر لأمة محمد ﷺ في هذا اليوم العظيم_`,

    10: `${DECO.DHU_HIJJAH('🎉 عيد الأضحى المبارك')}\n\n` +
        `*تقبل الله منا ومنكم* 🌹\n\n` +
        `*دعاء العيد:*\n_تقبل الله منا ومنكم، وجعلنا وإياكم من عتقاء النار_\n\n` +
        `*أدعية العيد:*\n` +
        `• اللهم تقبل منا صيامنا وقيامنا\n` +
        `• اللهم اجعل عيدنا عيد ايمان ويقين\n` +
        `• اللهم ارزقنا حج بيتك الحرام\n\n` +
        `*التكبير يوم العيد:*\nاللهُ أكبر، اللهُ أكبر، لا إله إلا الله،\nاللهُ أكبر، اللهُ أكبر، وللهِ الحمد\n\n` +
        `🤲 _عيدكم مبارك وكل عام وأنتم بخير_`,
  };
  return contents[day] || null;
}

// Caption for opening image
export function buildDhulHijjahImageCaption(day, hijriYear, gregorianDate) {
  const isFastingDay = day >= 1 && day <= 9;
  const isEid = day === 10;
  const fastingNote = isEid
    ? '🎉 اليوم عيد الأضحى — لا صيام'
    : day === 9
      ? '🕋 يوم عرفة — الصيام يكفر سنتين'
      : `✅ الصيام مستحب اليوم (اليوم ${day})`;
  return `${DECO.DHU_HIJJAH(`🌙 اليوم ${day} من ذي الحجة ${hijriYear}`)}\n\n` +
    `📅 ${gregorianDate}\n\n` +
    `${fastingNote}\n\n` +
    `🤲 _بارك الله لنا في هذه الأيام المباركة_`;
}

// ── Main scheduler hook ────────────────────────────────────────

/**
 * Called every minute from bot.js.
 * Returns an array of { type, payload } actions to perform, or [].
 *
 * Types:
 *   'image'    – { caption }
 *   'text'     – { text }
 *   'fasting'  – { text }
 */
export function getDhulHijjahActions(currentHour, currentMinute) {
  const day = getDhulHijjahDay();
  if (!day) return [];

  const state = loadState();
  const { hijriYear } = getHijriDate();
  const now = new Date();
  const gregorianDate = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const jid = '__global__'; // stored globally; bot.js broadcasts to all relevant targets
  refreshDayState(state, jid, todayKey);

  const actions = [];

  // 08:00 — opening image + virtues
  if (currentHour === 8 && currentMinute === 0) {
    if (!isDone(state, jid, 'image')) {
      markDone(state, jid, 'image');
      actions.push({ type: 'image', payload: { caption: buildDhulHijjahImageCaption(day, hijriYear, gregorianDate) } });
    }
    if (!isDone(state, jid, 'virtues')) {
      markDone(state, jid, 'virtues');
      actions.push({ type: 'text', payload: { text: virtuesMessage(day) } });
    }
  }

  // 08:30 — unique daily content
  if (currentHour === 8 && currentMinute === 30) {
    if (!isDone(state, jid, 'daily')) {
      markDone(state, jid, 'daily');
      const content = dailyUniqueContent(day);
      if (content) actions.push({ type: 'text', payload: { text: content } });
    }
  }

  // 21:00 — fasting reminder for next day (or Eid message on day 10)
  if (currentHour === 21 && currentMinute === 0) {
    if (!isDone(state, jid, 'fasting')) {
      markDone(state, jid, 'fasting');
      actions.push({ type: 'text', payload: { text: fastingReminder(day) } });
    }
  }

  return actions;
}

/**
 * Returns an iftar-at-Maghrib reminder text for fasting days (days 1-9).
 * Called from bot.js when Maghrib prayer fires on a Dhul Hijjah fasting day.
 */
export function getDhulHijjahIftarText(day) {
  if (day < 1 || day > 9) return null;
  return `${DECO.DHU_HIJJAH('🌙 إفطار ذي الحجة')}\n\n` +
    `*حان وقت الإفطار* — اليوم ${day} من ذي الحجة\n\n` +
    `دعاء الإفطار:\n_"ذهب الظمأُ وابتلت العروق وثبت الأجر إن شاء الله"_\n\n` +
    `🤲 _تقبل الله صيامكم_`;
}
