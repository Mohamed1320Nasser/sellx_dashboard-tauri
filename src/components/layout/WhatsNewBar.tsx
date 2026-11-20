import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { Modal } from '../ui';
import { APP_VERSION, entryOf, markVersionSeen, seenVersion } from '../../utils/appVersion';
import { formatTableDate } from '../../utils/dateUtils';

/**
 * After an update, a slim bar at the top of every page says so once: "updated to X — what's new".
 * It stays until the user closes it or opens the notes; then this device won't show it again
 * for this version.
 */
const WhatsNewBar: React.FC = () => {
  const entry = entryOf(APP_VERSION);
  const [hidden, setHidden] = useState(() => seenVersion() === APP_VERSION);
  const [open, setOpen] = useState(false);
  if (!entry || hidden) return null;

  const dismiss = () => {
    markVersionSeen();
    setHidden(true);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm text-primary-900">
        <Sparkles className="h-4 w-4 shrink-0 text-primary-600" />
        <span className="min-w-0 flex-1">
          تم التحديث إلى الإصدار <bdi className="font-semibold">{entry.version}</bdi>
          <span className="text-primary-700"> · {entry.items.length} تحسينات جديدة</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          ما الجديد؟
        </button>
        <button type="button" onClick={dismiss} className="rounded-lg p-1.5 text-primary-700 hover:bg-primary-100" aria-label="إغلاق" title="إغلاق">
          <X className="h-4 w-4" />
        </button>
      </div>

      <Modal
        isOpen={open}
        onClose={() => {
          setOpen(false);
          dismiss();
        }}
        title={`ما الجديد في الإصدار ${entry.version}`}
        size="md"
      >
        {entry.date && <p className="mb-3 text-xs text-gray-500">صدر في {formatTableDate(entry.date)}</p>}
        <ul className="space-y-2.5">
          {entry.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-6 text-gray-800">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
          <Link
            to="/settings/versions"
            onClick={() => {
              setOpen(false);
              dismiss();
            }}
            className="text-sm font-medium text-primary-700 hover:underline"
          >
            سجل الإصدارات
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              dismiss();
            }}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            تمام
          </button>
        </div>
      </Modal>
    </>
  );
};

export default WhatsNewBar;
