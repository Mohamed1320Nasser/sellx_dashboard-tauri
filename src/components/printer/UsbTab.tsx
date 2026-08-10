/**
 * USB Printer Detection Tab
 *
 * Allows users to:
 * - Detect connected USB printers
 * - Select barcode printer from list
 * - Automatically configure VID/PID
 * - Enable native USB printing (TSPL)
 */

import React, { useState } from 'react';
import { Card, Button } from '../ui';
import { Usb, Search, Check, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { usePrinterConfigStore } from '../../stores/printerConfigStore';
import toast from 'react-hot-toast';

interface UsbDevice {
  vid: string;
  pid: string;
  name: string;
  fullString: string;
}

export function UsbTab() {
  const config = usePrinterConfigStore();
  const [isDetecting, setIsDetecting] = useState(false);
  const [usbDevices, setUsbDevices] = useState<UsbDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<UsbDevice | null>(null);

  // Detect platform
  const isWindows = typeof window !== 'undefined' && navigator.userAgent.includes('Windows');

  const handleDetectUSB = async () => {
    setIsDetecting(true);
    try {
      console.log('[USB] Detecting USB devices...');
      const devices = await invoke<string[]>('list_usb_devices');
      console.log('[USB] Found devices:', devices);

      // Parse devices
      // Windows: "Printer: Xprinter XP-360B"
      // macOS/Linux: "VID: 0x1FC9, PID: 0x2016 - Printer-80"
      const parsed = devices.map((deviceStr) => {
        // Check if it's a Windows printer (starts with "Printer:")
        if (deviceStr.startsWith('Printer:')) {
          const printerName = deviceStr.replace('Printer:', '').trim();
          return {
            vid: '',
            pid: '',
            name: printerName,
            fullString: deviceStr,
          };
        }

        // Otherwise parse as USB device (macOS/Linux)
        const vidMatch = deviceStr.match(/VID:\s*(0x[0-9A-Fa-f]+)/);
        const pidMatch = deviceStr.match(/PID:\s*(0x[0-9A-Fa-f]+)/);
        const nameMatch = deviceStr.match(/-\s*(.+)$/);

        return {
          vid: vidMatch ? vidMatch[1] : '',
          pid: pidMatch ? pidMatch[1] : '',
          name: nameMatch ? nameMatch[1].trim() : 'Unknown Device',
          fullString: deviceStr,
        };
      }).filter(d => d.name); // Keep all devices with a name

      setUsbDevices(parsed);
      toast.success(`تم العثور على ${parsed.length} جهاز USB`);

      // Auto-select if VID/PID already configured
      if (config.usbVendorId && config.usbProductId) {
        const current = parsed.find(
          d => d.vid === config.usbVendorId && d.pid === config.usbProductId
        );
        if (current) {
          setSelectedDevice(current);
        }
      }
    } catch (error: any) {
      console.error('[USB] Detection failed:', error);
      toast.error(`فشل الكشف عن أجهزة USB: ${error}`);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSelectDevice = (device: UsbDevice) => {
    setSelectedDevice(device);

    // On Windows: Set printer assignment directly (Windows uses printer name, not VID/PID)
    if (isWindows && device.name) {
      config.updatePrinterAssignment('barcode', device.name);
      config.updateConfig({ useNativeUsb: true });
      toast.success(`تم تعيين طابعة الباركود: ${device.name}`);
    } else {
      // On macOS/Linux: Save VID/PID
      config.updateConfig({
        usbVendorId: device.vid,
        usbProductId: device.pid,
      });
      toast.success(`تم اختيار: ${device.name}`);
    }
  };

  const handleToggleNativeUSB = (enabled: boolean) => {
    // Windows selects a printer by name (winspool); macOS/Linux needs VID/PID.
    const missingSelection = isWindows
      ? !config.getPrinterForType('barcode')
      : !config.usbVendorId || !config.usbProductId;

    if (enabled && missingSelection) {
      toast.error('الرجاء اكتشاف واختيار طابعة USB أولاً');
      return;
    }
    config.updateConfig({ useNativeUsb: enabled });
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
        <div className="flex items-start space-x-4 space-x-reverse">
          <div className="p-3 bg-blue-100 rounded-lg">
            <Usb className="w-8 h-8 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              الطباعة المباشرة عبر USB (TSPL)
            </h3>
            <p className="text-sm text-gray-700">
              للطباعة المباشرة على طابعات الباركود (Xprinter, TSC, Zebra) بدون استخدام نظام الطباعة.
              هذه الطريقة أسرع وأكثر موثوقية لطباعة الباركود.
            </p>
          </div>
        </div>
      </Card>

      {/* Enable Native USB Toggle */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h4 className="text-base font-semibold text-gray-900 mb-1">
              تفعيل الطباعة المباشرة عبر USB
            </h4>
            <p className="text-sm text-gray-600">
              استخدام أوامر TSPL لطباعة الباركود مباشرة على الطابعة
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.useNativeUsb}
              onChange={(e) => handleToggleNativeUSB(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:right-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        {config.useNativeUsb && (!config.usbVendorId || !config.usbProductId) && (
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start space-x-3 space-x-reverse">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-800">
              الطباعة المباشرة مفعلة لكن لم يتم تكوين الطابعة. الرجاء اكتشاف واختيار طابعة USB أدناه.
            </p>
          </div>
        )}
      </Card>

      {/* Windows Instructions */}
      {isWindows && (
        <Card className="p-6 bg-blue-50 border-blue-200">
          <div className="flex items-start space-x-3 space-x-reverse">
            <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0" />
            <div>
              <h4 className="text-base font-semibold text-gray-900 mb-2">
                مستخدمي Windows
              </h4>
              <p className="text-sm text-gray-700">
                تأكد من تثبيت تعريف الطابعة من الشركة المصنعة. سيتم استخدام الطباعة المباشرة عبر Windows Printing API.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* USB Detection Section */}
      <Card className="p-6">
        <h4 className="text-base font-semibold text-gray-900 mb-4">
          اكتشاف طابعات USB
        </h4>

        <Button
          onClick={handleDetectUSB}
          disabled={isDetecting}
          className="w-full mb-4"
        >
          <Search className="w-5 h-5 ml-2" />
          {isDetecting ? 'جاري البحث...' : 'اكتشاف الطابعات المتصلة'}
        </Button>

        {/* Device List */}
        {usbDevices.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 mb-3">
              تم العثور على {usbDevices.length} جهاز. اختر طابعة الباركود:
            </p>

            {usbDevices.map((device, index) => {
              const isSelected = selectedDevice?.vid === device.vid &&
                                selectedDevice?.pid === device.pid;
              const isConfigured = config.usbVendorId === device.vid &&
                                   config.usbProductId === device.pid;

              return (
                <div
                  key={index}
                  onClick={() => handleSelectDevice(device)}
                  className={`
                    p-4 rounded-lg border-2 cursor-pointer transition-all
                    ${isSelected || isConfigured
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-25'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 mb-1">
                        {device.name}
                      </p>
                      <p className="text-sm font-mono text-gray-600">
                        VID: {device.vid} | PID: {device.pid}
                      </p>
                    </div>
                    {(isSelected || isConfigured) && (
                      <Check className="w-6 h-6 text-blue-600" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {usbDevices.length === 0 && !isDetecting && (
          <div className="text-center py-8 text-gray-500">
            <Usb className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              لم يتم اكتشاف أي أجهزة. انقر على "اكتشاف الطابعات المتصلة" للبدء.
            </p>
          </div>
        )}
      </Card>

      {/* Current Configuration */}
      {config.usbVendorId && config.usbProductId && (
        <Card className="p-6 bg-green-50 border-green-200">
          <h4 className="text-base font-semibold text-green-900 mb-3">
            ✓ الإعدادات الحالية
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-green-700">USB Vendor ID:</span>
              <span className="font-mono text-green-900">{config.usbVendorId}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-green-700">USB Product ID:</span>
              <span className="font-mono text-green-900">{config.usbProductId}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-green-700">الطباعة المباشرة:</span>
              <span className="font-semibold text-green-900">
                {config.useNativeUsb ? 'مفعّلة ✓' : 'معطّلة'}
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Help Section */}
      <Card className="p-6 bg-gray-50">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">
          ℹ️ معلومات مهمة
        </h4>
        <ul className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start space-x-2 space-x-reverse">
            <span className="text-blue-600 font-bold">•</span>
            <span>تأكد من توصيل طابعة الباركود عبر USB قبل الاكتشاف</span>
          </li>
          <li className="flex items-start space-x-2 space-x-reverse">
            <span className="text-blue-600 font-bold">•</span>
            <span>تعمل الطباعة المباشرة مع طابعات: Xprinter, TSC, Zebra</span>
          </li>
          <li className="flex items-start space-x-2 space-x-reverse">
            <span className="text-blue-600 font-bold">•</span>
            <span>تأكد من أن الطابعة في وضع الباركود (Barcode Mode)</span>
          </li>
          <li className="flex items-start space-x-2 space-x-reverse">
            <span className="text-blue-600 font-bold">•</span>
            <span>لا تنسَ حفظ الإعدادات بعد التكوين</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
