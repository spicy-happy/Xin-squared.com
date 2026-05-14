// Backend URL config. Default points at the canonical instance.
// Self-hosters override via Settings → Backend URL.

const KEY = "ht-backend-url";
const DEFAULT_BACKEND = "https://healthtracker.mail-f78.workers.dev";

export function getBackendUrl() {
  return localStorage.getItem(KEY) || DEFAULT_BACKEND;
}

export function setBackendUrl(url) {
  if (typeof url !== "string" || url.length === 0) {
    localStorage.removeItem(KEY);
    return;
  }
  // Normalize: strip trailing slash, require http(s).
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) throw new Error("backend_url_must_be_http");
  try {
    new URL(trimmed);
  } catch {
    throw new Error("backend_url_invalid");
  }
  localStorage.setItem(KEY, trimmed);
}

export function isDefaultBackend() {
  return getBackendUrl() === DEFAULT_BACKEND;
}
