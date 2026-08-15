// Sign-in ceremonies + envelope-key setup.
//
// There are three ways the DEK gets into memory, cheapest first:
//
//   resume()        nothing to type. The DEK was persisted in the device vault
//                   on a previous visit. This is the normal path on every load.
//   unlockLocal()   passphrase only. No passkey, no network — the KEK envelope
//                   is read from the device vault. Used when "stay signed in"
//                   is off, or after an explicit lock.
//   authenticate()  passkey assertion + passphrase. Only needed to enroll this
//                   device: first sign-in here, or after signing out. The
//                   passkey is a server requirement for minting a session
//                   token, so it can't be skipped on a device the server has
//                   never seen.
//
// register() is authenticate()'s counterpart for brand-new accounts.

import {
  startRegistration,
  startAuthentication,
} from "https://esm.sh/@simplewebauthn/browser@11.0.0";
import { api, setSession, getSession } from "./api.js";
import {
  DEFAULT_KEK_PARAMS,
  deriveKek,
  newDek,
  newSalt,
  unwrapDek,
  wrapDek,
} from "./crypto.js";
import { bytesToB64Url, b64UrlToBytes } from "./base64url.js";
import {
  clearDekKey,
  clearVault,
  getCacheOwner,
  loadDekKey,
  loadVault,
  saveDekKey,
  saveVault,
  setCacheOwner,
} from "./vault.js";
import { clearAllEntries, deleteMeta } from "./idb.js";

let cachedDekKey = null;
let cachedUserId = null;

export function getDekKey() {
  return cachedDekKey;
}

export function getUserId() {
  return cachedUserId;
}

export function isUnlocked() {
  return cachedDekKey !== null;
}

export function clearInMemoryKey() {
  cachedDekKey = null;
  cachedUserId = null;
}

/**
 * Restore the DEK from the device vault. Returns what the UI needs to decide
 * what (if anything) to ask for.
 *
 * `unlocked` false + `hasVault` true  → show a passphrase-only unlock.
 * `unlocked` false + `hasVault` false → show the full sign-in.
 *
 * `sessionValid` false means syncing is paused until the user re-enrols, but
 * the app is still fully usable against local data.
 */
export async function resume() {
  const vault = await loadVault();
  const dekKey = await loadDekKey();
  if (!vault) {
    // A stored key with no envelope can never be re-derived or verified, so
    // it is unusable rather than useful. Drop it instead of leaving it on disk.
    if (dekKey) await clearDekKey();
    return { unlocked: false, hasVault: false, sessionValid: false };
  }
  // Set even when still locked, so the UI can name the account on the unlock
  // screen instead of claiming nobody is signed in.
  cachedUserId = vault.userId ?? null;
  if (dekKey) cachedDekKey = dekKey;
  return {
    unlocked: !!dekKey,
    hasVault: true,
    sessionValid: !!getSession(),
  };
}

/**
 * Bind the local encrypted cache to an account.
 *
 * The `entries` store and `syncCursor` belong to exactly one user, and both
 * survive sign-out on purpose. If this device is now unlocking a *different*
 * account, leaving them in place is actively harmful: the old rows can't be
 * decrypted, any still-dirty ones get pushed into the new account as
 * permanently unreadable ciphertext, and the stale cursor hides the new
 * account's history from the first pull. So drop them on a mismatch.
 */
async function adoptCacheFor(userId) {
  if (typeof userId !== "string" || !userId) return;
  try {
    const owner = await getCacheOwner();
    if (owner && owner !== userId) {
      console.info("[auth] cache belongs to a different account — clearing it");
      await clearAllEntries();
      await deleteMeta("syncCursor");
    }
    await setCacheOwner(userId);
  } catch (err) {
    console.warn("[auth] could not reconcile cache ownership:", err?.message);
  }
}

/**
 * Unlock with the passphrase alone, against the locally-stored envelope.
 * No passkey ceremony and no network round-trip.
 */
export async function unlockLocal(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    throw new Error("passphrase_required");
  }
  const vault = await loadVault();
  if (!vault) throw new Error("no_local_vault");

  const kek = await deriveKek(
    passphrase,
    b64UrlToBytes(vault.kekSalt),
    vault.kekParams ?? DEFAULT_KEK_PARAMS
  );
  const dekKey = await unwrapDek(b64UrlToBytes(vault.wrappedDek), kek);

  cachedDekKey = dekKey;
  cachedUserId = vault.userId ?? null;
  await adoptCacheFor(cachedUserId);
  await saveDekKey(dekKey);
  return { userId: cachedUserId, sessionValid: !!getSession() };
}

export async function register(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < 8) {
    throw new Error("passphrase_too_short");
  }
  const salt = newSalt();
  const params = DEFAULT_KEK_PARAMS;
  const kek = await deriveKek(passphrase, salt, params);
  const dekBytes = newDek();
  const dekKey = await crypto.subtle.importKey(
    "raw",
    dekBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  const wrapped = await wrapDek(dekBytes, kek);

  const { userId, options } = await api.registerBegin({
    wrappedDek: bytesToB64Url(wrapped),
    kekSalt: bytesToB64Url(salt),
    kekParams: params,
  });

  let attResp;
  try {
    attResp = await startRegistration({ optionsJSON: options });
  } catch (err) {
    throw new Error("passkey_creation_cancelled");
  }

  const { sessionToken, expiresAt } = await api.registerFinish({
    userId,
    challenge: options.challenge,
    response: attResp,
  });

  setSession({ token: sessionToken, expiresAt, userId });
  cachedDekKey = dekKey;
  cachedUserId = userId;
  await adoptCacheFor(userId);
  await saveVault({
    userId,
    wrappedDek: bytesToB64Url(wrapped),
    kekSalt: bytesToB64Url(salt),
    kekParams: params,
  });
  await saveDekKey(dekKey);
  return { userId };
}

export async function authenticate(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    throw new Error("passphrase_required");
  }
  const { options } = await api.authenticateBegin();

  let assertion;
  try {
    assertion = await startAuthentication({ optionsJSON: options });
  } catch (err) {
    throw new Error("passkey_assertion_cancelled");
  }

  const result = await api.authenticateFinish({
    challenge: options.challenge,
    response: assertion,
  });

  const kek = await deriveKek(passphrase, b64UrlToBytes(result.kekSalt), result.kekParams);
  let dekKey;
  try {
    dekKey = await unwrapDek(b64UrlToBytes(result.wrappedDek), kek);
  } catch (err) {
    // Don't keep a half-signed-in state if the passphrase is wrong.
    throw new Error("wrong_passphrase");
  }

  setSession({
    token: result.sessionToken,
    expiresAt: result.expiresAt,
    userId: result.userId,
  });
  cachedDekKey = dekKey;
  cachedUserId = result.userId;
  await adoptCacheFor(result.userId);
  // Safe to persist verbatim: `unwrapDek` above already proved this envelope
  // opens with the passphrase just entered, so we never store one that can't
  // be used. An omitted `kekParams` round-trips consistently — `deriveKek`
  // defaults it, and `unlockLocal` applies the same default on read.
  await saveVault({
    userId: result.userId,
    wrappedDek: result.wrappedDek,
    kekSalt: result.kekSalt,
    kekParams: result.kekParams,
  });
  await saveDekKey(dekKey);
  return { userId: result.userId };
}

/** Re-persist the in-memory DEK, e.g. after "stay signed in" is switched on. */
export async function persistCurrentKey() {
  if (!cachedDekKey) return false;
  return saveDekKey(cachedDekKey);
}

/**
 * Stop persisting the DEK without ending the current session: the key stays in
 * memory until the tab closes, and the next visit asks for the passphrase.
 */
export async function forgetStoredKey() {
  await clearDekKey();
}

/**
 * Lock now. Forgets the DEK in memory and on disk but keeps the envelope, so
 * unlocking again is passphrase-only.
 *
 * This only drops the *key*. On its own it does not hide anything, because the
 * app's plaintext lives in localStorage — the caller must run bridge.js
 * `sealLocal()` first, while the key is still in memory. (Kept separate to
 * avoid an auth.js → bridge.js import cycle; bridge.js already imports this
 * module.)
 */
export async function lockDevice() {
  clearInMemoryKey();
  await clearDekKey();
}

/**
 * Key-level sign-out. Like `lockDevice()`, this leaves the plaintext in
 * localStorage — it can't seal from here without an auth → bridge import cycle.
 * The UI path is wipe.js `signOutThisDevice()`, which seals first; prefer that.
 */
export async function signOut() {
  try {
    await api.signOut();
  } catch {
    // best-effort — local sign-out always succeeds
  }
  clearInMemoryKey();
  await clearVault();
}

export { isRememberEnabled, setRememberEnabled } from "./vault.js";
