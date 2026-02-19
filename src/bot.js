import fs from 'fs';
import dotenv from 'dotenv';
import cron from 'node-cron';
import qrcode from 'qrcode-terminal';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import {
  azkarAfterPrayer,
  azkarMasa,
  azkarSabah,
  commandMenu,
  duas,
  prayerNameArabic,
  prayerRakaatInfo
} from './content.js';
import { addTarget, getStore, removeTarget } from './store.js';
import { formatPrayerTimes, getNextPrayer, getPrayerTimes, isPrayerNow } from './prayer.js';

dotenv.config();

const config = {
  city: process.env.CITY || 'Cairo',
  country: process.env.COUNTRY || 'Egypt',
  method: Number(process.env.METHOD || 5),
  nightlyAzkarTime: process.env.NIGHTLY_AZKAR_TIME || '21:30',
  adhan16Path: process.env.ADHAN_16_PATH || './assets/adhan16.mp3',
  adhan52Path: process.env.ADHAN_52_PATH || './assets/adhan52.mp3',
  adhan16Url: process.env.ADHAN_16_URL || '',
  adhan52Url: process.env.ADHAN_52_URL || ''
};

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

const notified = new Set();

async function broadcast(text, options = {}) {
  const { targets } = getStore();
  for (const target of targets) {
    await client.sendMessage(target.id, text, options);
  }
}

async function buildAdhanMedia(prayerKey) {
  const use52 = prayerKey === 'Fajr' || prayerKey === 'Maghrib';
  const path = use52 ? config.adhan52Path : config.adhan16Path;
  const url = use52 ? config.adhan52Url : config.adhan16Url;

  if (path && fs.existsSync(path)) return MessageMedia.fromFilePath(path);
  if (url) return MessageMedia.fromUrl(url, { unsafeMime: true });
  return null;
}

async function notifyPrayer(prayerKey, time) {
  const prayerAr = prayerNameArabic[prayerKey] || prayerKey;
  const info = prayerRakaatInfo[prayerKey] || '';
  const message = `🕌 *حان الآن وقت صلاة ${prayerAr}*\n⏰ الوقت: ${time}\n📌 ${info}\n\nتقبل الله منا ومنكم صالح الأعمال.`;

  await broadcast(message);

  const media = await buildAdhanMedia(prayerKey);
  if (media) {
    const caption = `🎧 أذان صلاة ${prayerAr} (${prayerKey === 'Fajr' || prayerKey === 'Maghrib' ? 'رقم 52' : 'رقم 16'})`;
    await broadcast(media, { sendAudioAsVoice: true, caption });
  }

  await broadcast(azkarAfterPrayer);
}

async function checkPrayerAlerts() {
  const times = await getPrayerTimes(config);
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);

  for (const prayer of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
    const mark = `${dateKey}-${prayer}`;
    if (!notified.has(mark) && isPrayerNow(times[prayer], now)) {
      await notifyPrayer(prayer, times[prayer]);
      notified.add(mark);
    }
  }

  if (notified.size > 20) {
    const today = now.toISOString().slice(0, 10);
    [...notified].forEach((entry) => {
      if (!entry.startsWith(today)) notified.delete(entry);
    });
  }
}

async function handleServicesCommand(message, body) {
  if (body === '.اوامر') return client.sendMessage(message.from, commandMenu);
  if (body === '.صباح') return client.sendMessage(message.from, azkarSabah);
  if (body === '.مساء') return client.sendMessage(message.from, azkarMasa);
  if (body === '.صلاة') return client.sendMessage(message.from, azkarAfterPrayer);
  if (body === '.دعاء') return client.sendMessage(message.from, duas);

  if (body === '.مواقيت') {
    const times = await getPrayerTimes(config);
    return client.sendMessage(message.from, formatPrayerTimes(times));
  }
}

async function handleAdminCommand(message, body) {
  if (body === '>connect') {
    const chats = await client.getChats();
    const groups = chats.filter((c) => c.isGroup);
    if (!groups.length) return client.sendMessage(message.from, 'لا توجد مجموعات متاحة حالياً.');

    const text = groups.map((g, i) => `${i + 1}) ${g.name}`).join('\n');
    return client.sendMessage(message.from, `📌 المجموعات المتاحة:\n${text}\n\nللربط أرسل: >connect[رقم]`);
  }

  if (/^>connect\d+$/.test(body)) {
    const index = Number(body.replace('>connect', '')) - 1;
    const chats = await client.getChats();
    const groups = chats.filter((c) => c.isGroup);
    const selected = groups[index];
    if (!selected) return client.sendMessage(message.from, 'رقم المجموعة غير صحيح.');

    const added = addTarget(selected.id._serialized, selected.name);
    return client.sendMessage(message.from, added ? `✅ تم ربط المجموعة: ${selected.name}` : `ℹ️ المجموعة ${selected.name} مرتبطة بالفعل.`);
  }

  if (body === '>disconnect') {
    const removed = removeTarget(message.from);
    return client.sendMessage(message.from, removed ? '✅ تم فك الربط.' : 'ℹ️ هذه الدردشة غير مرتبطة.');
  }

  if (body === '>live') {
    const times = await getPrayerTimes(config);
    const next = getNextPrayer(times);
    const prayerAr = prayerNameArabic[next.name] || next.name;
    return client.sendMessage(
      message.from,
      `🟢 *الحالة المباشرة*\nالصلاة القادمة: ${prayerAr}\nالوقت: ${next.time}\nالمتبقي: ${next.remainingText}`
    );
  }
}

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ Islamic WhatsApp Bot is ready'));

client.on('message', async (message) => {
  const body = (message.body || '').trim();
  try {
    if (body.startsWith('.')) await handleServicesCommand(message, body);
    if (body.startsWith('>')) await handleAdminCommand(message, body);
  } catch (error) {
    console.error(error.message);
    await client.sendMessage(message.from, 'حدث خطأ أثناء تنفيذ الأمر، حاول مرة أخرى.');
  }
});

cron.schedule('* * * * *', async () => {
  try {
    await checkPrayerAlerts();
  } catch (error) {
    console.error('Prayer scheduler error:', error.message);
  }
});

cron.schedule(config.nightlyAzkarTime.split(':').reverse().join(' ') + ' * * *', async () => {
  try {
    await broadcast(`🌙 تذكير أذكار المساء بعد العشاء\n\n${azkarMasa}`);
  } catch (error) {
    console.error('Nightly azkar scheduler error:', error.message);
  }
});

client.initialize();
