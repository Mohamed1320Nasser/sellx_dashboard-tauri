/**
 * Printer Assignment Tab - Like Sultana's PrinterSettings
 * Implements the complete load → assign → save cycle
 */

import React, { useState, useEffect } from 'react';
import { RefreshCw, Printer, Info, Receipt, ShoppingCart, Tag, FileText, CreditCard, Check } from 'lucide-react';
import { Card, Select } from '../ui';
import { usePrinterConfigStore, type PrinterType } from '../../stores/printerConfigStore';
import { listSystemPrinters } from '../../services/printService';
import {
  getPrinterTypeDisplayName,
  savePrinterAssignments,
  type PrinterAssignments,
} from '../../services/printerAssignmentService';
import toast from 'react-hot-toast';
import { PrinterModeCard } from './PrinterModeCard';

// Printer types with Arabic labels and icons (like Sultana's PRINTER_ROLES)
const PRINTER_TYPES: {
  type: PrinterType;
  label: string;
  description: string;
  icon: React.ReactElement;
  color: string;
}[] = [
  {
    type: 'receipt',
    label: 'طابعة الفواتير',
    description: 'فواتير البيع الرئيسية (نقاط البيع)',
    icon: <Receipt className="w-5 h-5" />,
    color: 'from-blue-500 to-blue-600',
  },
  {
    type: 'purchase',
    label: 'طابعة المشتريات',
    description: 'فواتير المشتريات من الموردين',
    icon: <ShoppingCart className="w-5 h-5" />,
    color: 'from-green-500 to-green-600',
  },
  {
    type: 'barcode',
    label: 'طابعة الباركود',
    description: 'ملصقات الباركود للمنتجات',
    icon: <Tag className="w-5 h-5" />,
    color: 'from-orange-500 to-orange-600',
  },
  {
    type: 'quote',
    label: 'طابعة عروض الأسعار',
    description: 'عروض الأسعار والتقديرات',
    icon: <FileText className="w-5 h-5" />,
    color: 'from-purple-500 to-purple-600',
  },
  {
    type: 'payment',
    label: 'طابعة الدفعات',
    description: 'إيصالات الدفع للعملاء',
    icon: <CreditCard className="w-5 h-5" />,
    color: 'from-pink-500 to-pink-600',
  },
];

export const AssignmentTab: React.FC = () => {
  const config = usePrinterConfigStore();
  const [printers, setPrinters] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<PrinterAssignments>({
    receipt: '',
    purchase: '',
    barcode: '',
    quote: '',
    payment: '',
  });
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  // ── LOAD CYCLE (like Sultana) ──
  // Load system printers on mount
  const loadPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const list = await listSystemPrinters();
      setPrinters(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Failed to load printers:', e);
      toast.error('فشل تحميل قائمة الطابعات');
      setPrinters([]);
    } finally {
      setLoadingPrinters(false);
    }
  };

  // Load saved assignments from store
  const loadAssignments = () => {
    const currentAssignments = config.printerAssignments;
    setAssignments(currentAssignments);
  };

  useEffect(() => {
    loadPrinters();
    loadAssignments();
  }, []);

  // Track if user made changes
  useEffect(() => {
    const originalAssignments = config.printerAssignments;
    const changed =
      assignments.receipt !== originalAssignments.receipt ||
      assignments.purchase !== originalAssignments.purchase ||
      assignments.barcode !== originalAssignments.barcode ||
      assignments.quote !== originalAssignments.quote ||
      assignments.payment !== originalAssignments.payment;
    setHasChanges(changed);
  }, [assignments, config.printerAssignments]);

  // ── ASSIGN CYCLE (like Sultana) ──
  // Handle printer assignment change
  const handleChange = (type: PrinterType, value: string) => {
    setAssignments((prev) => ({ ...prev, [type]: value }));
  };

  // Quick assign: Use same printer for all types
  const handleAssignToAll = () => {
    if (printers.length === 0) {
      toast.error('لا توجد طابعات متاحة');
      return;
    }

    const firstPrinter = assignments.receipt || printers[0];
    if (!firstPrinter) return;

    setAssignments({
      receipt: firstPrinter,
      purchase: firstPrinter,
      barcode: firstPrinter,
      quote: firstPrinter,
      payment: firstPrinter,
    });
    toast.success(`تم تعيين "${firstPrinter}" لجميع الأنواع`);
  };

  // Apply assignments to store (no save to API yet)
  const handleApply = () => {
    try {
      savePrinterAssignments(assignments);
      setHasChanges(false);
      // No toast - let the main save button handle that
    } catch (error) {
      console.error('Failed to apply assignments:', error);
      toast.error('فشل تطبيق التعيينات');
    }
  };

  // Reset to saved assignments
  const handleReset = () => {
    loadAssignments();
    toast.success('تم إعادة تعيين التعيينات المحفوظة');
  };

  return (
    <div className="space-y-6">
      {/* Info Card */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900 mb-1">
              تعيين الطابعات حسب النوع
            </h3>
            <p className="text-sm text-blue-700 leading-relaxed">
              يمكنك تعيين طابعة مختلفة لكل نوع من الفواتير. على سبيل المثال، يمكنك استخدام طابعة
              حرارية للفواتير وطابعة ملصقات للباركود. يمكن استخدام نفس الطابعة لأكثر من نوع.
            </p>
          </div>
        </div>
      </Card>

      {/* Header with Refresh Button */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">تعيينات الطابعات</h3>
              <p className="text-sm text-gray-600">اختر طابعة لكل نوع</p>
            </div>
          </div>
          <button
            onClick={loadPrinters}
            disabled={loadingPrinters}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loadingPrinters ? 'animate-spin' : ''}`} />
            تحديث القائمة
          </button>
        </div>

        {/* Printer Assignments - Modern Card Design */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {PRINTER_TYPES.map(({ type, label, description, icon, color }) => {
            const isAssigned = !!assignments[type];
            const printerOptions = [
              { value: '', label: '— لم يتم التحديد —' },
              ...printers.map(p => ({ value: p, label: p }))
            ];

            return (
              <div
                key={type}
                className={`p-4 rounded-xl border-2 transition-all ${
                  isAssigned
                    ? 'border-gray-300 bg-white shadow-sm'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 bg-gradient-to-br ${color} rounded-lg flex items-center justify-center text-white flex-shrink-0`}>
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900">{label}</h4>
                    <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                  </div>
                  {isAssigned && (
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-green-600" />
                      </div>
                    </div>
                  )}
                </div>
                <Select
                  value={assignments[type]}
                  onChange={(value) => handleChange(type, value)}
                  options={printerOptions}
                  placeholder="— لم يتم التحديد —"
                  disabled={loadingPrinters}
                  loading={loadingPrinters}
                />
              </div>
            );
          })}
        </div>

        {/* Empty State (like Sultana) */}
        {!loadingPrinters && printers.length === 0 && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800 text-center">
              لم يتم العثور على طابعات متصلة. تأكد من توصيل الطابعة ثم اضغط "تحديث القائمة".
            </p>
          </div>
        )}

        {/* Quick Actions */}
        {printers.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={handleAssignToAll}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                استخدام نفس الطابعة للكل
              </button>

              <div className="flex items-center gap-3">
                {hasChanges && (
                  <>
                    <button
                      onClick={handleReset}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                    >
                      إلغاء التغييرات
                    </button>
                    <button
                      onClick={handleApply}
                      className="px-6 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm transition-all"
                    >
                      تطبيق التعيينات
                    </button>
                  </>
                )}
                {!hasChanges && (
                  <span className="text-sm text-green-600 flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    التعيينات محفوظة
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      <PrinterModeCard />

      {/* Current Assignments Summary */}
      {printers.length > 0 && (
        <Card className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Printer className="w-5 h-5 text-gray-600" />
            <h4 className="text-sm font-semibold text-gray-900">ملخص التعيينات الحالية</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PRINTER_TYPES.map(({ type, label, icon, color }) => {
              const printer = assignments[type];
              const isAssigned = !!printer;
              return (
                <div
                  key={type}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    isAssigned
                      ? 'bg-white border-gray-300'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-6 h-6 bg-gradient-to-br ${color} rounded flex items-center justify-center text-white`}>
                      {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-3 h-3' })}
                    </div>
                    <div className="font-medium text-gray-700 text-xs">{label}</div>
                  </div>
                  <div className="text-sm text-gray-900 mt-1 truncate font-medium" title={printer || 'غير محدد'}>
                    {printer || (
                      <span className="text-gray-400 italic font-normal">غير محدد</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};
