// Sync engine: pull + push with last-writer-wins per entry.
//
// Local storage layout (IndexedDB):
//   entries[id] = { id, updatedAt, deletedAt, iv, ciphertext, dirty }
//
// Push: send all entries marked dirty=1. Server rejects entries with stale
// updatedAt. On success, clear the dirty flag.
//
// Pull: GET /sync?since=<cursor>. For each remote entry, compare against the
// local copy by updatedAt — newer wins. Tombstones (deletedAt set) overwrite
// live entries if newer.

import { api } from "./api.js";
import { b64UrlToBytes, bytesToB64Url } from "./base64url.js";
import { decryptEntry, encryptEntry } from "./crypto.js";
import {
  clearDirty,
  getDirtyEntries,
  getEntry,
  getMeta,
  putEntries,
  putEntry,
  setMeta,
} from "./idb.js";
import { getDekKey } from "./auth.js";

const CURSOR_KEY = "syncCursor";

function uuid() {
  // RFC4122 v4 via WebCrypto
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Save a logical entry (e.g. a day-blob or a meta value) to the local cache,
 * encrypted with the DEK, marked dirty for the next push.
 *
 * @param {string} id     stable UUID for this logical entity
 * @param {object} payload  plaintext JSON
 * @param {{ deleted?: boolean }} [opts]
 */
export async function writeEntry(id, payload, opts = {}) {
  const dek = getDekKey();
  // In local-only mode the caller writes directly to IndexedDB without this layer.
  // If we got here without a DEK, that's a bug — surface it loudly.
  if (!dek) throw new Error("not_signed_in");
  const updatedAt = Date.now();
  if (opts.deleted) {
    // Tombstone: still encrypt an empty payload so the server schema is uniform.
    const { iv, ciphertext } = await encryptEntry({ tombstone: true }, dek);
    const entry = {
      id,
      updatedAt,
      deletedAt: updatedAt,
      iv: bytesToB64Url(iv),
      ciphertext: bytesToB64Url(ciphertext),
      dirty: 1,
    };
    await putEntry(entry);
    return entry;
  }
  const { iv, ciphertext } = await encryptEntry(payload, dek);
  const entry = {
    id,
    updatedAt,
    deletedAt: null,
    iv: bytesToB64Url(iv),
    ciphertext: bytesToB64Url(ciphertext),
    dirty: 1,
  };
  await putEntry(entry);
  return entry;
}

/**
 * Decrypt every live entry in the local cache.
 * Returns a list of { id, updatedAt, payload }.
 */
export async function readAllEntriesDecrypted() {
  const dek = getDekKey();
  if (!dek) throw new Error("not_signed_in");
  const { getAllEntries } = await import("./idb.js");
  const all = await getAllEntries();
  const out = [];
  for (const e of all) {
    if (e.deletedAt) continue;
    try {
      const payload = await decryptEntry(
        { iv: b64UrlToBytes(e.iv), ciphertext: b64UrlToBytes(e.ciphertext) },
        dek
      );
      out.push({ id: e.id, updatedAt: e.updatedAt, payload });
    } catch {
      // skip entries we can't decrypt (e.g. wrong DEK after a botched recovery)
    }
  }
  return out;
}

export async function readEntryDecrypted(id) {
  const dek = getDekKey();
  if (!dek) throw new Error("not_signed_in");
  const e = await getEntry(id);
  if (!e || e.deletedAt) return null;
  return decryptEntry(
    { iv: b64UrlToBytes(e.iv), ciphertext: b64UrlToBytes(e.ciphertext) },
    dek
  );
}

// ---------- push ----------

export async function push() {
  const dirty = await getDirtyEntries();
  if (dirty.length === 0) return { pushed: 0 };
  // Batch in chunks of 200 (well under server MAX_BATCH_ENTRIES=500).
  const CHUNK = 200;
  let total = 0;
  for (let i = 0; i < dirty.length; i += CHUNK) {
    const slice = dirty.slice(i, i + CHUNK).map((e) => ({
      id: e.id,
      updatedAt: e.updatedAt,
      deletedAt: e.deletedAt,
      iv: e.iv,
      ciphertext: e.ciphertext,
    }));
    const result = await api.push({ entries: slice });
    const acceptedSet = new Set(result.accepted);
    const cleanIds = slice.map((e) => e.id).filter((id) => acceptedSet.has(id));
    await clearDirty(cleanIds);
    total += cleanIds.length;
    // If the server rejected some as stale, the next pull will reconcile.
  }
  return { pushed: total };
}

// ---------- pull ----------

export async function pull() {
  let cursor = (await getMeta(CURSOR_KEY)) ?? 0;
  let totalPulled = 0;
  for (;;) {
    const page = await api.pull(cursor, 1000);
    if (!page.entries || page.entries.length === 0) {
      await setMeta(CURSOR_KEY, page.cursor ?? cursor);
      return { pulled: totalPulled };
    }
    const toWrite = [];
    for (const remote of page.entries) {
      const local = await getEntry(remote.id);
      if (!local || remote.updatedAt > local.updatedAt) {
        toWrite.push({
          id: remote.id,
          updatedAt: remote.updatedAt,
          deletedAt: remote.deletedAt ?? null,
          iv: remote.iv,
          ciphertext: remote.ciphertext,
          // If the local copy is dirty *and* the remote is newer, we lose the
          // local edit. This is acceptable for last-writer-wins; if you want
          // to preserve it, surface a conflict UI here.
          dirty: 0,
        });
      }
    }
    if (toWrite.length > 0) await putEntries(toWrite);
    cursor = page.cursor;
    totalPulled += page.entries.length;
    await setMeta(CURSOR_KEY, cursor);
    if (!page.hasMore) return { pulled: totalPulled };
  }
}

export async function syncOnce() {
  // Push first so our pending writes don't lose to stale server data on pull.
  const pushed = await push();
  const pulled = await pull();
  return { ...pushed, ...pulled };
}

export { uuid };
