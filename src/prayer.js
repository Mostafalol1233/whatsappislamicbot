const TRACKED = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'Imsak'];

function parseTimeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function convertTo12Hour(time) {
  if (!time) return '-';
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'م' : 'ص';
  const h12 = hours % 12 || 12;
  return `${h12}:${String(minutes).padStart(2, '0')} ${period}`;
}

export async function getPrayerTimes(config) {
  const { city, country, method } = config;
  const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${method}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch prayer times: ${response.status}`);
  const payload = await response.json();
  const raw = payload?.data?.timings || {};

  return TRACKED.reduce((acc, key) => {
    acc[key] = (raw[key] || '').slice(0, 5);
    return acc;
  }, {});
}

export function formatPrayerTimes(times, city) {
  return `✨ *مواقيت الصلاة اليوم في ${city}* ✨\n━━━━━━━━━━━━━━━━━━\n` +
    `🕋 الفجر: ${convertTo12Hour(times.Fajr)}\n` +
    `🌅 الشروق: ${convertTo12Hour(times.Sunrise)}\n` +
    `🏙️ الظهر: ${convertTo12Hour(times.Dhuhr)}\n` +
    `🌆 العصر: ${convertTo12Hour(times.Asr)}\n` +
    `🌇 المغرب: ${convertTo12Hour(times.Maghrib)}\n` +
    `🌃 العشاء: ${convertTo12Hour(times.Isha)}\n` +
    `${times.Imsak ? `⏲️ الإمساك: ${convertTo12Hour(times.Imsak)}\n` : ''}` +
    '━━━━━━━━━━━━━━━━━━';
}

export function getNextPrayer(times, now = new Date()) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const ordered = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map((name) => ({ name, time: times[name], minutes: parseTimeToMinutes(times[name]) }));

  const next = ordered.find((p) => p.minutes > nowMinutes) || ordered[0];
  const rawDelta = next.minutes - nowMinutes;
  const delta = rawDelta >= 0 ? rawDelta : rawDelta + 24 * 60;

  return {
    name: next.name,
    time: next.time,
    remainingMinutes: delta,
    remainingText: `${Math.floor(delta / 60)} ساعة و ${delta % 60} دقيقة`
  };
}

export function isPrayerNow(prayerTime, now = new Date()) {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}` === prayerTime;
}

export function getDailyJuzNumber(now = new Date('2026-02-20T00:00:00')) {
  const start = new Date('2026-02-20T00:00:00');
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((current.getTime() - start.getTime()) / 86400000);
  if (diffDays < 0) return 1;
  return ((diffDays + 1) % 30) + 1;
}
