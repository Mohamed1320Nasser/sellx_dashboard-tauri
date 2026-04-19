import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, DollarSign, Calendar, User, Edit, Trash2, FileText } from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, Card, Badge, ConfirmDialog } from '../components/ui';
import { PermissionGuard } from '../components/common/PermissionGuard';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { useExpense, useDeleteExpense } from '../hooks/api/useExpenses';
import { formatCurrency } from '../utils/currencyUtils';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { Expense } from '../types';

const ExpenseDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();

  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    expense: Expense | null;
  }>({ isOpen: false, expense: null });

  // Fetch expense details
  const companyId = company?.companyId || company?.company?.id;
  const { data: expenseData, isLoading, error } = useExpense(id || '', companyId || 0);
  const deleteMutation = useDeleteExpense();

  const expense = expenseData as Expense;

  const handleEdit = () => {
    navigate(`/expenses/${id}/edit`);
  };

  const handleDelete = () => {
    if (expense) {
      setDeleteConfirm({ isOpen: true, expense });
    }
  };

  const confirmDelete = () => {
    if (deleteConfirm.expense) {
      deleteMutation.mutate({
        id: deleteConfirm.expense.id,
        companyId: companyId!,
      }, {
        onSuccess: () => {
          navigate('/expenses');
        }
      });
      setDeleteConfirm({ isOpen: false, expense: null });
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm({ isOpen: false, expense: null });
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="w-full max-w-4xl mx-auto flex justify-center items-center py-20">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">جاري تحميل تفاصيل المصروف...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !expense) {
    return (
      <Layout>
        <div className="w-full max-w-4xl mx-auto py-20 text-center">
          <Receipt className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">المصروف غير موجود</h2>
          <p className="text-gray-600 mb-6">لم يتم العثور على المصروف المطلوب</p>
          <Button onClick={() => navigate('/expenses')}>
            <ArrowLeft className="w-4 h-4 ml-2" />
            العودة إلى قائمة المصروفات
          </Button>
        </div>
      </Layout>
    );
  }

  const isLowStock = false; // Not applicable for expenses

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
              <h1 className="text-xl font-bold text-gray-900">تفاصيل المصروف</h1>
              <p className="text-sm text-gray-600 mt-1">
                رقم المصروف: {expense.expenseNumber}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <PermissionGuard permission="canManageExpenses">
              <Button
                variant="warning"
                onClick={handleEdit}
              >
                <Edit className="w-4 h-4 ml-2" />
                تعديل
              </Button>
            </PermissionGuard>
            <PermissionGuard permission="canManageExpenses">
              <Button
                variant="destructive"
                onClick={handleDelete}
              >
                <Trash2 className="w-4 h-4 ml-2" />
                حذف
              </Button>
            </PermissionGuard>
          </div>
        </div>

        {/* Main Info Card */}
        <Card padding="lg">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-red-500/30">
              <Receipt className="w-10 h-10" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{expense.title}</h2>
              <div className="flex items-center gap-4 mb-4">
                <Badge variant="primary" style={{ backgroundColor: expense.category?.color }}>
                  {expense.category?.name}
                </Badge>
                <span className="text-sm text-gray-600">
                  {expense.expenseDate && format(new Date(expense.expenseDate), "d MMMM yyyy", { locale: ar })}
                </span>
              </div>
              <div className="text-3xl font-bold text-red-600">
                {formatCurrency(expense.amount)} ج.م
              </div>
            </div>
          </div>

          {expense.description && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-gray-700 leading-relaxed">{expense.description}</p>
            </div>
          )}
        </Card>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Payment Info */}
          <Card padding="md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              معلومات الدفع
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">وسيلة الدفع:</span>
                <span className="font-semibold text-gray-900">{expense.paymentMethod || 'نقدي'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">المبلغ المدفوع:</span>
                <span className="font-semibold text-green-600">{formatCurrency(expense.amount)} ج.م</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">الحالة:</span>
                <Badge variant="success">مدفوع</Badge>
              </div>
            </div>
          </Card>

          {/* User Info */}
          <Card padding="md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              المستخدم
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">اسم المستخدم:</span>
                <span className="font-semibold text-gray-900">
                  {expense.user?.fullname || '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">البريد الإلكتروني:</span>
                <span className="text-sm text-gray-700">
                  {expense.user?.email || '-'}
                </span>
              </div>
            </div>
          </Card>

          {/* Date Info */}
          <Card padding="md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-600" />
              التواريخ
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">تاريخ المصروف:</span>
                <span className="font-semibold text-gray-900">
                  {expense.expenseDate && format(new Date(expense.expenseDate), "d MMMM yyyy", { locale: ar })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">تاريخ الإنشاء:</span>
                <span className="text-sm text-gray-700">
                  {expense.createdAt && format(new Date(expense.createdAt), "d MMMM yyyy, h:mm a", { locale: ar })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">آخر تحديث:</span>
                <span className="text-sm text-gray-700">
                  {expense.updatedAt && format(new Date(expense.updatedAt), "d MMMM yyyy, h:mm a", { locale: ar })}
                </span>
              </div>
            </div>
          </Card>

          {/* Notes */}
          {expense.notes && (
            <Card padding="md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-600" />
                ملاحظات
              </h3>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {expense.notes}
              </p>
            </Card>
          )}
        </div>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={deleteConfirm.isOpen}
          onClose={cancelDelete}
          onConfirm={confirmDelete}
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف المصروف "${deleteConfirm.expense?.title}"؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmText="حذف"
          cancelText="إلغاء"
          type="danger"
          isLoading={deleteMutation.isPending}
        />
      </div>
    </Layout>
  );
};

export default ExpenseDetails;
