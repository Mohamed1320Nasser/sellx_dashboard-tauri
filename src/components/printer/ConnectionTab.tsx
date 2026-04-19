import React, { useState, useEffect } from 'react';
import { Cable, Wifi, TestTube, RefreshCw } from 'lucide-react';
import { Card, Input, Button } from '../ui';
import { usePrinterConfigStore } from '../../stores/printerConfigStore';
import { listSystemPrinters, testPrint } from '../../services/printService';
import toast from 'react-hot-toast';

export const ConnectionTab: React.FC = () => {
  const config = usePrinterConfigStore();
  const [printers, setPrinters] = useState<string[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);

  const loadPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const list = await listSystemPrinters();
      setPrinters(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Failed to load printers:', e);
    } finally {
      setLoadingPrinters(false);
    }
  };

  useEffect(() => {
    loadPrinters();
  }, []);

  const handleTestConnection = async () => {
    try {
      toast.loading('جاري اختبار الطباعة...', { id: 'test-print' });
      await testPrint();
      toast.dismiss('test-print');
      toast.success('✅ تم الاختبار بنجاح! تحقق من الطابعة');
    } catch (error: any) {
      toast.dismiss('test-print');
      console.error('Test print error:', error);
      toast.error('❌ ' + (error.message || 'فشل اختبار الطباعة'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Connection Type */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">نوع الاتصال</h3>

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => config.updateConfig({ connectionType: 'usb' })}
            className={`
              p-6 rounded-lg border-2 transition-all flex flex-col items-center gap-3
              ${
                config.connectionType === 'usb'
                  ? 'border-primary-600 bg-primary-50 text-primary-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }
            `}
          >
            <Cable className="w-8 h-8" />
            <div className="text-center">
              <div className="font-semibold">USB</div>
              <div className="text-xs text-gray-500 mt-1">اتصال مباشر</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => config.updateConfig({ connectionType: 'lan' })}
            className={`
              p-6 rounded-lg border-2 transition-all flex flex-col items-center gap-3
              ${
                config.connectionType === 'lan'
                  ? 'border-primary-600 bg-primary-50 text-primary-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }
            `}
          >
            <Wifi className="w-8 h-8" />
            <div className="text-center">
              <div className="font-semibold">LAN (شبكة)</div>
              <div className="text-xs text-gray-500 mt-1">طابعة شبكة</div>
            </div>
          </button>
        </div>
      </Card>

      {/* Network Settings (only for LAN) */}
      {config.connectionType === 'lan' && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">إعدادات الشبكة</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                عنوان IP
              </label>
              <Input
                value={config.ipAddress}
                onChange={(e) => config.updateConfig({ ipAddress: e.target.value })}
                placeholder="192.168.1.50"
                className="text-right"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                المنفذ (Port)
              </label>
              <Input
                type="number"
                value={config.port}
                onChange={(e) => config.updateConfig({ port: parseInt(e.target.value) || 9100 })}
                placeholder="9100"
                className="text-right"
              />
              <p className="text-sm text-gray-500 mt-2">
                المنفذ الافتراضي للطابعات الحرارية: 9100
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Test Connection */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-blue-900 mb-1">
              اختبار الاتصال
            </h3>
            <p className="text-sm text-blue-700">
              تحقق من الاتصال بالطابعة وطباعة صفحة اختبار
            </p>
          </div>
          <Button
            onClick={handleTestConnection}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            <TestTube className="w-5 h-5" />
            اختبار
          </Button>
        </div>
      </Card>
    </div>
  );
};
