// Envelope encryption for the health tracker.
//
// Model:
//   passphrase  --Argon2id(salt, params)-->  KEK (32 bytes)
//   random 32-byte DEK is wrapped by KEK using AES-256-GCM
//   each entry payload is encrypted with the DEK + a fresh 12-byte IV
//
// The server only ever sees:
//   - wrappedDek + kekSalt + kekParams (during register / sign-in)
//   - {id, updatedAt, iv, ciphertext} per entry (during sync)
//
// The passphrase and DEK never leave the client.

import { argon2id } from "https://esm.sh/hash-wasm@4.11.0";
import { bytesToB64Url, b64UrlToBytes, utf8Encode, utf8Decode } from "./base64url.js";

// Conservative defaults for Argon2id in 2026 (~250-500 ms on a modern phone
// with WASM-backed hash-wasm). Tunable per-user via `kekParams` from the server.
export const DEFAULT_KEK_PARAMS = Object.freeze({ m: 64 * 1024, t: 3, p: 1 });

const KEK_BYTES = 32;
const DEK_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export function randomBytes(n) {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export function newSalt() {
  return randomBytes(SALT_BYTES);
}

export function newDek() {
  return randomBytes(DEK_BYTES);
}

export function newIv() {
  return randomBytes(IV_BYTES);
}

// ---------- KEK derivation ----------

/**
 * Derive a 32-byte KEK from a passphrase using Argon2id.
 * Returns a CryptoKey usable for AES-GCM unwrap/wrap.
 */
export async function deriveKek(passphrase, salt, params = DEFAULT_KEK_PARAMS) {
  if (typeof passphrase !== "string" || passphrase.length === 0) {
    throw new Error("passphrase required");
  }
  const raw = await argon2id({
    password: passphrase,
    salt,
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m,
    hashLength: KEK_BYTES,
    outputType: "binary",
  });
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

// ---------- DEK wrap/unwrap ----------

const DEK_WRAP_AAD = utf8Encode("ht:dek:v1");

export async function wrapDek(dek, kek) {
  const iv = newIv();
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: DEK_WRAP_AAD },
      kek,
      dek
    )
  );
  // wrapped format: [iv (12)] [ct + tag]
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

export async function unwrapDek(wrappedDek, kek) {
  if (wrappedDek.length < IV_BYTES + 16) throw new Error("wrapped_dek_too_short");
  const iv = wrappedDek.slice(0, IV_BYTES);
  const ct = wrappedDek.slice(IV_BYTES);
  let raw;
  try {
    raw = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: DEK_WRAP_AAD },
        kek,
        ct
      )
    );
  } catch {
    throw new Error("wrong_passphrase");
  }
  if (raw.length !== DEK_BYTES) throw new Error("dek_length_invalid");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

// ---------- Entry encrypt/decrypt ----------

const ENTRY_AAD = utf8Encode("ht:entry:v1");

/**
 * @param {object} payload  — JSON-serializable plaintext entry body
 * @param {CryptoKey} dekKey
 * @returns {Promise<{iv: Uint8Array, ciphertext: Uint8Array}>}
 */
export async function encryptEntry(payload, dekKey) {
  const iv = newIv();
  const plaintext = utf8Encode(JSON.stringify(payload));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: ENTRY_AAD },
      dekKey,
      plaintext
    )
  );
  return { iv, ciphertext: ct };
}

/**
 * @param {{iv: Uint8Array, ciphertext: Uint8Array}} envelope
 * @param {CryptoKey} dekKey
 */
export async function decryptEntry(envelope, dekKey) {
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: envelope.iv, additionalData: ENTRY_AAD },
      dekKey,
      envelope.ciphertext
    )
  );
  return JSON.parse(utf8Decode(plain));
}

// Convenience: base64url-encoded variants for wire transport.

export async function encryptEntryB64(payload, dekKey) {
  const { iv, ciphertext } = await encryptEntry(payload, dekKey);
  return { iv: bytesToB64Url(iv), ciphertext: bytesToB64Url(ciphertext) };
}

export async function decryptEntryB64({ iv, ciphertext }, dekKey) {
  return decryptEntry({ iv: b64UrlToBytes(iv), ciphertext: b64UrlToBytes(ciphertext) }, dekKey);
}
