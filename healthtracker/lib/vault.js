// Device vault: what lets this device unlock without a full sign-in ceremony.
//
// Three separate things live in the IndexedDB `meta` store:
//
//   'vault'   { userId, wrappedDek, kekSalt, kekParams }
//             The same envelope the server holds. Useless without the
//             passphrase, so keeping a copy locally is no weaker than the
//             server copy — but it means an unlock can be done offline, with
//             the passphrase alone, and with no passkey ceremony.
//
//   'dekKey'  a non-extractable AES-GCM CryptoKey (the unwrapped DEK).
//             Present only while "stay signed in" is on. Structured-cloned by
//             IndexedDB, so the raw bytes are never reachable from JS — but
//             anyone with this browser profile can decrypt the data. That is
//             the deliberate trade for not re-authenticating on every load.
//
//   'cacheOwner'  the userId the encrypted `entries` cache belongs to. Kept
//             deliberately across sign-out (which preserves that cache) so the
//             next sign-in can tell whether it is the same account. See
//             auth.js `adoptCacheFor`.
//
// Turning "stay signed in" off drops 'dekKey' and keeps 'vault', so the device
// still unlocks with just the passphrase.
//
// NOTE: none of this protects data at rest on the device. The app's source of
// truth is plaintext in localStorage; the DEK protects data in transit and on
// the server. Removing the plaintext copy is bridge.js `sealLocal`'s job, and
// that is what "Lock now" and sign-out call before dropping the key.

import { getMeta, setMeta, deleteMeta } from "./idb.js";

const VAULT_META = "vault";
const DEK_META = "dekKey";
const OWNER_META = "cacheOwner";
const REMEMBER_KEY = "ht-remember";

export function isRememberEnabled() {
  // Default on — the whole point is not signing in on every visit.
  return localStorage.getItem(REMEMBER_KEY) !== "0";
}

export function setRememberEnabled(on) {
  localStorage.setItem(REMEMBER_KEY, on ? "1" : "0");
}

/** Drop the preference itself, so a wiped device starts from the default. */
export function clearRememberFlag() {
  localStorage.removeItem(REMEMBER_KEY);
}

/**
 * The account the encrypted `entries` cache belongs to. Survives clearVault()
 * on purpose: sign-out keeps the cache, so the next sign-in still needs to know
 * whose rows those are.
 */
export async function getCacheOwner() {
  try {
    const v = await getMeta(OWNER_META);
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

export async function setCacheOwner(userId) {
  if (typeof userId !== "string" || !userId) return;
  try {
    await setMeta(OWNER_META, userId);
  } catch (err) {
    console.warn("[vault] could not record cache owner:", err?.message);
  }
}

/**
 * Persist the KEK envelope for this device.
 * @param {{userId: string, wrappedDek: string, kekSalt: string, kekParams: object}} v
 */
export async function saveVault(v) {
  try {
    await setMeta(VAULT_META, {
      userId: v.userId,
      wrappedDek: v.wrappedDek,
      kekSalt: v.kekSalt,
      kekParams: v.kekParams,
      savedAt: Date.now(),
    });
  } catch (err) {
    console.warn("[vault] could not persist envelope:", err?.message);
  }
}

export async function loadVault() {
  try {
    const v = await getMeta(VAULT_META);
    if (!v || typeof v.wrappedDek !== "string" || typeof v.kekSalt !== "string") return null;
    return v;
  } catch {
    return null;
  }
}

/**
 * Persist the unwrapped DEK. No-op when "stay signed in" is off. Failures are
 * non-fatal: a browser that refuses to structured-clone a CryptoKey just falls
 * back to the passphrase-only unlock path.
 */
export async function saveDekKey(dekKey) {
  if (!isRememberEnabled()) return false;
  try {
    await setMeta(DEK_META, dekKey);
    return true;
  } catch (err) {
    console.warn("[vault] could not persist key:", err?.message);
    return false;
  }
}

export async function loadDekKey() {
  if (!isRememberEnabled()) return null;
  try {
    const k = await getMeta(DEK_META);
    // Guard against a stale/garbage value surviving a schema change.
    return k && typeof k === "object" && k.type === "secret" ? k : null;
  } catch {
    return null;
  }
}

/** Lock the device: forget the DEK, keep the envelope for passphrase unlock. */
export async function clearDekKey() {
  try {
    await deleteMeta(DEK_META);
  } catch {
    // best-effort
  }
}

/**
 * Full sign-out: forget both the DEK and the envelope. Deliberately keeps
 * 'cacheOwner' — the encrypted entries survive sign-out, so the next sign-in
 * still has to be able to tell whether they belong to the account signing in.
 */
export async function clearVault() {
  await clearDekKey();
  try {
    await deleteMeta(VAULT_META);
  } catch {
    // best-effort
  }
}
