// Passkey ceremonies (register + authenticate) + envelope-key setup.
//
// Registration: passphrase is required because we provision the DEK envelope
// here. Authentication: passphrase is required to unwrap the DEK after the
// passkey assertion succeeds.

import {
  startRegistration,
  startAuthentication,
} from "https://esm.sh/@simplewebauthn/browser@11.0.0";
import { api, setSession } from "./api.js";
import {
  DEFAULT_KEK_PARAMS,
  deriveKek,
  newDek,
  newSalt,
  unwrapDek,
  wrapDek,
} from "./crypto.js";
import { bytesToB64Url, b64UrlToBytes } from "./base64url.js";

// In-memory only — never persisted. Cleared on tab close / sign-out / wipe.
let cachedDekKey = null;
let cachedUserId = null;

export function getDekKey() {
  return cachedDekKey;
}

export function getUserId() {
  return cachedUserId;
}

export function clearInMemoryKey() {
  cachedDekKey = null;
  cachedUserId = null;
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
  return { userId: result.userId };
}

export async function signOut() {
  try {
    await api.signOut();
  } catch {
    // best-effort — local sign-out always succeeds
  }
  clearInMemoryKey();
}
