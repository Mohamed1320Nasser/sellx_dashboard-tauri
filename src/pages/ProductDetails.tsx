import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, DollarSign, AlertTriangle, Edit, Trash2, Tag } from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, Card, ConfirmDialog } from '../components/ui';
import { PermissionGuard } from '../components/common/PermissionGuard';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { useProduct, useDeleteProduct } from '../hooks/api/useProducts';
import { formatCurrency, formatNumber } from '../utils/currencyUtils';
import { formatTableDate } from '../utils/dateUtils';
import type { Product } from '../types';
import { printBarcode } from '../services/smartPrintService';
import toast from 'react-hot-toast';
import { PrintBarcodeModal } from '../components/modals/PrintBarcodeModal';
import { formatQty, unitOf } from '../utils/quantity';
import { HeaderAction } from '../components/common/HeaderAction';

const ProductDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();

  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    product: Product | null;
  }>({ isOpen: false, product: null });

  const [printModal, setPrintModal] = useState<{
    isOpen: boolean;
    product: Product | null;
  }>({ isOpen: false, product: null });

  // Fetch product details using the single endpoint
  const companyId = company?.companyId || company?.company?.id;

  // Only fetch if we have both id and companyId
  const { data: productData, isLoading, error } = useProduct(
    id || '',
    companyId || 0
  );
  const deleteMutation = useDeleteProduct();

  const product = productData;

  const handleEdit = () => {
    navigate(`/products/${id}/edit`);
  };

  const handleDelete = () => {
    if (product) {
      setDeleteConfirm({ isOpen: true, product });
    }
  };

  const confirmDelete = () => {
    if (deleteConfirm.product) {
      deleteMutation.mutate({
        id: deleteConfirm.product.id,
        companyId: companyId,
      }, {
        onSuccess: () => {
          navigate('/products');
        }
      });
      setDeleteConfirm({ isOpen: false, product: null });
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm({ isOpen: false, product: null });
  };

  const handlePrintBarcode = () => {
    if (!product) {
      toast.error("لا توجد بيانات المنتج");
      return;
    }

    if (!product.sku) {
      toast.error("لا يوجد رمز SKU لهذا المنتج");
      return;
    }

    setPrintModal({ isOpen: true, product });
  };

  const handlePrint = async (quantity: number) => {
    if (!printModal.product) return;

    try {
      await printBarcode({
        barcode: printModal.product.sku,
        productName: printModal.product.name,
        price: printModal.product.sellingPrice,
      }, quantity);

      toast.success(`تم طباعة ${quantity} نسخة من الباركود بنجاح`);
    } catch (error: any) {
      const errorMessage = error.message || 'فشلت طباعة الباركود';
      toast.error(errorMessage);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="w-full space-y-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-64 bg-gray-200 rounded mb-4"></div>
            <div className="h-64 bg-gray-200 rounded mb-4"></div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!companyId) {
    return (
      <Layout>
        <div className="w-full space-y-6">
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">خطأ في البيانات</h2>
            <p className="text-gray-600 mb-4">لم يتم العثور على معرف الشركة</p>
            <Button onClick={() => navigate('/products')}>
              العودة إلى قائمة المنتجات
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !product) {
    return (
      <Layout>
        <div className="w-full space-y-6">
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">المنتج غير موجود</h2>
            <p className="text-gray-600 mb-4">لم يتم العثور على المنتج المطلوب</p>
            <Button onClick={() => navigate('/products')}>
              العودة إلى قائمة المنتجات
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const currentStock = product?.currentStock || product?.stockQuantity || 0;
  const minStock = product?.minStockLevel || 0;
  const isLowStock = currentStock <= minStock;
  const stockStatusColor = isLowStock ? 'text-red-600' : 'text-green-600';
  
  // FIX #4: Calculate profit margin correctly (retail industry standard)
  const purchasePrice = product?.purchasePrice || 0;
  const sellingPrice = product?.sellingPrice || 0;
  const profitAmount = sellingPrice - purchasePrice; // Amount of profit
  // Margin = (Profit / Selling Price) × 100 (not Profit / Cost)
  const profitMarginPercentage = sellingPrice > 0 ? (profitAmount / sellingPrice * 100) : 0;

  return (
    <Layout>
      <div className="w-full space-y-6">
        {/* Clean Header Section */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              onClick={() => navigate('/products')}
              className="flex items-center space-x-2 space-x-reverse text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>العودة</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {product?.name || 'منتج غير محدد'}
              </h1>
              <p className="text-gray-500 text-sm">تفاصيل المنتج</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HeaderAction icon={Tag} label="طباعة الباركود" onClick={handlePrintBarcode} />
            <PermissionGuard permission="canEditProducts">
              <HeaderAction icon={Edit} label="تعديل" onClick={handleEdit} tone="primary" />
            </PermissionGuard>
            <PermissionGuard permission="canDeleteProducts">
              <HeaderAction icon={Trash2} label="حذف المنتج" onClick={handleDelete} tone="danger" iconOnly />
            </PermissionGuard>
          </div>
        </div>

        {/* Stock Status Alert */}
        {isLowStock && minStock > 0 && (
          <div className="bg-gradient-to-r from-red-50 to-red-100 rounded-xl p-6 border border-red-200 shadow-sm">
            <div className="flex items-center">
              <div className="p-2 bg-red-600 rounded-lg ml-3">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-red-800">مخزون منخفض</h3>
                <p className="text-red-700">
                  المخزون الحالي ({formatQty(currentStock, unitOf(product as any))}) أقل من الحد الأدنى المطلوب ({formatQty(minStock, unitOf(product as any))})
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Product Overview Section */}
        <div className="space-y-6">
          {/* Data Status Message */}
          {(!product?.name || !product?.sku) && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600 ml-2" />
                <div>
                  <h3 className="text-sm font-medium text-yellow-800">بيانات المنتج غير مكتملة</h3>
                  <p className="text-sm text-yellow-700">
                    يبدو أن بعض بيانات المنتج مفقودة. يمكنك النقر على زر "تعديل" لإضافة أو تحديث المعلومات المطلوبة.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Basic Information Card */}
            <Card padding="lg" className="lg:col-span-2">
              <div className="space-y-6">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mr-3">المعلومات الأساسية</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">اسم المنتج</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">{product?.name || 'غير محدد'}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">رمز المنتج (SKU)</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">{product?.sku || 'غير محدد'}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الفئة</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">{product?.category?.name || 'غير محدد'}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الإنشاء</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">
                        {product?.createdAt ? formatTableDate(product.createdAt) : 'غير محدد'}
                      </span>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
                    <div className="bg-gray-50 rounded-lg p-3 border min-h-[100px]">
                      <span className="text-gray-900">
                        {product?.description || 'لا يوجد وصف متاح لهذا المنتج'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Pricing & Stock Card */}
            <Card padding="lg">
              <div className="space-y-6">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mr-3">التسعير والمخزون</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">سعر الشراء</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">
                        {purchasePrice > 0 ? formatCurrency(purchasePrice) : 'غير محدد'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">سعر البيع</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">
                        {sellingPrice > 0 ? formatCurrency(sellingPrice) : 'غير محدد'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الكمية المتاحة</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className={`font-medium ${stockStatusColor}`}>
                        {formatQty(currentStock, unitOf(product as any))}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الحد الأدنى للمخزون</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">
                        {formatQty(minStock, unitOf(product as any))}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">مبلغ الربح</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="font-medium text-green-600">
                        {profitAmount > 0 ? formatCurrency(profitAmount) : 'غير محدد'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">هامش الربح</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="font-medium text-green-600">
                        {profitMarginPercentage > 0 ? `${profitMarginPercentage.toFixed(1)}%` : 'غير محدد'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

        </div>

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

export default ProductDetails;
