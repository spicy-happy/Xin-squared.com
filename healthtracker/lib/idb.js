// IndexedDB cache: encrypted entries + meta (sync cursor, schema version).
//
// Stores:
//   entries: {id, updatedAt, deletedAt, iv, ciphertext, dirty}
//     - one per logical health-tracker day-blob (or meta value)
//     - `dirty` true means the entry has local changes not yet pushed to the server
//   meta:    {key, value}
//     - 'syncCursor' — server `updatedAt` of the last pulled entry
//     - 'schemaVersion' — local schema version (separate from worker's user-level version)

const DB_NAME = "healthtracker";
const DB_VERSION = 1;
const STORE_ENTRIES = "entries";
const STORE_META = "meta";

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const s = db.createObjectStore(STORE_ENTRIES, { keyPath: "id" });
        s.createIndex("byDirty", "dirty");
        s.createIndex("byUpdatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txPromise(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putEntry(entry) {
  const db = await open();
  const tx = db.transaction(STORE_ENTRIES, "readwrite");
  tx.objectStore(STORE_ENTRIES).put(entry);
  await txPromise(tx);
}

export async function putEntries(entries) {
  if (entries.length === 0) return;
  const db = await open();
  const tx = db.transaction(STORE_ENTRIES, "readwrite");
  const store = tx.objectStore(STORE_ENTRIES);
  for (const e of entries) store.put(e);
  await txPromise(tx);
}

export async function getEntry(id) {
  const db = await open();
  const tx = db.transaction(STORE_ENTRIES, "readonly");
  return reqPromise(tx.objectStore(STORE_ENTRIES).get(id));
}

export async function getAllEntries() {
  const db = await open();
  const tx = db.transaction(STORE_ENTRIES, "readonly");
  return reqPromise(tx.objectStore(STORE_ENTRIES).getAll());
}

export async function getDirtyEntries() {
  const db = await open();
  const tx = db.transaction(STORE_ENTRIES, "readonly");
  const idx = tx.objectStore(STORE_ENTRIES).index("byDirty");
  // IndexedDB index keys must be defined values; we use 1/0 instead of true/false.
  return reqPromise(idx.getAll(IDBKeyRange.only(1)));
}

export async function clearDirty(ids) {
  if (ids.length === 0) return;
  const db = await open();
  const tx = db.transaction(STORE_ENTRIES, "readwrite");
  const store = tx.objectStore(STORE_ENTRIES);
  for (const id of ids) {
    const req = store.get(id);
    req.onsuccess = () => {
      const e = req.result;
      if (e && e.dirty) {
        e.dirty = 0;
        store.put(e);
      }
    };
  }
  await txPromise(tx);
}

export async function deleteEntryLocal(id) {
  const db = await open();
  const tx = db.transaction(STORE_ENTRIES, "readwrite");
  tx.objectStore(STORE_ENTRIES).delete(id);
  await txPromise(tx);
}

export async function clearAllEntries() {
  const db = await open();
  const tx = db.transaction(STORE_ENTRIES, "readwrite");
  tx.objectStore(STORE_ENTRIES).clear();
  await txPromise(tx);
}

export async function getMeta(key) {
  const db = await open();
  const tx = db.transaction(STORE_META, "readonly");
  const row = await reqPromise(tx.objectStore(STORE_META).get(key));
  return row ? row.value : null;
}

export async function setMeta(key, value) {
  const db = await open();
  const tx = db.transaction(STORE_META, "readwrite");
  tx.objectStore(STORE_META).put({ key, value });
  await txPromise(tx);
}

export async function deleteMeta(key) {
  const db = await open();
  const tx = db.transaction(STORE_META, "readwrite");
  tx.objectStore(STORE_META).delete(key);
  await txPromise(tx);
}

export async function nuke() {
  const db = await open();
  db.close();
  dbPromise = null;
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // best-effort
  });
}
