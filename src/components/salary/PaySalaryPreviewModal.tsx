import React, { useState, useEffect } from 'react';
import { X, Zap, CheckCircle, Loader2, AlertCircle, Wallet, Users } from 'lucide-react';
import { Button, Select, Card } from '../ui';
import { usePaymentPreview, usePaySalary } from '../../hooks/api/useSalaries';
import { PaymentMethod, PaymentSource, type Salary } from '../../types';

interface PaySalaryPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  salary: Salary | null;
  companyId: number;
}

export const PaySalaryPreviewModal: React.FC<PaySalaryPreviewModalProps> = ({
  isOpen,
  onClose,
  salary,
  companyId,
}) => {
  const currentDate = new Date();
  const [month, setMonth] = useState(String(currentDate.getMonth() + 1));
  const [year, setYear] = useState(String(currentDate.getFullYear()));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [paymentSource, setPaymentSource] = useState<PaymentSource>(PaymentSource.ACTIVE_SHIFT);
  const [notes, setNotes] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const previewMutation = usePaymentPreview();
  const payMutation = usePaySalary();

  // Auto-load preview when modal opens
  useEffect(() => {
    if (isOpen && salary) {
      // Automatically fetch preview when modal opens
      previewMutation.mutateAsync({
        id: salary.id,
        data: {
          companyId,
          month: parseInt(month),
          year: parseInt(year),
        },
      });
      setShowPreview(true);
    } else if (!isOpen) {
      // Reset state when modal closes
      setShowPreview(false);
      setMonth(String(currentDate.getMonth() + 1));
      setYear(String(currentDate.getFullYear()));
      setPaymentMethod(PaymentMethod.CASH);
      setPaymentSource(PaymentSource.ACTIVE_SHIFT);
      setNotes('');
      previewMutation.reset();
    }
  }, [isOpen, salary?.id]);

  // Month options
  const monthOptions = [
    { value: '1', label: 'يناير' },
    { value: '2', label: 'فبراير' },
    { value: '3', label: 'مارس' },
    { value: '4', label: 'أبريل' },
    { value: '5', label: 'مايو' },
    { value: '6', label: 'يونيو' },
    { value: '7', label: 'يوليو' },
    { value: '8', label: 'أغسطس' },
    { value: '9', label: 'سبتمبر' },
    { value: '10', label: 'أكتوبر' },
    { value: '11', label: 'نوفمبر' },
    { value: '12', label: 'ديسمبر' },
  ];

  // Year options
  const currentYear = currentDate.getFullYear();
  const yearOptions = Array.from({ length: 4 }, (_, i) => {
    const y = currentYear - 2 + i;
    return { value: String(y), label: String(y) };
  });

  // Payment method options
  const paymentMethodOptions = [
    { value: PaymentMethod.CASH, label: 'نقدي' },
    { value: PaymentMethod.BANK_TRANSFER, label: 'تحويل بنكي' },
    { value: PaymentMethod.CHECK, label: 'شيك' },
  ];

  // Payment source options (for CASH only)
  const paymentSourceOptions = [
    { value: PaymentSource.ACTIVE_SHIFT, label: 'الوردية النشطة' },
    { value: PaymentSource.MAIN_VAULT, label: 'الخزينة الرئيسية' },
    { value: PaymentSource.OWNER_DRAWER, label: 'درج المالك' },
  ];

  const handlePreview = async () => {
    if (!salary) return;

    await previewMutation.mutateAsync({
      id: salary.id,
      data: {
        companyId,
        month: parseInt(month),
        year: parseInt(year),
      },
    });

    setShowPreview(true);
  };

  const handleConfirmPayment = async () => {
    if (!salary) return;

    try {
      await payMutation.mutateAsync({
        id: salary.id,
        data: {
          companyId,
          month: parseInt(month),
          year: parseInt(year),
          paymentMethod,
          paymentSource: paymentMethod === PaymentMethod.CASH ? paymentSource : undefined,
          notes: notes.trim() || undefined,
        },
      });

      onClose();
    } catch (error) {
      console.error('Payment error:', error);
    }
  };

  const previewData = previewMutation.data?.data;

  if (!isOpen || !salary) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                دفع راتب - {salary.user?.fullname}
              </h2>
              <p className="text-sm text-gray-600">
                معاينة وتأكيد دفع الراتب
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {!showPreview ? (
            <div className="space-y-6">
              {/* Period Selection */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">اختر الفترة</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="الشهر *"
                    value={month}
                    onChange={setMonth}
                    options={monthOptions}
                  />
                  <Select
                    label="السنة *"
                    value={year}
                    onChange={setYear}
                    options={yearOptions}
                  />
                </div>
              </div>

              {/* Salary Template Info */}
              <Card padding="md">
                <h3 className="font-semibold text-gray-900 mb-3">معلومات الراتب الأساسية</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">الراتب الأساسي</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {salary.baseSalary.toFixed(2)} ج.م
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">البدلات</p>
                    <p className="text-lg font-semibold text-green-600">
                      +{salary.allowances.toFixed(2)} ج.م
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">الخصومات</p>
                    <p className="text-lg font-semibold text-red-600">
                      -{salary.deductions.toFixed(2)} ج.م
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">الإضافي + المكافآت</p>
                    <p className="text-lg font-semibold text-blue-600">
                      +{(salary.overtime + salary.bonuses).toFixed(2)} ج.م
                    </p>
                  </div>
                </div>
              </Card>

              {/* Info Box */}
              <Card padding="md">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 mb-2">
                      سيتم حساب التفاصيل التالية تلقائياً:
                    </p>
                    <ul className="space-y-1 text-sm text-gray-600">
                      <li>• أيام العمل الفعلية في الشهر المحدد</li>
                      <li>• أيام الغياب من سجلات الحضور</li>
                      <li>• خصم الغياب من الراتب الأساسي</li>
                      <li>• المبلغ النهائي المستحق</li>
                    </ul>
                  </div>
                </div>
              </Card>
            </div>
          ) : previewMutation.isPending ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">جاري حساب التفاصيل...</p>
              </div>
            </div>
          ) : previewMutation.isError ? (
            <Card padding="md">
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-red-600 mb-2">
                  تنبيه
                </h3>
                <p className="text-gray-700 text-base mb-4 font-medium">
                  {(previewMutation.error as any)?.response?.data?.msg ||
                   (previewMutation.error as any)?.response?.data?.message ||
                   'حدث خطأ أثناء حساب التفاصيل'}
                </p>
                <Button variant="ghost" onClick={onClose}>
                  إغلاق
                </Button>
              </div>
            </Card>
          ) : previewData ? (
            <div className="space-y-6">
              {/* Employee Info */}
              <Card padding="md">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{previewData.salary.user.fullname}</p>
                    <p className="text-sm text-gray-600">{previewData.salary.user.email}</p>
                  </div>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-sm text-gray-600">الفترة</p>
                  <p className="text-lg font-bold text-purple-600">
                    {monthOptions.find(m => m.value === month)?.label} {year}
                  </p>
                </div>
              </Card>

              {/* Calculation Details */}
              <Card padding="md">
                <h3 className="font-semibold text-gray-900 mb-4">تفاصيل الحساب</h3>
                <div className="space-y-3">
                  <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">إجمالي أيام العمل في الشهر</span>
                    <span className="font-semibold">{previewData.calculation.totalWorkingDays} يوم</span>
                  </div>
                  <div className="flex justify-between p-3 bg-green-50 rounded-lg">
                    <span className="text-gray-600">أيام الحضور</span>
                    <span className="font-semibold text-green-600">{previewData.calculation.workingDays} يوم</span>
                  </div>
                  <div className="flex justify-between p-3 bg-red-50 rounded-lg">
                    <div className="flex flex-col">
                      <span className="text-gray-600">أيام الغياب غير المدفوع</span>
                      <span className="text-xs text-gray-500">الإجازات المدفوعة لا تُخصم</span>
                    </div>
                    <span className="font-semibold text-red-600">{previewData.calculation.absentDays} يوم</span>
                  </div>
                  <div className="flex justify-between p-3 bg-blue-50 rounded-lg">
                    <span className="text-gray-600">خصم الغياب</span>
                    <span className="font-semibold text-red-600">-{previewData.calculation.absentDeduction.toFixed(2)} ج.م</span>
                  </div>
                </div>
              </Card>

              {/* Absences List */}
              {previewData.absences && previewData.absences.length > 0 && (
                <Card padding="md">
                  <h3 className="font-semibold text-gray-900 mb-4">
                    سجل الغياب ({previewData.absences.length})
                  </h3>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {previewData.absences.map((absence: any) => (
                      <div key={absence.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-gray-900">
                            {absence.type === "SICK_LEAVE" ? "إجازة مرضية" :
                             absence.type === "VACATION" ? "إجازة" :
                             absence.type === "UNPAID_LEAVE" ? "إجازة بدون أجر" :
                             "غياب"}
                          </span>
                          <span className="text-xs text-gray-600">{absence.totalDays} يوم</span>
                        </div>
                        <div className="text-xs text-gray-600">
                          {new Date(absence.startDate).toLocaleDateString('ar-EG')} - {new Date(absence.endDate).toLocaleDateString('ar-EG')}
                        </div>
                        {absence.reason && (
                          <div className="text-xs text-gray-500 mt-1">{absence.reason}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Final Amount */}
              <div className="p-6 bg-gradient-to-br from-green-500 to-green-600 rounded-lg">
                <p className="text-white mb-2">المبلغ النهائي المستحق</p>
                <p className="text-4xl font-bold text-white">
                  {previewData.calculation.finalAmount.toFixed(2)} ج.م
                </p>
              </div>

              {/* Payment Method */}
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">وسيلة الدفع</h3>
                <Select
                  label="وسيلة الدفع *"
                  value={paymentMethod}
                  onChange={(value) => setPaymentMethod(value as PaymentMethod)}
                  options={paymentMethodOptions}
                />

                {paymentMethod === PaymentMethod.CASH && (
                  <>
                    <Select
                      label="مصدر الدفع *"
                      value={paymentSource}
                      onChange={(value) => setPaymentSource(value as PaymentSource)}
                      options={paymentSourceOptions}
                    />
                    {/* TODO: Shift integration - Show warning when shift management is enabled */}
                    {/*
                    {paymentSource === PaymentSource.ACTIVE_SHIFT && (
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm text-blue-800">
                          <strong>ملاحظة:</strong> يجب أن تكون لديك وردية مفتوحة حالياً للدفع من الوردية النشطة. إذا لم تكن هناك وردية مفتوحة، اختر "الخزينة الرئيسية" أو "درج المالك".
                        </p>
                      </div>
                    )}
                    */}
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ملاحظات
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="أي ملاحظات حول عملية الدفع..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          {!showPreview ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                إلغاء
              </Button>
              <Button
                onClick={handlePreview}
                disabled={previewMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Zap className="w-4 h-4 ml-2" />
                {previewMutation.isPending ? 'جاري الحساب...' : 'معاينة'}
              </Button>
            </>
          ) : previewMutation.isError ? (
            <Button variant="ghost" onClick={() => setShowPreview(false)}>
              رجوع
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setShowPreview(false)}>
                رجوع
              </Button>
              <Button
                onClick={handleConfirmPayment}
                disabled={payMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="w-4 h-4 ml-2" />
                {payMutation.isPending ? 'جاري الدفع...' : 'تأكيد الدفع'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
