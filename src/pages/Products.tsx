import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Edit, Trash2, Package, AlertTriangle, Eye, Folder, Printer, ShoppingCart, FolderInput } from "lucide-react";
import { Layout } from "../components/layout";
import { Button, Card, DataTable, Badge, ConfirmDialog, Modal, Select } from "../components/ui";
import type { Column, TableFilter } from "../components/ui/DataTable";
import { PermissionGuard } from "../components/common/PermissionGuard";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { usePermissionStore } from "../stores/permissionStore";
import {
  useProducts,
  useDeleteProduct,
} from "../hooks/api/useProducts";
import { useCategories } from "../hooks/api/useCategories";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "../config/queryKeys";
import { productService } from "../services/productService";
import type { Product } from "../types";
import { printBarcode } from "../services/smartPrintService";
import { ensurePrinterMode } from "../services/printerModeService";
import { PrintBarcodeModal } from "../components/modals/PrintBarcodeModal";
import toast from 'react-hot-toast';

const Products: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { company } = useSessionAuthStore();
  const { hasPermission } = usePermissionStore();
  const resolvedCompanyId = company?.companyId || company?.company?.id;

  const prefetchProduct = (productId: string | number) => {
    if (!resolvedCompanyId) return;
    queryClient.prefetchQuery({
      queryKey: qk.products.detail(productId, resolvedCompanyId),
      queryFn: () => productService.getById(String(productId), resolvedCompanyId as number),
      staleTime: 10 * 1000,
    });
  };
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showLowStock, setShowLowStock] = useState(false);
  // Removed showCreateModal state - now using navigation
  // Removed editingProduct state - now using navigation to edit page
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    product: Product | null;
  }>({ isOpen: false, product: null });
  const [printModal, setPrintModal] = useState<{
    isOpen: boolean;
    product: Product | null;
  }>({ isOpen: false, product: null });

  // ── Bulk selection state (current-page scope) ──
  const [selectedIds, setSelectedIds] = useState<(string | number)[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMoveCategoryId, setBulkMoveCategoryId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  // API hooks
  const { data: productsData, isLoading } = useProducts({
    companyId: company?.companyId || company?.company?.id,
    page: currentPage,
    limit: pageSize,
    search: searchTerm,
    categoryId: selectedCategory || undefined,
    lowStock: showLowStock,
  });

  const { data: categoriesData } = useCategories({
    companyId: company?.companyId || 0,
    limit: 100,
  });

  // Removed createMutation and updateMutation - now handled in dedicated pages
  const deleteMutation = useDeleteProduct();

  // Table columns - simplified to show only essential information
  const columns: Column<Product>[] = [
    {
      key: "name",
      label: "اسم المنتج",
      render: (product: Product) => (
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
            <Package className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{product.name}</p>
            <p className="text-sm text-gray-500">SKU: {product.sku}</p>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      label: "الفئة",
      render: (product: Product) => (
        <Badge variant="primary">{(product as any).category?.name || "غير محدد"}</Badge>
      ),
    },
    {
      key: "stockQuantity",
      label: "المخزون",
      render: (product: Product) => {
        const stock = product.stockQuantity;
        const minLevel = product.minStockLevel;
        const isLow = stock <= minLevel;
        const isMedium = stock <= minLevel * 2 && stock > minLevel;

        return (
          <div className="flex items-center gap-2">
            <span
              className={`text-lg ${
                isLow ? "text-warning-600" : isMedium ? "text-warning-500" : "text-success-600"
              }`}
            >
              {stock}
            </span>
            {isLow && (
              <Badge variant="warning" dot>
                <AlertTriangle className="w-3 h-3 ml-1 inline" />
                منخفض
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "sellingPrice",
      label: "سعر البيع",
      render: (product: Product) => (
        <span className="text-gray-900 text-lg">{product.sellingPrice} ج.م</span>
      ),
    },
  ];

  // Handlers
  // Removed handleCreate - now handled in ProductCreate page

  // Removed handleUpdate - now handled in ProductEdit page

  const handleDelete = (product: Product) => {
    setDeleteConfirm({ isOpen: true, product });
  };

  const confirmDelete = () => {
    if (deleteConfirm.product) {
      deleteMutation.mutate({
        id: deleteConfirm.product.id,
        companyId: company?.companyId || company?.company?.id,
      });
      setDeleteConfirm({ isOpen: false, product: null });
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm({ isOpen: false, product: null });
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
    { value: "", label: "جميع الفئات" },
    ...(categoriesData?.data?.list.map((category) => ({
      value: category.id,
      label: category.name,
    })) || []),
  ], [categoriesData]);

  // Table filters configuration
  const tableFilters: TableFilter[] = useMemo(() => [
    {
      key: 'category',
      label: 'الفئة',
      type: 'select',
      options: categoryOptions,
      value: selectedCategory,
      onChange: (value) => handleCategoryFilter(value as string),
    },
    {
      key: 'lowStock',
      label: 'المخزون المنخفض',
      type: 'checkbox',
      value: showLowStock,
      onChange: (value) => {
        setShowLowStock(value as boolean);
        setCurrentPage(1);
      },
    },
  ], [categoryOptions, selectedCategory, showLowStock, handleCategoryFilter]);

  const handleClearFilters = useCallback(() => {
    setSelectedCategory("");
    setShowLowStock(false);
    setCurrentPage(1);
  }, []);

  const handlePrintBarcode = (product: Product) => {
    if (!product.sku) {
      toast.error("لا يوجد رمز SKU لهذا المنتج");
      return;
    }
    setPrintModal({ isOpen: true, product });
  };

  const handlePrint = async (quantity: number) => {
    console.log('📦 PRODUCTS PAGE: handlePrint called', {
      product: printModal.product?.name,
      quantity
    });

    if (!printModal.product) {
      console.error('❌ No product selected');
      return;
    }

    try {
      console.log('📦 PRODUCTS PAGE: Calling printBarcode...');
      await printBarcode({
        barcode: printModal.product.sku,
        productName: printModal.product.name,
        price: printModal.product.sellingPrice,
      }, quantity);

      console.log('✅ PRODUCTS PAGE: Print successful');
      toast.success(`تم طباعة ${quantity} نسخة من الباركود بنجاح`);
    } catch (error: any) {
      console.error('❌ PRODUCTS PAGE: Print failed:', error);
      const errorMessage = error.message || 'فشلت طباعة الباركود';
      toast.error(errorMessage);
    }
  };

  // ── Bulk operations ──
  const currentPageProducts: Product[] = (productsData as any)?.data?.list || [];
  const selectedProducts = useMemo(
    () => currentPageProducts.filter((p) => selectedIds.includes(p.id)),
    [currentPageProducts, selectedIds]
  );

  // Clear selection whenever the page/filters change (current-page scope)
  useEffect(() => {
    setSelectedIds([]);
  }, [currentPage, pageSize, searchTerm, selectedCategory, showLowStock]);

  const handleBulkDelete = async () => {
    if (!resolvedCompanyId || selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await productService.bulkDelete(
        resolvedCompanyId as number,
        selectedIds.map(String)
      );
      const deleted = res?.data?.deletedCount ?? res?.deletedCount ?? 0;
      const failedCount = res?.data?.failedCount ?? res?.failedCount ?? 0;
      if (deleted > 0) toast.success(`تم حذف ${deleted} منتج`);
      if (failedCount > 0)
        toast.error(`تعذّر حذف ${failedCount} منتج (مرتبط بمبيعات أو مخزون)`);
      setSelectedIds([]);
      setBulkDeleteOpen(false);
      queryClient.invalidateQueries({ queryKey: qk.products.all });
    } catch {
      toast.error("فشل الحذف الجماعي");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkMoveCategory = async () => {
    if (!resolvedCompanyId || selectedIds.length === 0 || !bulkMoveCategoryId) return;
    setBulkBusy(true);
    try {
      const res = await productService.bulkMoveCategory(
        resolvedCompanyId as number,
        selectedIds.map(String),
        bulkMoveCategoryId
      );
      const moved = res?.data?.movedCount ?? res?.movedCount ?? 0;
      toast.success(`تم نقل ${moved} منتج إلى الفئة المحددة`);
      setSelectedIds([]);
      setBulkMoveOpen(false);
      setBulkMoveCategoryId("");
      queryClient.invalidateQueries({ queryKey: qk.products.all });
    } catch {
      toast.error("فشل نقل الفئة");
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkAddToInvoice = () => {
    if (selectedIds.length === 0) return;
    navigate("/sales/create", { state: { bulkProductIds: selectedIds } });
  };

  const handleBulkPrintBarcodes = async () => {
    const printable = selectedProducts.filter((p) => p.sku);
    if (printable.length === 0) {
      toast.error("لا توجد منتجات تحتوي على باركود للطباعة");
      return;
    }
    // ask about the printer mode once for the whole batch, not per product
    try {
      await ensurePrinterMode("label");
    } catch {
      toast("تم إلغاء الطباعة");
      return;
    }
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (const product of printable) {
      try {
        await printBarcode(
          {
            barcode: product.sku,
            productName: product.name,
            price: product.sellingPrice,
          },
          1
        );
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBulkBusy(false);
    if (ok > 0) toast.success(`تم طباعة باركود ${ok} منتج`);
    if (fail > 0) toast.error(`فشلت طباعة ${fail} منتج`);
  };

  const bulkMoveCategoryOptions = useMemo(
    () =>
      (categoriesData?.data?.list || []).map((c) => ({ value: c.id, label: c.name })),
    [categoriesData]
  );

  // Calculate summary stats
  const totalProducts = (productsData as any)?.data?.totalCount || 0;
  const lowStockCount = (productsData as any)?.data?.list.filter(
    (p: any) => p.stockQuantity <= p.minStockLevel
  ).length || 0;

  return (
    <Layout>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">إدارة المنتجات</h1>
            <p className="text-gray-600 mt-1">
              إدارة منتجات المتجر والتحكم في المخزون
            </p>
          </div>
          <PermissionGuard permission="canCreateProducts">
            <Button onClick={() => navigate('/products/create')}>
              <Plus className="w-4 h-4 ml-2" />
              إضافة منتج جديد
            </Button>
          </PermissionGuard>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary-500/30">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">إجمالي المنتجات</p>
                <p className="text-2xl font-bold text-gray-900">{totalProducts}</p>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-500/30">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">مخزون منخفض</p>
                <p className="text-2xl font-bold text-red-600">{lowStockCount}</p>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-green-500/30">
                <Folder className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">الفئات</p>
                <p className="text-2xl font-bold text-green-600">
                  {categoriesData?.data?.totalCount || 0}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Products Table with integrated search and filters */}
        <DataTable<Product>
          title="جميع المنتجات"
          columns={columns}
          data={productsData?.data?.list || []}
          loading={isLoading}
          searchPlaceholder="البحث في المنتجات (الاسم، SKU...)"
          onSearch={handleSearch}
          filters={tableFilters}
          onClearFilters={handleClearFilters}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          renderBulkActions={() => (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkAddToInvoice}
                disabled={bulkBusy}
                className="flex items-center"
              >
                <ShoppingCart className="w-4 h-4 ml-1" />
                إضافة للفاتورة
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkPrintBarcodes}
                disabled={bulkBusy}
                className="flex items-center"
              >
                <Printer className="w-4 h-4 ml-1" />
                طباعة الباركود
              </Button>
              {hasPermission("canEditProducts") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkMoveOpen(true)}
                  disabled={bulkBusy}
                  className="flex items-center"
                >
                  <FolderInput className="w-4 h-4 ml-1" />
                  نقل لفئة
                </Button>
              )}
              {hasPermission("canDeleteProducts") && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkDeleteOpen(true)}
                  disabled={bulkBusy}
                  className="flex items-center"
                >
                  <Trash2 className="w-4 h-4 ml-1" />
                  حذف
                </Button>
              )}
            </>
          )}
          actions={[
            {
              icon: Eye,
              label: "عرض التفاصيل",
              onClick: (product) => navigate(`/products/${product.id}`),
              onHover: (product) => prefetchProduct(product.id),
              variant: "primary",
            },
            {
              icon: Printer,
              label: "طباعة الباركود",
              onClick: (product) => handlePrintBarcode(product),
              variant: "primary",
            },
            {
              icon: Edit,
              label: "تعديل المنتج",
              onClick: (product) => navigate(`/products/${product.id}/edit`),
              onHover: (product) => prefetchProduct(product.id),
              variant: "warning",
              show: () => hasPermission("canEditProducts"),
            },
            {
              icon: Trash2,
              label: "حذف المنتج",
              onClick: (product) => handleDelete(product),
              variant: "danger",
              show: () => hasPermission("canDeleteProducts"),
            },
          ]}
          totalItems={productsData?.data?.totalCount || 0}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          emptyMessage="لا توجد منتجات حتى الآن. قم بإضافة منتج جديد للبدء!"
        />

        {/* Create Modal removed - now using dedicated ProductCreate page */}

        {/* Edit Modal removed - now using dedicated ProductEdit page */}

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={deleteConfirm.isOpen}
          onClose={cancelDelete}
          onConfirm={confirmDelete}
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف المنتج "${deleteConfirm.product?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmText="حذف"
          cancelText="إلغاء"
          type="danger"
          isLoading={deleteMutation.isPending}
        />

        {/* Bulk Delete Confirmation */}
        <ConfirmDialog
          isOpen={bulkDeleteOpen}
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={handleBulkDelete}
          title="تأكيد الحذف الجماعي"
          message={`هل أنت متأكد من حذف ${selectedIds.length} منتج؟ المنتجات المرتبطة بمبيعات أو مخزون لن يتم حذفها.`}
          confirmText="حذف"
          cancelText="إلغاء"
          type="danger"
          isLoading={bulkBusy}
        />

        {/* Bulk Move Category Modal */}
        <Modal
          isOpen={bulkMoveOpen}
          onClose={() => setBulkMoveOpen(false)}
          title="نقل المنتجات إلى فئة"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              سيتم نقل {selectedIds.length} منتج إلى الفئة المختارة.
            </p>
            <Select
              label="الفئة"
              placeholder="اختر الفئة"
              options={bulkMoveCategoryOptions}
              value={bulkMoveCategoryId}
              onChange={(v) => setBulkMoveCategoryId(v)}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkMoveOpen(false)} disabled={bulkBusy}>
                إلغاء
              </Button>
              <Button
                onClick={handleBulkMoveCategory}
                disabled={bulkBusy || !bulkMoveCategoryId}
              >
                نقل
              </Button>
            </div>
          </div>
        </Modal>

        {/* Print Barcode Modal */}
        {printModal.product && (
          <PrintBarcodeModal
            isOpen={printModal.isOpen}
            onClose={() => setPrintModal({ isOpen: false, product: null })}
            onPrint={handlePrint}
            product={{
              name: printModal.product.name,
              sku: printModal.product.sku,
              price: printModal.product.sellingPrice,
            }}
          />
        )}
      </div>
    </Layout>
  );
};

export default Products;
