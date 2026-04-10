import fs from 'fs';
import dotenv from 'dotenv';
import cron from 'node-cron';
import qrcode from 'qrcode-terminal';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { adminMenu, athkar, athkarCards, commandMenu, dailyCards, duas, formatAthkar, formatPrayerInfo, istighfarList, lastTenDuas, prayerNameArabic, dailyDuas, dailyTips, seriesAllahNames, seriesAshraMubashareen, seriesSeerah, triviaQuestions } from './content.js';
import { getAfterPrayerAzkar, getEveningAzkar, getMorningAzkar } from './azkarApi.js';
import { getPixabayImages, getRandomIslamicImage } from './imageApi.js';
import { addTarget, getStore, getTarget, removeTarget, updateTarget, isEventSentToday, markEventSent } from './store.js';
import { convertTo12Hour, formatPrayerTimes, getDailyJuzNumber, getNextPrayer, getPrayerTimes, isPrayerNow } from './prayer.js';
import { getProphetsStory, getSeerahInfo, getQuranVerse, getFiqhIssue, getDhuAlHijjahReminder } from './dailyContentManager.js';
import { startCompleteVerseGame, revealCompleteVerseAnswer, startWhoAmIGame, revealWhoAmIAnswer, checkGameAnswer, activeGames, startTriviaGame } from './gameManager.js';
import { addPoints, getLeaderboard } from './leaderboard.js';

dotenv.config();

const config = {
  city: process.env.CITY || 'Cairo',
  country: process.env.COUNTRY || 'Egypt',
  method: Number(process.env.METHOD || 5),
  timezone: process.env.TIMEZONE || 'Africa/Cairo',
  nightlyAzkarTime: process.env.NIGHTLY_AZKAR_TIME || '21:30',
  quranPdfTime: process.env.QURAN_PDF_TIME || '10:00',
  dailyJuzTime: process.env.DAILY_JUZ_TIME || '08:00',
  dailyCardTime: process.env.DAILY_CARD_TIME || '09:00',
  dailySeriesTime: process.env.DAILY_SERIES_TIME || '13:00',
  dailyQuestionTime: process.env.DAILY_QUESTION_TIME || '11:00',
  dailyAnswerTime: process.env.DAILY_ANSWER_TIME || '12:00',
  salawatTime: process.env.SALAWAT_TIME || '12:00',
  audioSnippetTime: process.env.AUDIO_SNIPPET_TIME || '19:00',
  witrReminderTime: process.env.WITR_REMINDER_TIME || '23:00',
  charityReminderTime: process.env.CHARITY_REMINDER_TIME || '14:30',
  adhan019Path: process.env.ADHAN_019_PATH || './assets/019--1.mp3',
  adhan052Path: process.env.ADHAN_052_PATH || './assets/052-.mp3',
  dua046Path: process.env.DUA_046_PATH || './assets/046--_up_by_muslem.mp3',
  adhan019Url: process.env.ADHAN_019_URL || '',
  adhan052Url: process.env.ADHAN_052_URL || '',
  dua046Url: process.env.DUA_046_URL || '',
  botStartDate: process.env.BOT_START_DATE || '2026-02-19',
  ishaDuaDelayMinutes: Number(process.env.ISHA_DUA_DELAY_MINUTES || 10),
  quranPdfUrl: process.env.QURAN_PDF_URL || 'https://archive.org/download/TheHolyQuran-Arabic.pdf/TheHolyQuran-Arabic.pdf',
  enableSolarAthkar: process.env.ENABLE_SOLAR_ATHKAR !== 'false',
  skipWhatsappInit: process.env.SKIP_WHATSAPP_INIT === 'true',
  authFolder: process.env.BAILEYS_AUTH_FOLDER || 'auth_info_baileys',
  ownerNumber: process.env.OWNER_NUMBER || '201500302461'
};

const notified = new Set();
const logger = { info: console.log, warn: console.warn, error: console.error };
let sock;
let started = false;
let baileysApi;

const parseTimeToMinutes = (hhmm) => {
  if (!hhmm || typeof hhmm !== 'string') return 1441; // Greater than any time in day
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const getBotDay = (now = new Date()) => {
  const start = new Date(`${config.botStartDate}T00:00:00`);
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((current.getTime() - start.getTime()) / 86400000);
  if (diffDays < 0) return 1;
  return diffDays + 1;
};

const toCron = (hhmm) => {
  const [h, m] = hhmm.split(':');
  return `${m} ${h} * * *`;
};

async function loadBaileysApi() {
  if (baileysApi) return baileysApi;
  const mod = await import('@whiskeysockets/baileys');
  baileysApi = {
    makeWASocket: mod.default,
    DisconnectReason: mod.DisconnectReason,
    fetchLatestBaileysVersion: mod.fetchLatestBaileysVersion,
    useMultiFileAuthState: mod.useMultiFileAuthState,
    downloadContentFromMessage: mod.downloadContentFromMessage
  };
  return baileysApi;
}

async function sendText(jid, text) {
  if (!sock) return;
  await sock.sendMessage(jid, { text });
}

async function broadcastTo(targets, text) {
  for (const t of targets) await sendText(t.id, text);
}

async function loadAudioBuffer(path, url) {
  if (path && fs.existsSync(path)) return fs.readFileSync(path);
  if (url) {
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  }
  return null;
}

async function sendAudio(jid, buffer, caption) {
  if (!sock || !buffer) return;
  if (caption) await sendText(jid, caption);
  await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg' });
}

async function sendStickerFromBuffer(jid, buffer, pack, author) {
  if (!sock || !buffer) return;
  const sticker = new Sticker(buffer, { pack, author, type: StickerTypes.FULL, quality: 70 });
  const stickerBuffer = await sticker.build();
  await sock.sendMessage(jid, { sticker: stickerBuffer });
}

function getActiveTargets(filter = () => true) {
  return getStore().targets.filter((t) => t.isActive && filter(t));
}

function getAdhanFileName(prayerKey) {
  return prayerKey === 'Fajr' || prayerKey === 'Maghrib' ? '052-.mp3' : '019--1.mp3';
}

async function notifyPrayerForTarget(target, prayerKey, time) {
  const ar = prayerNameArabic[prayerKey] || prayerKey;
  const displayTime = convertTo12Hour(time);
  
  const messages = [
    `يا جماعة، حان الآن موعد أذان *${ar}* 🕌\nالوقت: *${displayTime}*\n\nلا تنسوا الدعاء في هذا الوقت المستجاب 🤲`,
    `الله أكبر، أذن *${ar}* الآن 🕋\nالساعة: *${displayTime}*\n\nتقبل الله منا ومنكم صالح الأعمال 🌸`,
    `حان وقت لقاء الله.. أذان *${ar}* الآن 🕌\nتوقيت: *${displayTime}*\n\nصلوا على النبي ﷺ واستعدوا للصلاة ✨`
  ];
  const text = messages[Math.floor(Math.random() * messages.length)];
  await sendText(target.id, text);

  const use052 = prayerKey === 'Fajr' || prayerKey === 'Maghrib';
  const adhanBuffer = await loadAudioBuffer(use052 ? config.adhan052Path : config.adhan019Path, use052 ? config.adhan052Url : config.adhan019Url);
  await sendAudio(target.id, adhanBuffer); // No caption for audio to keep it natural

  if (target.enableAthkar) {
    setTimeout(async () => {
      const list = await getAfterPrayerAzkar();
      await sendText(target.id, formatAthkar('أذكار بعد الصلاة', list));
    }, 10 * 60 * 1000);
  }
  if (prayerKey === 'Isha') {
    setTimeout(async () => {
      const duaBuffer = await loadAudioBuffer(config.dua046Path, config.dua046Url);
      await sendAudio(target.id, duaBuffer);
    }, config.ishaDuaDelayMinutes * 60 * 1000);
  }
  if (prayerKey === 'Fajr' || prayerKey === 'Isha') {
    const dua = duas[Math.floor(Math.random() * duas.length)];
    setTimeout(() => sendText(target.id, `🤲 *دعاء جميل في هذا الوقت:*\n\n${dua}`), 5 * 60 * 1000);
  }
}

async function checkPrayerAlerts() {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (const target of getActiveTargets((t) => t.enablePrayer)) {
    const times = await getPrayerTimes({ city: target.city, country: target.country, method: config.method });
    for (const prayer of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      const eventKey = `prayer-${prayer.toLowerCase()}`;
      const prayerTime = times[prayer];
      if (!prayerTime) continue;
      const prayerMinutes = parseTimeToMinutes(prayerTime);

      // Only send if it's exactly the current minute
      if (prayerMinutes === nowMinutes && !isEventSentToday(target.id, eventKey)) {
        await notifyPrayerForTarget(target, prayer, prayerTime);
        markEventSent(target.id, eventKey);
      }

      const preEventKey = `${eventKey}-pre10`;
      if (prayerMinutes - nowMinutes === 10 && !isEventSentToday(target.id, preEventKey)) {
        const ar = prayerNameArabic[prayer] || prayer;
        await sendText(target.id, `يا شباب، فضل 10 دقايق على أذان *${ar}*.. استعدوا 🕌✨`);
        markEventSent(target.id, preEventKey);
      }
    }
  }
}

async function checkSolarAthkarAlerts() {
  if (!config.enableSolarAthkar) return;
  const now = new Date();
  for (const target of getActiveTargets((t) => t.enableAthkar)) {
    const times = await getPrayerTimes({ city: target.city, country: target.country, method: config.method });
    
    if (!isEventSentToday(target.id, 'sunrise-athkar') && isPrayerNow(times.Sunrise, now)) {
      const list = await getMorningAzkar();
      await sendText(target.id, `صباح الخير 🌸 الشمس طلعت، لا تنسوا أذكار الصباح عشان يومكم يكون كله بركة ✨\n\n${formatAthkar('أذكار الصباح', list)}`);
      markEventSent(target.id, 'sunrise-athkar');
    }
    
    if (!isEventSentToday(target.id, 'sunset-athkar') && isPrayerNow(times.Maghrib, now)) {
      const list = await getEveningAzkar();
      await sendText(target.id, `مساء الخير والطاعة 🌇 الشمس غربت، وقت أذكار المساء.. تقبل الله طاعاتكم 🤲\n\n${formatAthkar('أذكار المساء', list)}`);
      markEventSent(target.id, 'sunset-athkar');
    }
  }
}

async function sendQuranPdf() {
  for (const t of getActiveTargets((x) => x.enableQuran)) {
    if (isEventSentToday(t.id, 'quran-pdf')) continue;
    await sock.sendMessage(t.id, { document: { url: config.quranPdfUrl }, fileName: 'Holy-Quran.pdf', mimetype: 'application/pdf', caption: `يا شباب، ده ملف المصحف عشان اللي حابب يقرأ قرآن انهارده 📖✨\n\nاجعل لك ورداً يومياً تطهر به قلبك 🌸🌙` });
    markEventSent(t.id, 'quran-pdf');
  }
}

async function sendDailyJuz() {
  const juz = getDailyJuzNumber(new Date(), config.botStartDate);
  for (const t of getActiveTargets((t) => t.enableQuran)) {
    if (isEventSentToday(t.id, 'daily-juz')) continue;
    await sendText(t.id, `📚 *ورد اليوم انهارده:* الجزء رقم *${juz}*\n\nالرابط للمتابعة: https://quran.com/juz/${juz} 🌙✨`);
    markEventSent(t.id, 'daily-juz');
  }
}

async function sendDailyDua() {
  const targets = getActiveTargets((t) => t.enableAthkar || t.enablePrayer);
  if (!targets.length || !duas.length) return;
  const dua = duas[Math.floor(Math.random() * duas.length)];
  const messages = [
    `🤲 *دعاء جميل انهارده:*\n\n${dua}\n\nرددوه من قلبكم 🌸✨`,
    `اللهم استجب 🤲✨\n\n${dua}\n\nما تنسوش تدعوا لإخوانكم معاكم 🌸`,
    `دعاء يريح القلب 🤲🌸\n\n${dua}\n\nيومكم كله بركة وطاعة ✨`
  ];
  const text = messages[Math.floor(Math.random() * messages.length)];
  for (const t of targets) {
    if (isEventSentToday(t.id, 'daily-dua')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'daily-dua');
  }
}

async function sendDailyProphetsStory() {
  const day = getBotDay();
  const text = getProphetsStory(day - 1);
  if (!text) return;
  for (const t of getActiveTargets((x) => x.enableDaily)) {
    if (isEventSentToday(t.id, 'prophets-story')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'prophets-story');
  }
}

async function sendDailySeerah() {
  const day = getBotDay();
  const text = getSeerahInfo(day - 1);
  if (!text) return;
  for (const t of getActiveTargets((x) => x.enableDaily)) {
    if (isEventSentToday(t.id, 'seerah-info')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'seerah-info');
  }
}

async function sendDailyQuranVerse() {
  const day = getBotDay();
  const text = getQuranVerse(day - 1);
  if (!text) return;
  for (const t of getActiveTargets((x) => x.enableDaily)) {
    if (isEventSentToday(t.id, 'quran-verse')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'quran-verse');
  }
}

async function sendDailyFiqh() {
  const day = getBotDay();
  const text = getFiqhIssue(day - 1);
  if (!text) return;
  for (const t of getActiveTargets((x) => x.enableDaily)) {
    if (isEventSentToday(t.id, 'fiqh-issue')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'fiqh-issue');
  }
}

async function sendThursdayReminder() {
  const text = `🔔 *تذكير ليلة الجمعة* 🔔\n\nما تنسوش الليلة قراءة سورة الكهف 📖\nوكذلك الإكثار من الصلاة على النبي ﷺ 🌸\n\n"اللهم صل وسلم على نبينا محمد" ✨`;
  for (const t of getActiveTargets((x) => x.enableDaily || x.enableAthkar)) {
    if (isEventSentToday(t.id, 'thursday-reminder')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'thursday-reminder');
  }
}

async function sendFridaySalawat() {
  const text = `🌸 *ليالي الجمعة* 🌸\n\nأكثروا من الصلاة على النبي ﷺ في هذه الليلة المباركة.\n\n"إن الله وملائكته يصلون على النبي يا أيها الذين آمنوا صلوا عليه وسلموا تسليما" ✨\n\nاللهم صل وسلم وبارك على نبينا محمد 🕌`;
  for (const t of getActiveTargets((x) => x.enableDaily || x.enableAthkar)) {
    if (isEventSentToday(t.id, 'friday-salawat')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'friday-salawat');
  }
}

async function sendDhuAlHijjahReminder() {
  const text = getDhuAlHijjahReminder();
  if (!text) return;
  for (const t of getActiveTargets((x) => x.enableDaily)) {
    if (isEventSentToday(t.id, 'dhul-hijjah-reminder')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'dhul-hijjah-reminder');
  }
}

async function sendCompleteVerseGame() {
  const day = getBotDay();
  for (const t of getActiveTargets((x) => x.enableChallenges)) {
    if (isEventSentToday(t.id, 'complete-verse-start')) continue;
    const text = startCompleteVerseGame(t.id, day - 1);
    if (text) {
      await sendText(t.id, text);
      markEventSent(t.id, 'complete-verse-start');
    }
  }
}

async function revealCompleteVerseGame() {
  for (const t of getActiveTargets((x) => x.enableChallenges)) {
    if (isEventSentToday(t.id, 'complete-verse-reveal')) continue;
    const text = revealCompleteVerseAnswer(t.id);
    if (text) {
      await sendText(t.id, text);
      markEventSent(t.id, 'complete-verse-reveal');
    }
  }
}

async function sendWhoAmIGame() {
  const day = getBotDay();
  for (const t of getActiveTargets((x) => x.enableChallenges)) {
    if (isEventSentToday(t.id, 'who-am-i-start')) continue;
    const text = startWhoAmIGame(t.id, day - 1);
    if (text) {
      await sendText(t.id, text);
      markEventSent(t.id, 'who-am-i-start');
    }
  }
}

async function revealWhoAmIGame() {
  for (const t of getActiveTargets((x) => x.enableChallenges)) {
    if (isEventSentToday(t.id, 'who-am-i-reveal')) continue;
    const text = revealWhoAmIAnswer(t.id);
    if (text) {
      await sendText(t.id, text);
      markEventSent(t.id, 'who-am-i-reveal');
    }
  }
}

async function sendDailyCard() {
  const targets = getActiveTargets((t) => t.enableDaily);
  if (!targets.length || !dailyCards.length) return;
  const day = getBotDay();
  const idx = (day - 1) % dailyCards.length;
  const card = dailyCards[idx];
  
  const tip = dailyTips.length ? dailyTips[(day - 1) % dailyTips.length] : '';
  
  const messages = [
    `يوم جديد من الأيام المباركة 🌙.. اليوم *${day}*\n\n*${card.title}*\n${card.text}\n\n💡 نصيحة سريعة: ${tip} 🌸`,
    `صباح الخير في اليوم *${day}* 🌙\n\n*${card.title}*\n${card.text}\n\n💡 خذ بهذه النصيحة: ${tip} ✨`,
    `تقبل الله طاعاتكم في اليوم *${day}* 🌙\n\n*${card.title}*\n${card.text}\n\n💡 نصيحة اليوم: ${tip} 🌸`
  ];
  const caption = messages[Math.floor(Math.random() * messages.length)];
  
  const autoImageUrl = await getRandomIslamicImage();
  for (const t of targets) {
    if (isEventSentToday(t.id, 'daily-card')) continue;
    const imageUrl = autoImageUrl || card.imageUrl;
    if (imageUrl) await sock.sendMessage(t.id, { image: { url: imageUrl }, caption });
    else await sendText(t.id, caption);
    markEventSent(t.id, 'daily-card');
  }
}

async function sendDailySeries() {
  const targets = getActiveTargets((t) => t.enableDaily || t.enableQuran);
  if (!targets.length) return;
  const day = getBotDay();
  const name = seriesAllahNames.length ? seriesAllahNames[(day - 1) % seriesAllahNames.length] : null;
  const ashra = seriesAshraMubashareen.length ? seriesAshraMubashareen[(day - 1) % seriesAshraMubashareen.length] : null;
  const seerah = seriesSeerah.length ? seriesSeerah[(day - 1) % seriesSeerah.length] : null;
  if (!name && !ashra && !seerah) return;

  let text = `معلومات دينية جميلة ليومنا ده (اليوم *${day}*) 🌙✨\n━━━━━━━━━━━━━━━━━━\n\n`;
  if (name) text += `🔹 *من أسماء الله الحُسنى:* ${name.name}\n*المعنى:* ${name.meaning}\n*دعاء:* ${name.dua}\n\n`;
  if (ashra) text += `🌟 *من العشرة المبشرين بالجنة:* ${ashra.title}\n${ashra.text}\n\n`;
  if (seerah) text += `📖 *من السيرة النبوية:* ${seerah.title}\n${seerah.text}\n`;
  
  for (const t of targets) {
    if (isEventSentToday(t.id, 'daily-series')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'daily-series');
  }
}

async function sendSalawatReminder() {
  const targets = getActiveTargets((t) => t.enablePrayer || t.enableAthkar);
  if (!targets.length) return;
  const counts = [10, 33, 50, 100];
  const n = counts[Math.floor(Math.random() * counts.length)];
  const messages = [
    `يا جماعة، إيه رأيكم نصلي على النبي ﷺ انهارده؟ 🌸\nاللهم صل وسلم على نبينا محمد.. هدفنا انهارده *${n}* مرة ✨`,
    `اللهم صل وسلم على نبينا محمد 🌸.. ما تنسوش تعطروا ألسنتكم بالصلاة عليه انهارده، خلونا نوصل لـ *${n}* صلاة ✨`,
    `يومكم جميل بالصلاة على الحبيب ﷺ 🌸.. خلونا انهارده نكثر منها، هدفنا *${n}* مرة 🕌`
  ];
  const text = messages[Math.floor(Math.random() * messages.length)];
  for (const t of targets) {
    if (isEventSentToday(t.id, 'salawat-reminder')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'salawat-reminder');
  }
}

async function sendWitrReminder() {
  const targets = getActiveTargets((t) => t.enablePrayer);
  if (!targets.length) return;
  const messages = [
    `قبل ما تناموا، لا تنسوا صلاة الوتر 🌙.. هي نور ليلتكم، "اجعلوا آخر صلاتكم بالليل وتراً" ✨`,
    `ختام يومكم ركعة وتر 🌙.. لا تضيعوا فضلها قبل النوم، تقبل الله منكم 🤲`,
    `يا شباب، الوتر جنة القلوب 🌙.. ركعة واحدة تكفي لختام يومكم بالخير ✨`
  ];
  const text = messages[Math.floor(Math.random() * messages.length)];
  for (const t of targets) {
    if (isEventSentToday(t.id, 'witr-reminder')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'witr-reminder');
  }
}

async function sendCharityReminder() {
  const targets = getActiveTargets((t) => t.enableDaily);
  if (!targets.length) return;
  const messages = [
    `حاجة بسيطة ممكن تفرق كتير.. إيه رأيكم نتصدق انهارده ولو بشيء قليل؟ 💝 الصدقة بركة في العمر والمال ✨`,
    `الصدقة تطفئ غضب الرب 💝.. لا تنسوا نصيبكم من الخير انهارده، ولو بمساعدة محتاج أو مبلغ بسيط لجهة موثوقة ✨`,
    `تصدقوا ولو بشق تمرة 💝.. يومكم كله بركة لما تبدأوه بالصدقة والإحسان 🌸`
  ];
  const text = messages[Math.floor(Math.random() * messages.length)];
  for (const t of targets) {
    if (isEventSentToday(t.id, 'charity-reminder')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'charity-reminder');
  }
}

async function sendDailyAudioSnippet() {
  const targets = getActiveTargets((t) => t.enableDaily || t.enableQuran);
  if (!targets.length) return;
  const buffer = await loadAudioBuffer(config.dua046Path, config.dua046Url);
  if (!buffer) return;
  for (const t of targets) {
    if (isEventSentToday(t.id, 'audio-snippet')) continue;
    await sendAudio(t.id, buffer);
    markEventSent(t.id, 'audio-snippet');
  }
}

async function sendDailyQuestion() {
  const allTargets = getActiveTargets((t) => t.enableDaily || t.enableQuran);
  if (!allTargets.length || !triviaQuestions.length) return;
  
  for (const t of allTargets) {
    if (isEventSentToday(t.id, 'daily-question-start')) continue;
    
    let indices = t.sentQuestionIndices || [];
    if (indices.length >= triviaQuestions.length) indices = []; // Reset if all questions used
    
    // Find a random index not in indices
    let qIdx;
    const available = triviaQuestions.map((_, i) => i).filter(i => !indices.includes(i));
    if (available.length === 0) {
      qIdx = Math.floor(Math.random() * triviaQuestions.length);
      indices = [qIdx];
    } else {
      qIdx = available[Math.floor(Math.random() * available.length)];
      indices.push(qIdx);
    }
    
    updateTarget(t.id, { sentQuestionIndices: indices });
    const q = triviaQuestions[qIdx];
    startTriviaGame(t.id, q);
    
    const optionsText = q.options.map((opt, i) => `${i + 1}) ${opt}`).join('\n');
    const messages = [
      `✨ *مسابقة دينية سريعة* 🤔✨\n\n*${q.question}*\n\n${optionsText}\n\nفكروا في الإجابة، وبعد ساعة هبعت لكم الرد الصحيح مع شرح بسيط 🌸`,
      `إيه رأيكم نختبر معلوماتنا الدينية؟ 🤔✨\n\n*${q.question}*\n\n${optionsText}\n\nالإجابة والشرح بعد ساعة بالظبط إن شاء الله 🌸`,
      `سؤال اليوم الديني 🤔✨\n\n*${q.question}*\n\n${optionsText}\n\nهنتظر ساعة وهنزل الإجابة الصحيحة 🌸`
    ];
    const text = messages[Math.floor(Math.random() * messages.length)];
    await sendText(t.id, text);
    markEventSent(t.id, 'daily-question-start');
  }
}

async function sendDailyAnswer() {
  const allTargets = getActiveTargets((t) => t.enableDaily || t.enableQuran);
  if (!allTargets.length || !triviaQuestions.length) return;
  
  for (const t of allTargets) {
    if (isEventSentToday(t.id, 'daily-question-reveal')) continue;
    
    activeGames.delete(t.id);
    const indices = t.sentQuestionIndices || [];
    if (indices.length === 0) continue;
    const qIdx = indices[indices.length - 1];
    const q = triviaQuestions[qIdx];
    
    const messages = [
      `مرت ساعة، ودي إجابة سؤالنا انهارده ✅✨\n\nالسؤال كان: *${q.question}*\nالإجابة الصح هي: *${q.answer}*\n\n*شرح بسيط:* ${q.explanation} 🌸`,
      `الإجابة الصحيحة لسؤال اليوم ✅✨\n\n*${q.answer}*\n\n*بإيجاز:* ${q.explanation} 🌸`,
      `خلص الوقت، والحل هو: *${q.answer}* ✅✨\n\n*للفائدة:* ${q.explanation} 🌸`
    ];
    const text = messages[Math.floor(Math.random() * messages.length)];
    await sendText(t.id, text);
    markEventSent(t.id, 'daily-question-reveal');
  }
}

async function sendFridayContent() {
  const now = new Date();
  if (now.getDay() !== 5) return;
  const targets = getActiveTargets((t) => t.enableDaily || t.enablePrayer || t.enableAthkar);
  if (!targets.length) return;
  const text = 'جمعة مباركة يا شباب 🌿✨\n\nما تنسوش سنن اليوم:\n- الإكثار من الصلاة على النبي ﷺ 🌸\n- قراءة سورة الكهف 📖\n- تحري ساعة الإجابة 🤲\n\nاللهم صل وسلم على نبينا محمد ✨';
  for (const t of targets) {
    if (isEventSentToday(t.id, 'friday-content')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'friday-content');
  }
}

async function sendNightlyDuas() {
  const day = getBotDay();
  const targets = getActiveTargets((t) => t.enableDaily || t.enableQuran || t.enableAthkar);
  if (!targets.length) return;
  const idx = (day - 1) % lastTenDuas.length;
  const dua = lastTenDuas[idx];
  let text = `دعاء ليلة اليوم (اليوم *${day}*) 🌙✨\n\n🤲 *دعاء الليلة:*\n${dua}\n\nتقبل الله منا ومنكم 🌸🌙`;
  for (const t of targets) {
    if (isEventSentToday(t.id, 'nightly-dua')) continue;
    await sendText(t.id, text);
    markEventSent(t.id, 'nightly-dua');
  }
}

async function fetchJuzAyahs(juz) {
  const res = await fetch(`http://api.alquran.cloud/v1/juz/${juz}/ar.alafasy`);
  if (!res.ok) throw new Error(`Failed to fetch juz ${juz}: ${res.status}`);
  const data = await res.json();
  return data?.data?.ayahs || [];
}

async function sendJuzForChat(jid, juz) {
  try {
    const ayahs = await fetchJuzAyahs(juz);
    if (!ayahs.length) {
      await sendText(jid, `📚 ورد اليوم: الجزء ${juz}\nhttps://quran.com/juz/${juz}`);
      return;
    }
    await sendText(jid, `📚 *ورد اليوم: الجزء ${juz}*\nسيتم إرسال الآيات في رسائل متتابعة.\nhttps://quran.com/juz/${juz}`);
    const chunkSize = 10;
    for (let i = 0; i < ayahs.length; i += chunkSize) {
      const chunk = ayahs.slice(i, i + chunkSize);
      const text = chunk.map((a) => `${a.surah?.name || ''} ${a.numberInSurah}: ${a.text}`).join('\n');
      await sendText(jid, text);
    }
  } catch (error) {
    logger.error(error);
    await sendText(jid, `📚 ورد اليوم: الجزء ${juz}\nhttps://quran.com/juz/${juz}`);
  }
}

function pickRandomAthkarItem() {
  const all = [...athkar.morning, ...athkar.evening, ...athkar.afterPrayer, ...athkar.sleep];
  return all[Math.floor(Math.random() * all.length)];
}

async function sendHourlyAthkar() {
  const targets = getActiveTargets((t) => t.enableHourlyAthkar);
  if (!targets.length) return;
  const now = new Date();
  const hour = now.getHours();
  const eventKey = `hourly-athkar-${hour}`;

  const item = pickRandomAthkarItem();
  const card = athkarCards.length ? athkarCards[Math.floor(Math.random() * athkarCards.length)] : null;
  
  const messages = [
    `🌙━━━━━━━━━━━━━━\n🕊️ *ذكر الساعة*\n━━━━━━━━━━━━━━🌙\n\n${item.text}${item.count > 1 ? `\n\n🔁 خلونا نكرره: *${item.count}* مرات` : ''}\n\nاللهم اجعلنا من الذاكرين الشاكرين 🤲🌸`,
    `يا جماعة، وقت ذكر الساعة 🌙✨\n\n${item.text}${item.count > 1 ? `\n\n🔁 التكرار: *${item.count}* مرات` : ''}\n\nطهروا قلوبكم بذكر الله 🌸🤲`,
    `ذكر الله حياة القلوب 🌙✨\n\n${item.text}${item.count > 1 ? `\n\n🔁 خلونا نكرره *${item.count}* مرات انهارده` : ''}\n\nتقبل الله منا ومنكم 🌸🤲`
  ];
  const text = messages[Math.floor(Math.random() * messages.length)];
  
  for (const t of targets) {
    if (isEventSentToday(t.id, eventKey)) continue;
    if (card?.image) {
      await sock.sendMessage(t.id, { image: { url: card.image }, caption: text });
    } else {
      await sendText(t.id, text);
    }
    markEventSent(t.id, eventKey);
  }
}

async function sendDailySchedule() {
  for (const t of getActiveTargets((x) => x.enableDaily)) {
    if (isEventSentToday(t.id, 'daily-schedule')) continue;
    const times = await getPrayerTimes({ city: t.city, country: t.country, method: config.method });
    const messages = [
      `يا جماعة، ده جدول مواعيدنا انهارده 🌙✨\n\n🌅 *الشروق:* ${times.Sunrise ? convertTo12Hour(times.Sunrise) : '-'}\n🌇 *المغرب:* ${convertTo12Hour(times.Maghrib)}\n\nيومكم مبارك ومليء بالطاعات 🌸🤲`,
      `مواعيدنا انهارده 🌙✨\n\n*شروق:* ${times.Sunrise ? convertTo12Hour(times.Sunrise) : '-'}\n*مغرب:* ${convertTo12Hour(times.Maghrib)}\n\nيومكم مبارك 🌸🤲`
    ];
    const text = messages[Math.floor(Math.random() * messages.length)];
    await sendText(t.id, text);
    markEventSent(t.id, 'daily-schedule');
  }
}

function formatStatus(target) {
  if (!target) return 'الدردشة دي مش مربوطة، جرب تكتب .ابدأ الأول 🌸';
  return `⚙️ *إعدادات الجروب: ${target.name}*\n\nالمدينة: ${target.city}\n\nالصلاة: ${target.enablePrayer ? '✅' : '❌'}\nالأذكار: ${target.enableAthkar ? '✅' : '❌'}\nالقرآن: ${target.enableQuran ? '✅' : '❌'}\nالمحتوى اليومي: ${target.enableDaily ? '✅' : '❌'}\nالمسابقات: ${target.enableChallenges ? '✅' : '❌'}\nذكر الساعة: ${target.enableHourlyAthkar ? '✅' : '❌'}`;
}

const getMessageText = (m) => m?.conversation || m?.extendedTextMessage?.text || m?.imageMessage?.caption || m?.videoMessage?.caption || '';

async function fetchHadithOfDay() {
  const url = process.env.HADITH_API_URL || 'https://sunnah.com/api/v1/hadiths/random';
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn(`hadith api status ${res.status}`);
      return null;
    }
    const data = await res.json();
    const item = Array.isArray(data?.hadiths) ? data.hadiths[0] : data?.hadith || data;
    if (!item) throw new Error('no hadith in response');
    const text = item.arabic || item.arabic_text || item.text || item.hadith || '';
    const ref = item.reference || item.ref || item.source || '';
    if (!text) throw new Error('empty hadith text');
    return { text, ref };
  } catch {
    return null;
  }
}

async function handleServicesCommand(jid, body, msg) {
  const target = getTarget(jid);
  if (body === '.ما' || body === '.قايمه') return sendText(jid, commandMenu);
  if (body === '.صباح') {
    const list = await getMorningAzkar();
    return sendText(jid, formatAthkar('أذكار الصباح', list));
  }
  if (body === '.مساء') {
    const list = await getEveningAzkar();
    return sendText(jid, formatAthkar('أذكار المساء', list));
  }
  if (body === '.صلاة') {
    const list = await getAfterPrayerAzkar();
    return sendText(jid, formatAthkar('الأذكار بعد الصلاة المفروضة', list));
  }
  if (body === '.نوم') return sendText(jid, formatAthkar('أذكار النوم', athkar.sleep));
  if (body === '.اذكار') {
    return sendText(jid, `🤲 *أدعية وأذكار*\n${duas.map((d) => `• ${d}`).join('\n')}`);
  }
  if (body === '.اذكار_يومية') {
    const day = getBotDay();
    const idx = (day - 1) % lastTenDuas.length;
    const dua = lastTenDuas[idx];
    return sendText(jid, `🤲 *دعاء اليوم*\n${dua}`);
  }
  if (body === '.استغفار') return sendText(jid, `🕊️ *مجلس استغفار*\n${istighfarList.map((d) => `• ${d}`).join('\n')}`);
  if (body === '.حديث') {
    const hadith = await fetchHadithOfDay();
    if (!hadith) return sendText(jid, 'تعذر جلب حديث اليوم حاليًا، حاول مرة أخرى لاحقًا.');
    const refLine = hadith.ref ? `\n\n📚 المرجع: ${hadith.ref}` : '';
    return sendText(jid, `📖 *حديث اليوم*\n${hadith.text}${refLine}`);
   }
  if (body === '.صورة') {
    return sendText(jid, 'اكتب الصيغة: .صورة كلمة البحث\nمثال: .صورة مكة مسجد');
  }
  if (body.startsWith('.صورة ')) {
    const query = body.slice('.صورة'.length).trim();
    if (!query) return sendText(jid, 'اكتب الصيغة: .صورة كلمة البحث\nمثال: .صورة مكة مسجد');
    try {
      let url = await getRandomIslamicImage(query);
      if (!url) url = await getRandomIslamicImage();
      if (!url) return sendText(jid, 'لم يتم العثور على صورة مناسبة، جرب كلمة أخرى أو كلمة بالإنجليزي مثل: mosque, dua.');
      await sock.sendMessage(jid, { image: { url }, caption: `🔍 نتيجة من Pixabay لكلمة: ${query}` });
    } catch (e) {
      logger.error(e);
      return sendText(jid, 'تعذر جلب صورة من Pixabay، تأكد من ضبط PIXABAY_API_KEY بشكل صحيح.');
    }
    return;
  }
  if (body === '.صور') {
    return sendText(jid, 'اكتب الصيغة: .صور كلمة البحث\nمثال: .صور مكة مسجد');
  }
  if (body.startsWith('.صور ')) {
    const query = body.slice('.صور'.length).trim();
    if (!query) return sendText(jid, 'اكتب الصيغة: .صور كلمة البحث\nمثال: .صور مكة مسجد');
    try {
      let urls = await getPixabayImages(query, 5);
      if (!urls.length) urls = await getPixabayImages('dua islamic', 5);
      if (!urls.length) return sendText(jid, 'لم يتم العثور على صور مناسبة، جرب كلمة أخرى أو كلمة بالإنجليزي مثل: mosque, dua.');
      let index = 1;
      for (const url of urls) {
        await sock.sendMessage(jid, { image: { url }, caption: `📷 نتيجة ${index} من Pixabay\nالكلمة: ${query}` });
        index += 1;
      }
    } catch (e) {
      logger.error(e);
      return sendText(jid, 'تعذر جلب صور من Pixabay، تأكد من ضبط PIXABAY_API_KEY بشكل صحيح.');
    }
    return;
  }
  if (body.startsWith('.منشن جماعي')) {
    if (!jid.endsWith('@g.us')) return sendText(jid, 'هذا الأمر يعمل في المجموعات فقط.');
    const meta = await sock.groupMetadata(jid);
    const participants = meta?.participants || [];
    const jids = participants.map((p) => p.id).filter((id) => id && id.endsWith('@s.whatsapp.net'));
    if (!jids.length) return sendText(jid, 'لا يوجد أعضاء لمنشنهم في هذه المجموعة.');
    const base = '.منشن جماعي';
    const extra = body.length > base.length ? body.slice(base.length).trim() : '';
    const header = extra || 'منشن جماعي لجميع الأعضاء:';
    const mentionText = jids
      .map((id) => '@' + (id.split('@')[0] || '').replace(/[^0-9]/g, '').slice(-11))
      .join(' ');
    const text = `${header}\n\n${mentionText}`;
    await sock.sendMessage(jid, { text, mentions: jids });
    return;
  }
  if (body.startsWith('.منشن خفي')) {
    if (!jid.endsWith('@g.us')) return sendText(jid, 'هذا الأمر يعمل في المجموعات فقط.');
    const meta = await sock.groupMetadata(jid);
    const participants = meta?.participants || [];
    const jids = participants.map((p) => p.id).filter((id) => id && id.endsWith('@s.whatsapp.net'));
    if (!jids.length) return sendText(jid, 'لا يوجد أعضاء لمنشنهم في هذه المجموعة.');
    const base = '.منشن خفي';
    const extra = body.length > base.length ? body.slice(base.length).trim() : '';
    const text = extra || 'تم منشن جميع الأعضاء بشكل خفي ✅';
    await sock.sendMessage(jid, { text, mentions: jids });
    return;
  }
  if (body === '.ستيكر') {
    const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imageMessage = quoted?.imageMessage;
    if (!imageMessage) return sendText(jid, 'لإنشاء ستيكر، رد على صورة بالأمر: .ستيكر');
    try {
      const { downloadContentFromMessage } = await loadBaileysApi();
      const stream = await downloadContentFromMessage(imageMessage, 'image');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      await sendStickerFromBuffer(jid, buffer, 'Islamic Bot', 'IslamicBot');
    } catch (e) {
      logger.error(e);
      return sendText(jid, 'تعذر إنشاء ستيكر من هذه الصورة.');
    }
    return;
  }
  if (body.startsWith('.تعديل_ستيكر|')) {
    const parts = body.split('|');
    const pack = (parts[1] || '').trim() || 'My Stickers';
    const author = (parts[2] || '').trim() || 'IslamicBot';
    const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const stickerMessage = quoted?.stickerMessage;
    if (!stickerMessage) {
      return sendText(jid, 'لتعديل معلومات الستيكر، رد على ستيكر بالأمر: .تعديل_ستيكر|اسم الباك|الكاتب');
    }
    try {
      const { downloadContentFromMessage } = await loadBaileysApi();
      const stream = await downloadContentFromMessage(stickerMessage, 'sticker');
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      await sendStickerFromBuffer(jid, buffer, pack, author);
    } catch (e) {
      logger.error(e);
      return sendText(jid, 'تعذر تعديل معلومات هذا الستيكر.');
    }
    return;
  }
  if (body === '.ملفات') return sendText(jid, '📁 *ملفات الصوت المتاحة*\n• 019--1.mp3 (أذان عام)\n• 052-.mp3 (أذان الفجر والمغرب)\n• 046--_up_by_muslem.mp3 (دعاء بعد العشاء)\n\nللطلب:\n• *.ملف019* : إرسال ملف 019--1.mp3\n• *.ملف052* : إرسال ملف 052-.mp3\n• *.ملف046* : إرسال ملف 046--_up_by_muslem.mp3');
  if (body === '.ابدأ') {
    if (!getTarget(jid)) addTarget(jid, 'Direct Chat', config.city, config.country);
    return sendText(jid, '✅ تم تهيئة الدردشة. استخدم .حالة و .مدينة|City|Country ثم .اوامر');
  }
  if (body === '.ورد') {
    const juz = getDailyJuzNumber(new Date(), config.botStartDate);
    return sendJuzForChat(jid, juz);
  }
  if (body === '.افطار') return sendText(jid, `🤲 *دعاء الإفطار*\n${ramadanDuas.iftar}`);
  if (body === '.سحور') return sendText(jid, `🤲 *دعاء السحور*\n${ramadanDuas.suhoor}`);
  if (body === '.مصحف') {
    if (!sock) return;
    await sock.sendMessage(jid, { document: { url: config.quranPdfUrl }, fileName: 'Holy-Quran.pdf', mimetype: 'application/pdf', caption: '📖 مصحف المدينة المنورة' });
    return;
  }
  if (body === '.نقاط') {
    return sendText(jid, getLeaderboard());
  }

  const city = target?.city || config.city;
  const country = target?.country || config.country;
  if (body === '.تيست') {
    const times = await getPrayerTimes({ city, country, method: config.method });
    const next = getNextPrayer(times);
    const ar = prayerNameArabic[next.name] || next.name;
    const displayTime = convertTo12Hour(next.time);
    await sendText(jid, `🧪 *اختبار الأذان*\nالصلاة القادمة: ${ar}\nالوقت: ${displayTime}\n━━━━━━━━━━━━━━━━━━\n${formatPrayerInfo(next.name)}`);
    const use052 = next.name === 'Fajr' || next.name === 'Maghrib';
    const buffer = await loadAudioBuffer(use052 ? config.adhan052Path : config.adhan019Path, use052 ? config.adhan052Url : config.adhan019Url);
    await sendAudio(jid, buffer, `🎧 اختبار أذان ${ar} (${getAdhanFileName(next.name)})`);
    return;
  }
  if (body === '.مواقيت') return sendText(jid, formatPrayerTimes(await getPrayerTimes({ city, country, method: config.method }), city));
  if (body === '.live') {
    const next = getNextPrayer(await getPrayerTimes({ city, country, method: config.method }));
    return sendText(jid, `🟢 *الحالة المباشرة*\nالصلاة القادمة: ${prayerNameArabic[next.name]}\nالوقت: ${convertTo12Hour(next.time)}\nالمتبقي: ${next.remainingText}`);
  }
  if (body === '.التالي') {
    const next = getNextPrayer(await getPrayerTimes({ city, country, method: config.method }));
    return sendText(jid, `📌 *الصلاة القادمة*\n${prayerNameArabic[next.name]} - ${convertTo12Hour(next.time)}\n🎧 ملف الأذان: ${getAdhanFileName(next.name)}\n⏳ المتبقي: ${next.remainingText}`);
  }
  if (body === '.مواقيت_اليوم') {
    const times = await getPrayerTimes({ city, country, method: config.method });
    return sendText(jid, `🌙 *مواقيت اليوم*\nالشروق: ${times.Sunrise ? convertTo12Hour(times.Sunrise) : '-'}\nالمغرب: ${convertTo12Hour(times.Maghrib)}`);
  }
  if (body === '.ملف019') {
    const buffer = await loadAudioBuffer(config.adhan019Path, config.adhan019Url);
    await sendAudio(jid, buffer, '🎧 اختبار ملف الأذان 019--1.mp3');
    return;
  }
  if (body === '.ملف052') {
    const buffer = await loadAudioBuffer(config.adhan052Path, config.adhan052Url);
    await sendAudio(jid, buffer, '🎧 اختبار ملف الأذان 052-.mp3');
    return;
  }
  if (body === '.ملف046') {
    const buffer = await loadAudioBuffer(config.dua046Path, config.dua046Url);
    await sendAudio(jid, buffer, '🎧 اختبار ملف الدعاء 046--_up_by_muslem.mp3');
    return;
  }
}

async function handleAdminCommand(jid, body, msg) {
  if (body === '.ادمن') {
    await sendText(jid, adminMenu);
    return;
  }

  const store = getStore();
  const targets = store.targets || [];

  if (body === '.حالة' || body === '.مجموعات') {
    if (!targets.length) return sendText(jid, 'ℹ️ لا توجد دردشات مربوطة حاليًا.');
    let text = '📊 *الدردشات المرتبطة وحالتها:*\n\n';
    targets.forEach((t, i) => {
      text += `${i + 1}) *${t.name || 'مجموعة'}*\n`;
      text += `📍 المدينة: ${t.city}\n`;
      text += `⚙️ [ ${t.enablePrayer ? '✅' : '❌'}صلاة | ${t.enableAthkar ? '✅' : '❌'}أذكار | ${t.enableQuran ? '✅' : '❌'}قرآن | ${t.enableDaily ? '✅' : '❌'}يومي | ${t.enableChallenges ? '✅' : '❌'}مسابقات | ${t.enableHourlyAthkar ? '✅' : '❌'}ساعة ]\n\n`;
    });
    text += '💡 للتعديل: .تفعيل [رقم] [خدمة] أو .مدينة [رقم] [اسم المدينة] أو .فصل [رقم]';
    await sendText(jid, text);
    return;
  }

  // Simplified Toggle Command: .تفعيل [رقم الجروب] [الخدمة]
  if (body.startsWith('.تفعيل')) {
    const parts = body.split(' ').filter(p => p);
    // Support both ".تفعيل 1 صلاة" and ".تفعيل|صلاة" (current chat)
    let target, service;
    
    if (parts.length >= 3) { // .تفعيل 1 صلاة
      const idx = parseInt(parts[1]) - 1;
      target = targets[idx];
      service = parts[2];
    } else if (parts[0].includes('|')) { // .تفعيل|صلاة
      target = getTarget(jid);
      service = parts[0].split('|')[1];
    } else if (parts.length === 2) { // .تفعيل صلاة (current chat)
      target = getTarget(jid);
      service = parts[1];
    }

    if (!target) return sendText(jid, '❌ الدردشة غير موجودة أو غير مربوطة.');
    if (!service) return sendText(jid, '❌ يرجى تحديد الخدمة (مثلاً: .تفعيل 1 صلاة).');

    const map = {
      'صلاة': 'enablePrayer', 'prayer': 'enablePrayer', '1': 'enablePrayer',
      'أذكار': 'enableAthkar', 'athkar': 'enableAthkar', '2': 'enableAthkar',
      'قرآن': 'enableQuran', 'quran': 'enableQuran', '3': 'enableQuran',
      'يومي': 'enableDaily', 'daily': 'enableDaily', '4': 'enableDaily',
      'مسابقات': 'enableChallenges', 'challenges': 'enableChallenges', '5': 'enableChallenges',
      'ساعة': 'enableHourlyAthkar', 'hourly': 'enableHourlyAthkar', '6': 'enableHourlyAthkar'
    };
    const field = map[service];
    if (!field) return sendText(jid, '❌ خدمة غير معروفة (صلاة، أذكار، قرآن، يومي، مسابقات، ساعة).');

    const updated = updateTarget(target.id, { [field]: !target[field] });
    return sendText(jid, `✅ تم ${updated[field] ? 'تفعيل' : 'تعطيل'} ${service} لـ "${updated.name}"`);
  }

  // Simplified City Command: .مدينة [رقم الجروب] [المدينة]
  if (body.startsWith('.مدينة')) {
    const parts = body.split(' ').filter(p => p);
    let target, city;

    if (parts.length >= 3) { // .مدينة 1 مكة
      const idx = parseInt(parts[1]) - 1;
      target = targets[idx];
      city = parts.slice(2).join(' ');
    } else if (parts[0].includes('|')) { // .مدينة|مكة
      target = getTarget(jid);
      city = parts[0].split('|')[1];
    } else if (parts.length === 2) { // .مدينة مكة
      target = getTarget(jid);
      city = parts[1];
    }

    if (!target) return sendText(jid, '❌ الدردشة غير موجودة أو غير مربوطة.');
    if (!city) return sendText(jid, '❌ يرجى تحديد المدينة (مثلاً: .مدينة 1 مكة).');

    const updated = updateTarget(target.id, { city });
    return sendText(jid, `✅ تم تحديث مدينة "${updated.name}" إلى ${city}`);
  }

  // Simplified Separation Command: .فصل [رقم الجروب]
  if (body.startsWith('.فصل')) {
    const parts = body.split(' ').filter(p => p);
    let target;

    if (parts.length >= 2) {
      const idx = parseInt(parts[1]) - 1;
      target = targets[idx];
    } else {
      target = getTarget(jid);
    }

    if (!target) return sendText(jid, '❌ الدردشة غير مربوطة بالفعل.');
    const ok = removeTarget(target.id);
    return sendText(jid, ok ? `✅ تم فك الربط عن: ${target.name}` : '❌ حدث خطأ.');
  }

  if (body === '.ربط') {
    const groups = Object.values(await sock.groupFetchAllParticipating());
    if (!groups.length) return sendText(jid, 'لا توجد مجموعات متاحة حاليًا.');
    return sendText(jid, `📌 المجموعات المتاحة للربط:\n\n${groups.map((g, i) => `${i + 1}) ${g.subject}`).join('\n')}\n\n💡 أرسل: .ربط [الرقم]`);
  }

  if (body.startsWith('.ربط ')) {
    const idx = parseInt(body.split(' ')[1]) - 1;
    const groups = Object.values(await sock.groupFetchAllParticipating());
    const selected = groups[idx];
    if (!selected) return sendText(jid, '❌ رقم غير صحيح.');
    const ok = addTarget(selected.id, selected.subject, config.city, config.country);
    return sendText(jid, ok ? `✅ تم ربط مجموعة: ${selected.subject}` : 'ℹ️ المجموعة مرتبطة بالفعل.');
  }
}

async function startBaileys() {
  const { makeWASocket, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } = await loadBaileysApi();
  const { state, saveCreds } = await useMultiFileAuthState(config.authFolder);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({ version, auth: state, printQRInTerminal: true });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.clear();
      console.log('📱 امسح هذا الـ QR من واتساب على جوالك لربط البوت:');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      logger.info('✅ Baileys WhatsApp Bot ready');
      checkMissedDailyEvents().catch(e => logger.error('Error checking missed events:', e));
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      logger.warn(`connection closed (code=${code}), reconnect=${shouldReconnect}`);
      if (shouldReconnect) startBaileys();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg?.message) return;
    const jid = msg.key.remoteJid;
    const body = (getMessageText(msg.message) || '').trim();
    if (!jid) return;

    // Handle @all command (Owner only)
    if (body.includes('@all') && jid.endsWith('@g.us')) {
      const sender = msg.key.participant || msg.key.remoteJid;
      if (sender.startsWith(config.ownerNumber)) {
        const groupMetadata = await sock.groupMetadata(jid);
        const participants = groupMetadata.participants.map(p => p.id);
        const text = body.replace(/@all/g, '').trim();
        await sock.sendMessage(jid, {
          text: text || '📢 تنبيه للجميع',
          mentions: participants
        }, { quoted: msg });
        return;
      }
    }

    // Game answer check
    if (activeGames.has(jid)) {
      const userJid = msg.key.participant || msg.key.remoteJid;
      const userName = msg.pushName || 'فاعل خير';
      const result = checkGameAnswer(jid, body, userJid, userName);
      if (result) {
        addPoints(userJid, userName, result.points);
        activeGames.delete(jid);
        await sendText(jid, `✨ *إجابة صحيحة يا ${userName}!* ✨\n\nلقد حصلت على *${result.points}* نقطة 🏆\n\nبارك الله فيك! 🌸`);
      }
    }

    if (!body.startsWith('.')) return;

    try {
      await handleServicesCommand(jid, body, msg);
      if (/^(\.ربط\d+|\.ربط|\.فصل|\.حالة|\.مدينة|\.تفعيل|\.ادمن|\.مجموعات)/.test(body)) await handleAdminCommand(jid, body, msg);
    } catch (error) {
      logger.error(error);
      await sendText(jid, 'حدث خطأ أثناء تنفيذ الأمر.');
    }
  });
}

export async function checkMissedDailyEvents() {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const events = [
    { key: 'quran-pdf', time: config.quranPdfTime, fn: sendQuranPdf },
    { key: 'daily-juz', time: config.dailyJuzTime, fn: sendDailyJuz },
    { key: 'daily-dua', time: '15:30', fn: sendDailyDua },
    { key: 'daily-card', time: config.dailyCardTime, fn: sendDailyCard },
    { key: 'daily-series', time: config.dailySeriesTime, fn: sendDailySeries },
    { key: 'prophets-story', time: '10:00', fn: sendDailyProphetsStory },
    { key: 'seerah-info', time: '11:00', fn: sendDailySeerah },
    { key: 'daily-question-start', time: '11:00', fn: sendDailyQuestion },
    { key: 'quran-verse', time: '12:00', fn: sendDailyQuranVerse },
    { key: 'daily-question-reveal', time: '12:00', fn: sendDailyAnswer },
    { key: 'fiqh-issue', time: '13:00', fn: sendDailyFiqh },
    { key: 'salawat-reminder', time: config.salawatTime, fn: sendSalawatReminder },
    { key: 'charity-reminder', time: config.charityReminderTime, fn: sendCharityReminder },
    { key: 'complete-verse-start', time: '16:00', fn: sendCompleteVerseGame },
    { key: 'complete-verse-reveal', time: '17:00', fn: revealCompleteVerseGame },
    { key: 'who-am-i-start', time: '18:00', fn: sendWhoAmIGame },
    { key: 'who-am-i-reveal', time: '19:00', fn: revealWhoAmIGame },
    { key: 'nightly-dua', time: config.nightlyAzkarTime, fn: sendNightlyDuas },
    { key: 'witr-reminder', time: config.witrReminderTime, fn: sendWitrReminder },
    { key: 'dhul-hijjah-reminder', time: '09:00', fn: sendDhuAlHijjahReminder }
  ];

  for (const ev of events) {
    if (nowMinutes >= parseTimeToMinutes(ev.time)) {
      await ev.fn();
    }
  }

  // Reminders for specific days
  if (now.getDay() === 4) { // Thursday
    if (nowMinutes >= parseTimeToMinutes('20:00')) await sendThursdayReminder();
    if (nowMinutes >= parseTimeToMinutes('21:00')) await sendFridaySalawat();
  }
  if (now.getDay() === 5) { // Friday
    if (nowMinutes >= parseTimeToMinutes('08:00')) await sendFridayContent();
  }
}

export async function startBot() {
  if (started) return;
  started = true;

  cron.schedule('* * * * *', async () => {
    if (!sock) return;
    await checkPrayerAlerts();
    await checkSolarAthkarAlerts();
  }, { timezone: config.timezone });
  cron.schedule('0 * * * *', async () => sock && sendHourlyAthkar(), { timezone: config.timezone });
  cron.schedule(toCron(config.nightlyAzkarTime), async () => sock && broadcastTo(getActiveTargets((t) => t.enableAthkar), formatAthkar('أذكار المساء', athkar.evening)), { timezone: config.timezone });
  cron.schedule(toCron(config.quranPdfTime), async () => sock && sendQuranPdf(), { timezone: config.timezone });
  cron.schedule(toCron(config.dailyJuzTime), async () => sock && sendDailyJuz(), { timezone: config.timezone });
  cron.schedule('30 15 * * *', async () => sock && sendDailyDua(), { timezone: config.timezone });
  cron.schedule('0 4 * * *', async () => sock && sendDailySchedule(), { timezone: config.timezone });
  cron.schedule(toCron(config.dailyCardTime), async () => sock && sendDailyCard(), { timezone: config.timezone });
  cron.schedule(toCron(config.dailySeriesTime), async () => sock && sendDailySeries(), { timezone: config.timezone });
  
  // New Daily Content
  cron.schedule('0 10 * * *', async () => sock && sendDailyProphetsStory(), { timezone: config.timezone });
  cron.schedule('0 11 * * *', async () => sock && sendDailySeerah(), { timezone: config.timezone });
  cron.schedule('0 12 * * *', async () => sock && sendDailyQuranVerse(), { timezone: config.timezone });
  cron.schedule('0 13 * * *', async () => sock && sendDailyFiqh(), { timezone: config.timezone });

  // New Reminders
  cron.schedule('0 20 * * 4', async () => sock && sendThursdayReminder(), { timezone: config.timezone }); // Thursday 8 PM
  cron.schedule('0 21 * * 4', async () => sock && sendFridaySalawat(), { timezone: config.timezone }); // Thursday 9 PM (Friday night)
  cron.schedule('0 9 * * *', async () => sock && sendDhuAlHijjahReminder(), { timezone: config.timezone }); // Check daily for Dhu al-Hijjah

  // New Games
  cron.schedule('0 16 * * *', async () => sock && sendCompleteVerseGame(), { timezone: config.timezone });
  cron.schedule('0 17 * * *', async () => sock && revealCompleteVerseGame(), { timezone: config.timezone });
  cron.schedule('0 18 * * *', async () => sock && sendWhoAmIGame(), { timezone: config.timezone });
  cron.schedule('0 19 * * *', async () => sock && revealWhoAmIGame(), { timezone: config.timezone });

  cron.schedule(toCron(config.salawatTime), async () => sock && sendSalawatReminder(), { timezone: config.timezone });
  cron.schedule(toCron(config.witrReminderTime), async () => sock && sendWitrReminder(), { timezone: config.timezone });
  cron.schedule(toCron(config.charityReminderTime), async () => sock && sendCharityReminder(), { timezone: config.timezone });
  cron.schedule(toCron(config.audioSnippetTime), async () => sock && sendDailyAudioSnippet(), { timezone: config.timezone });
  cron.schedule(toCron(config.dailyQuestionTime), async () => sock && sendDailyQuestion(), { timezone: config.timezone });
  cron.schedule(toCron(config.dailyAnswerTime), async () => sock && sendDailyAnswer(), { timezone: config.timezone });
  cron.schedule('0 9 * * 5', async () => sock && sendFridayContent(), { timezone: config.timezone });
  cron.schedule('0 22 * * *', async () => sock && sendNightlyDuas(), { timezone: config.timezone });
  cron.schedule('0 6 * * *', async () => {
    if (!sock) return;
    for (const t of getActiveTargets((x) => x.enableDaily)) {
      const hadith = await fetchHadithOfDay();
      if (!hadith) continue;
      const refLine = hadith.ref ? `\n\n📚 المرجع: ${hadith.ref}` : '';
      const messages = [
        `صباح الخير 🌸.. قرأت الحديث ده انهارده وحبيت أشاركه معاكم:\n\n📖 *حديث اليوم*\n${hadith.text}${refLine}\n\nاللهم انفعنا بما علمتنا ✨`,
        `حديث نبوي شريف نبدأ بيه يومنا 🌸✨\n\n📖 *حديث اليوم*\n${hadith.text}${refLine}\n\nصلوا على النبي ﷺ 🕌`
      ];
      await sendText(t.id, messages[Math.floor(Math.random() * messages.length)]);
    }
  }, { timezone: config.timezone });

  if (config.skipWhatsappInit) logger.warn('⚠️ SKIP_WHATSAPP_INIT=true -> skipping WhatsApp init');
  else await startBaileys();
}
