import fs from 'fs';
import dotenv from 'dotenv';
import cron from 'node-cron';
import qrcode from 'qrcode-terminal';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
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
  adhan16Path: process.env.ADHAN_16_PATH || './assets/adhan16.mp3',
  adhan52Path: process.env.ADHAN_52_PATH || './assets/adhan52.mp3',
  adhan16Url: process.env.ADHAN_16_URL || '',
  adhan52Url: process.env.ADHAN_52_URL || '',
  quranPdfUrl: process.env.QURAN_PDF_URL || 'https://www.searchtruth.com/pdf/Holy-Quran-Arabic-Writing-1.pdf',
  enableSolarAthkar: process.env.ENABLE_SOLAR_ATHKAR !== 'false'
};

const client = new Client({ authStrategy: new LocalAuth(), puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] } });
const notified = new Set();

const toCron = (hhmm) => {
  const [h, m] = hhmm.split(':');
  return `${m} ${h} * * *`;
};

async function broadcastTo(targets, payload, options = undefined) {
  for (const t of targets) {
    await client.sendMessage(t.id, payload, options);
  }
}

async function buildMediaFromPathOrUrl(path, url) {
  if (path && fs.existsSync(path)) return MessageMedia.fromFilePath(path);
  if (url) return MessageMedia.fromUrl(url, { unsafeMime: true });
  return null;
}

async function buildAdhanMedia(prayerKey) {
  const use052 = prayerKey === 'Fajr' || prayerKey === 'Maghrib';
  return buildMediaFromPathOrUrl(
    use052 ? config.adhan052Path : config.adhan019Path,
    use052 ? config.adhan052Url : config.adhan019Url
  );
}

async function buildIshaDuaMedia() {
  return buildMediaFromPathOrUrl(config.dua046Path, config.dua046Url);
}

function getActiveTargets(filter = () => true) {
  return getStore().targets.filter((t) => t.isActive && filter(t));
}

async function sendIshaDuaAudio(target) {
  const media = await buildIshaDuaMedia();
  if (!media) return;

  await client.sendMessage(
    target.id,
    media,
    { sendAudioAsVoice: true, caption: '🤲 دعاء بعد العشاء (046--_up_by_muslem.mp3)' }
  );
}

async function notifyPrayerForTarget(target, prayerKey, time) {
  const ar = prayerNameArabic[prayerKey] || prayerKey;
  const msg = `📢 *حان الآن موعد أذان ${ar} في ${target.city}* 🕌\n⏰ الوقت: ${time}\n━━━━━━━━━━━━━━━━━━\n${formatPrayerInfo(prayerKey)}\n━━━━━━━━━━━━━━━━━━\n🤲 لا تنسوا الدعاء عند الأذان`;
  await client.sendMessage(target.id, msg);

  const media = await buildAdhanMedia(prayerKey);
  if (media) {
    const audioName = prayerKey === 'Fajr' || prayerKey === 'Maghrib' ? '052-.mp3' : '019--1.mp3';
    await client.sendMessage(target.id, media, { sendAudioAsVoice: true, caption: `🎧 أذان ${ar} (${audioName})` });
  }

  if (target.enableAthkar) {
    setTimeout(async () => {
      await client.sendMessage(target.id, formatAthkar('الأذكار بعد الصلاة المفروضة', athkar.afterPrayer));
    }, 15 * 60 * 1000);
  }

  if (prayerKey === 'Isha') {
    setTimeout(async () => {
      await sendIshaDuaAudio(target);
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
      await client.sendMessage(target.id, `🌅 *حان وقت الشروق*\n${formatAthkar('أذكار الصباح', athkar.morning)}`);
      notified.add(sunriseMark);
    }

    const sunsetMark = `${dateKey}-${target.id}-sunset-athkar`;
    if (!notified.has(sunsetMark) && isPrayerNow(times.Maghrib, now)) {
      await client.sendMessage(target.id, `🌇 *حان وقت الغروب*\n${formatAthkar('أذكار المساء', athkar.evening)}`);
      notified.add(sunsetMark);
    }
  }

  if (notified.size > 350) {
    for (const entry of [...notified]) {
      if (!entry.startsWith(dateKey)) notified.delete(entry);
    }
  }
}

async function sendQuranPdf() {
  const targets = getActiveTargets((t) => t.enableQuran);
  const media = await MessageMedia.fromUrl(config.quranPdfUrl, { unsafeMime: true, filename: 'Holy-Quran.pdf' });
  for (const t of targets) {
    await client.sendMessage(t.id, media, { caption: '📖 *مصحف المدينة المنورة*\nاجعل لك ورداً يومياً من القرآن 🌙', sendMediaAsDocument: true });
  }
}

async function sendDailyJuz() {
  const juz = getDailyJuzNumber(new Date());
  const targets = getActiveTargets((t) => t.enableQuran);
  const text = `📚 *ورد اليوم الرمضاني*\nالجزء: ${juz}\nالرابط: https://quran.com/juz/${juz}\n\nتقبل الله طاعتكم.`;
  await broadcastTo(targets, text);
}

async function sendRamadanStatus() {
  const targets = getActiveTargets((t) => t.enableRamadan);
  for (const t of targets) {
    const times = await getPrayerTimes({ city: t.city, country: t.country, method: config.method });
    const msg = `🌙 *تذكير رمضاني*\n⏲️ الإمساك: ${times.Imsak || '-'}\n🌅 الشروق: ${times.Sunrise || '-'}\n🌇 الإفطار (المغرب): ${times.Maghrib}\n🤲 اللهم بلغنا رمضان وتقبل منا.`;
    await client.sendMessage(t.id, msg);
  }
}

function formatStatus(target) {
  if (!target) return 'هذه الدردشة غير مرتبطة. استخدم >connect أولاً.';
  return `⚙️ *حالة الدردشة*\nالاسم: ${target.name}\nالمدينة: ${target.city}, ${target.country}\nالصلاة: ${target.enablePrayer ? '✅' : '❌'}\nالأذكار: ${target.enableAthkar ? '✅' : '❌'}\nالقرآن: ${target.enableQuran ? '✅' : '❌'}\nرمضان: ${target.enableRamadan ? '✅' : '❌'}`;
}

async function handleServicesCommand(message, body) {
  const target = getTarget(message.from);
  if (body === '.اوامر') return client.sendMessage(message.from, commandMenu);
  if (body === '.صباح') return client.sendMessage(message.from, formatAthkar('أذكار الصباح', athkar.morning));
  if (body === '.مساء') return client.sendMessage(message.from, formatAthkar('أذكار المساء', athkar.evening));
  if (body === '.صلاة') return client.sendMessage(message.from, formatAthkar('الأذكار بعد الصلاة المفروضة', athkar.afterPrayer));
  if (body === '.نوم') return client.sendMessage(message.from, formatAthkar('أذكار النوم', athkar.sleep));
  if (body === '.ادعية') return client.sendMessage(message.from, `🤲 *أدعية مختارة*\n` + duas.map((d) => `• ${d}`).join('\n'));
  if (body === '.استغفار') return client.sendMessage(message.from, `🕊️ *مجلس استغفار*\n` + istighfarList.map((d) => `• ${d}`).join('\n'));
  if (body === '.ملفات') return client.sendMessage(message.from, '📁 ضع الملفات داخل assets/ بالأسماء التالية:\n• 019--1.mp3 (لكل الصلوات)\n• 052-.mp3 (للفجر والمغرب)\n• 046--_up_by_muslem.mp3 (دعاء بعد العشاء)');

  const juz = getDailyJuzNumber(new Date());
  if (body === '.ورد') return client.sendMessage(message.from, `📚 ورد اليوم: الجزء ${juz}\nhttps://quran.com/juz/${juz}`);

  const city = target?.city || config.city;
  const country = target?.country || config.country;

  if (body === '.مواقيت') {
    const times = await getPrayerTimes({ city, country, method: config.method });
    return client.sendMessage(message.from, formatPrayerTimes(times, city));
  }
  if (body === '.live') {
    const times = await getPrayerTimes({ city, country, method: config.method });
    const next = getNextPrayer(times);
    return client.sendMessage(message.from, `🟢 *الحالة المباشرة*\nالصلاة القادمة: ${prayerNameArabic[next.name]}\nالوقت: ${next.time}\nالمتبقي: ${next.remainingText}`);
  }
  if (body === '.رمضان') {
    const times = await getPrayerTimes({ city, country, method: config.method });
    return client.sendMessage(message.from, `🌙 *حالة رمضان اليومية*\nالمدينة: ${city}\nالإمساك: ${times.Imsak || '-'}\nالشروق: ${times.Sunrise || '-'}\nالإفطار: ${times.Maghrib}`);
  }
}

async function handleAdminCommand(message, body) {
  if (body === '.ربط' || body === '>connect') {
    const groups = (await client.getChats()).filter((c) => c.isGroup);
    if (!groups.length) return client.sendMessage(message.from, 'لا توجد مجموعات متاحة حالياً.');
    const text = groups.map((g, i) => `${i + 1}) ${g.name}`).join('\n');
    return client.sendMessage(message.from, `📌 المجموعات المتاحة:\n${text}\n\nأرسل .ربط[رقم]`);
  }

  if (/^(\.ربط\d+|>connect\d+)$/.test(body)) {
    const idx = Number(body.replace('>connect', '').replace('.ربط', '')) - 1;
    const groups = (await client.getChats()).filter((c) => c.isGroup);
    const selected = groups[idx];
    if (!selected) return client.sendMessage(message.from, 'رقم غير صحيح.');
    const ok = addTarget(selected.id._serialized, selected.name, config.city, config.country);
    return client.sendMessage(message.from, ok ? `✅ تم ربط ${selected.name}` : 'ℹ️ المجموعة مرتبطة بالفعل.');
  }

  if (body === '.فصل' || body === '>disconnect') return client.sendMessage(message.from, removeTarget(message.from) ? '✅ تم فك الربط.' : 'ℹ️ غير مرتبطة.');
  if (body === '.حالة' || body === '>status') return client.sendMessage(message.from, formatStatus(getTarget(message.from)));

  if (body.startsWith('.مدينة|') || body.startsWith('>setcity|')) {
    const [, city, country] = body.split('|');
    if (!city || !country) return client.sendMessage(message.from, 'الصيغة الصحيحة: .مدينة|City|Country');
    const updated = updateTarget(message.from, { city, country });
    return client.sendMessage(message.from, updated ? `✅ تم تحديث الموقع إلى ${city}, ${country}` : 'ℹ️ اربط الدردشة أولاً باستخدام >connect');
  }

  if (body.startsWith('.تفعيل|') || body.startsWith('>toggle|')) {
    const [, key] = body.split('|');
    const map = { prayer: 'enablePrayer', athkar: 'enableAthkar', quran: 'enableQuran', ramadan: 'enableRamadan' };
    const field = map[key];
    if (!field) return client.sendMessage(message.from, 'الخدمات المتاحة: prayer, athkar, quran, ramadan');
    const target = getTarget(message.from);
    if (!target) return client.sendMessage(message.from, 'اربط الدردشة أولاً باستخدام >connect');
    const updated = updateTarget(message.from, { [field]: !target[field] });
    return client.sendMessage(message.from, `✅ ${key}: ${updated[field] ? 'مفعّل' : 'معطّل'}`);
  }
}

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ Ramadan Islamic WhatsApp Bot ready'));
client.on('message', async (message) => {
  const body = (message.body || '').trim();
  try {
    if (body.startsWith('.')) {
      await handleServicesCommand(message, body);
      if (/^(\.ربط\d+|\.ربط|\.فصل|\.حالة|\.مدينة\||\.تفعيل\|)/.test(body)) await handleAdminCommand(message, body);
    }
    if (body.startsWith('>')) await handleAdminCommand(message, body);
  } catch (error) {
    console.error(error.message);
    await client.sendMessage(message.from, 'حدث خطأ أثناء تنفيذ الأمر.');
  }
});

cron.schedule('* * * * *', async () => {
  await checkPrayerAlerts();
  await checkSolarAthkarAlerts();
}, { timezone: config.timezone });

cron.schedule(toCron(config.nightlyAzkarTime), async () => {
  await broadcastTo(getActiveTargets((t) => t.enableAthkar), formatAthkar('أذكار المساء', athkar.evening));
}, { timezone: config.timezone });
cron.schedule(toCron(config.quranPdfTime), sendQuranPdf, { timezone: config.timezone });
cron.schedule(toCron(config.dailyJuzTime), sendDailyJuz, { timezone: config.timezone });
cron.schedule('0 4 * * *', sendRamadanStatus, { timezone: config.timezone });

client.initialize();
