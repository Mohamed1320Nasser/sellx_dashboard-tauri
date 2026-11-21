import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, CloudOff, CloudUpload, LogIn, ShieldAlert, WifiOff } from "lucide-react";
import { canWorkOffline, syncNow, useOfflineStore } from "../../offline/runtime";
import { useSessionAuthStore } from "../../stores/sessionAuthStore";
import { formatDateTime } from "../../utils/dateUtils";

/** Pages that work on this PC without internet; the rest show OfflinePagePanel */
export const OFFLINE_PAGES = ["/sales/create", "/shifts", "/settings/offline", "/settings/printer", "/settings/app-config"];

const plural = (n: number) => (n === 1 ? "عملية واحدة" : n === 2 ? "عمليتان" : `${n} عمليات`);

/** One line at the top of every page: offline, sending, refused actions, problems with this PC */
export const OfflineBar: React.FC = () => {
  const s = useOfflineStore();
  const navigate = useNavigate();
  const logout = useSessionAuthStore(st => st.logout);
  const [noteClosed, setNoteClosed] = useState(false);
  if (!s.available || s.status === "off" || s.status === "unregistered") return null;

  const ready = canWorkOffline();
  const local = ready && (!s.online || s.offlineSession);
  const rows: React.ReactNode[] = [];

  if (s.startNote && !noteClosed) {
    rows.push(
      <div key="note" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">{s.startNote}</span>
        <button type="button" onClick={() => setNoteClosed(true)} className="text-xs font-medium underline">
          إخفاء
        </button>
      </div>
    );
  }

  if (s.status === "revoked") {
    rows.push(
      <div key="revoked" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          {s.lastSyncError || "تم إلغاء تسجيل هذا الجهاز للبيع بدون إنترنت"}
          {s.counts.pending > 0 && ` · عليه ${plural(s.counts.pending)} لم تُرسل: سجّله من جديد لإرسالها`}
        </span>
        <Link to="/settings/offline" className="text-xs font-medium underline">
          الإعدادات
        </Link>
      </div>
    );
  } else if (local && !s.online) {
    rows.push(
      <div key="offline" className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          <b>لا يوجد اتصال بالسيرفر.</b> البيع مستمر على هذا الجهاز
          {s.counts.pending > 0 ? ` · ${plural(s.counts.pending)} بانتظار الإرسال` : ""}
          {s.catalogAt && ` · بيانات المحل من ${formatDateTime(s.catalogAt)}`}
        </span>
      </div>
    );
  } else if (s.offlineSession && s.online) {
    rows.push(
      <div key="relogin" className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <LogIn className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          عاد الاتصال{s.counts.pending > 0 ? ` وجاري إرسال ${plural(s.counts.pending)}` : " وتم إرسال كل العمليات"}. سجّل الدخول من جديد لفتح باقي الصفحات
        </span>
        <button
          type="button"
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          تسجيل الدخول
        </button>
      </div>
    );
  } else if (s.counts.pending > 0) {
    rows.push(
      <div key="sending" className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <CloudUpload className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          {s.syncing ? "جاري إرسال" : "بانتظار إرسال"} {plural(s.counts.pending)} سُجّلت بدون إنترنت
          {s.lastSyncError && !s.syncing ? ` · آخر محاولة: ${s.lastSyncError}` : ""}
        </span>
        {!s.syncing && (
          <button type="button" onClick={() => void syncNow()} className="text-xs font-medium underline">
            إرسال الآن
          </button>
        )}
      </div>
    );
  }

  if (s.counts.rejected > 0) {
    rows.push(
      <div key="rejected" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">رفض السيرفر {plural(s.counts.rejected)} من هذا الجهاز وتحتاج مراجعة</span>
        <Link to="/settings/offline#queue" className="text-xs font-medium underline">
          مراجعة
        </Link>
      </div>
    );
  }

  if (s.mirrorError) {
    rows.push(
      <div key="mirror" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">تعذر نسخ سجل العمليات إلى مجلد النسخة الإضافية (هل الفلاشة موصولة؟). البيع مستمر والسجل محفوظ على الجهاز</span>
        <Link to="/settings/offline#backups" className="text-xs font-medium underline">
          الإعدادات
        </Link>
      </div>
    );
  }

  if (!rows.length) return null;
  return <div className="mb-3 space-y-2">{rows}</div>;
};

/** Shown instead of a page that needs the server, while working offline */
export const OfflinePagePanel: React.FC = () => {
  const offlineSession = useOfflineStore(s => s.offlineSession);
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <CloudOff className="mx-auto h-12 w-12 text-amber-500" />
      <h2 className="mt-4 text-lg font-bold text-gray-900">هذه الصفحة تحتاج اتصال بالإنترنت</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        {offlineSession
          ? "دخلت بدون إنترنت، فالمتاح الآن هو نقطة البيع والورديات. ستفتح باقي الصفحات بعد تسجيل الدخول وأنت متصل."
          : "يمكنك الاستمرار في البيع وفتح وإغلاق الوردية وإضافة العملاء، وكل ذلك يُرسل تلقائياً عند عودة الاتصال."}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link to="/sales/create" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
          نقطة البيع
        </Link>
        <Link to="/settings/offline" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          حالة البيع بدون إنترنت
        </Link>
      </div>
    </div>
  );
};

/** true while pages that need the server must be replaced by OfflinePagePanel */
export function usePageNeedsInternet(pathname: string) {
  const s = useOfflineStore();
  const local = s.status === "ready" && canWorkOffline() && (!s.online || s.offlineSession);
  return local && !OFFLINE_PAGES.some(p => pathname === p || pathname.startsWith(p + "/"));
}
