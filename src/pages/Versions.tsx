import React from 'react';
import { CheckCircle2, History, Monitor } from 'lucide-react';
import { Layout } from '../components/layout';
import { APP_VERSION, CHANGELOG } from '../utils/appVersion';
import { formatTableDate } from '../utils/dateUtils';
import { isTauri } from '../services/tauriBridge';

/** Version history: the version this device runs, and what every version changed */
const Versions: React.FC = () => (
  <Layout>
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <History className="h-6 w-6 text-primary-600" />
          سجل الإصدارات
        </h1>
        <p className="mt-1 text-sm text-gray-600">ما تغيّر في كل إصدار من SellX</p>
      </div>

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <Monitor className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-500">الإصدار الذي تعمل عليه</p>
          <p className="text-xl font-bold text-gray-900" dir="ltr" style={{ textAlign: 'right' }}>
            {APP_VERSION}
          </p>
        </div>
        <p className="text-xs text-gray-500">
          {isTauri ? 'يبحث التطبيق عن تحديث عند فتحه وكل 4 ساعات، ويظهر لك تنبيه عند وجوده.' : 'نسخة الويب تتحدّث تلقائياً.'}
        </p>
      </section>

      <ol className="relative space-y-4 border-r-2 border-gray-200 pr-6">
        {CHANGELOG.map(entry => {
          const current = entry.version === APP_VERSION;
          return (
            <li key={entry.version} className="relative">
              <span
                className={`absolute -right-[33px] top-5 h-4 w-4 rounded-full ring-4 ring-gray-50 ${current ? 'bg-primary-600' : 'bg-gray-300'}`}
              />
              <article className={`rounded-2xl border bg-white p-5 shadow-sm ${current ? 'border-primary-200' : 'border-gray-200'}`}>
                <header className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-gray-900" dir="ltr">
                    {entry.version}
                  </h2>
                  {current && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> الإصدار الحالي
                    </span>
                  )}
                  <span className="mr-auto text-xs text-gray-500">{entry.date ? formatTableDate(entry.date) : 'قيد الإصدار'}</span>
                </header>
                <ul className="space-y-2">
                  {entry.items.map((item, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-6 text-gray-700">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  </Layout>
);

export default Versions;
