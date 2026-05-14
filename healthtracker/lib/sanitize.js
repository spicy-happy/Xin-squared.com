// Input validation. We don't want to pull in Zod for a no-build app — these
// hand-rolled validators cover every place untrusted data enters the app.

const MAX_TEXT_FIELD = 1000;
const MAX_PAYLOAD_BYTES = 14 * 1024;        // leaves headroom under server's 16 KB cap
const MAX_IMPORT_ENTRIES = 100_000;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export function clampText(s, max = MAX_TEXT_FIELD) {
  if (typeof s !== "string") return "";
  return s.length > max ? s.slice(0, max) : s;
}

export function payloadFits(payload) {
  try {
    return new TextEncoder().encode(JSON.stringify(payload)).length <= MAX_PAYLOAD_BYTES;
  } catch {
    return false;
  }
}

export function validatePhotoFile(file) {
  if (!file || typeof file !== "object") throw new Error("photo_missing");
  if (!ALLOWED_PHOTO_MIME.has(file.type)) throw new Error("photo_mime_invalid");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("photo_too_large");
}

// Strip EXIF by re-encoding through a canvas. Returns a new Blob.
export async function stripExif(file) {
  validatePhotoFile(file);
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(bitmap, 0, 0);
    return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
  } finally {
    bitmap.close();
  }
}

const DAY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shape of a "day-blob" payload — the equivalent of one localStorage day key
// in the current app, ported into the encrypted entry model.
export function validateDayPayload(p) {
  if (!p || typeof p !== "object") throw new Error("day_payload_invalid");
  if (typeof p.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
    throw new Error("day_date_invalid");
  }
  if (p.weight !== undefined && p.weight !== null) {
    if (typeof p.weight !== "number" || !Number.isFinite(p.weight)) throw new Error("weight_invalid");
  }
  const arrayOf = (key) => {
    if (p[key] === undefined) return [];
    if (!Array.isArray(p[key])) throw new Error(`${key}_not_array`);
    return p[key].map((item) => ({
      ...item,
      description: clampText(item?.description ?? ""),
      name: clampText(item?.name ?? ""),
    }));
  };
  const cleaned = {
    date: p.date,
    weight: p.weight ?? null,
    foods: arrayOf("foods"),
    exercises: arrayOf("exercises"),
    water: typeof p.water === "number" ? p.water : null,
    mood: clampText(p.mood ?? "", 200),
    notes: clampText(p.notes ?? "", MAX_TEXT_FIELD),
    isTrainingDay: !!p.isTrainingDay,
    isPeriod: !!p.isPeriod,
    lastModified: p.lastModified ?? null,
  };
  if (!payloadFits(cleaned)) throw new Error("day_payload_too_large");
  return cleaned;
}

// Validates an imported JSON file before applying it.
export function validateImport(raw) {
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("import_not_json");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("import_shape");
  const out = { meta: {}, days: [] };
  if (parsed.meta && typeof parsed.meta === "object") {
    for (const [k, v] of Object.entries(parsed.meta)) {
      if (typeof k !== "string" || k.length > 128) continue;
      if (typeof v !== "string" || v.length > MAX_TEXT_FIELD * 4) continue;
      out.meta[k] = v;
    }
  }
  if (Array.isArray(parsed.days)) {
    if (parsed.days.length > MAX_IMPORT_ENTRIES) throw new Error("import_too_many_entries");
    for (const d of parsed.days) {
      try {
        out.days.push(validateDayPayload(d));
      } catch {
        // skip invalid entries silently — we'd rather salvage a partial import than reject all
      }
    }
  }
  return out;
}

// Treats values from OpenAI as raw text. Strip HTML-ish characters defensively
// even though React will escape on render — belt-and-suspenders.
export function sanitizeModelText(s) {
  return clampText(String(s ?? ""), MAX_TEXT_FIELD * 4).replace(/<\/?[^>]+>/g, "");
}

export function isValidId(id) {
  return typeof id === "string" && DAY_ID_RE.test(id);
}

export const SANITIZE_LIMITS = Object.freeze({
  MAX_TEXT_FIELD,
  MAX_PAYLOAD_BYTES,
  MAX_IMPORT_ENTRIES,
  MAX_PHOTO_BYTES,
});
