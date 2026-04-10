import fs from 'fs';

const STORE_PATH = './data/connections.json';

function ensureStore() {
  if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
  if (!fs.existsSync(STORE_PATH)) fs.writeFileSync(STORE_PATH, JSON.stringify({ targets: [] }, null, 2));
}

export function getStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

function setStore(data) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function defaultTarget({ id, name, city = 'Cairo', country = 'Egypt' }) {
  return {
    id,
    name,
    city,
    country,
    isActive: true,
    enablePrayer: true,
    enableAthkar: true,
    enableQuran: true,
    enableDaily: true,
    enableChallenges: true,
    enableHourlyAthkar: true,
    sentQuestionIndices: [],
    sentLog: {}, // { date: 'YYYY-MM-DD', events: ['fajr', 'prophets', ...] }
    createdAt: new Date().toISOString()
  };
}

export function addTarget(id, name, city, country) {
  const store = getStore();
  if (store.targets.some((t) => t.id === id)) return false;
  store.targets.push(defaultTarget({ id, name, city, country }));
  setStore(store);
  return true;
}

export function removeTarget(id) {
  const store = getStore();
  const before = store.targets.length;
  store.targets = store.targets.filter((t) => t.id !== id);
  setStore(store);
  return store.targets.length !== before;
}

export function updateTarget(id, updates) {
  const store = getStore();
  const idx = store.targets.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  store.targets[idx] = { ...store.targets[idx], ...updates };
  setStore(store);
  return store.targets[idx];
}

export function getTarget(id) {
  const store = getStore();
  return store.targets.find((t) => t.id === id) || null;
}

export function markEventSent(targetId, eventKey) {
  const store = getStore();
  const idx = store.targets.findIndex((t) => t.id === targetId);
  if (idx === -1) return;

  const today = new Date().toISOString().split('T')[0];
  const target = store.targets[idx];

  if (target.sentLog?.date !== today) {
    target.sentLog = { date: today, events: [] };
  }

  if (!target.sentLog.events.includes(eventKey)) {
    target.sentLog.events.push(eventKey);
  }

  setStore(store);
}

export function isEventSentToday(targetId, eventKey) {
  const target = getTarget(targetId);
  if (!target || !target.sentLog) return false;
  
  const today = new Date().toISOString().split('T')[0];
  return target.sentLog.date === today && target.sentLog.events.includes(eventKey);
}
