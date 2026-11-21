/**
 * The PC's local database (offline selling).
 *
 * Desktop app: the SQLite store in Rust (src-tauri/src/offline.rs): survives crashes and power cuts,
 * journal + backups. In the browser during development only (`npm run dev`, not the web app) a
 * localStorage copy with the same behaviour is used, so the offline flow can be tested in Chrome.
 * The web app in production has no local store: offline selling is a desktop feature.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../services/tauriBridge";

export type ActionKind = "sale.create" | "client.create" | "shift.open" | "shift.close" | "shift.cash";

export interface OfflineAction {
  id: string;
  kind: ActionKind;
  userId: number;
  at: string;
  payload: Record<string, any>;
  receiptNumber?: string;
  clientActionId?: string;
}

/** a provisional record saved in the same transaction as its action (null data = remove) */
export interface Effect {
  ns: string;
  id: string;
  data: unknown | null;
}

export interface ActionRow {
  seq: number;
  id: string;
  kind: ActionKind;
  body: OfflineAction;
  status: "pending" | "sent" | "rejected" | "discarded";
  attempts: number;
  error: any;
  result: any;
  createdAt: string;
  doneAt: string | null;
}

export interface BackupInfo {
  name: string;
  label: string;
  size: number;
  createdAt: string;
  pending: number;
}

export interface StoreStatus {
  ready: boolean;
  path?: string;
  counts: { pending: number; rejected: number; sent: number; discarded: number; oldestPending: string | null };
  startNote?: string | null;
  lastBackupAt?: string | null;
  backups?: number;
  journalMirror?: string | null;
  mirrorError?: string | null;
  restorePending?: boolean;
}

export interface LocalStore {
  kind: "desktop" | "dev-browser";
  status(): Promise<StoreStatus>;
  metaGet(key: string): Promise<string | null>;
  metaSet(key: string, value: string | null): Promise<void>;
  nextSeq(key: string): Promise<number>;
  kvReplace(ns: string, rows: { id: string | number }[]): Promise<number>;
  kvPut(ns: string, id: string, data: unknown | null): Promise<void>;
  kvGet<T = any>(ns: string, id: string): Promise<T | null>;
  kvList<T = any>(ns: string): Promise<T[]>;
  enqueue(action: OfflineAction, effects: Effect[]): Promise<void>;
  pending(limit: number): Promise<OfflineAction[]>;
  mark(results: { id: string; status: string; result?: unknown; error?: unknown }[]): Promise<void>;
  actions(status: ActionRow["status"] | null, limit: number): Promise<ActionRow[]>;
  setStatus(id: string, status: "pending" | "discarded"): Promise<void>;
  prune(days: number): Promise<number>;
  saveLogin(username: string, password: string, profile: unknown): Promise<void>;
  checkLogin(username: string, password: string): Promise<{ profile: any; savedAt: string }>;
  backupNow(label?: "manual" | "shift" | "exit"): Promise<BackupInfo>;
  backupList(): Promise<BackupInfo[]>;
  backupRestore(name: string): Promise<void>;
  setMirror(dir: string | null): Promise<void>;
}

const desktopStore: LocalStore = {
  kind: "desktop",
  status: () => invoke("offline_status"),
  metaGet: key => invoke("offline_meta_get", { key }),
  metaSet: (key, value) => invoke("offline_meta_set", { key, value }),
  nextSeq: key => invoke("offline_next_seq", { key }),
  kvReplace: (ns, rows) => invoke("offline_kv_replace", { ns, rows }),
  kvPut: (ns, id, data) => invoke("offline_kv_put", { ns, id, data }),
  kvGet: (ns, id) => invoke("offline_kv_get", { ns, id }),
  kvList: ns => invoke("offline_kv_list", { ns }),
  enqueue: (action, effects) => invoke("offline_enqueue", { action, effects }),
  pending: limit => invoke("offline_pending", { limit }),
  mark: results => invoke("offline_mark", { results }),
  actions: (status, limit) => invoke("offline_actions", { status, limit }),
  setStatus: (id, status) => invoke("offline_set_status", { id, status }),
  prune: days => invoke("offline_prune", { days }),
  saveLogin: (username, password, profile) => invoke("offline_save_login", { username, password, profile }),
  checkLogin: (username, password) => invoke("offline_check_login", { username, password }),
  backupNow: label => invoke("offline_backup_now", { label }),
  backupList: () => invoke("offline_backup_list"),
  backupRestore: name => invoke("offline_backup_restore", { name }),
  setMirror: dir => invoke("offline_set_mirror", { dir }),
};

// ---------------------------------------------------------------------------- development fallback

const P = "sellx-offline-dev:";
const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(P + k);
    return v === null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => localStorage.setItem(P + k, JSON.stringify(v));

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const devStore: LocalStore = {
  kind: "dev-browser",
  async status() {
    const rows = read<ActionRow[]>("outbox", []);
    const counts = { pending: 0, rejected: 0, sent: 0, discarded: 0, oldestPending: null as string | null };
    for (const r of rows) {
      counts[r.status]++;
      if (r.status === "pending" && (!counts.oldestPending || r.createdAt < counts.oldestPending)) counts.oldestPending = r.createdAt;
    }
    return { ready: true, path: "browser (development)", counts, backups: 0, lastBackupAt: null, journalMirror: null, mirrorError: null, restorePending: false };
  },
  async metaGet(key) {
    return read<Record<string, string>>("meta", {})[key] ?? null;
  },
  async metaSet(key, value) {
    const m = read<Record<string, string>>("meta", {});
    if (value === null) delete m[key];
    else m[key] = value;
    write("meta", m);
  },
  async nextSeq(key) {
    const m = read<Record<string, string>>("meta", {});
    const next = (Number(m[key]) || 0) + 1;
    m[key] = String(next);
    write("meta", m);
    return next;
  },
  async kvReplace(ns, rows) {
    write("kv:" + ns, Object.fromEntries(rows.map(r => [String(r.id), r])));
    return rows.length;
  },
  async kvPut(ns, id, data) {
    const all = read<Record<string, unknown>>("kv:" + ns, {});
    if (data === null) delete all[id];
    else all[id] = data;
    write("kv:" + ns, all);
  },
  async kvGet(ns, id) {
    return (read<Record<string, any>>("kv:" + ns, {})[id] ?? null) as any;
  },
  async kvList(ns) {
    return Object.values(read<Record<string, any>>("kv:" + ns, {})) as any;
  },
  async enqueue(action, effects) {
    const rows = read<ActionRow[]>("outbox", []);
    if (!rows.some(r => r.id === action.id)) {
      const seq = (rows.at(-1)?.seq ?? 0) + 1;
      rows.push({ seq, id: action.id, kind: action.kind, body: action, status: "pending", attempts: 0, error: null, result: null, createdAt: new Date().toISOString(), doneAt: null });
      write("outbox", rows);
    }
    for (const fx of effects) await devStore.kvPut(fx.ns, fx.id, fx.data);
  },
  async pending(limit) {
    return read<ActionRow[]>("outbox", []).filter(r => r.status === "pending").slice(0, limit).map(r => r.body);
  },
  async mark(results) {
    const rows = read<ActionRow[]>("outbox", []);
    const now = new Date().toISOString();
    for (const res of results) {
      const r = rows.find(x => x.id === res.id);
      if (!r) continue;
      if (res.status === "applied" || res.status === "duplicate") Object.assign(r, { status: "sent", result: res.result ?? null, error: null, doneAt: now });
      else if (res.status === "rejected") Object.assign(r, { status: "rejected", attempts: r.attempts + 1, error: res.error ?? null, doneAt: now });
      else Object.assign(r, { attempts: r.attempts + 1, error: res.error ?? null });
    }
    write("outbox", rows);
  },
  async actions(status, limit) {
    return read<ActionRow[]>("outbox", []).filter(r => !status || r.status === status).reverse().slice(0, limit);
  },
  async setStatus(id, status) {
    const rows = read<ActionRow[]>("outbox", []);
    const r = rows.find(x => x.id === id);
    const allowed = status === "pending" ? r?.status === "rejected" : r && ["rejected", "pending"].includes(r.status);
    if (!r || !allowed) throw new Error("العملية غير موجودة أو حالتها لا تسمح بذلك");
    r.status = status;
    if (status === "pending") r.error = null;
    else r.doneAt = new Date().toISOString();
    write("outbox", rows);
  },
  async prune(days) {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    const rows = read<ActionRow[]>("outbox", []);
    const keep = rows.filter(r => !(["sent", "discarded"].includes(r.status) && r.doneAt && r.doneAt < cutoff));
    write("outbox", keep);
    return rows.length - keep.length;
  },
  async saveLogin(username, password, profile) {
    const id = username.trim().toLowerCase();
    const salt = crypto.randomUUID();
    await devStore.kvPut("login", id, { id, salt, hash: await sha256Hex(salt + password), profile, savedAt: new Date().toISOString() });
  },
  async checkLogin(username, password) {
    const row = await devStore.kvGet("login", username.trim().toLowerCase());
    if (!row) throw new Error("لم يسجّل هذا المستخدم الدخول على هذا الجهاز من قبل وهو متصل بالإنترنت");
    if ((await sha256Hex(row.salt + password)) !== row.hash) throw new Error("كلمة المرور غير صحيحة");
    return { profile: row.profile, savedAt: row.savedAt };
  },
  async backupNow() {
    throw new Error("النسخ الاحتياطي متاح في تطبيق الكمبيوتر فقط");
  },
  async backupList() {
    return [];
  },
  async backupRestore() {
    throw new Error("النسخ الاحتياطي متاح في تطبيق الكمبيوتر فقط");
  },
  async setMirror() {
    throw new Error("متاح في تطبيق الكمبيوتر فقط");
  },
};

/** null when this build cannot sell offline (the web app) */
export const localStore: LocalStore | null = isTauri ? desktopStore : import.meta.env.DEV ? devStore : null;

/** Rust errors arrive as plain strings */
export const storeError = (e: unknown) => (typeof e === "string" ? e : (e as any)?.message || String(e));
