import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Wallet, Lock } from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, Input, Textarea, Card } from '../components/ui';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { useSalary, useUpdateSalary } from '../hooks/api/useSalaries';
import { SalaryStatusBadge } from '../components/salary/SalaryStatusBadge';
import toast from 'react-hot-toast';

const SalaryEdit: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;

  // Fetch salary data
  const { data: salaryData, isLoading } = useSalary(id!, companyId!);

  // Form state
  const [formData, setFormData] = useState({
    baseSalary: '',
    allowances: '0',
    deductions: '0',
    overtime: '0',
    bonuses: '0',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Update mutation
  const updateMutation = useUpdateSalary();

  // Populate form when data is loaded
  useEffect(() => {
    if (salaryData) {
      setFormData({
        baseSalary: String(salaryData.baseSalary || ''),
        allowances: String(salaryData.allowances || '0'),
        deductions: String(salaryData.deductions || '0'),
        overtime: String(salaryData.overtime || '0'),
        bonuses: String(salaryData.bonuses || '0'),
        notes: salaryData.notes || '',
      });
    }
  }, [salaryData]);

  // Check if salary can be edited (ACTIVE templates can be edited)
  const canEdit = salaryData?.status === 'ACTIVE';

  // Handle input change
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Calculate net salary
  const netSalary = useMemo(() => {
    const base = parseFloat(formData.baseSalary) || 0;
    const allowances = parseFloat(formData.allowances) || 0;
    const deductions = parseFloat(formData.deductions) || 0;
    const overtime = parseFloat(formData.overtime) || 0;
    const bonuses = parseFloat(formData.bonuses) || 0;

    return base + allowances + overtime + bonuses - deductions;
  }, [formData]);

  // Validate form
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.baseSalary || parseFloat(formData.baseSalary) <= 0) {
      newErrors.baseSalary = 'الراتب الأساسي يجب أن يكون أكبر من صفر';
    }
    if (parseFloat(formData.deductions) < 0) {
      newErrors.deductions = 'الخصومات لا يمكن أن تكون سالبة';
    }
    if (parseFloat(formData.allowances) < 0) {
      newErrors.allowances = 'البدلات لا يمكن أن تكون سالبة';
    }
    if (netSalary < 0) {
      newErrors.baseSalary = 'صافي الراتب لا يمكن أن يكون سالباً';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!canEdit) {
      toast.error('لا يمكن تعديل قالب راتب غير نشط');
      return;
    }

    if (!validateForm()) {
      toast.error('يرجى تصحيح الأخطاء');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: id!,
        data: {
          baseSalary: parseFloat(formData.baseSalary),
          allowances: parseFloat(formData.allowances) || 0,
          deductions: parseFloat(formData.deductions) || 0,
          overtime: parseFloat(formData.overtime) || 0,
          bonuses: parseFloat(formData.bonuses) || 0,
          notes: formData.notes.trim() || undefined,
        },
        companyId: companyId!,
      });

      navigate('/salaries');
    } catch (error) {
      console.error('Update error:', error);
    }
  }, [formData, validateForm, updateMutation, companyId, navigate, canEdit, id, netSalary]);

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
                <h1 className="text-xl font-bold text-gray-900">تعديل قالب الراتب</h1>
                <SalaryStatusBadge status={salaryData.status} />
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {salaryData.user?.fullname}
              </p>
            </div>
          </div>
          {canEdit && (
            <Button
              onClick={handleSubmit}
              disabled={updateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Save className="w-4 h-4 ml-2" />
              {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </Button>
          )}
        </div>

        {/* Lock Warning */}
        {!canEdit && (
          <Card padding="md">
            <div className="flex items-center gap-3 text-orange-600">
              <Lock className="w-5 h-5" />
              <p className="font-medium">
                لا يمكن تعديل هذا القالب لأنه غير نشط
              </p>
            </div>
          </Card>
        )}

        {/* Form */}
        <Card padding="lg">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Employee Info (Read-only) */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                معلومات الموظف
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">الموظف</p>
                  <p className="font-semibold text-gray-900">
                    {salaryData.user?.fullname}
                  </p>
                  <p className="text-sm text-gray-500">{salaryData.user?.email}</p>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">آخر دفع</p>
                  <p className="font-semibold text-gray-900">
                    {salaryData.lastPaidMonth && salaryData.lastPaidYear
                      ? `${salaryData.lastPaidMonth}/${salaryData.lastPaidYear}`
                      : 'لم يتم الدفع بعد'}
                  </p>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">تاريخ الإنشاء</p>
                  <p className="font-semibold text-gray-900">
                    {new Date(salaryData.createdAt).toLocaleDateString('ar-EG')}
                  </p>
                </div>
              </div>
            </div>

            {/* Salary Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-green-600" />
                تفاصيل الراتب
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="الراتب الأساسي (ج.م) *"
                  type="number"
                  step="0.01"
                  value={formData.baseSalary}
                  onChange={(e) => handleInputChange('baseSalary', e.target.value)}
                  placeholder="0.00"
                  error={errors.baseSalary}
                  disabled={!canEdit}
                />

                <Input
                  label="البدلات (ج.م)"
                  type="number"
                  step="0.01"
                  value={formData.allowances}
                  onChange={(e) => handleInputChange('allowances', e.target.value)}
                  placeholder="0.00"
                  error={errors.allowances}
                  disabled={!canEdit}
                />

                <Input
                  label="الخصومات (ج.م)"
                  type="number"
                  step="0.01"
                  value={formData.deductions}
                  onChange={(e) => handleInputChange('deductions', e.target.value)}
                  placeholder="0.00"
                  error={errors.deductions}
                  disabled={!canEdit}
                />

                <Input
                  label="الإضافي (ج.م)"
                  type="number"
                  step="0.01"
                  value={formData.overtime}
                  onChange={(e) => handleInputChange('overtime', e.target.value)}
                  placeholder="0.00"
                  disabled={!canEdit}
                />

                <Input
                  label="المكافآت (ج.م)"
                  type="number"
                  step="0.01"
                  value={formData.bonuses}
                  onChange={(e) => handleInputChange('bonuses', e.target.value)}
                  placeholder="0.00"
                  disabled={!canEdit}
                />

                <div className="flex items-end">
                  <div className="w-full p-4 bg-green-50 rounded-lg border-2 border-green-200">
                    <p className="text-sm text-gray-600 mb-1">صافي الراتب</p>
                    <p className="text-2xl font-bold text-green-600">
                      {netSalary.toFixed(2)} ج.م
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-4">
              <Textarea
                label="ملاحظات"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="أي ملاحظات إضافية..."
                rows={3}
                disabled={!canEdit}
              />
            </div>

            {/* Submit Button (Mobile) */}
            {canEdit && (
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
                  disabled={updateMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </Button>
              </div>
            )}
          </form>
        </Card>
      </div>
    </Layout>
  );
};

export default SalaryEdit;
