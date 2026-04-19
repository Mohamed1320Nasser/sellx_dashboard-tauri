import React, { useState } from 'react';
import { TestTube, Receipt, Tag } from 'lucide-react';
import { Card, Button } from '../ui';
import { usePrinterConfigStore } from '../../stores/printerConfigStore';
import { printBarcode } from '../../services/smartPrintService';
import { testPrint } from '../../services/printService';
import toast from 'react-hot-toast';

export const TestTab: React.FC = () => {
  const config = usePrinterConfigStore();
  const [isTesting, setIsTesting] = useState<'receipt' | 'barcode' | null>(null);

  const handleTestReceipt = async () => {
    setIsTesting('receipt');
    try {
      toast.loading('جاري طباعة فاتورة تجريبية...', { id: 'test-receipt' });
      await testPrint();
      toast.success('✅ تم إرسال الفاتورة التجريبية للطباعة', { id: 'test-receipt' });
    } catch (error: any) {
      console.error('Test receipt error:', error);
      toast.error('❌ ' + (error.message || 'فشلت طباعة الفاتورة'), { id: 'test-receipt' });
    } finally {
      setIsTesting(null);
    }
  };

  const handleTestBarcode = async () => {
    setIsTesting('barcode');
    try {
      toast.loading('جاري طباعة ملصق باركود تجريبي...', { id: 'test-barcode' });
      await printBarcode({
        barcode: 'TEST-123456',
        productName: 'منتج تجريبي / Test Product',
        price: 99.99,
      }, 1);
      toast.success('✅ تم إرسال الملصق التجريبي للطباعة', { id: 'test-barcode' });
    } catch (error: any) {
      console.error('Test barcode error:', error);
      toast.error('❌ ' + (error.message || 'فشلت طباعة الباركود'), { id: 'test-barcode' });
    } finally {
      setIsTesting(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header Info */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <TestTube className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              اختبار الطباعة
            </h3>
            <p className="text-sm text-gray-600">
              تحقق من إعدادات الطابعة عن طريق طباعة تجريبية للفاتورة أو الباركود
            </p>
          </div>
        </div>
      </Card>

      {/* Test Receipt Button */}
      <Card className="p-6 hover:shadow-lg transition-shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
              <Receipt className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                طباعة فاتورة تجريبية
              </h3>
              <p className="text-sm text-gray-600">
                اختبار طباعة الفواتير باستخدام طابعة الإيصالات المعينة
              </p>
              <div className="mt-2 text-xs text-gray-500">
                الطابعة: {config.getPrinterForType('receipt') || 'غير محدد'}
              </div>
            </div>
          </div>
          <Button
            onClick={handleTestReceipt}
            disabled={isTesting === 'receipt'}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 flex items-center gap-2"
          >
            <Receipt className="w-5 h-5" />
            {isTesting === 'receipt' ? 'جاري الطباعة...' : 'طباعة فاتورة'}
          </Button>
        </div>
      </Card>

      {/* Test Barcode Button */}
      <Card className="p-6 hover:shadow-lg transition-shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Tag className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                طباعة باركود تجريبي
              </h3>
              <p className="text-sm text-gray-600">
                اختبار طباعة الباركود باستخدام طابعة الملصقات المعينة
              </p>
              <div className="mt-2 flex flex-col gap-1">
                <div className="text-xs text-gray-500">
                  الطابعة: {config.getPrinterForType('barcode') || 'غير محدد'}
                </div>
                {config.useNativeUsb && config.usbVendorId && config.usbProductId && (
                  <div className="text-xs text-purple-600 font-medium">
                    ✓ USB مباشر مفعّل (VID: {config.usbVendorId}, PID: {config.usbProductId})
                  </div>
                )}
              </div>
            </div>
          </div>
          <Button
            onClick={handleTestBarcode}
            disabled={isTesting === 'barcode'}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 flex items-center gap-2"
          >
            <Tag className="w-5 h-5" />
            {isTesting === 'barcode' ? 'جاري الطباعة...' : 'طباعة باركود'}
          </Button>
        </div>
      </Card>

      {/* Instructions */}
      <Card className="p-6 bg-yellow-50 border-yellow-200">
        <div className="flex items-start gap-3">
          <div className="text-2xl">💡</div>
          <div>
            <h4 className="font-semibold text-yellow-900 mb-2">نصائح الاختبار</h4>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              <li>تأكد من تعيين الطابعات في تبويب "تعيين الطابعات"</li>
              <li>تأكد من توصيل الطابعة وتشغيلها</li>
              <li>للطباعة عبر USB المباشر، تأكد من تفعيلها في تبويب "USB المباشر"</li>
              <li>احفظ الإعدادات قبل الطباعة التجريبية</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
};
