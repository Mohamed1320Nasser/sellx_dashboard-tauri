import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Receipt } from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, Input, Textarea, Select, Card, DatePicker } from '../components/ui';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { useCreateExpense } from '../hooks/api/useExpenses';
import { useExpenseCategories } from '../hooks/api/useExpenseCategories';
import toast from 'react-hot-toast';
import { toLocalDay } from '../utils/dateUtils';

const ExpenseCreate: React.FC = () => {
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    amount: '',
    categoryId: '',
    paymentMethod: 'نقدي',
    notes: '',
  });

  const [expenseDate, setExpenseDate] = useState<Date>(new Date());

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch categories
  const { data: categoriesData } = useExpenseCategories({
    companyId: companyId!,
    includeInactive: false,
  });

  // Create mutation
  const createMutation = useCreateExpense();

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

    if (!formData.title.trim()) newErrors.title = 'عنوان المصروف مطلوب';
    if (!formData.categoryId) newErrors.categoryId = 'التصنيف مطلوب';
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'المبلغ يجب أن يكون أكبر من صفر';
    }
    if (!expenseDate) newErrors.expenseDate = 'التاريخ مطلوب';

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
          title: formData.title.trim(),
          description: formData.description.trim(),
          amount: parseFloat(formData.amount),
          categoryId: formData.categoryId,
          paymentMethod: formData.paymentMethod,
          expenseDate: toLocalDay(expenseDate),
          notes: formData.notes.trim() || undefined,
        },
        companyId: companyId!,
      });

      navigate('/expenses');
    } catch (error) {
      console.error('Create error:', error);
      // Error toast is already handled by the mutation hook
    }
  }, [formData, expenseDate, validateForm, createMutation, companyId, navigate]);

  // Category options
  const categoryOptions = [
    { value: '', label: 'اختر التصنيف' },
    ...((categoriesData?.data || []).map((category: any) => ({
      value: category.id,
      label: category.name,
    }))),
  ];

  return (
    <Layout>
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/expenses')}
              className="text-gray-600"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">إضافة مصروف جديد</h1>
              <p className="text-sm text-gray-600 mt-1">
                سيتم احتساب المصروف كمدفوع فوراً
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
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-red-600" />
                المعلومات الأساسية
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="عنوان المصروف *"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="مثال: توصيل، نظافة، طعام..."
                  error={errors.title}
                />

                <Select
                  label="التصنيف *"
                  value={formData.categoryId}
                  onChange={(value) => handleInputChange('categoryId', value)}
                  options={categoryOptions}
                  error={errors.categoryId}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="المبلغ (ج.م) *"
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => handleInputChange('amount', e.target.value)}
                  placeholder="0.00"
                  error={errors.amount}
                />

                <Input
                  label="وسيلة الدفع"
                  value={formData.paymentMethod}
                  onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
                  placeholder="نقدي، تحويل بنكي، إلخ..."
                />

                <DatePicker
                  label="تاريخ المصروف *"
                  value={expenseDate}
                  onChange={(date) => setExpenseDate(date || new Date())}
                  placeholder="اختر تاريخ المصروف"
                  required
                  error={errors.expenseDate}
                />
              </div>

              <Textarea
                label="الوصف"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="وصف تفصيلي للمصروف..."
                rows={3}
              />

              <Textarea
                label="ملاحظات"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="أي ملاحظات إضافية..."
                rows={2}
              />
            </div>

            {/* Submit Button (Mobile) */}
            <div className="flex justify-end gap-2 md:hidden">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate('/expenses')}
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

export default ExpenseCreate;
