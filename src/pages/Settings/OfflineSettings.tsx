import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, CloudOff, Database, HardDrive, Laptop, RefreshCw, RotateCcw, ShieldCheck, Trash2, Wifi, WifiOff } from "lucide-react";
import { Layout } from "../../components/layout";
import { apiClient } from "../../services/apiClient";
import { useSessionAuthStore } from "../../stores/sessionAuthStore";
import { localStore, storeError, type ActionRow, type BackupInfo } from "../../offline/localStore";
import { checkConnection, discardAction, reloadPending, forgetThisDevice, listActions, refreshCatalog, registerThisDevice, retryAction, syncNow, useOfflineStore } from "../../offline/runtime";
import { formatDateTime } from "../../utils/dateUtils";
import { isTauri } from "../../services/tauriBridge";

const card = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm";
const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
const primary = `${btn} bg-primary-600 text-white hover:bg-primary-700`;
const secondary = `${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;
const danger = `${btn} border border-red-200 bg-red-50 text-red-700 hover:bg-red-100`;

const ISSUE_LABELS: Record<string, string> = {
  NEGATIVE_STOCK: "بيع بكمية أكبر من الرصيد",
  CREDIT_LIMIT: "تجاوز حد الائتمان للعميل",
  PRICE_CHANGED: "سعر مختلف عن سعر القائمة",
  DELETED_ITEM: "صنف أو عميل حُذف قبل وصول البيع",
  ROLE_CHANGED: "صلاحية المستخدم تغيرت",
  RECEIPT_NUMBER: "رقم الإيصال المطبوع للعميل يختلف عن المسجل",
  CLIENT_LINKED: "عميل جديد رُبط بعميل موجود بنفس الاسم",
};
const KIND_LABELS: Record<string, string> = {
  "sale.create": "بيع",
  "client.create": "عميل جديد",
  "shift.open": "فتح وردية",
  "shift.close": "إغلاق وردية",
  "shift.cash": "حركة نقدية",
};
const BACKUP_LABELS: Record<string, string> = {
  auto: "تلقائية",
  daily: "يومية",
  weekly: "أسبوعية",
  monthly: "شهرية",
  shift: "إغلاق وردية",
  exit: "عند الإغلاق",
  manual: "يدوية",
  "pre-restore": "قبل الاستعادة",
  "pre-migrate": "قبل التحديث",
  recovery: "استرجاع",
};

/** a destructive button that asks for a second click instead of a browser dialog */
const ConfirmButton: React.FC<{ label: string; confirm: string; onConfirm: () => void; disabled?: boolean; className?: string; icon?: React.ReactNode }> = ({ label, confirm, onConfirm, disabled, className = danger, icon }) => {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const t = setTimeout(() => setAsking(false), 4000);
    return () => clearTimeout(t);
  }, [asking]);
  return (
    <button
      type="button"
      disabled={disabled}
      className={asking ? `${btn} bg-red-600 text-white hover:bg-red-700` : className}
      onClick={() => {
        if (asking) {
          setAsking(false);
          onConfirm();
        } else setAsking(true);
      }}
    >
      {icon}
      {asking ? confirm : label}
    </button>
  );
};

const errMsg = (e: any) => e?.response?.data?.msg || e?.response?.data?.message || storeError(e);

const OfflineSettings: React.FC = () => {
  const s = useOfflineStore();
  const user = useSessionAuthStore(st => st.user);
  const company = useSessionAuthStore(st => st.company);
  const companyId: number = company?.companyId || company?.id;
  const role: string = user?.role || "CASHIER";
  const isManager = role === "ADMIN" || role === "MANAGER";
  const isOwner = role === "ADMIN";
  const canUseServer = s.online && !s.offlineSession;

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [issueTotal, setIssueTotal] = useState(0);
  const [queue, setQueue] = useState<ActionRow[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [pcName, setPcName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const thisPcHere = s.device && s.device.companyId === companyId;

  const loadServer = useCallback(async () => {
    if (!canUseServer || !companyId) return;
    try {
      const st: any = await apiClient.get("/sync/settings", { params: { companyId } });
      setEnabled(!!st?.data?.offlineEnabled);
      if (isManager) {
        const d: any = await apiClient.get("/sync/devices", { params: { companyId } });
        setDevices(d?.data ?? []);
        const iss: any = await apiClient.get("/sync/issues", { params: { companyId, open: true, limit: 50 } });
        setIssues(iss?.data?.list ?? []);
        setIssueTotal(iss?.data?.total ?? 0);
      }
    } catch (e) {
      console.warn("[offline settings]", errMsg(e));
    }
  }, [canUseServer, companyId, isManager]);

  const loadLocal = useCallback(async () => {
    if (!localStore) return;
    const [rejected, waiting] = await Promise.all([listActions("rejected", 100), listActions("pending", 100)]);
    setQueue([...rejected, ...waiting]);
    if (isTauri) setBackups(await localStore.backupList().catch(() => []));
  }, []);

  useEffect(() => {
    void loadServer();
  }, [loadServer]);
  useEffect(() => {
    void loadLocal();
  }, [loadLocal, s.counts.pending, s.counts.rejected]);

  const run = async (key: string, work: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await work();
      if (done) toast.success(done);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(null);
      void loadServer();
      void loadLocal();
    }
  };

  const toggleShop = () =>
    run("toggle", async () => {
      await apiClient.put("/sync/settings", { companyId, offlineEnabled: !enabled });
      setEnabled(!enabled);
      if (s.status === "ready") await refreshCatalog();
    }, !enabled ? "تم تفعيل البيع بدون إنترنت للمحل" : "تم إيقاف البيع بدون إنترنت. ما على الأجهزة من عمليات سيُرسل كالمعتاد");

  const register = () =>
    run("register", async () => {
      const name = pcName.trim();
      if (!name) throw new Error("اكتب اسماً لهذا الجهاز (مثل: كاشير 1)");
      const r: any = await apiClient.post("/sync/devices", { companyId, name });
      const { device, token } = r?.data ?? {};
      if (!device || !token) throw new Error("لم يرجع السيرفر بيانات الجهاز");
      await registerThisDevice({ id: device.id, code: device.code, name: device.name, companyId }, token);
      setPcName("");
    }, "تم تسجيل هذا الجهاز وتنزيل بيانات المحل");

  const pendingLocal = s.counts.pending;

  return (
    <Layout>
      <div className="w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">البيع بدون إنترنت</h1>
          <p className="mt-1 text-gray-600">
            عند انقطاع الإنترنت يستمر البيع على أجهزة الكاشير المسجلة، ويُرسل كل شيء للسيرفر تلقائياً عند عودة الاتصال، دون تكرار.
          </p>
        </div>

        {!s.available && (
          <div className={`${card} text-sm text-gray-700`}>
            البيع بدون إنترنت متاح في تطبيق SellX على الكمبيوتر. من المتصفح يمكنك فقط تفعيله للمحل وإدارة الأجهزة.
          </div>
        )}

        {/* ------------------------------------------------ this PC */}
        {s.available && (
          <div className={card}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`rounded-xl p-2.5 ${s.online ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>{s.online ? <Wifi className="h-6 w-6" /> : <WifiOff className="h-6 w-6" />}</div>
                <div>
                  <h2 className="font-semibold text-gray-900">هذا الجهاز</h2>
                  <p className="text-sm text-gray-600">
                    {s.online ? "متصل بالسيرفر" : "لا يوجد اتصال بالسيرفر"}
                    {s.device && ` · ${s.device.name} (حرف الإيصالات ${s.device.code})`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={secondary} onClick={() => void checkConnection()}>
                  <RefreshCw className="h-4 w-4" /> فحص الاتصال
                </button>
                {s.status === "ready" && (
                  <>
                    <button type="button" className={secondary} disabled={!s.online || s.syncing} onClick={() => run("sync", () => syncNow())}>
                      <RefreshCw className={`h-4 w-4 ${s.syncing ? "animate-spin" : ""}`} /> إرسال الآن
                    </button>
                    <button type="button" className={secondary} disabled={!s.online || busy === "catalog"} onClick={() => run("catalog", async () => { if (!(await refreshCatalog())) throw new Error("تعذر تنزيل بيانات المحل"); }, "تم تحديث بيانات المحل على هذا الجهاز")}>
                      <Database className="h-4 w-4" /> تحديث بيانات المحل
                    </button>
                  </>
                )}
              </div>
            </div>

            {s.status === "ready" || s.status === "revoked" ? (
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-gray-500">بانتظار الإرسال</dt>
                  <dd className="text-lg font-semibold text-gray-900">{pendingLocal}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">رفضها السيرفر</dt>
                  <dd className={`text-lg font-semibold ${s.counts.rejected ? "text-red-600" : "text-gray-900"}`}>{s.counts.rejected}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">آخر إرسال</dt>
                  <dd className="text-gray-900">{s.lastSyncAt ? formatDateTime(s.lastSyncAt) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">بيانات المحل على الجهاز</dt>
                  <dd className="text-gray-900">{s.catalogAt ? formatDateTime(s.catalogAt) : "لم تُنزّل بعد"}</dd>
                </div>
              </dl>
            ) : null}

            {s.status === "revoked" && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {s.lastSyncError || "تم إلغاء تسجيل هذا الجهاز."} {pendingLocal > 0 && `عليه ${pendingLocal} عملية لم تُرسل: سجّله من جديد بالأسفل وستُرسل تلقائياً.`}
              </p>
            )}

            {s.device && !thisPcHere && (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">هذا الجهاز مسجل لمحل آخر، فالبيع بدون إنترنت لا يعمل لهذا المحل عليه.</p>
            )}

            {/* register / re-register */}
            {(s.status === "unregistered" || s.status === "revoked") && (
              <div className="mt-5 border-t border-gray-100 pt-5">
                {!isManager ? (
                  <p className="text-sm text-gray-600">لتسجيل هذا الجهاز للبيع بدون إنترنت، يدخل المدير أو المالك على هذه الصفحة وهو متصل.</p>
                ) : !canUseServer ? (
                  <p className="text-sm text-gray-600">التسجيل يحتاج اتصالاً بالإنترنت.</p>
                ) : enabled === false ? (
                  <p className="text-sm text-gray-600">فعّل البيع بدون إنترنت للمحل أولاً (بالأسفل).</p>
                ) : (
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">اسم هذا الجهاز</span>
                      <input value={pcName} onChange={e => setPcName(e.target.value)} maxLength={60} placeholder="مثال: كاشير 1" className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                    </label>
                    <button type="button" className={primary} disabled={busy === "register"} onClick={register}>
                      <Laptop className="h-4 w-4" /> {busy === "register" ? "جاري التسجيل..." : "تسجيل هذا الجهاز"}
                    </button>
                    <p className="w-full text-xs text-gray-500">بعد التسجيل يُنزَّل المنتجات والعملاء والأسعار، ويمكن لكل من سجّل الدخول على هذا الجهاز وهو متصل أن يدخل عليه بدون إنترنت.</p>
                  </div>
                )}
              </div>
            )}

            {s.status === "ready" && isManager && (
              <div className="mt-5 flex justify-end border-t border-gray-100 pt-4">
                <ConfirmButton label="إلغاء تسجيل هذا الجهاز" confirm="اضغط مرة أخرى للتأكيد" disabled={pendingLocal > 0} onConfirm={() => run("forget", () => forgetThisDevice(), "تم إلغاء التسجيل على هذا الجهاز")} icon={<CloudOff className="h-4 w-4" />} />
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------ queue on this PC */}
        {s.available && queue.length > 0 && (
          <div id="queue" className={card}>
            <h2 className="font-semibold text-gray-900">عمليات هذا الجهاز التي لم تكتمل</h2>
            <p className="mt-1 text-sm text-gray-600">ما رفضه السيرفر لا يُرسل مرة أخرى حتى تراجعه: أعد المحاولة بعد حل السبب، أو احذفه إن لم يعد مطلوباً.</p>
            <div className="mt-4 divide-y divide-gray-100">
              {queue.map(a => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.status === "rejected" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>{a.status === "rejected" ? "مرفوضة" : "بانتظار الإرسال"}</span>
                  <span className="font-medium text-gray-900">{KIND_LABELS[a.kind] || a.kind}</span>
                  {a.body.receiptNumber && <span className="text-gray-600" dir="ltr">{a.body.receiptNumber}</span>}
                  {(a.body as any).view?.total !== undefined && <span className="text-gray-600">{(a.body as any).view.total}</span>}
                  <span className="text-gray-500">{formatDateTime(a.body.at)}</span>
                  {a.error?.msg && <span className="w-full text-red-700 sm:w-auto sm:flex-1">{a.error.msg}</span>}
                  {a.status === "rejected" && (
                    <div className="mr-auto flex gap-2">
                      <button type="button" className={secondary} onClick={() => run("retry", () => retryAction(a.id), "ستُرسل مرة أخرى")}>
                        <RotateCcw className="h-4 w-4" /> إعادة المحاولة
                      </button>
                      {isManager && <ConfirmButton label="حذف" confirm="تأكيد الحذف" onConfirm={() => run("discard", () => discardAction(a.id), "تم حذف العملية من هذا الجهاز")} icon={<Trash2 className="h-4 w-4" />} />}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ------------------------------------------------ the shop (owner) */}
        {canUseServer && enabled !== null && (
          <div className={card}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">البيع بدون إنترنت للمحل</h2>
                <p className="mt-1 text-sm text-gray-600">{enabled ? "مفعّل: الأجهزة المسجلة تستمر في البيع عند انقطاع الإنترنت." : "موقوف: عند انقطاع الإنترنت يتوقف البيع حتى يعود الاتصال."}</p>
              </div>
              {isOwner ? (
                <button type="button" className={enabled ? secondary : primary} disabled={busy === "toggle"} onClick={toggleShop}>
                  {enabled ? "إيقاف" : "تفعيل"}
                </button>
              ) : (
                <span className="text-sm text-gray-500">يغيّره المالك فقط</span>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------ registered PCs (manager) */}
        {canUseServer && isManager && devices.length > 0 && (
          <div className={card}>
            <h2 className="font-semibold text-gray-900">الأجهزة المسجلة</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-right text-gray-500">
                  <tr>
                    <th className="py-2 font-medium">الجهاز</th>
                    <th className="py-2 font-medium">حرف الإيصالات</th>
                    <th className="py-2 font-medium">آخر اتصال</th>
                    <th className="py-2 font-medium">ملاحظات مفتوحة</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {devices.map(d => (
                    <tr key={d.id} className={d.revokedAt ? "text-gray-400" : "text-gray-900"}>
                      <td className="py-2.5">
                        {d.name} {s.device?.id === d.id && <span className="mr-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">هذا الجهاز</span>}
                      </td>
                      <td className="py-2.5" dir="ltr">{d.code}</td>
                      <td className="py-2.5">{d.revokedAt ? "أُلغي تسجيله" : d.lastSeenAt ? formatDateTime(d.lastSeenAt) : "—"}</td>
                      <td className="py-2.5">{d.openIssues ?? 0}</td>
                      <td className="py-2.5 text-left">
                        {!d.revokedAt && (
                          <ConfirmButton label="إلغاء التسجيل" confirm="تأكيد: لن يرسل هذا الجهاز بعد الآن" onConfirm={() =>
                              run(
                                "revoke",
                                async () => {
                                  await apiClient.delete(`/sync/devices/${d.id}`, { params: { companyId } });
                                  if (d.id === s.device?.id) await refreshCatalog(); // this PC: show it as revoked now
                                },
                                "تم إلغاء تسجيل الجهاز"
                              )
                            } icon={<Trash2 className="h-4 w-4" />} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ------------------------------------------------ notes for the manager */}
        {canUseServer && isManager && (
          <div className={card}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">مبيعات بدون إنترنت تحتاج مراجعة {issueTotal > 0 && <span className="text-red-600">({issueTotal})</span>}</h2>
            </div>
            <p className="mt-1 text-sm text-gray-600">ما سمح به البيع بدون إنترنت ويختلف عن القواعد المعتادة، مثل البيع بكمية أكبر من الرصيد أو تجاوز حد الائتمان. البيع نفسه مسجل؛ راجعه ثم علّمه كتمت مراجعته.</p>
            {issues.length === 0 ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> لا يوجد ما يحتاج مراجعة
              </p>
            ) : (
              <div className="mt-4 divide-y divide-gray-100">
                {issues.map(i => (
                  <div key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <span className="font-medium text-gray-900">{ISSUE_LABELS[i.kind] || i.kind}</span>
                    {i.kind === "RECEIPT_NUMBER" && i.details?.recorded ? (
                      <span className="text-gray-700">
                        المطبوع <b dir="ltr">{i.details.printed}</b> مسجل باسم <b dir="ltr">{i.details.recorded}</b>
                      </span>
                    ) : (
                      i.label && <span className="text-gray-700">{i.label}</span>
                    )}
                    <span className="text-gray-500">
                      {i.device?.name ?? ""} · {i.user?.fullname ?? ""} · {formatDateTime(i.createdAt)}
                    </span>
                    <button type="button" className={`${secondary} mr-auto`} onClick={() => run("resolve", () => apiClient.put(`/sync/issues/${i.id}/resolve`, { companyId }))}>
                      <CheckCircle2 className="h-4 w-4" /> تمت المراجعة
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------ backups of the local database (desktop) */}
        {isTauri && s.available && (
          <div id="backups" className={card}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-gray-500" />
                <h2 className="font-semibold text-gray-900">النسخ الاحتياطي لقاعدة بيانات هذا الجهاز</h2>
              </div>
              <button type="button" className={secondary} disabled={busy === "backup"} onClick={() => run("backup", () => localStore!.backupNow("manual"), "تم عمل نسخة احتياطية وفحصها")}>
                نسخة احتياطية الآن
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              نسخة تلقائية كل 4 ساعات من العمل، ويومية وأسبوعية وشهرية، وعند إغلاق الوردية وإغلاق البرنامج. كل نسخة تُفحص قبل حفظها.
              {s.lastBackupAt && ` آخر نسخة: ${formatDateTime(s.lastBackupAt)}.`}
            </p>

            <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium text-gray-800">نسخة إضافية من سجل العمليات (فلاشة أو قرص آخر):</span>
                <span className="text-gray-600" dir="ltr">{s.journalMirror || "غير محدد"}</span>
                <button
                  type="button"
                  className={`${secondary} mr-auto`}
                  onClick={() =>
                    run("mirror", async () => {
                      const { open } = await import("@tauri-apps/plugin-dialog");
                      const dir = await open({ directory: true, title: "اختر مجلد النسخة الإضافية" });
                      if (typeof dir === "string") {
                        await localStore!.setMirror(dir);
                        await reloadPending();
                        toast.success("سيُنسخ كل بيع إلى هذا المجلد أيضاً");
                      }
                    })
                  }
                >
                  اختيار مجلد
                </button>
              </div>
            </div>

            {backups.length > 0 && (
              <div className="mt-4 max-h-72 divide-y divide-gray-100 overflow-y-auto">
                {backups.map(b => (
                  <div key={b.name} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{BACKUP_LABELS[b.label] || b.label}</span>
                    <span className="text-gray-700">{formatDateTime(b.createdAt)}</span>
                    <span className="text-gray-400">{(b.size / 1024).toFixed(0)} KB</span>
                    <span className="mr-auto">
                      <ConfirmButton
                        label="استعادة"
                        confirm="تأكيد: تُستعاد عند إعادة فتح البرنامج"
                        className={secondary}
                        onConfirm={() => run("restore", () => localStore!.backupRestore(b.name), "ستتم الاستعادة عند إعادة فتح البرنامج. العمليات المسجلة بعد النسخة تُعاد من السجل تلقائياً")}
                      />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default OfflineSettings;
