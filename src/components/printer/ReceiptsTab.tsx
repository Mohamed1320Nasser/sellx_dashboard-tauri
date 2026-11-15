import React, { useState } from 'react';
import { Receipt, AlertTriangle, Ruler } from 'lucide-react';
import toast from 'react-hot-toast';
import { guessPaperWidth, testPrint } from '../../services/printService';
import { Card, Input, Toggle, Select } from '../ui';
import { usePrinterConfigStore } from '../../stores/printerConfigStore';

export const ReceiptsTab: React.FC = () => {
  const config = usePrinterConfigStore();
  const [testing, setTesting] = useState(false);
  const receiptPrinter = config.getPrinterForType('receipt');
  const guessed = guessPaperWidth(receiptPrinter);
  const mismatch = guessed && guessed !== config.paperWidth;

  const handleWidthTest = async () => {
    setTesting(true);
    toast.loading('جاري طباعة اختبار العرض...', { id: 'width-test' });
    try {
      await testPrint();
      toast.success('تم الإرسال للطابعة - تأكد أن الإطار ظاهر كاملًا', { id: 'width-test' });
    } catch (error: any) {
      toast.error(error?.message || 'فشلت الطباعة', { id: 'width-test' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Paper Width */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
            <Receipt className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            عرض الورق
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => config.updateConfig({ paperWidth: '80mm' })}
            className={`
              p-4 rounded-lg border-2 transition-all text-center
              ${
                config.paperWidth === '80mm'
                  ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }
            `}
          >
            <div className="text-2xl font-bold">80mm</div>
            <div className="text-xs text-gray-500 mt-1">قياسي (موصى به)</div>
          </button>

          <button
            type="button"
            onClick={() => config.updateConfig({ paperWidth: '58mm' })}
            className={`
              p-4 rounded-lg border-2 transition-all text-center
              ${
                config.paperWidth === '58mm'
                  ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }
            `}
          >
            <div className="text-2xl font-bold">58mm</div>
            <div className="text-xs text-gray-500 mt-1">صغير</div>
          </button>
        </div>

        {mismatch && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              اسم الطابعة <b dir="ltr">{receiptPrinter}</b> يدل على ورق {guessed}، والمختار {config.paperWidth}.
              إذا ظهرت الفاتورة مقطوعة من الجانب فاختر {guessed}.{' '}
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => config.updateConfig({ paperWidth: guessed! })}
              >
                استخدم {guessed}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-blue-800">
            💡 اختر عرض الورق المناسب لطابعتك، ثم اطبع اختبار العرض: يجب أن يظهر الإطار كاملًا.
          </p>
          <button
            type="button"
            onClick={handleWidthTest}
            disabled={testing || !receiptPrinter}
            title={receiptPrinter ? '' : 'اختر طابعة الفواتير أولًا'}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-blue-700 bg-white border border-blue-300 rounded-lg hover:bg-blue-100 disabled:opacity-50"
          >
            <Ruler className="w-4 h-4" />
            {testing ? 'جاري الطباعة...' : 'طباعة اختبار العرض'}
          </button>
        </div>
      </Card>

      {/* A4 invoice */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">فاتورة A4 وملف PDF</h3>
        <p className="text-sm text-gray-500 mb-4">تظهر على فاتورة A4 وعروض الأسعار وملفات PDF فقط، وليس على الإيصال الحراري.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">رقم السجل التجاري</label>
            <Input
              value={config.commercialRegister}
              onChange={(e) => config.updateConfig({ commercialRegister: e.target.value })}
              placeholder="مثال: 123456"
              maxLength={60}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">الشروط والأحكام</label>
            <textarea
              value={config.invoiceTerms}
              onChange={(e) => config.updateConfig({ invoiceTerms: e.target.value })}
              rows={4}
              maxLength={2000}
              placeholder={"مثال:\n- البضاعة المباعة ترد أو تستبدل خلال 14 يومًا بحالتها الأصلية مع الفاتورة.\n- الأسعار شاملة ضريبة القيمة المضافة."}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="text-xs text-gray-500 mt-1">كل سطر يظهر في سطر مستقل أسفل الفاتورة. اتركه فارغًا لإخفاء القسم.</p>
          </div>
        </div>
      </Card>

      {/* Receipt Content */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">محتوى الفاتورة</h3>

        <div className="space-y-4">
          {/* Header Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              نص العنوان (Header)
            </label>
            <Input
              value={config.headerText}
              onChange={(e) => config.updateConfig({ headerText: e.target.value })}
              placeholder="نص اختياري يظهر في أعلى الفاتورة"
              className="text-right"
            />
            <p className="text-xs text-gray-500 mt-1">
              مثال: "عروض خاصة - خصم 10% على جميع المنتجات"
            </p>
          </div>

          {/* Footer Text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              نص التذييل (Footer)
            </label>
            <Input
              value={config.footerText}
              onChange={(e) => config.updateConfig({ footerText: e.target.value })}
              placeholder="شكراً لزيارتكم"
              className="text-right"
            />
            <p className="text-xs text-gray-500 mt-1">
              رسالة الشكر أو معلومات إضافية
            </p>
          </div>

          {/* QR Code Toggle */}
          <div className="pt-4 border-t border-gray-200">
            <Toggle
              enabled={config.showQrCode}
              onChange={(enabled) => config.updateConfig({ showQrCode: enabled })}
              label="رمز QR"
              description="إظهار رمز QR للفواتير الإلكترونية (ZATCA)"
            />
          </div>
        </div>
      </Card>

      {/* Info Note */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <div className="text-2xl">ℹ️</div>
          <div>
            <h4 className="font-semibold text-blue-900 mb-1">ملاحظة</h4>
            <p className="text-sm text-blue-800">
              هذه الإعدادات تؤثر على جميع أنواع الفواتير: فواتير المبيعات، فواتير المشتريات، عروض الأسعار، وإيصالات الدفع.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};
