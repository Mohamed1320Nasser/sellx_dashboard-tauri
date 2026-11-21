import type { AxiosRequestConfig } from "axios";

/**
 * Safe repeats for saves that move money or stock (sale, payment, collection, return, purchase, expense).
 *
 * Each save carries an `Idempotency-Key`. Sending the SAME content again (the automatic retry, or the
 * user pressing "save" again after a timeout) reuses the key, so the server answers with the first
 * result instead of creating a second invoice. The key is dropped once the outcome is known: on success,
 * or when the server clearly refused (4xx: nothing was saved). After a network error, a timeout or a
 * 5xx the outcome is unknown, so the key is kept for the next identical attempt (for 15 minutes).
 * Different content always gets a new key.
 */

const KEEP_MS = 15 * 60 * 1000;
const pending = new Map<string, { key: string; at: number }>();

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Content fingerprint: sorted JSON; FormData by its fields (files by name, size and date) */
function fingerprint(body: unknown): string {
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const fields: [string, string][] = [];
    body.forEach((v, k) => fields.push([k, typeof v === "string" ? v : `file:${v.name}:${v.size}:${(v as File).lastModified ?? ""}`]));
    return JSON.stringify(fields.sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1)));
  }
  const sorted = (v: any): any =>
    Array.isArray(v)
      ? v.map(sorted)
      : v && typeof v === "object" && !(v instanceof Date)
        ? Object.fromEntries(Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => [k, sorted(v[k])]))
        : v;
  return JSON.stringify(sorted(body ?? null));
}

/**
 * Send `body` with a key that stays the same for identical repeats of this action.
 * `send` receives the axios config (headers) to pass along.
 */
export async function sendOnce<T>(scope: string, body: unknown, send: (config: AxiosRequestConfig) => Promise<T>): Promise<T> {
  const now = Date.now();
  for (const [id, p] of pending) if (now - p.at > KEEP_MS) pending.delete(id);

  const id = `${scope}|${fingerprint(body)}`;
  const entry = pending.get(id) ?? { key: newKey(), at: now };
  pending.set(id, entry);
  try {
    const result = await send({ headers: { "Idempotency-Key": entry.key } });
    pending.delete(id);
    return result;
  } catch (error: any) {
    const status: number | undefined = error?.response?.status ?? error?.status;
    // the server answered with a refusal: nothing was saved, a corrected attempt starts fresh
    if (status && status >= 400 && status < 500) pending.delete(id);
    throw error;
  }
}
