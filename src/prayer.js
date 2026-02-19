const TRACKED = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

function parseTimeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
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

export function formatPrayerTimes(times) {
  return `🕋 *مواقيت الصلاة اليوم*\n\n` +
    `الفجر: ${times.Fajr}\n` +
    `الظهر: ${times.Dhuhr}\n` +
    `العصر: ${times.Asr}\n` +
    `المغرب: ${times.Maghrib}\n` +
    `العشاء: ${times.Isha}`;
}

export function getNextPrayer(times, now = new Date()) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const ordered = TRACKED.map((name) => ({ name, time: times[name], minutes: parseTimeToMinutes(times[name]) }));

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
