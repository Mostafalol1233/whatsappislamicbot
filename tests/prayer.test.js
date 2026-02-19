import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPrayerTimes, getNextPrayer, isPrayerNow } from '../src/prayer.js';

const times = {
  Fajr: '05:00',
  Dhuhr: '12:00',
  Asr: '15:30',
  Maghrib: '18:00',
  Isha: '19:30'
};

test('formats prayer times', () => {
  const output = formatPrayerTimes(times);
  assert.match(output, /الفجر: 05:00/);
  assert.match(output, /العشاء: 19:30/);
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
  assert.equal(isPrayerNow('18:01', now), false);
});
