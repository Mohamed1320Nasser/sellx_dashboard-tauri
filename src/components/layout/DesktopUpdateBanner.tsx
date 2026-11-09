import React from 'react';
import { AlertTriangle, Download, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useDesktopUpdate, type UpdatePhase } from '../../hooks/useDesktopUpdate';

const Version: React.FC<{ value: string }> = ({ value }) => (
  <span dir="ltr" className="font-semibold tabular-nums">{value}</span>
);

const Progress: React.FC<{ phase: UpdatePhase; percent: number | null }> = ({ phase, percent }) => (
  <div className="mt-3">
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/70">
      <div
        className={`h-full rounded-full bg-emerald-500 transition-all ${percent === null ? 'w-1/3 animate-pulse' : ''}`}
        style={percent === null ? undefined : { width: `${percent}%` }}
      />
    </div>
    <p className="mt-1 text-xs text-gray-600">
      {phase === 'installing'
        ? 'جارٍ التثبيت… سيُعاد تشغيل التطبيق تلقائياً'
        : <>جارٍ تنزيل التحديث{percent !== null && <> <span dir="ltr">{percent}%</span></>} — سيُعاد تشغيل التطبيق تلقائياً بعد التثبيت</>}
    </p>
  </div>
);

const Notes: React.FC<{ notes: string }> = ({ notes }) =>
  notes.trim() ? <p className="mt-2 whitespace-pre-line text-sm text-gray-700">{notes}</p> : null;

/** "New version available" banner of the desktop app; a blocking dialog for a mandatory update found at launch. */
const DesktopUpdateBanner: React.FC = () => {
  const { update, visible, blocking, phase, percent, error, install, postpone } = useDesktopUpdate();
  if (!update || !visible) return null;

  const working = phase === 'downloading' || phase === 'installing';
  const installButton = (
    <button
      type="button"
      onClick={() => void install()}
      disabled={working}
      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {working ? <Loader2 className="h-4 w-4 animate-spin" /> : phase === 'error' ? <RefreshCw className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      {working ? 'جارٍ التحديث…' : phase === 'error' ? 'إعادة المحاولة' : 'تحديث الآن'}
    </button>
  );
  const versionLine = (
    <p className="text-sm text-gray-700">
      الإصدار <Version value={update.version} /> (الحالي <Version value={update.currentVersion} />)
    </p>
  );

  if (blocking) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" dir="rtl" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-3 flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-lg font-bold">تحديث إلزامي مطلوب</h2>
          </div>
          {versionLine}
          <p className="mt-1 text-sm text-gray-600">يجب تثبيت هذا الإصدار لمتابعة استخدام التطبيق.</p>
          <Notes notes={update.notes} />
          {working && <Progress phase={phase} percent={percent} />}
          {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex justify-end">{installButton}</div>
        </div>
      </div>
    );
  }

  const tone = update.mandatory ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50';
  return (
    <div className={`mb-4 rounded-xl border p-4 ${tone}`} dir="rtl" role="status">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {update.mandatory
            ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            : <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />}
          <div>
            <p className="font-semibold text-gray-900">
              {update.mandatory ? 'تحديث إلزامي متاح — احفظ عملك ثم حدّث التطبيق' : 'إصدار جديد من التطبيق متاح'}
            </p>
            {versionLine}
            <Notes notes={update.notes} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {installButton}
          {!update.mandatory && !working && (
            <button
              type="button"
              onClick={postpone}
              className="rounded-lg px-3 py-2 text-sm text-gray-600 transition hover:bg-white/70"
            >
              لاحقاً
            </button>
          )}
        </div>
      </div>
      {working && <Progress phase={phase} percent={percent} />}
      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    </div>
  );
};

export default DesktopUpdateBanner;
