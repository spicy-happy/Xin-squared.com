// Bridge: localStorage <-> encrypted IndexedDB entries.
//
// Strategy
// --------
// The existing React app writes its source-of-truth state into localStorage
// keys (e.g. `nutrition-2026-05-14`, `user-profile`). To add cloud sync
// without rewriting the UI, we intercept `localStorage.setItem`/`removeItem`,
// map each synced key to a deterministic UUID, encrypt the value, and persist
// it as an `entry` in IndexedDB. The sync engine pushes those entries to the
// worker and pulls remote changes back, decrypts them, and writes them into
// localStorage — which fires the existing `health-data-changed` event the
// app already listens to.
//
// Events emitted on `window`:
//   'ht-sync-status' { detail: 'syncing' | 'synced' | 'error' }
//   'health-data-changed' (already used by the app; we fire it after pulls)
//
// Events listened for on `window`:
//   'ht-sync-now'   — force an immediate sync tick (used by the Settings UI)

import { writeEntry, syncOnce, readAllEntriesDecrypted, readEntryDecrypted } from "./sync.js";
import { getDekKey } from "./auth.js";
import { bytesToB64Url, utf8Encode } from "./base64url.js";

// Set while the plaintext copy has been removed from localStorage by
// sealLocal(). Tells the unlock path to repopulate from the encrypted cache
// rather than treating an empty localStorage as "the user deleted everything".
// Not a synced key, so the interceptors below ignore it.
const SEALED_KEY = "ht-sealed";

const SYNCED_KEY_PATTERNS = [
  /^nutrition-\d{4}-\d{2}-\d{2}$/,
  /^user-profile$/,
  /^nutrition-goals$/,
  /^health-goal$/,
  /^unit-system$/,
  /^last-backup-date$/,
  /^backup-reminder-dismissed$/,
];

const NAMESPACE_BYTES = utf8Encode("ht:v1:bridge");

export function isSynced(key) {
  return typeof key === "string" && SYNCED_KEY_PATTERNS.some((re) => re.test(key));
}

// UUIDv5-ish: SHA-1(namespace || name), formatted as a UUID. We deliberately
// don't follow RFC 4122 byte-twiddling because we only need (a) deterministic
// per-key ids, (b) low collision risk, and (c) acceptance by the server's
// `z.string().uuid()` Zod check. Both bits 6 and 8 are set to make it look
// like a v5 UUID to the validator.
async function keyToId(key) {
  const buf = new Uint8Array(NAMESPACE_BYTES.length + key.length + 1);
  buf.set(NAMESPACE_BYTES, 0);
  buf[NAMESPACE_BYTES.length] = 0x1f;
  buf.set(utf8Encode(key), NAMESPACE_BYTES.length + 1);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", buf));
  // Format first 16 bytes as a UUIDv5
  const b = hash.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let ticking = false;
let installed = false;
let pendingWrites = new Map(); // key -> { value | null (delete) }
let writeFlushTimer = null;
const FLUSH_MS = 500;

function emit(status) {
  window.dispatchEvent(new CustomEvent("ht-sync-status", { detail: status }));
}

// Storage changed underneath the UI — a pull landed, or a lock/unlock moved the
// plaintext. Distinct from 'health-data-changed', which the app also fires on
// its own saves: the UI must re-read on these but not on its own writes, or it
// would clobber whatever the user is mid-way through typing.
function emitExternalChange() {
  window.dispatchEvent(new Event("health-data-changed"));
  window.dispatchEvent(new Event("ht-external-change"));
}

async function flushPendingWrites() {
  writeFlushTimer = null;
  const dek = getDekKey();
  // No key right now — still booting, or just locked / signed out. Keep the
  // queue rather than dropping it: an unlock later in this page's life will
  // flush it. Clearing here silently lost any edit made in the half-second
  // before a lock.
  if (!dek) return;
  const drained = pendingWrites;
  pendingWrites = new Map();
  for (const [key, op] of drained.entries()) {
    try {
      const id = await keyToId(key);
      if (op.value === null) {
        await writeEntry(id, { key, deleted: true }, { deleted: true });
      } else {
        await writeEntry(id, { key, value: op.value });
      }
    } catch (err) {
      // If anything goes wrong, put the unprocessed key back so the next
      // flush retries it.
      pendingWrites.set(key, op);
      console.warn("[bridge] write failed for", key, err?.message);
      break;
    }
  }
}

function scheduleFlush() {
  if (writeFlushTimer != null) return;
  writeFlushTimer = setTimeout(flushPendingWrites, FLUSH_MS);
}

function onLocalWrite(key, value) {
  if (!isSynced(key)) return;
  if (!getDekKey()) return; // local-only mode — bridge dormant
  pendingWrites.set(key, { value });
  scheduleFlush();
}

function onLocalRemove(key) {
  if (!isSynced(key)) return;
  if (!getDekKey()) return;
  pendingWrites.set(key, { value: null });
  scheduleFlush();
}

export function installLocalStorageHooks() {
  if (installed) return;
  installed = true;
  const origSet = localStorage.setItem.bind(localStorage);
  const origRemove = localStorage.removeItem.bind(localStorage);
  const origClear = localStorage.clear.bind(localStorage);
  localStorage.setItem = (k, v) => {
    origSet(k, v);
    try { onLocalWrite(k, v); } catch {}
  };
  localStorage.removeItem = (k) => {
    origRemove(k);
    try { onLocalRemove(k); } catch {}
  };
  localStorage.clear = () => {
    // Collect keys *before* clearing so we can tombstone synced ones.
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    origClear();
    for (const k of keys) { try { onLocalRemove(k); } catch {} }
  };
}

// Apply decrypted remote entries to localStorage. Bypasses the intercept above
// so a pull doesn't immediately re-push the same data.
async function applyRemoteEntriesToLocalStorage() {
  const all = await readAllEntriesDecrypted();
  if (all.length === 0) return false;
  const origSet = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem")?.value
    || localStorage.setItem; // safety
  let changed = false;
  for (const { payload } of all) {
    if (!payload || typeof payload.key !== "string") continue;
    if (!isSynced(payload.key)) continue;
    if (payload.deleted) {
      // localStorage.removeItem on the raw prototype to bypass our hook.
      Storage.prototype.removeItem.call(localStorage, payload.key);
      changed = true;
      continue;
    }
    if (typeof payload.value !== "string") continue;
    const existing = localStorage.getItem(payload.key);
    if (existing === payload.value) continue;
    Storage.prototype.setItem.call(localStorage, payload.key, payload.value);
    changed = true;
  }
  return changed;
}

// Every synced key currently present in localStorage.
function syncedKeysPresent() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (isSynced(k)) keys.push(k);
  }
  return keys;
}

export function isSealed() {
  return localStorage.getItem(SEALED_KEY) === "1";
}

/**
 * Forget that this device was ever sealed. For paths where the plaintext is
 * legitimately gone for good (a wipe) or legitimately empty (a brand-new
 * account), so a later local-only choice doesn't warn about data that no
 * longer exists.
 */
export function clearSealedFlag() {
  localStorage.removeItem(SEALED_KEY);
}

/**
 * Capture into the encrypted cache any synced localStorage value that isn't
 * already there. Covers writes made while no DEK was in memory — those are
 * dropped by the interceptors above, so without this they would live on in
 * localStorage but never sync, and a later pull could silently overwrite them.
 * The main offender is the `migrateDateKeys` pass in index.html, which runs
 * before React mounts and rewrites `nutrition-*` keys.
 *
 * Only safe to call when localStorage is authoritative, i.e. NOT straight after
 * a seal — check `isSealed()` first and restore instead.
 */
export async function reconcileLocalToVault() {
  if (!getDekKey()) return 0;
  let recovered = 0;
  for (const key of syncedKeysPresent()) {
    const value = localStorage.getItem(key);
    if (typeof value !== "string") continue;
    try {
      const id = await keyToId(key);
      const current = await readEntryDecrypted(id);
      if (current && current.value === value) continue;
      await writeEntry(id, { key, value });
      recovered++;
    } catch (err) {
      console.warn("[bridge] reconcile failed for", key, err?.message);
    }
  }
  if (recovered > 0) console.info("[bridge] recovered", recovered, "unqueued local change(s)");
  return recovered;
}

/**
 * Repopulate localStorage from the encrypted cache after a seal, and clear the
 * sealed marker. Also used to surface a pull's results.
 */
export async function restoreLocalFromVault() {
  const changed = await applyRemoteEntriesToLocalStorage();
  localStorage.removeItem(SEALED_KEY);
  if (changed) emitExternalChange();
  return changed;
}

/**
 * Remove the plaintext copy of every synced key from localStorage.
 *
 * Removal goes through `Storage.prototype` directly: the hooked `removeItem`
 * would tombstone each key and push those tombstones to the server, deleting
 * the user's data everywhere. This only ever removes the local plaintext.
 */
export function purgeLocalPlaintext() {
  for (const key of syncedKeysPresent()) {
    Storage.prototype.removeItem.call(localStorage, key);
  }
  emitExternalChange();
}

/**
 * Lock the device's plaintext: make sure everything visible locally is captured
 * in the encrypted cache, then drop the plaintext. Must run while the DEK is
 * still in memory — callers seal first, then clear the key.
 */
export async function sealLocal() {
  if (!getDekKey()) return false;
  await reconcileLocalToVault();
  if (writeFlushTimer != null) clearTimeout(writeFlushTimer);
  await flushPendingWrites();
  purgeLocalPlaintext();
  localStorage.setItem(SEALED_KEY, "1");
  return true;
}

export async function tick() {
  if (ticking) return { skipped: true };
  if (!getDekKey()) return { skipped: true };
  ticking = true;
  emit("syncing");
  try {
    // Flush any debounced local writes first so they go up in this tick. Note
    // this runs unconditionally: the queue can hold entries with no timer
    // pending, if a flush was skipped while the key was briefly unavailable.
    if (writeFlushTimer != null) clearTimeout(writeFlushTimer);
    await flushPendingWrites();
    await syncOnce();
    const changed = await applyRemoteEntriesToLocalStorage();
    if (changed) emitExternalChange();
    emit("synced");
    return { ok: true, changed };
  } catch (err) {
    console.warn("[bridge] tick failed:", err?.message);
    // A dead session isn't a sync error — the app keeps working against the
    // local encrypted cache and pending writes stay dirty until the user
    // re-enrols this device. Report it as its own state so the UI can say so.
    const authFailed = err?.status === 401 || err?.code === "no_session";
    emit(authFailed ? "signin" : "error");
    return { ok: false, error: err?.message, authFailed };
  } finally {
    ticking = false;
  }
}

let intervalHandle = null;

export function startBridge() {
  installLocalStorageHooks();
  if (intervalHandle != null) return;
  intervalHandle = setInterval(tick, 30_000);
  window.addEventListener("focus", tick);
  window.addEventListener("online", tick);
  window.addEventListener("ht-sync-now", tick);
}

export function stopBridge() {
  if (intervalHandle != null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  // We intentionally leave the localStorage hooks in place — they no-op when
  // there is no DEK in memory, so removing them isn't necessary and would
  // race with reinstalling them on re-sign-in.
}

// Encrypt and upload every currently-synced localStorage key as a one-shot
// "initial snapshot" — used when the user converts from local-only to cloud.
export async function uploadInitialSnapshot() {
  const dek = getDekKey();
  if (!dek) throw new Error("not_signed_in");
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!isSynced(k)) continue;
    const v = localStorage.getItem(k);
    if (typeof v !== "string") continue;
    pendingWrites.set(k, { value: v });
  }
  await flushPendingWrites();
  await syncOnce();
}
