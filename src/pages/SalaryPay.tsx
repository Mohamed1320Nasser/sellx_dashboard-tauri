import React, { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CreditCard, Wallet, CheckCircle } from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, Select, Textarea, Card } from '../components/ui';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { useSalary, usePaySalary } from '../hooks/api/useSalaries';
import { SalaryStatusBadge } from '../components/salary/SalaryStatusBadge';
import { PaymentMethod, PaymentSource, SalaryStatus } from '../types';
import toast from 'react-hot-toast';

const SalaryPay: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;

  // Fetch salary data
  const { data: salaryData, isLoading } = useSalary(id!, companyId!);

  // Form state
  const [formData, setFormData] = useState({
    paymentMethod: PaymentMethod.CASH,
    paymentSource: PaymentSource.ACTIVE_SHIFT,
    shiftId: '',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pay mutation
  const payMutation = usePaySalary();

  // Check if salary can be paid (DRAFT only)
  const canPay = salaryData?.status === SalaryStatus.DRAFT;

  // Handle input change
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Validate form
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.paymentMethod) {
      newErrors.paymentMethod = 'وسيلة الدفع مطلوبة';
    }

    if (formData.paymentMethod === PaymentMethod.CASH && formData.paymentSource === PaymentSource.ACTIVE_SHIFT) {
      if (!formData.shiftId) {
        newErrors.shiftId = 'رقم الوردية مطلوب للدفع النقدي من الوردية النشطة';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!canPay) {
      toast.error('لا يمكن دفع راتب مدفوع أو ملغي');
      return;
    }

    if (!validateForm()) {
      toast.error('يرجى تصحيح الأخطاء');
      return;
    }

    try {
      await payMutation.mutateAsync({
        id: id!,
        data: {
          companyId: companyId!,
          month: salaryData.month,
          year: salaryData.year,
          paymentMethod: formData.paymentMethod,
          paymentSource: formData.paymentSource || undefined,
          shiftId: formData.shiftId || undefined,
          notes: formData.notes.trim() || undefined,
        },
      });

      navigate('/salaries');
    } catch (error) {
      console.error('Pay error:', error);
    }
  }, [formData, validateForm, payMutation, companyId, navigate, canPay, id]);

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

  if (isLoading) {
    return (
      <Layout>
        <div className="w-full max-w-4xl mx-auto">
          <div className="text-center py-12">
            <p className="text-gray-600">جاري التحميل...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!salaryData) {
    return (
      <Layout>
        <div className="w-full max-w-4xl mx-auto">
          <div className="text-center py-12">
            <p className="text-red-600">الراتب غير موجود</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/salaries')}
              className="text-gray-600"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-gray-900">دفع الراتب</h1>
                <SalaryStatusBadge status={salaryData.status} />
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {salaryData.user?.fullname} - {salaryData.month}/{salaryData.year}
              </p>
            </div>
          </div>
          {canPay && (
            <Button
              onClick={handleSubmit}
              disabled={payMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="w-4 h-4 ml-2" />
              {payMutation.isPending ? 'جاري الدفع...' : 'تأكيد الدفع'}
            </Button>
          )}
        </div>

        {/* Salary Summary */}
        <Card padding="lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-blue-600" />
            ملخص الراتب
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">الراتب الأساسي</p>
              <p className="text-lg font-semibold text-gray-900">
                {salaryData.baseSalary.toFixed(2)} ج.م
              </p>
            </div>

            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">البدلات والإضافي</p>
              <p className="text-lg font-semibold text-green-600">
                +{(salaryData.allowances + salaryData.overtime + salaryData.bonuses).toFixed(2)} ج.م
              </p>
            </div>

            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">الخصومات</p>
              <p className="text-lg font-semibold text-red-600">
                -{salaryData.deductions.toFixed(2)} ج.م
              </p>
            </div>

            <div className="md:col-span-3 p-6 bg-gradient-to-br from-green-500 to-green-600 rounded-lg">
              <p className="text-white mb-2">إجمالي المبلغ المستحق</p>
              <p className="text-4xl font-bold text-white">
                {salaryData.netSalary.toFixed(2)} ج.م
              </p>
            </div>
          </div>

          {/* Employee & Period Details */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-gray-600 mb-1">الموظف</p>
              <p className="font-semibold text-gray-900">{salaryData.user?.fullname}</p>
              <p className="text-sm text-gray-500">{salaryData.user?.email}</p>
            </div>

            <div className="p-4 border rounded-lg">
              <p className="text-sm text-gray-600 mb-1">الفترة</p>
              <p className="font-semibold text-gray-900">
                {salaryData.month}/{salaryData.year}
              </p>
              <p className="text-sm text-gray-500">
                أيام العمل: {salaryData.workingDays} | الغياب: {salaryData.absentDays}
              </p>
            </div>
          </div>
        </Card>

        {/* Payment Form */}
        {canPay ? (
          <Card padding="lg">
            <form onSubmit={handleSubmit} className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-green-600" />
                معلومات الدفع
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="وسيلة الدفع *"
                  value={formData.paymentMethod}
                  onChange={(value) => handleInputChange('paymentMethod', value)}
                  options={paymentMethodOptions}
                  error={errors.paymentMethod}
                />

                {formData.paymentMethod === PaymentMethod.CASH && (
                  <Select
                    label="مصدر الدفع *"
                    value={formData.paymentSource}
                    onChange={(value) => handleInputChange('paymentSource', value)}
                    options={paymentSourceOptions}
                    error={errors.paymentSource}
                  />
                )}
              </div>

              <Textarea
                label="ملاحظات"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="أي ملاحظات حول عملية الدفع..."
                rows={3}
              />

              {/* Info Box */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>ملاحظة:</strong> سيتم إنشاء مصروف تلقائي عند تأكيد الدفع،
                  وسيتم ربطه بسجل الراتب. في حالة الدفع النقدي من الوردية النشطة،
                  سيتم تسجيل حركة نقدية في سجل الوردية.
                </p>
              </div>

              {/* Submit Button (Mobile) */}
              <div className="flex justify-end gap-2 md:hidden">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate('/salaries')}
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={payMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {payMutation.isPending ? 'جاري الدفع...' : 'تأكيد الدفع'}
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Card padding="lg">
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Wallet className="w-8 h-8 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                لا يمكن دفع هذا الراتب
              </h3>
              <p className="text-gray-600">
                الراتب {salaryData.status === SalaryStatus.PAID ? 'مدفوع بالفعل' : 'ملغي'}
              </p>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
};

export default SalaryPay;
