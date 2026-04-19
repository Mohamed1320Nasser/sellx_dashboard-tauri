import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Wallet, Users } from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, Input, Textarea, Select, Card } from '../components/ui';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { useCreateSalary } from '../hooks/api/useSalaries';
import { useCompanyUsers } from '../hooks/api/useUsers';
import toast from 'react-hot-toast';

const SalaryCreate: React.FC = () => {
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;

  // Form state
  const [formData, setFormData] = useState({
    userId: '',
    baseSalary: '',
    allowances: '0',
    deductions: '0',
    overtime: '0',
    bonuses: '0',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch company users (employees)
  const { data: usersData } = useCompanyUsers({
    companyId: companyId!,
    limit: 1000, // Get all users for dropdown
  });

  // Create mutation
  const createMutation = useCreateSalary();

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

    if (!formData.userId) newErrors.userId = 'الموظف مطلوب';
    if (!formData.baseSalary || parseFloat(formData.baseSalary) <= 0) {
      newErrors.baseSalary = 'الراتب الأساسي يجب أن يكون أكبر من صفر';
    }
    if (parseFloat(formData.deductions) < 0) {
      newErrors.deductions = 'الخصومات لا يمكن أن تكون سالبة';
    }
    if (parseFloat(formData.allowances) < 0) {
      newErrors.allowances = 'البدلات لا يمكن أن تكون سالبة';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!validateForm()) {
      toast.error('يرجى تصحيح الأخطاء');
      return;
    }

    try {
      await createMutation.mutateAsync({
        data: {
          userId: formData.userId,
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
      console.error('Create error:', error);
    }
  }, [formData, validateForm, createMutation, companyId, navigate, netSalary]);

  // User options
  const userOptions = useMemo(() => {
    const users = usersData?.data?.list || [];
    return [
      { value: '', label: 'اختر الموظف' },
      ...users.map((record: any) => ({
        value: String(record.user?.id || record.id),
        label: `${record.user?.fullname || record.fullname || 'غير محدد'} - ${record.user?.email || record.email || 'غير محدد'}`,
      })),
    ];
  }, [usersData]);

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
              <h1 className="text-xl font-bold text-gray-900">إضافة قالب راتب جديد</h1>
              <p className="text-sm text-gray-600 mt-1">
                سيتم إنشاء قالب راتب للموظف يمكن استخدامه للدفع الشهري
              </p>
            </div>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Save className="w-4 h-4 ml-2" />
            {createMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
          </Button>
        </div>

        {/* Form */}
        <Card padding="lg">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Employee Selection */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                اختيار الموظف
              </h3>

              <Select
                label="الموظف *"
                value={formData.userId}
                onChange={(value) => handleInputChange('userId', value)}
                options={userOptions}
                error={errors.userId}
              />
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
                />

                <Input
                  label="البدلات (ج.م)"
                  type="number"
                  step="0.01"
                  value={formData.allowances}
                  onChange={(e) => handleInputChange('allowances', e.target.value)}
                  placeholder="0.00"
                  error={errors.allowances}
                />

                <Input
                  label="الخصومات (ج.م)"
                  type="number"
                  step="0.01"
                  value={formData.deductions}
                  onChange={(e) => handleInputChange('deductions', e.target.value)}
                  placeholder="0.00"
                  error={errors.deductions}
                />

                <Input
                  label="الإضافي (ج.م)"
                  type="number"
                  step="0.01"
                  value={formData.overtime}
                  onChange={(e) => handleInputChange('overtime', e.target.value)}
                  placeholder="0.00"
                />

                <Input
                  label="المكافآت (ج.م)"
                  type="number"
                  step="0.01"
                  value={formData.bonuses}
                  onChange={(e) => handleInputChange('bonuses', e.target.value)}
                  placeholder="0.00"
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
              />
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
                disabled={createMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {createMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </Layout>
  );
};

export default SalaryCreate;
