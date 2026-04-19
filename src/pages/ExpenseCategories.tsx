import React, { useState } from "react";
import { Plus, Edit, Trash2, Receipt, Calendar, Power, PowerOff } from "lucide-react";
import { Layout } from "../components/layout";
import { Button, Card, Modal, Input, Textarea, ConfirmDialog, DataTable, Badge } from "../components/ui";
import type { Column } from "../components/ui/DataTable";
import { PermissionGuard } from "../components/common/PermissionGuard";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import {
  useExpenseCategories,
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
  useDeleteExpenseCategory,
  useToggleExpenseCategoryActive,
  useSeedDefaultExpenseCategories,
} from "../hooks/api/useExpenseCategories";
import { formatTableDate } from "../utils/dateUtils";
import type { ExpenseCategory } from "../types";
import toast from "react-hot-toast";

const ExpenseCategories: React.FC = () => {
  const { company } = useSessionAuthStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    category: ExpenseCategory | null;
  }>({ isOpen: false, category: null });

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "",
    color: "#3B82F6",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Get company ID
  const companyId = company?.companyId || company?.company?.id;

  // API hooks
  const { data: categoriesData, isLoading } = useExpenseCategories({
    companyId: companyId!,
    includeInactive: true,
    search: searchTerm,
  });

  const createMutation = useCreateExpenseCategory();
  const updateMutation = useUpdateExpenseCategory();
  const deleteMutation = useDeleteExpenseCategory();
  const toggleActiveMutation = useToggleExpenseCategoryActive();
  const seedDefaultsMutation = useSeedDefaultExpenseCategories();

  // Reset form
  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      icon: "",
      color: "#3B82F6",
    });
    setFormErrors({});
  };

  // Table columns
  const columns: Column<ExpenseCategory>[] = [
    {
      key: "name",
      label: "اسم التصنيف",
      render: (category: ExpenseCategory) => (
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg"
            style={{ backgroundColor: category.color || "#3B82F6" }}
          >
            <Receipt className="w-5 h-5 text-white" />
          </div>
          <span className="font-medium text-gray-900">{category.name}</span>
        </div>
      ),
    },
    {
      key: "description",
      label: "الوصف",
      render: (category: ExpenseCategory) => {
        const description = category.description || "";
        const maxLength = 50;
        const shouldTruncate = description.length > maxLength;

        if (!description) {
          return <span className="text-gray-400 text-sm italic">لا يوجد وصف</span>;
        }

        return (
          <span className="text-gray-600 text-sm">
            {shouldTruncate ? `${description.slice(0, maxLength)}...` : description}
          </span>
        );
      },
    },
    {
      key: "_count",
      label: "عدد المصروفات",
      render: (category: ExpenseCategory) => (
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-red-600" />
          <span className="font-bold text-red-600">{category._count?.expenses || 0}</span>
        </div>
      ),
    },
    {
      key: "isActive",
      label: "الحالة",
      render: (category: ExpenseCategory) => (
        <Badge variant={category.isActive ? "success" : "error"}>
          {category.isActive ? "نشط" : "غير نشط"}
        </Badge>
      ),
    },
    {
      key: "createdAt",
      label: "تاريخ الإنشاء",
      render: (category: ExpenseCategory) => (
        <div className="flex items-center gap-2 text-gray-600">
          <Calendar className="w-4 h-4" />
          <span>{formatTableDate(category.createdAt)}</span>
        </div>
      ),
    },
  ];

  // Validate form
  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = "اسم التصنيف مطلوب";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handlers
  const handleCreate = () => {
    if (!validateForm()) return;

    createMutation.mutate(
      {
        data: {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          icon: formData.icon.trim() || undefined,
          color: formData.color,
        },
        companyId: companyId!,
      },
      {
        onSuccess: () => {
          setShowCreateModal(false);
          resetForm();
        },
      }
    );
  };

  const handleUpdate = () => {
    if (!editingCategory || !validateForm()) return;

    updateMutation.mutate(
      {
        id: editingCategory.id,
        data: {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          icon: formData.icon.trim() || undefined,
          color: formData.color,
        },
        companyId: companyId!,
      },
      {
        onSuccess: () => {
          setEditingCategory(null);
          resetForm();
        },
      }
    );
  };

  const handleDelete = (category: ExpenseCategory) => {
    setDeleteConfirm({ isOpen: true, category });
  };

  const confirmDelete = () => {
    if (deleteConfirm.category) {
      deleteMutation.mutate(
        {
          id: deleteConfirm.category.id,
          companyId: companyId!,
        },
        {
          onSuccess: () => {
            setDeleteConfirm({ isOpen: false, category: null });
          },
        }
      );
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm({ isOpen: false, category: null });
  };

  const handleToggleActive = (category: ExpenseCategory) => {
    toggleActiveMutation.mutate({
      id: category.id,
      companyId: companyId!,
    });
  };

  const handleEdit = (category: ExpenseCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      description: category.description || "",
      icon: category.icon || "",
      color: category.color || "#3B82F6",
    });
  };

  const handleSeedDefaults = () => {
    seedDefaultsMutation.mutate(companyId!);
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
  };

  const totalCategories = categoriesData?.data?.length || 0;
  const activeCategories = categoriesData?.data?.filter(c => c.isActive).length || 0;

  return (
    <Layout>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">تصنيفات المصروفات</h1>
            <p className="text-gray-600 mt-1">
              إدارة تصنيفات المصروفات المختلفة
            </p>
          </div>
          <div className="flex gap-2">
            <PermissionGuard permission="canManageExpenses">
              <Button
                variant="ghost"
                onClick={handleSeedDefaults}
                disabled={seedDefaultsMutation.isPending}
              >
                {seedDefaultsMutation.isPending ? "جاري الإضافة..." : "إضافة التصنيفات الافتراضية"}
              </Button>
            </PermissionGuard>
            <PermissionGuard permission="canManageExpenses">
              <Button onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}>
                <Plus className="w-4 h-4 ml-2" />
                إضافة تصنيف جديد
              </Button>
            </PermissionGuard>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
                <Receipt className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">إجمالي التصنيفات</p>
                <p className="text-2xl font-bold text-gray-900">{totalCategories}</p>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-green-500/30">
                <Power className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">التصنيفات النشطة</p>
                <p className="text-2xl font-bold text-green-600">{activeCategories}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Categories Table */}
        <DataTable<ExpenseCategory>
          title="جميع التصنيفات"
          columns={columns}
          data={categoriesData?.data || []}
          loading={isLoading}
          searchPlaceholder="البحث في التصنيفات..."
          onSearch={handleSearch}
          actions={[
            {
              icon: Edit,
              label: "تعديل",
              onClick: handleEdit,
              variant: "warning",
              show: () => true,
            },
            {
              icon: Power,
              label: "تفعيل/تعطيل",
              onClick: handleToggleActive,
              variant: "primary",
              show: () => true,
            },
            {
              icon: Trash2,
              label: "حذف",
              onClick: handleDelete,
              variant: "danger",
              show: (category: ExpenseCategory) => (category._count?.expenses || 0) === 0,
            },
          ]}
          emptyMessage="لا توجد تصنيفات حتى الآن. قم بإضافة تصنيف جديد أو استخدم التصنيفات الافتراضية!"
        />

        {/* Create/Edit Modal */}
        <Modal
          isOpen={showCreateModal || !!editingCategory}
          onClose={() => {
            setShowCreateModal(false);
            setEditingCategory(null);
            resetForm();
          }}
          title={editingCategory ? "تعديل التصنيف" : "إضافة تصنيف جديد"}
        >
          <div className="space-y-4">
            <Input
              label="اسم التصنيف *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="مثال: توصيل، نظافة، طعام..."
              error={formErrors.name}
            />

            <Textarea
              label="الوصف"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="وصف التصنيف (اختياري)..."
              rows={3}
            />

            <Input
              label="اللون"
              type="color"
              value={formData.color}
              onChange={(e) => setFormData({ ...formData, color: e.target.value })}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingCategory(null);
                  resetForm();
                }}
              >
                إلغاء
              </Button>
              <Button
                onClick={editingCategory ? handleUpdate : handleCreate}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingCategory ? "حفظ التغييرات" : "إضافة"}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={deleteConfirm.isOpen}
          onClose={cancelDelete}
          onConfirm={confirmDelete}
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف التصنيف "${deleteConfirm.category?.name}"؟`}
          confirmText="حذف"
          cancelText="إلغاء"
          type="danger"
          isLoading={deleteMutation.isPending}
        />
      </div>
    </Layout>
  );
};

export default ExpenseCategories;
