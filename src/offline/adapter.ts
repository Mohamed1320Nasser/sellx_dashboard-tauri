/**
 * Plugs offline selling into the app's axios client, so pages need no changes:
 *
 *  - online: requests go to the server as before. Answers the POS may need offline (permissions,
 *    company profile, price lists, taxes, categories...) are kept on the PC.
 *  - the server cannot be reached (or this is an offline sign-in): the request is answered on the
 *    PC (localRoutes), from a kept answer, or refused with "needs internet".
 *  - a sale / new customer / shift action that fails because the connection dropped is saved on the
 *    PC with the same Idempotency-Key. If the server did get it, sending it later answers
 *    "duplicate", so it is never recorded twice.
 */
import axios, { AxiosError, AxiosHeaders, type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { localStore, storeError } from "./localStore";
import { canWorkOffline, inLocalMode, isSimulatedOffline, reportNetworkFailure } from "./runtime";
import { findRoute, isLocalHeldId, localHeldList, LocalHttpError, NEEDS_INTERNET, PREFER_CACHE, type LocalRequest } from "./localRoutes";

/** server answers worth keeping for offline use (GET, plus POST /category/list) */
const KEEP = [
  /^\/auth\/permissions$/,
  /^\/company\/profile\/\d+$/,
  /^\/company\/\d+$/,
  /^\/price-list\/list$/,
  /^\/price-list\/single\/[^/]+\/prices$/,
  /^\/tax\/(active\/\d+|list)$/,
  /^\/category\/list$/,
  /^\/printer[-/]/,
  /^\/label-preset\/list$/,
  /^\/user\/profile$/,
];

function toRequest(config: InternalAxiosRequestConfig): LocalRequest {
  const base = (config.baseURL || "").replace(/\/+$/, "");
  let url = config.url || "";
  if (base && url.startsWith(base)) url = url.slice(base.length);
  if (/^https?:\/\//.test(url)) url = new URL(url).pathname;
  const [path, query] = url.split("?");
  const params: Record<string, any> = { ...(query ? Object.fromEntries(new URLSearchParams(query)) : {}), ...(config.params || {}) };
  let body: any = config.data;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      /* not JSON */
    }
  }
  const headers = AxiosHeaders.from(config.headers as any);
  const key = headers.get("Idempotency-Key");
  return { method: (config.method || "get").toUpperCase(), path: "/" + path.replace(/^\/+/, ""), params, body, idempotencyKey: typeof key === "string" ? key : undefined };
}

const cacheKey = (r: LocalRequest) => {
  const p = Object.keys(r.params).sort().map(k => `${k}=${r.params[k]}`).join("&");
  const b = r.method === "GET" || !r.body || typeof r.body !== "object" ? "" : JSON.stringify(r.body, Object.keys(r.body).sort());
  return `${r.method} ${r.path}?${p}#${b}`;
};
const keepable = (r: LocalRequest) => (r.method === "GET" || (r.method === "POST" && r.path === "/category/list")) && KEEP.some(re => re.test(r.path));

function reply(config: InternalAxiosRequestConfig, data: unknown, status = 200, msg = "ok"): AxiosResponse {
  return { data: { msg, status, data, error: false }, status, statusText: "OK", headers: {}, config, request: { offline: true } };
}

function refuse(config: InternalAxiosRequestConfig, status: number, msg: string): never {
  const response = { data: { msg, message: msg, status, error: true }, status, statusText: "", headers: {}, config } as AxiosResponse;
  throw new AxiosError(msg, status >= 500 ? "ERR_OFFLINE" : "ERR_BAD_REQUEST", config, { offline: true }, response);
}

/** the connection, not the server, failed (no answer, or the host's gateway answered for it) */
const isNetworkFailure = (e: any) => !e?.response || [502, 503, 504].includes(e.response.status);

async function answerLocally(config: InternalAxiosRequestConfig, req: LocalRequest): Promise<AxiosResponse> {
  if (!localStore) refuse(config, 503, NEEDS_INTERNET);
  const kept = keepable(req) ? await localStore.kvGet<any>("http", cacheKey(req)) : null;
  if (kept && PREFER_CACHE.some(re => re.test(req.path))) return { ...reply(config, null), data: kept };
  const route = findRoute(req);
  if (route) {
    try {
      const r = await route(req);
      return reply(config, r.data, r.status ?? 200, r.msg ?? "ok");
    } catch (e) {
      if (e instanceof LocalHttpError) refuse(config, e.status, e.message);
      refuse(config, 500, `خطأ في قاعدة البيانات المحلية: ${storeError(e)}`);
    }
  }
  if (kept) return { ...reply(config, null), data: kept };
  refuse(config, 503, NEEDS_INTERNET);
}

export function installOfflineAdapter(client: AxiosInstance) {
  if (!localStore) return;
  const real = axios.getAdapter(client.defaults.adapter ?? axios.defaults.adapter);

  client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const req = toRequest(config);

    // parked sales saved on this PC are handled here, online or not
    const heldId = req.path.match(/^\/held-sale\/(?:resume|single)\/(local-[^/]+)$/)?.[1];
    if (heldId && isLocalHeldId(heldId)) return answerLocally(config, req);

    if (inLocalMode()) return answerLocally(config, req);

    let res: AxiosResponse;
    try {
      if (isSimulatedOffline()) throw new AxiosError("Network Error (simulated)", AxiosError.ERR_NETWORK, config);
      res = await real(config);
    } catch (e) {
      if (isNetworkFailure(e) && canWorkOffline()) {
        reportNetworkFailure();
        if (findRoute(req) || keepable(req)) return answerLocally(config, req);
      }
      throw e;
    }

    try {
      const body = res.data && typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      if (keepable(req) && body && body.error !== true) void localStore.kvPut("http", cacheKey(req), body).catch(() => undefined);
      // the held-sale list also shows the sales parked on this PC while it was offline
      if (req.method === "GET" && req.path === "/held-sale/list" && body?.data?.list) {
        const mine = await localHeldList(Number(req.params.companyId));
        if (mine.length) res = { ...res, data: { ...body, data: { ...body.data, list: [...mine, ...body.data.list] } } };
      }
    } catch {
      /* keeping a copy must never break the request */
    }
    return res;
  };
}
