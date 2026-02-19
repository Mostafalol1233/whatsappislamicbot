import fs from 'fs';
import dotenv from 'dotenv';
import cron from 'node-cron';
import pino from 'pino';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';
import { athkar, commandMenu, duas, formatAthkar, formatPrayerInfo, istighfarList, prayerNameArabic } from './content.js';
import { addTarget, getStore, getTarget, removeTarget, updateTarget } from './store.js';
import { formatPrayerTimes, getDailyJuzNumber, getNextPrayer, getPrayerTimes, isPrayerNow } from './prayer.js';

dotenv.config();

const config = {
  city: process.env.CITY || 'Cairo',
  country: process.env.COUNTRY || 'Egypt',
  method: Number(process.env.METHOD || 5),
  timezone: process.env.TIMEZONE || 'Africa/Cairo',
  nightlyAzkarTime: process.env.NIGHTLY_AZKAR_TIME || '21:30',
  quranPdfTime: process.env.QURAN_PDF_TIME || '10:00',
  dailyJuzTime: process.env.DAILY_JUZ_TIME || '08:00',
  adhan019Path: process.env.ADHAN_019_PATH || './assets/019--1.mp3',
  adhan052Path: process.env.ADHAN_052_PATH || './assets/052-.mp3',
  dua046Path: process.env.DUA_046_PATH || './assets/046--_up_by_muslem.mp3',
  adhan019Url: process.env.ADHAN_019_URL || '',
  adhan052Url: process.env.ADHAN_052_URL || '',
  dua046Url: process.env.DUA_046_URL || '',
  ishaDuaDelayMinutes: Number(process.env.ISHA_DUA_DELAY_MINUTES || 10),
  quranPdfUrl: process.env.QURAN_PDF_URL || 'https://www.searchtruth.com/pdf/Holy-Quran-Arabic-Writing-1.pdf',
  enableSolarAthkar: process.env.ENABLE_SOLAR_ATHKAR !== 'false',
  skipWhatsappInit: process.env.SKIP_WHATSAPP_INIT === 'true',
  authFolder: process.env.BAILEYS_AUTH_FOLDER || 'auth_info_baileys'
};

const notified = new Set();
const logger = pino({ level: 'info' });
const store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });
let sock;

const toCron = (hhmm) => {
  const [h, m] = hhmm.split(':');
  return `${m} ${h} * * *`;
};

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
  await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
}

function getActiveTargets(filter = () => true) {
  return getStore().targets.filter((t) => t.isActive && filter(t));
}

async function notifyPrayerForTarget(target, prayerKey, time) {
  const ar = prayerNameArabic[prayerKey] || prayerKey;
  const msg = `📢 *حان الآن موعد أذان ${ar} في ${target.city}* 🕌\n⏰ الوقت: ${time}\n━━━━━━━━━━━━━━━━━━\n${formatPrayerInfo(prayerKey)}\n━━━━━━━━━━━━━━━━━━\n🤲 لا تنسوا الدعاء عند الأذان`;
  await sendText(target.id, msg);

  const use052 = prayerKey === 'Fajr' || prayerKey === 'Maghrib';
  const adhanBuffer = await loadAudioBuffer(use052 ? config.adhan052Path : config.adhan019Path, use052 ? config.adhan052Url : config.adhan019Url);
  await sendAudio(target.id, adhanBuffer, `🎧 أذان ${ar} (${use052 ? '052-.mp3' : '019--1.mp3'})`);

  if (target.enableAthkar) {
    setTimeout(() => sendText(target.id, formatAthkar('الأذكار بعد الصلاة المفروضة', athkar.afterPrayer)), 15 * 60 * 1000);
  }

  if (prayerKey === 'Isha') {
    setTimeout(async () => {
      const duaBuffer = await loadAudioBuffer(config.dua046Path, config.dua046Url);
      await sendAudio(target.id, duaBuffer, '🤲 دعاء بعد العشاء (046--_up_by_muslem.mp3)');
    }, config.ishaDuaDelayMinutes * 60 * 1000);
  }
}

async function checkPrayerAlerts() {
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const targets = getActiveTargets((t) => t.enablePrayer);

  for (const target of targets) {
    const times = await getPrayerTimes({ city: target.city, country: target.country, method: config.method });
    for (const prayer of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      const mark = `${dateKey}-${target.id}-${prayer}`;
      if (!notified.has(mark) && isPrayerNow(times[prayer], now)) {
        await notifyPrayerForTarget(target, prayer, times[prayer]);
        notified.add(mark);
      }
    }
  }
}

async function checkSolarAthkarAlerts() {
  if (!config.enableSolarAthkar) return;
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const targets = getActiveTargets((t) => t.enableAthkar);

  for (const target of targets) {
    const times = await getPrayerTimes({ city: target.city, country: target.country, method: config.method });
    const sunriseMark = `${dateKey}-${target.id}-sunrise-athkar`;
    if (!notified.has(sunriseMark) && isPrayerNow(times.Sunrise, now)) {
      await sendText(target.id, `🌅 *حان وقت الشروق*\n${formatAthkar('أذكار الصباح', athkar.morning)}`);
      notified.add(sunriseMark);
    }
    const sunsetMark = `${dateKey}-${target.id}-sunset-athkar`;
    if (!notified.has(sunsetMark) && isPrayerNow(times.Maghrib, now)) {
      await sendText(target.id, `🌇 *حان وقت الغروب*\n${formatAthkar('أذكار المساء', athkar.evening)}`);
      notified.add(sunsetMark);
    }
  }
}

async function sendQuranPdf() {
  const targets = getActiveTargets((t) => t.enableQuran);
  for (const t of targets) {
    await sock.sendMessage(t.id, {
      document: { url: config.quranPdfUrl },
      fileName: 'Holy-Quran.pdf',
      mimetype: 'application/pdf',
      caption: '📖 *مصحف المدينة المنورة*\nاجعل لك ورداً يومياً من القرآن 🌙'
    });
  }
}

async function sendDailyJuz() {
  const juz = getDailyJuzNumber(new Date());
  await broadcastTo(getActiveTargets((t) => t.enableQuran), `📚 *ورد اليوم الرمضاني*\nالجزء: ${juz}\nالرابط: https://quran.com/juz/${juz}`);
}

async function sendRamadanStatus() {
  const targets = getActiveTargets((t) => t.enableRamadan);
  for (const t of targets) {
    const times = await getPrayerTimes({ city: t.city, country: t.country, method: config.method });
    await sendText(t.id, `🌙 *تذكير رمضاني*\n⏲️ الإمساك: ${times.Imsak || '-'}\n🌅 الشروق: ${times.Sunrise || '-'}\n🌇 الإفطار: ${times.Maghrib}`);
  }
}

function formatStatus(target) {
  if (!target) return 'هذه الدردشة غير مرتبطة. استخدم .ربط أولاً.';
  return `⚙️ *حالة الدردشة*\nالاسم: ${target.name}\nالمدينة: ${target.city}, ${target.country}\nالصلاة: ${target.enablePrayer ? '✅' : '❌'}\nالأذكار: ${target.enableAthkar ? '✅' : '❌'}\nالقرآن: ${target.enableQuran ? '✅' : '❌'}\nرمضان: ${target.enableRamadan ? '✅' : '❌'}`;
}

function getMessageText(message) {
  if (!message) return '';
  return message.conversation || message.extendedTextMessage?.text || '';
}

async function handleServicesCommand(jid, body) {
  const target = getTarget(jid);
  if (body === '.اوامر') return sendText(jid, commandMenu);
  if (body === '.صباح') return sendText(jid, formatAthkar('أذكار الصباح', athkar.morning));
  if (body === '.مساء') return sendText(jid, formatAthkar('أذكار المساء', athkar.evening));
  if (body === '.صلاة') return sendText(jid, formatAthkar('الأذكار بعد الصلاة المفروضة', athkar.afterPrayer));
  if (body === '.نوم') return sendText(jid, formatAthkar('أذكار النوم', athkar.sleep));
  if (body === '.ادعية') return sendText(jid, `🤲 *أدعية مختارة*\n` + duas.map((d) => `• ${d}`).join('\n'));
  if (body === '.استغفار') return sendText(jid, `🕊️ *مجلس استغفار*\n` + istighfarList.map((d) => `• ${d}`).join('\n'));
  if (body === '.ملفات') return sendText(jid, '📁 assets/:\n• 019--1.mp3\n• 052-.mp3\n• 046--_up_by_muslem.mp3');
  if (body === '.ورد') {
    const juz = getDailyJuzNumber(new Date());
    return sendText(jid, `📚 ورد اليوم: الجزء ${juz}\nhttps://quran.com/juz/${juz}`);
  }

  const city = target?.city || config.city;
  const country = target?.country || config.country;
  if (body === '.مواقيت') return sendText(jid, formatPrayerTimes(await getPrayerTimes({ city, country, method: config.method }), city));
  if (body === '.live') {
    const next = getNextPrayer(await getPrayerTimes({ city, country, method: config.method }));
    return sendText(jid, `🟢 *الحالة المباشرة*\nالصلاة القادمة: ${prayerNameArabic[next.name]}\nالوقت: ${next.time}\nالمتبقي: ${next.remainingText}`);
  }
  if (body === '.رمضان') {
    const times = await getPrayerTimes({ city, country, method: config.method });
    return sendText(jid, `🌙 *حالة رمضان اليومية*\nالإمساك: ${times.Imsak || '-'}\nالإفطار: ${times.Maghrib}`);
  }
}

async function handleAdminCommand(jid, body) {
  if (body === '.ربط') {
    const groups = Object.values(await sock.groupFetchAllParticipating());
    if (!groups.length) return sendText(jid, 'لا توجد مجموعات متاحة حاليًا.');
    const text = groups.map((g, i) => `${i + 1}) ${g.subject}`).join('\n');
    return sendText(jid, `📌 المجموعات:\n${text}\n\nأرسل .ربط[رقم]`);
  }
  if (/^\.ربط\d+$/.test(body)) {
    const idx = Number(body.replace('.ربط', '')) - 1;
    const groups = Object.values(await sock.groupFetchAllParticipating());
    const selected = groups[idx];
    if (!selected) return sendText(jid, 'رقم غير صحيح.');
    const ok = addTarget(selected.id, selected.subject, config.city, config.country);
    return sendText(jid, ok ? `✅ تم ربط ${selected.subject}` : 'ℹ️ المجموعة مرتبطة بالفعل.');
  }
  if (body === '.فصل') return sendText(jid, removeTarget(jid) ? '✅ تم فك الربط.' : 'ℹ️ غير مرتبطة.');
  if (body === '.حالة') return sendText(jid, formatStatus(getTarget(jid)));
  if (body.startsWith('.مدينة|')) {
    const [, city, country] = body.split('|');
    if (!city || !country) return sendText(jid, 'الصيغة الصحيحة: .مدينة|City|Country');
    const updated = updateTarget(jid, { city, country });
    return sendText(jid, updated ? `✅ تم تحديث الموقع إلى ${city}, ${country}` : 'ℹ️ اربط الدردشة أولاً باستخدام .ربط');
  }
  if (body.startsWith('.تفعيل|')) {
    const [, key] = body.split('|');
    const map = { prayer: 'enablePrayer', athkar: 'enableAthkar', quran: 'enableQuran', ramadan: 'enableRamadan' };
    const field = map[key];
    if (!field) return sendText(jid, 'الخدمات المتاحة: prayer, athkar, quran, ramadan');
    const target = getTarget(jid);
    if (!target) return sendText(jid, 'اربط الدردشة أولاً باستخدام .ربط');
    const updated = updateTarget(jid, { [field]: !target[field] });
    return sendText(jid, `✅ ${key}: ${updated[field] ? 'مفعّل' : 'معطّل'}`);
  }
}

async function startBaileys() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authFolder);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' })
  });

  store.bind(sock.ev);
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') logger.info('✅ Baileys WhatsApp Bot ready');
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
    if (!msg?.message || msg.key.fromMe) return;
    const jid = msg.key.remoteJid;
    const body = (getMessageText(msg.message) || '').trim();
    if (!jid || !body.startsWith('.')) return;

    try {
      await handleServicesCommand(jid, body);
      if (/^(\.ربط\d+|\.ربط|\.فصل|\.حالة|\.مدينة\||\.تفعيل\|)/.test(body)) await handleAdminCommand(jid, body);
    } catch (error) {
      logger.error(error);
      await sendText(jid, 'حدث خطأ أثناء تنفيذ الأمر.');
    }
  });
}

cron.schedule('* * * * *', async () => {
  if (!sock) return;
  await checkPrayerAlerts();
  await checkSolarAthkarAlerts();
}, { timezone: config.timezone });
cron.schedule(toCron(config.nightlyAzkarTime), async () => sock && broadcastTo(getActiveTargets((t) => t.enableAthkar), formatAthkar('أذكار المساء', athkar.evening)), { timezone: config.timezone });
cron.schedule(toCron(config.quranPdfTime), async () => sock && sendQuranPdf(), { timezone: config.timezone });
cron.schedule(toCron(config.dailyJuzTime), async () => sock && sendDailyJuz(), { timezone: config.timezone });
cron.schedule('0 4 * * *', async () => sock && sendRamadanStatus(), { timezone: config.timezone });

if (config.skipWhatsappInit) logger.warn('⚠️ SKIP_WHATSAPP_INIT=true -> skipping WhatsApp init');
else startBaileys().catch((e) => logger.error(e));
