/**
 * Offline selling: connection, the PC's local copy of the shop, and sending what was recorded.
 *
 *   online  -> every request goes to the server as before; the local copy refreshes in the background
 *   offline -> the POS is answered from the local copy; sales, new customers and shift actions are
 *              queued in the local database and sent, oldest first, when the server is back
 *
 * The queue is sent with the PC's device token, not the cashier's sign-in, so it still goes out
 * after the sign-in expires or the cashier signs out. Each action carries its id as the
 * Idempotency-Key, so sending it twice can never record it twice.
 */
import { create } from "zustand";
import { getBaseURL } from "../shared/api/config";
import { localStore, storeError, type ActionRow, type OfflineAction, type StoreStatus } from "./localStore";

export const DEVICE_HEADER = "x-device-token";
const HEALTH_TIMEOUT = 4000;
const CHECK_ONLINE_MS = 20_000;
const CHECK_OFFLINE_MS = 5_000;
const SYNC_MS = 10_000;
const CATALOG_MS = 5 * 60_000;
const BATCH = 50;

export interface Device {
  id: string;
  code: string;
  name: string;
  companyId: number;
}

export interface Catalog {
  version: string;
  at: string;
  company: { id: number; name: string; offlineEnabled: boolean; priceRoundingRule?: string | null; scaleBarcodeEnabled: boolean; scaleBarcodePrefixes: string; scaleBarcodePluLength: number; scaleBarcodeMode: string };
  products: any[];
  categories: any[];
  priceLists: any[];
  prices: Record<string, Record<string, number>>;
  clients: any[];
  taxes: any[];
  registers: any[];
  users: { id: number; fullname: string; username: string; role: string }[];
  openShifts: any[];
}

type Status = "off" | "unregistered" | "ready" | "revoked";

interface OfflineState {
  /** this build can sell offline (desktop app, or the browser in development) */
  available: boolean;
  status: Status;
  device: Device | null;
  /** the server answers /health */
  online: boolean;
  /** signed in on this PC without internet: no server session, so the POS stays on the local copy */
  offlineSession: boolean;
  catalogAt: string | null;
  syncing: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  counts: StoreStatus["counts"];
  startNote: string | null;
  mirrorError: string | null;
  journalMirror: string | null;
  lastBackupAt: string | null;
}

const emptyCounts = { pending: 0, rejected: 0, sent: 0, discarded: 0, oldestPending: null };

export const useOfflineStore = create<OfflineState>(() => ({
  available: !!localStore,
  status: localStore ? "unregistered" : "off",
  device: null,
  online: true,
  offlineSession: false,
  catalogAt: null,
  syncing: false,
  lastSyncAt: null,
  lastSyncError: null,
  counts: emptyCounts,
  startNote: null,
  mirrorError: null,
  journalMirror: null,
  lastBackupAt: null,
}));

const set = (s: Partial<OfflineState>) => useOfflineStore.setState(s);
const get = () => useOfflineStore.getState();

// ---------------------------------------------------------------------------- in-memory copies

let catalog: Catalog | null = null;
let pendingActions: OfflineAction[] = [];
let deviceToken: string | null = null;
/** development only: pretend the server is unreachable */
let simulatedOffline = false;

export const getCatalog = () => catalog;

/** pages show data from the server or from the PC: when that source or the PC's copy changes, reload them */
let lastLocal: boolean | null = null;
function refreshScreens(force = false) {
  const local = inLocalMode();
  if (!force && local === lastLocal) return;
  lastLocal = local;
  void import("../config/queryClient").then(m => m.queryClient.invalidateQueries()).catch(() => undefined);
}
useOfflineStore.subscribe((s, prev) => {
  if (s.online !== prev.online || s.offlineSession !== prev.offlineSession || s.status !== prev.status) refreshScreens();
});
export const getPending = () => pendingActions;

/** the signed-in shop, read without importing the auth store (avoids an import cycle) */
function sessionCompanyId(): number | null {
  try {
    const raw = localStorage.getItem("company") || sessionStorage.getItem("company");
    const c = raw ? JSON.parse(raw) : null;
    return c?.id ? Number(c.id) : null;
  } catch {
    return null;
  }
}

/** Offline answers are possible: registered PC, shop switched it on, local copy downloaded, same shop signed in */
export function canWorkOffline(): boolean {
  const s = get();
  if (s.status !== "ready" || !catalog || !catalog.company.offlineEnabled || !s.device) return false;
  const cid = sessionCompanyId();
  return cid === null || cid === s.device.companyId;
}

/** The POS should be answered from the local copy now */
export function inLocalMode(): boolean {
  const s = get();
  return canWorkOffline() && (!s.online || s.offlineSession);
}

// ---------------------------------------------------------------------------- server calls with the device token

async function deviceFetch(path: string, init: RequestInit = {}) {
  if (simulatedOffline) throw new TypeError("simulated offline");
  if (!deviceToken) throw new Error("no device token");
  const res = await fetch(getBaseURL() + path, {
    ...init,
    headers: { "content-type": "application/json", [DEVICE_HEADER]: deviceToken, ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    // removed by the owner (or the token was lost on the server): stop sending; the queue is kept
    set({ status: "revoked", lastSyncError: body?.msg || "تم إلغاء تسجيل هذا الجهاز" });
    throw Object.assign(new Error(body?.msg || "device refused"), { status: res.status });
  }
  if (!res.ok || body?.error) throw Object.assign(new Error(body?.msg || `HTTP ${res.status}`), { status: res.status });
  return body?.data;
}

// ---------------------------------------------------------------------------- connection

let checking: Promise<boolean> | null = null;
let checkTimer: ReturnType<typeof setTimeout> | null = null;

export function checkConnection(): Promise<boolean> {
  if (checking) return checking;
  checking = (async () => {
    let ok = false;
    if (!simulatedOffline) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT);
      try {
        const r = await fetch(getBaseURL() + "/health", { cache: "no-store", signal: ctrl.signal });
        const b = await r.json().catch(() => null);
        ok = r.ok && b?.data?.ok !== false;
      } catch {
        ok = false;
      } finally {
        clearTimeout(t);
      }
    }
    const was = get().online;
    set({ online: ok });
    if (ok && !was) {
      // back online: send right away, then take the shop's latest data (this also learns if the PC was revoked)
      void syncNow().then(() => (get().status === "ready" ? refreshCatalog() : false));
    }
    scheduleCheck();
    return ok;
  })().finally(() => (checking = null));
  return checking;
}

function scheduleCheck() {
  if (checkTimer) clearTimeout(checkTimer);
  checkTimer = setTimeout(() => void checkConnection(), get().online ? CHECK_ONLINE_MS : CHECK_OFFLINE_MS);
}

/** A request could not reach the server: switch to offline at once (confirmed by /health) */
export function reportNetworkFailure() {
  if (get().online) set({ online: false });
  void checkConnection();
}

// ---------------------------------------------------------------------------- the local copy

async function loadCatalogFromStore() {
  if (!localStore) return;
  const c = await localStore.kvGet<Catalog>("catalog", "all");
  if (c) {
    catalog = c;
    set({ catalogAt: c.at });
  }
}

export async function refreshCatalog(): Promise<boolean> {
  if (!localStore || !deviceToken || get().status === "revoked") return false;
  try {
    const data = (await deviceFetch("/sync/catalog")) as Catalog & { device: Device };
    if (!data?.products) return false;
    const { device: _d, ...fresh } = data;
    if (catalog?.version !== fresh.version) {
      await localStore.kvPut("catalog", "all", fresh);
      catalog = fresh;
      if (inLocalMode()) refreshScreens(true);
    } else if (catalog) {
      catalog.at = fresh.at;
    }
    await localStore.metaSet("catalogAt", fresh.at);
    set({ catalogAt: fresh.at });
    // printed receipts need the shop's profile (name, logo, address): keep a copy on the PC too
    if (!get().offlineSession) {
      void import("../services/apiClient")
        .then(m => m.apiClient.get(`/company/profile/${fresh.company.id}`))
        .catch(() => undefined);
    }
    return true;
  } catch (e) {
    if (!(e as any)?.status) reportNetworkFailure();
    return false;
  }
}

// ---------------------------------------------------------------------------- the queue

async function reloadPending() {
  if (!localStore) return;
  pendingActions = await localStore.pending(100000);
  const st = await localStore.status();
  set({ counts: st.counts, mirrorError: st.mirrorError ?? null, journalMirror: st.journalMirror ?? null, lastBackupAt: st.lastBackupAt ?? null });
}

/** Save an action (and its provisional records) in the local database; it is sent when online */
export async function enqueue(action: OfflineAction, effects: { ns: string; id: string; data: unknown | null }[] = []) {
  if (!localStore) throw new Error("لا توجد قاعدة بيانات محلية على هذا الجهاز");
  await localStore.enqueue(action, effects);
  await reloadPending();
  if (get().online && !get().offlineSession) void syncNow();
}

let syncRunning: Promise<void> | null = null;

/** Send the queue, oldest first, in batches; stops at the first temporary failure */
export function syncNow(): Promise<void> {
  if (syncRunning) return syncRunning;
  syncRunning = (async () => {
    if (!localStore || !deviceToken || get().status !== "ready") return;
    set({ syncing: true });
    let applied = 0;
    try {
      for (;;) {
        const batch = await localStore.pending(BATCH);
        if (!batch.length) break;
        const data = await deviceFetch("/sync/actions", { method: "POST", body: JSON.stringify({ actions: batch }) });
        const results: { id: string; status: string }[] = data?.results ?? [];
        await localStore.mark(results);
        applied += results.filter(r => r.status === "applied" || r.status === "duplicate").length;
        if (results.length < batch.length || results.some(r => r.status === "retry")) break;
      }
      set({ lastSyncAt: new Date().toISOString(), lastSyncError: null });
    } catch (e) {
      const status = (e as any)?.status;
      if (!status) reportNetworkFailure();
      set({ lastSyncError: storeError(e) });
    } finally {
      // what the server now has is in its stock and balances: refresh before dropping the local view
      if (applied) await refreshCatalog();
      await reloadPending();
      set({ syncing: false });
    }
  })().finally(() => (syncRunning = null));
  return syncRunning;
}

// ---------------------------------------------------------------------------- registration

/** Register this PC (a manager, signed in and online). Keeps whatever is already queued. */
export async function registerThisDevice(device: Device, token: string) {
  if (!localStore) throw new Error("هذا الإصدار لا يدعم البيع بدون إنترنت");
  await localStore.metaSet("deviceToken", token);
  await localStore.metaSet("device", JSON.stringify(device));
  deviceToken = token;
  set({ device, status: "ready", lastSyncError: null });
  const ok = await refreshCatalog();
  if (!ok) throw new Error("تم تسجيل الجهاز لكن تعذر تنزيل بيانات المحل، سيُعاد المحاولة تلقائياً");
  void syncNow();
}

/** Forget the registration on this PC (only when nothing is waiting to be sent) */
export async function forgetThisDevice() {
  if (!localStore) return;
  await reloadPending();
  if (get().counts.pending > 0) throw new Error("على هذا الجهاز عمليات لم تُرسل بعد. انتظر حتى تُرسل قبل إلغاء التسجيل");
  await localStore.metaSet("deviceToken", null);
  await localStore.metaSet("device", null);
  await localStore.kvPut("catalog", "all", null);
  deviceToken = null;
  catalog = null;
  set({ device: null, status: "unregistered", catalogAt: null });
}

export function setOfflineSession(on: boolean) {
  set({ offlineSession: on });
}

// ---------------------------------------------------------------------------- start

let started = false;

export async function startOffline() {
  if (!localStore || started) return;
  started = true;
  try {
    const st = await localStore.status();
    set({ startNote: st.startNote ?? null });
    deviceToken = await localStore.metaGet("deviceToken");
    const dev = await localStore.metaGet("device");
    if (deviceToken && dev) set({ device: JSON.parse(dev), status: "ready" });
    await loadCatalogFromStore();
    await reloadPending();
    try {
      set({ offlineSession: sessionStorage.getItem("offlineSession") === "1" || localStorage.getItem("offlineSession") === "1" });
    } catch {
      /* storage blocked */
    }
  } catch (e) {
    console.error("[offline] start failed:", e);
  }
  await checkConnection();
  setInterval(() => {
    if (get().online && get().counts.pending > 0) void syncNow();
  }, SYNC_MS);
  setInterval(() => {
    if (get().online && get().status === "ready") void refreshCatalog();
  }, CATALOG_MS);
  if (get().online && get().status === "ready") void refreshCatalog();
  // confirmed actions are kept 30 days on the PC, then removed
  void localStore.prune(30).catch(() => undefined);

  if (import.meta.env.DEV) {
    // development only: while "simulated offline", every request to the server fails like a dead link
    const realFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (simulatedOffline && url.startsWith(getBaseURL())) return Promise.reject(new TypeError("Failed to fetch (simulated offline)"));
      return realFetch(input, init);
    };
    (window as any).__sellxOffline = {
      simulate(on: boolean) {
        simulatedOffline = on;
        return checkConnection();
      },
      state: get,
      catalog: () => catalog,
      pending: () => pendingActions,
      syncNow,
      refreshCatalog,
    };
  }
}

/** true while the dev hook pretends there is no internet (real requests must fail too) */
export const isSimulatedOffline = () => simulatedOffline;

export async function listActions(status: ActionRow["status"] | null, limit = 200) {
  return localStore ? localStore.actions(status, limit) : [];
}

export async function retryAction(id: string) {
  await localStore!.setStatus(id, "pending");
  await reloadPending();
  void syncNow();
}

export async function discardAction(id: string) {
  await localStore!.setStatus(id, "discarded");
  await reloadPending();
}

export { reloadPending };
