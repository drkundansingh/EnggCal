// storage.js — persistence layer.
//
// This MVP runs entirely client-side, so history/config are stored in the
// browser's IndexedDB (NOT localStorage — see note below) and can be backed
// up/restored as a JSON file. The public API (saveCalculation, listHistory,
// deleteCalculation, exportBackup, importBackup, getConfig, setConfig) is
// written so a production build can swap the internals for `fetch()` calls
// to a real backend (see README.md → "Production database") without any
// change to the calculator UI code that calls this module.
//
// Why not localStorage: it's synchronous, ~5MB-capped, and string-only.
// IndexedDB scales far better for calculation history + PDF blobs and is
// the correct browser-native choice for an app that will later sync to a
// server database.

const DB_NAME = 'enghub';
const DB_VERSION = 1;
const STORE_HISTORY = 'history';
const STORE_CONFIG = 'config';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_HISTORY)) {
        const store = db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
        store.createIndex('byDate', 'createdAt');
        store.createIndex('byCalculator', 'calculatorId');
      }
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

export async function saveCalculation(record) {
  const db = await openDB();
  const full = {
    id: record.id || `calc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: record.createdAt || new Date().toISOString(),
    name: record.name || 'Untitled calculation',
    calculatorId: record.calculatorId,
    inputs: record.inputs,
    result: record.result,
    assumptions: record.assumptions || null,
  };
  return new Promise((resolve, reject) => {
    const req = tx(db, STORE_HISTORY, 'readwrite').put(full);
    req.onsuccess = () => resolve(full);
    req.onerror = () => reject(req.error);
  });
}

export async function listHistory(calculatorId = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, STORE_HISTORY, 'readonly');
    const req = store.getAll();
    req.onsuccess = () => {
      let rows = req.result || [];
      if (calculatorId) rows = rows.filter((r) => r.calculatorId === calculatorId);
      rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteCalculation(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, STORE_HISTORY, 'readwrite').delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function renameCalculation(id, newName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, STORE_HISTORY, 'readwrite');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const rec = getReq.result;
      if (!rec) return reject(new Error('Record not found'));
      rec.name = newName;
      const putReq = store.put(rec);
      putReq.onsuccess = () => resolve(rec);
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function duplicateCalculation(id) {
  const db = await openDB();
  const rec = await new Promise((resolve, reject) => {
    const req = tx(db, STORE_HISTORY, 'readonly').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!rec) throw new Error('Record not found');
  const copy = { ...rec, id: undefined, name: `${rec.name} (copy)`, createdAt: new Date().toISOString() };
  return saveCalculation(copy);
}

export async function getConfig(key, fallback = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, STORE_CONFIG, 'readonly').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
    req.onerror = () => reject(req.error);
  });
}

export async function setConfig(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, STORE_CONFIG, 'readwrite').put({ key, value });
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/** Full local backup — exports history + config as a downloadable JSON file. */
export async function exportBackup() {
  const db = await openDB();
  const [history, configEntries] = await Promise.all([
    new Promise((res, rej) => {
      const req = tx(db, STORE_HISTORY, 'readonly').getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    }),
    new Promise((res, rej) => {
      const req = tx(db, STORE_CONFIG, 'readonly').getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    }),
  ]);
  const backup = {
    app: 'Engineering Calculator Hub',
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    history,
    config: configEntries,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `enghub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return backup;
}

/** Restore from a backup JSON object (as produced by exportBackup). Merges by id. */
export async function importBackup(backup) {
  if (!backup || !Array.isArray(backup.history)) {
    throw new Error('Invalid backup file: missing history array');
  }
  const db = await openDB();
  const histStore = tx(db, STORE_HISTORY, 'readwrite');
  for (const rec of backup.history) histStore.put(rec);
  if (Array.isArray(backup.config)) {
    const cfgStore = tx(db, STORE_CONFIG, 'readwrite');
    for (const entry of backup.config) cfgStore.put(entry);
  }
  return { restored: backup.history.length };
}
