import React, { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Edit, Trash2, Receipt, Eye, DollarSign, TrendingDown } from "lucide-react";
import { Layout } from "../components/layout";
import { Button, Card, DataTable, Badge, ConfirmDialog } from "../components/ui";
import type { Column, TableFilter } from "../components/ui/DataTable";
import { PermissionGuard } from "../components/common/PermissionGuard";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { usePermissionStore } from "../stores/permissionStore";
import {
  useExpenses,
  useDeleteExpense,
} from "../hooks/api/useExpenses";
import { useExpenseCategories } from "../hooks/api/useExpenseCategories";
import type { Expense } from "../types";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const Expenses: React.FC = () => {
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const { hasPermission } = usePermissionStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    expense: Expense | null;
  }>({ isOpen: false, expense: null });

  // API hooks
  const { data: expensesData, isLoading } = useExpenses({
    companyId: company?.companyId || company?.company?.id || 0,
    page: currentPage,
    limit: pageSize,
    search: searchTerm,
    categoryId: selectedCategory || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const { data: categoriesData } = useExpenseCategories({
    companyId: company?.companyId || company?.company?.id || 0,
    includeInactive: false,
  });

  const deleteMutation = useDeleteExpense();

  // Table columns
  const columns: Column<Expense>[] = [
    {
      key: "expenseNumber",
      label: "رقم المصروف",
      render: (expense: Expense) => (
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-500/30">
            <Receipt className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{expense.expenseNumber}</p>
            <p className="text-sm text-gray-500">{expense.title}</p>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      label: "التصنيف",
      render: (expense: Expense) => (
        <Badge variant="primary" style={{ backgroundColor: expense.category?.color }}>
          {expense.category?.name || "غير محدد"}
        </Badge>
      ),
    },
    {
      key: "amount",
      label: "المبلغ",
      render: (expense: Expense) => (
        <span className="text-red-600 text-lg font-semibold">
          {expense.amount.toFixed(2)} ج.م
        </span>
      ),
    },
    {
      key: "expenseDate",
      label: "التاريخ",
      render: (expense: Expense) => (
        <span className="text-gray-600">
          {format(new Date(expense.expenseDate), "d MMMM yyyy", { locale: ar })}
        </span>
      ),
    },
    {
      key: "user",
      label: "المستخدم",
      render: (expense: Expense) => (
        <span className="text-gray-700">{expense.user?.fullname || "-"}</span>
      ),
    },
  ];

  // Handlers
  const handleDelete = (expense: Expense) => {
    setDeleteConfirm({ isOpen: true, expense });
  };

  const confirmDelete = () => {
    if (deleteConfirm.expense) {
      deleteMutation.mutate({
        id: deleteConfirm.expense.id,
        companyId: company?.companyId || company?.company?.id || 0,
      });
      setDeleteConfirm({ isOpen: false, expense: null });
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm({ isOpen: false, expense: null });
  };

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  }, []);

  const handleCategoryFilter = useCallback((value: string) => {
    setSelectedCategory(value);
    setCurrentPage(1);
  }, []);

  const categoryOptions = useMemo(() => [
    { value: "", label: "جميع التصنيفات" },
    ...(categoriesData?.data?.map((category) => ({
      value: category.id,
      label: category.name,
    })) || []),
  ], [categoriesData]);

  // Table filters configuration
  const tableFilters: TableFilter[] = useMemo(() => [
    {
      key: 'category',
      label: 'التصنيف',
      type: 'select',
      options: categoryOptions,
      value: selectedCategory,
      onChange: (value) => handleCategoryFilter(value as string),
    },
    {
      key: 'startDate',
      label: 'من تاريخ',
      type: 'date',
      value: startDate,
      onChange: (value) => {
        setStartDate(value as string);
        setCurrentPage(1);
      },
    },
    {
      key: 'endDate',
      label: 'إلى تاريخ',
      type: 'date',
      value: endDate,
      onChange: (value) => {
        setEndDate(value as string);
        setCurrentPage(1);
      },
    },
  ], [categoryOptions, selectedCategory, startDate, endDate, handleCategoryFilter]);

  const handleClearFilters = useCallback(() => {
    setSelectedCategory("");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
  }, []);

  // Calculate summary stats
  const totalExpenses = (expensesData as any)?.data?.totalCount || 0;
  const totalAmount = (expensesData as any)?.data?.totalAmount || 0;

  return (
    <Layout>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">إدارة المصروفات</h1>
            <p className="text-gray-600 mt-1">
              تتبع وإدارة مصروفات الشركة
            </p>
          </div>
          <PermissionGuard permission="canManageExpenses">
            <Button onClick={() => navigate('/expenses/create')}>
              <Plus className="w-4 h-4 ml-2" />
              إضافة مصروف جديد
            </Button>
          </PermissionGuard>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-500/30">
                <Receipt className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">إجمالي المصروفات</p>
                <p className="text-2xl font-bold text-gray-900">{totalExpenses}</p>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">إجمالي المبالغ</p>
                <p className="text-2xl font-bold text-red-600">{totalAmount.toFixed(2)} ج.م</p>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
                <TrendingDown className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">التصنيفات</p>
                <p className="text-2xl font-bold text-purple-600">
                  {categoriesData?.data?.length || 0}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Expenses Table with integrated search and filters */}
        <DataTable<Expense>
          title="جميع المصروفات"
          columns={columns}
          data={expensesData?.data?.list || []}
          loading={isLoading}
          searchPlaceholder="البحث في المصروفات (العنوان، الوصف...)"
          onSearch={handleSearch}
          filters={tableFilters}
          onClearFilters={handleClearFilters}
          actions={[
            {
              icon: Eye,
              label: "عرض التفاصيل",
              onClick: (expense) => navigate(`/expenses/${expense.id}`),
              variant: "primary",
            },
            {
              icon: Edit,
              label: "تعديل المصروف",
              onClick: (expense) => navigate(`/expenses/${expense.id}/edit`),
              variant: "warning",
              show: () => hasPermission("canManageExpenses"),
            },
            {
              icon: Trash2,
              label: "حذف المصروف",
              onClick: (expense) => handleDelete(expense),
              variant: "danger",
              show: () => hasPermission("canManageExpenses"),
            },
          ]}
          totalItems={expensesData?.data?.totalCount || 0}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          emptyMessage="لا توجد مصروفات حتى الآن. قم بإضافة مصروف جديد للبدء!"
        />

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

export default Expenses;
