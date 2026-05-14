// The three distinct wipe operations, exposed as named functions so the
// settings UI maps 1:1 to them.

import { api, clearSession } from "./api.js";
import { clearInMemoryKey } from "./auth.js";
import { clearAllEntries, nuke as nukeIdb } from "./idb.js";

/**
 * Sign out of this device only. Server session is revoked; cloud data and
 * other devices are untouched. Local IndexedDB cache is preserved so the user
 * can sign back in without re-pulling.
 */
export async function signOutThisDevice() {
  try {
    await api.signOut();
  } catch {
    // best-effort
  }
  clearSession();
  clearInMemoryKey();
}

/**
 * Delete cloud data. Server entries are wiped. Other paired devices will pull
 * empty on their next sync. Local data on *this* device is preserved unless
 * the caller passes `{ alsoLocal: true }`.
 */
export async function deleteCloudData({ alsoLocal = false } = {}) {
  await api.deleteAccountData();
  if (alsoLocal) await clearAllEntries();
}

/**
 * Wipe everything: server account deleted (cascades to passkeys + entries +
 * sessions), local IndexedDB nuked, session cleared, in-memory key cleared.
 * The OS-stored passkey credential remains in the user's keychain — that's
 * outside our control. The caller's UI must explicitly tell the user to
 * remove it via system settings.
 */
export async function wipeEverything() {
  try {
    await api.deleteAccount();
  } catch {
    // continue with local wipe even if the network call fails
  }
  clearSession();
  clearInMemoryKey();
  await nukeIdb();
}
