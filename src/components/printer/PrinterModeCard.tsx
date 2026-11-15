import React from 'react';
import { Repeat } from 'lucide-react';
import { Card } from '../ui';
import { usePrinterConfigStore } from '../../stores/printerConfigStore';
import {
  usePrinterModeStore,
  sameAssignedPrinter,
  setSharedPrinter,
  setLastPrintMode,
} from '../../services/printerModeService';

/** Settings for one printer that switches between receipts and barcode labels (stored on this computer) */
export const PrinterModeCard: React.FC = () => {
  const settings = usePrinterModeStore((s) => s.settings);
  // re-render when the assignments change
  usePrinterConfigStore((s) => s.printerAssignments);
  const auto = sameAssignedPrinter();
  const shared = settings.shared ?? auto;
  const modeLabel =
    settings.lastMode === 'label' ? 'ملصقات باركود' : settings.lastMode === 'receipt' ? 'إيصالات' : 'غير معروف';

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <Repeat className="w-5 h-5" />
        </div>
        <div className="flex-1 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4"
              checked={shared}
              onChange={(e) => setSharedPrinter(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">
                طابعة واحدة للإيصالات والملصقات (تتحول بين الوضعين يدويًا)
              </span>
              <span className="block text-xs text-gray-600 mt-1 leading-5">
                الطابعة لا تخبر البرنامج بوضعها الحالي، لذلك يتذكر البرنامج آخر وضع طبع به. عند طباعة ملصقات بعد إيصال
                (أو العكس) سيطلب منك تحويل الطابعة أولًا، فلا يضيع ورق.
              </span>
              {settings.shared === null && auto && (
                <span className="block text-xs text-amber-700 mt-1">
                  تم التفعيل تلقائيًا لأن نفس الطابعة معيّنة للفواتير والباركود.
                </span>
              )}
            </span>
          </label>

          {shared && (
            <div className="flex flex-wrap items-center gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-gray-600">
                الوضع حسب آخر طباعة: <b className="text-gray-900">{modeLabel}</b>
              </span>
              {settings.lastMode && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setLastPrintMode(null)}
                >
                  غيّرت الوضع يدويًا؟ اسألني في الطباعة القادمة
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
