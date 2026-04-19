import React from 'react';
import { Receipt } from 'lucide-react';
import { Card, Input, Toggle, Select } from '../ui';
import { usePrinterConfigStore } from '../../stores/printerConfigStore';

export const ReceiptsTab: React.FC = () => {
  const config = usePrinterConfigStore();

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

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            💡 اختر عرض الورق المناسب لطابعتك. معظم طابعات الإيصالات تستخدم 80mm
          </p>
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
