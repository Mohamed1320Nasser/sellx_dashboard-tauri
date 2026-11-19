import React, { useState } from 'react';
import { Zap, Scissors, Copy } from 'lucide-react';
import { Card, Input, Toggle } from '../ui';
import { usePrinterConfigStore } from '../../stores/printerConfigStore';
import { AFTER_SALE_OPTIONS, getAfterSaleMode, setAfterSaleMode, type AfterSaleMode } from '../../utils/afterSalePrint';

export const AutomationTab: React.FC = () => {
  const config = usePrinterConfigStore();
  const [afterSale, setAfterSale] = useState<AfterSaleMode>(() => getAfterSaleMode(config.autoPrintOnPayment));

  return (
    <div className="space-y-6 max-w-4xl">
      {/* After a sale (per device) */}
      <Card className="p-6">
        <div className="mb-4 flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-green-600">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">بعد إتمام البيع</h3>
            <p className="text-sm text-gray-600">
              ماذا يحدث بعد حفظ الفاتورة على <span className="font-semibold">هذا الجهاز</span>. كل جهاز يختار لنفسه: جهاز الكاشير بطابعة يطبع مباشرة،
              وجهاز بدون طابعة لا يطبع. يمكن تغييره أيضاً من زر الطابعة في شاشة البيع.
            </p>
          </div>
        </div>
        <div role="radiogroup" aria-label="بعد إتمام البيع" className="grid gap-3 sm:grid-cols-3">
          {AFTER_SALE_OPTIONS.map(o => {
            const selected = afterSale === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setAfterSaleMode(o.value);
                  setAfterSale(o.value);
                }}
                className={`rounded-xl border-2 p-4 text-right transition-colors ${
                  selected ? "border-primary-500 bg-primary-50" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <span className={`block text-sm font-semibold ${selected ? "text-primary-700" : "text-gray-900"}`}>{o.label}</span>
                <span className="mt-1 block text-xs text-gray-500">{o.description}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Auto Cut Paper */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Scissors className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-gray-900">
                قص الورق تلقائياً
              </h3>
              <Toggle
                enabled={config.autoCut}
                onChange={(enabled) => config.updateConfig({ autoCut: enabled })}
              />
            </div>
            <p className="text-sm text-gray-600 mb-3">
              قص الورق الحراري تلقائياً بعد الطباعة (يتطلب طابعة بها قاطع)
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                <span className="font-semibold">ℹ️ ملاحظة:</span> هذه الميزة تعمل فقط مع الطابعات التي تحتوي على قاطع ورق مدمج.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Print Copies */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Copy className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              عدد النسخ
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              عدد نسخ الفاتورة التي سيتم طباعتها (1-5)
            </p>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Input
                  type="number"
                  value={config.printCopies}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 1;
                    const copies = Math.min(Math.max(value, 1), 5);
                    config.updateConfig({ printCopies: copies });
                  }}
                  min="1"
                  max="5"
                  className="text-right text-center text-2xl font-bold"
                />
              </div>

              {/* Visual Copies Indicator */}
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => config.updateConfig({ printCopies: num })}
                    className={`
                      w-10 h-10 rounded-lg border-2 font-semibold transition-all
                      ${
                        config.printCopies >= num
                          ? 'border-purple-600 bg-purple-50 text-purple-700'
                          : 'border-gray-200 text-gray-400'
                      }
                    `}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs text-purple-800">
                <span className="font-semibold">📋 مثال:</span> نسخة للعميل + نسخة للمحاسبة + نسخة للأرشيف
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Summary Card */}
      <Card className="p-6 bg-gray-50 border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">ملخص الإعدادات</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">بعد البيع (هذا الجهاز):</span>
            <span className="font-semibold text-gray-800">
              {AFTER_SALE_OPTIONS.find(o => o.value === afterSale)!.label}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">قص الورق:</span>
            <span className={`font-semibold ${config.autoCut ? 'text-blue-600' : 'text-gray-400'}`}>
              {config.autoCut ? '✓ مفعّل' : '✗ معطل'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">عدد النسخ:</span>
            <span className="font-semibold text-purple-600">
              {config.printCopies} {config.printCopies === 1 ? 'نسخة' : 'نسخ'}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
};
