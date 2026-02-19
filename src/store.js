import fs from 'fs';

const STORE_PATH = './data/connections.json';

function ensureStore() {
  if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ targets: [] }, null, 2));
  }
}

export function getStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

export function setStore(data) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

export function addTarget(id, name) {
  const store = getStore();
  if (!store.targets.find((t) => t.id === id)) {
    store.targets.push({ id, name, createdAt: new Date().toISOString() });
    setStore(store);
    return true;
  }
  return false;
}

export function removeTarget(id) {
  const store = getStore();
  const before = store.targets.length;
  store.targets = store.targets.filter((t) => t.id !== id);
  setStore(store);
  return store.targets.length !== before;
}
