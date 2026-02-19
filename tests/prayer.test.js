import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPrayerTimes, getDailyJuzNumber, getNextPrayer, isPrayerNow } from '../src/prayer.js';

const times = {
  Fajr: '05:00',
  Sunrise: '06:25',
  Dhuhr: '12:00',
  Asr: '15:30',
  Maghrib: '18:00',
  Isha: '19:30',
  Imsak: '04:45'
};

test('formats prayer times with sunrise and imsak', () => {
  const output = formatPrayerTimes(times, 'Cairo');
  assert.match(output, /الشروق/);
  assert.match(output, /الإمساك/);
});

test('returns next prayer and remaining time', () => {
  const now = new Date('2024-01-01T14:00:00');
  const next = getNextPrayer(times, now);
  assert.equal(next.name, 'Asr');
  assert.equal(next.remainingMinutes, 90);
});

test('detects prayer exact minute', () => {
  const now = new Date('2024-01-01T18:00:00');
  assert.equal(isPrayerNow('18:00', now), true);
});

test('calculates daily juz cycle', () => {
  assert.equal(getDailyJuzNumber(new Date('2026-02-20T08:00:00')), 2);
  assert.equal(getDailyJuzNumber(new Date('2026-03-19T08:00:00')), 29);
  assert.equal(getDailyJuzNumber(new Date('2026-03-20T08:00:00')), 30);
  assert.equal(getDailyJuzNumber(new Date('2026-03-21T08:00:00')), 1);
});
