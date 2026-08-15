// The three distinct wipe operations, exposed as named functions so the
// settings UI maps 1:1 to them.

import { api, clearSession } from "./api.js";
import { clearInMemoryKey } from "./auth.js";
import { clearVault, clearRememberFlag } from "./vault.js";
import { clearSealedFlag, purgeLocalPlaintext, sealLocal } from "./bridge.js";
import { clearAllEntries, nuke as nukeIdb } from "./idb.js";

const MODE_KEY = "ht-mode";

/**
 * Sign out of this device only. Server session is revoked, and the device
 * vault (stored DEK + KEK envelope) is forgotten, so getting back in needs the
 * full passkey + passphrase ceremony. Cloud data and other devices are
 * untouched, and the encrypted IndexedDB cache is preserved so signing back in
 * doesn't re-pull everything.
 *
 * The plaintext copy in localStorage goes too — otherwise "sign out" would
 * leave every entry readable to the next person to open this browser profile.
 * `sealLocal()` runs first, while the key is still in memory, so anything not
 * yet captured is encrypted into the cache before the plaintext is dropped.
 */
export async function signOutThisDevice() {
  try {
    await sealLocal();
  } catch (err) {
    console.warn("[wipe] could not seal local data:", err?.message);
  }
  try {
    await api.signOut();
  } catch {
    // best-effort
  }
  clearSession();
  clearInMemoryKey();
  await clearVault();
}

/**
 * Delete cloud data. Server entries are wiped. Other paired devices will pull
 * empty on their next sync. Local data on *this* device is preserved unless
 * the caller passes `{ alsoLocal: true }`.
 */
export async function deleteCloudData({ alsoLocal = false } = {}) {
  await api.deleteAccountData();
  if (alsoLocal) {
    await clearAllEntries();
    // The encrypted cache is not where the app reads from — drop the plaintext
    // too, or "also local" deletes nothing the user can see.
    purgeLocalPlaintext();
  }
}

/**
 * Wipe everything: server account deleted (cascades to passkeys + entries +
 * sessions), all local state destroyed.
 *
 * The OS-stored passkey credential remains in the user's keychain — that's
 * outside our control. The caller's UI must explicitly tell the user to
 * remove it via system settings.
 *
 * Order matters here. `nuke()` resolves on `blocked` as well as on success —
 * another tab holding the database open is enough — so relying on it to take
 * the vault with it would report a successful wipe while leaving the persisted
 * DEK and the KEK envelope on disk. Clear those explicitly first. Likewise the
 * plaintext in localStorage: it is the app's actual source of truth, and
 * dropping the database alone would leave every entry intact and readable.
 */
export async function wipeEverything() {
  try {
    await api.deleteAccount();
  } catch {
    // continue with local wipe even if the network call fails
  }
  clearSession();
  clearInMemoryKey();
  await clearVault();
  purgeLocalPlaintext();
  clearSealedFlag();
  localStorage.removeItem(MODE_KEY);
  clearRememberFlag();
  await nukeIdb();
}
