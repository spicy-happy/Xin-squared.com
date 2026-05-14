// Worker HTTP client. Thin fetch wrapper that:
//   - prepends the configured backend URL
//   - attaches the session bearer token
//   - parses errors into a consistent shape

import { getBackendUrl } from "./config.js";

const SESSION_KEY = "ht-session";

export function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (!s || typeof s.token !== "string") return null;
    if (typeof s.expiresAt === "number" && s.expiresAt < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function setSession(session) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

async function request(method, path, { body, auth = false, signal } = {}) {
  const headers = { "content-type": "application/json" };
  if (auth) {
    const session = getSession();
    if (!session) throw new ApiError(401, "no_session", "Not signed in");
    headers["authorization"] = `Bearer ${session.token}`;
  }
  let res;
  try {
    res = await fetch(`${getBackendUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new ApiError(0, "network_error", err?.message ?? "network error");
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    // empty/non-JSON body
  }
  if (!res.ok) {
    const code = data?.error?.code ?? `http_${res.status}`;
    const message = data?.error?.message ?? code;
    if (res.status === 401) clearSession();
    throw new ApiError(res.status, code, message, data?.error ?? {});
  }
  return data;
}

export const api = {
  registerBegin: (body) => request("POST", "/auth/register/begin", { body }),
  registerFinish: (body) => request("POST", "/auth/register/finish", { body }),
  authenticateBegin: () => request("POST", "/auth/authenticate/begin", { body: {} }),
  authenticateFinish: (body) => request("POST", "/auth/authenticate/finish", { body }),
  signOut: () => request("POST", "/auth/signout", { auth: true }),
  getAccount: () => request("GET", "/account", { auth: true }),
  deleteAccountData: () => request("DELETE", "/account/data", { auth: true }),
  deleteAccount: () => request("DELETE", "/account", { auth: true }),
  rotatePassphrase: (body) => request("POST", "/account/passphrase", { body, auth: true }),
  pull: (since, limit) =>
    request(
      "GET",
      `/sync?since=${encodeURIComponent(since)}${limit ? `&limit=${limit}` : ""}`,
      { auth: true }
    ),
  push: (body) => request("POST", "/sync", { body, auth: true }),
};
