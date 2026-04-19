import React, { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Edit, Trash2, Wallet, Eye, DollarSign, Users, TrendingUp } from "lucide-react";
import { Layout } from "../components/layout";
import { Button, Card, DataTable, ConfirmDialog } from "../components/ui";
import type { Column, TableFilter } from "../components/ui/DataTable";
import { PermissionGuard } from "../components/common/PermissionGuard";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { usePermissionStore } from "../stores/permissionStore";
import {
  useSalaries,
  useDeleteSalary,
  useSalarySummary,
} from "../hooks/api/useSalaries";
import { SalaryStatusBadge } from "../components/salary/SalaryStatusBadge";
import { PaySalaryPreviewModal } from "../components/salary/PaySalaryPreviewModal";
import type { Salary, SalaryStatus } from "../types";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const Salaries: React.FC = () => {
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const { hasPermission } = usePermissionStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    salary: Salary | null;
  }>({ isOpen: false, salary: null });
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedSalary, setSelectedSalary] = useState<Salary | null>(null);

  // API hooks
  const { data: salariesData, isLoading } = useSalaries({
    companyId: company?.companyId || company?.company?.id || 0,
    page: currentPage,
    limit: pageSize,
    search: searchTerm,
    status: selectedStatus ? (selectedStatus as SalaryStatus) : undefined,
    month: selectedMonth ? parseInt(selectedMonth) : undefined,
    year: selectedYear ? parseInt(selectedYear) : undefined,
  });

  const { data: summaryData } = useSalarySummary(
    company?.companyId || company?.company?.id || 0
  );

  const deleteMutation = useDeleteSalary();

  // Table columns
  const columns: Column<Salary>[] = [
    {
      key: "user",
      label: "الموظف",
      render: (salary: Salary) => (
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <Users className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{salary.user?.fullname || "-"}</p>
            <p className="text-sm text-gray-500">{salary.user?.email || "-"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "baseSalary",
      label: "الراتب الأساسي",
      render: (salary: Salary) => (
        <p className="text-lg font-bold text-blue-600">
          {salary.baseSalary.toFixed(2)} ج.م
        </p>
      ),
    },
    {
      key: "lastPaid",
      label: "آخر دفعة",
      render: (salary: Salary) => (
        <div>
          {salary.lastPaidMonth && salary.lastPaidYear ? (
            <>
              <p className="font-semibold text-gray-900">
                {salary.lastPaidMonth}/{salary.lastPaidYear}
              </p>
              <p className="text-xs text-gray-500">
                {salary.lastPaidAmount ? `${salary.lastPaidAmount.toFixed(2)} ج.م` : "-"}
              </p>
            </>
          ) : (
            <span className="text-gray-500">لم يتم الدفع بعد</span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      label: "حالة القالب",
      render: (salary: Salary) => <SalaryStatusBadge status={salary.status} />,
    },
    {
      key: "lastPaymentDate",
      label: "تاريخ آخر دفع",
      render: (salary: Salary) => (
        <span className="text-gray-600">
          {salary.lastPaymentDate
            ? format(new Date(salary.lastPaymentDate), "d MMMM yyyy", { locale: ar })
            : "-"}
        </span>
      ),
    },
  ];

  // Handlers
  const handleDelete = (salary: Salary) => {
    setDeleteConfirm({ isOpen: true, salary });
  };

  const handlePaySalary = (salary: Salary) => {
    setSelectedSalary(salary);
    setShowPayModal(true);
  };

  const confirmDelete = () => {
    if (deleteConfirm.salary) {
      deleteMutation.mutate({
        id: deleteConfirm.salary.id,
        companyId: company?.companyId || company?.company?.id || 0,
      });
      setDeleteConfirm({ isOpen: false, salary: null });
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm({ isOpen: false, salary: null });
  };

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  }, []);

  const handleStatusFilter = useCallback((value: string) => {
    setSelectedStatus(value);
    setCurrentPage(1);
  }, []);

  const handleMonthFilter = useCallback((value: string) => {
    setSelectedMonth(value);
    setCurrentPage(1);
  }, []);

  const handleYearFilter = useCallback((value: string) => {
    setSelectedYear(value);
    setCurrentPage(1);
  }, []);

  // Filter options
  const statusOptions = [
    { value: "", label: "جميع الحالات" },
    { value: "ACTIVE", label: "نشط" },
    { value: "INACTIVE", label: "غير نشط" },
  ];

  const monthOptions = [
    { value: "", label: "جميع الأشهر" },
    { value: "1", label: "يناير" },
    { value: "2", label: "فبراير" },
    { value: "3", label: "مارس" },
    { value: "4", label: "أبريل" },
    { value: "5", label: "مايو" },
    { value: "6", label: "يونيو" },
    { value: "7", label: "يوليو" },
    { value: "8", label: "أغسطس" },
    { value: "9", label: "سبتمبر" },
    { value: "10", label: "أكتوبر" },
    { value: "11", label: "نوفمبر" },
    { value: "12", label: "ديسمبر" },
  ];

  const currentYear = new Date().getFullYear();
  const yearOptions = [
    { value: "", label: "جميع السنوات" },
    ...Array.from({ length: 5 }, (_, i) => ({
      value: String(currentYear - i),
      label: String(currentYear - i),
    })),
  ];

  // Table filters configuration
  const tableFilters: TableFilter[] = useMemo(
    () => [
      {
        key: "status",
        label: "الحالة",
        type: "select",
        options: statusOptions,
        value: selectedStatus,
        onChange: (value) => handleStatusFilter(value as string),
      },
      {
        key: "month",
        label: "الشهر",
        type: "select",
        options: monthOptions,
        value: selectedMonth,
        onChange: (value) => handleMonthFilter(value as string),
      },
      {
        key: "year",
        label: "السنة",
        type: "select",
        options: yearOptions,
        value: selectedYear,
        onChange: (value) => handleYearFilter(value as string),
      },
    ],
    [selectedStatus, selectedMonth, selectedYear, handleStatusFilter, handleMonthFilter, handleYearFilter]
  );

  const handleClearFilters = useCallback(() => {
    setSelectedStatus("");
    setSelectedMonth("");
    setSelectedYear("");
    setCurrentPage(1);
  }, []);

  // Calculate summary stats
  const totalSalaries = summaryData?.data?.totalSalaries || 0;
  const paidThisMonth = summaryData?.data?.paidThisMonth || 0;
  const totalPaidAmount = summaryData?.data?.totalPaidAmount || 0;
  const unpaidCount = summaryData?.data?.unpaidCount || 0;

  return (
    <Layout>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">إدارة الرواتب</h1>
            <p className="text-gray-600 mt-1">
              تتبع وإدارة رواتب الموظفين
            </p>
          </div>
          <PermissionGuard permission="canManageExpenses">
            <Button onClick={() => navigate("/salaries/create")}>
              <Plus className="w-4 h-4 ml-2" />
              إضافة قالب راتب جديد
            </Button>
          </PermissionGuard>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">إجمالي الموظفين</p>
                <p className="text-2xl font-bold text-gray-900">{totalSalaries}</p>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-green-500/30">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">مدفوع هذا الشهر</p>
                <p className="text-2xl font-bold text-green-600">{paidThisMonth}</p>
                <p className="text-xs text-gray-500">{totalPaidAmount.toFixed(2)} ج.م</p>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">غير مدفوع</p>
                <p className="text-2xl font-bold text-orange-600">{unpaidCount}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Salaries Table with integrated search and filters */}
        <DataTable<Salary>
          title="جميع الرواتب"
          columns={columns}
          data={salariesData?.data?.list || []}
          loading={isLoading}
          searchPlaceholder="البحث في الرواتب (اسم الموظف...)"
          onSearch={handleSearch}
          filters={tableFilters}
          onClearFilters={handleClearFilters}
          actions={[
            {
              icon: Eye,
              label: "عرض التفاصيل",
              onClick: (salary) => navigate(`/salaries/${salary.id}`),
              variant: "primary",
            },
            {
              icon: Edit,
              label: "تعديل القالب",
              onClick: (salary) => navigate(`/salaries/${salary.id}/edit`),
              variant: "warning",
              show: () => hasPermission("canManageExpenses"),
            },
            {
              icon: Wallet,
              label: "دفع الراتب",
              onClick: (salary) => handlePaySalary(salary),
              variant: "success",
              show: (salary) => salary.status === "ACTIVE" && hasPermission("canManageExpenses"),
            },
            {
              icon: Trash2,
              label: "حذف القالب",
              onClick: (salary) => handleDelete(salary),
              variant: "danger",
              show: (salary) => salary.status === "ACTIVE" && hasPermission("canManageExpenses"),
            },
          ]}
          totalItems={salariesData?.data?.totalCount || 0}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          emptyMessage="لا توجد رواتب حتى الآن. قم بإضافة راتب جديد للبدء!"
        />

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={deleteConfirm.isOpen}
          onClose={cancelDelete}
          onConfirm={confirmDelete}
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف قالب راتب "${deleteConfirm.salary?.user?.fullname}"؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmText="حذف"
          cancelText="إلغاء"
          type="danger"
          isLoading={deleteMutation.isPending}
        />

        {/* Pay Salary Preview Modal */}
        <PaySalaryPreviewModal
          isOpen={showPayModal}
          onClose={() => {
            setShowPayModal(false);
            setSelectedSalary(null);
          }}
          salary={selectedSalary}
          companyId={company?.companyId || company?.company?.id || 0}
        />
      </div>
    </Layout>
  );
};

export default Salaries;
