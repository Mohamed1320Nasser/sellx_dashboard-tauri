import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Package, Edit, Trash2, Tag, LayoutGrid, ShoppingCart, Truck, LineChart as LineChartIcon, ArrowLeftRight } from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, ConfirmDialog } from '../components/ui';
import { PermissionGuard } from '../components/common/PermissionGuard';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { useProduct, useDeleteProduct } from '../hooks/api/useProducts';
import { formatCurrency, formatNumber } from '../utils/currencyUtils';
import type { Product } from '../types';
import { printBarcode } from '../services/smartPrintService';
import toast from 'react-hot-toast';
import { PrintBarcodeModal } from '../components/modals/PrintBarcodeModal';
import { formatQty, unitOf } from '../utils/quantity';
import { HeaderAction } from '../components/common/HeaderAction';
import { usePermissionStore } from '../stores/permissionStore';
import { productHistoryService, type ProductInsights } from '../services/productHistoryService';
import { Tile } from '../components/productDetails/HistoryParts';
import { DEFAULT_RANGE, shopDate, type HistoryRange } from '../components/productDetails/historyRange';
import ProductOverviewTab from '../components/productDetails/ProductOverviewTab';
import ProductSalesTab from '../components/productDetails/ProductSalesTab';
import ProductPurchasesTab from '../components/productDetails/ProductPurchasesTab';
import ProductPricesTab from '../components/productDetails/ProductPricesTab';
import ProductMovementsTab from '../components/productDetails/ProductMovementsTab';

type TabId = 'overview' | 'sales' | 'purchases' | 'prices' | 'movements';
const TABS: { id: TabId; label: string; icon: React.ElementType; managers?: boolean }[] = [
  { id: 'overview', label: 'نظرة عامة', icon: LayoutGrid },
  { id: 'sales', label: 'المبيعات', icon: ShoppingCart },
  { id: 'purchases', label: 'المشتريات', icon: Truck, managers: true },
  { id: 'prices', label: 'الأسعار', icon: LineChartIcon, managers: true },
  { id: 'movements', label: 'حركة المخزون', icon: ArrowLeftRight },
];

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

  // managers and owners see costs, purchases and price history
  const role = usePermissionStore(state => state.role);
  const isManager = role === 'ADMIN' || role === 'MANAGER';
  const companyName = company?.company?.name || company?.name;
  const { data: insights } = useQuery<ProductInsights>({
    queryKey: ['product-history', 'insights', id, companyId],
    queryFn: () => productHistoryService.insights(id || '', companyId || 0),
    enabled: !!id && !!companyId,
  });

  // the open tab lives in the link (?tab=sales), so refresh and back keep it
  const [searchParams, setSearchParams] = useSearchParams();
  const asked = searchParams.get('tab') as TabId | null;
  const tab: TabId = asked && TABS.some(t => t.id === asked && (!t.managers || isManager)) ? asked : 'overview';
  const setTab = (t: TabId) =>
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (t === 'overview') next.delete('tab');
        else next.set('tab', t);
        return next;
      },
      { replace: true }
    );
  // one choice of days for every history tab
  const [range, setRange] = useState<HistoryRange>(DEFAULT_RANGE);

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

  const unit = unitOf(product as any);
  const currentStock = insights?.stock ?? Number(product?.currentStock ?? product?.stockQuantity ?? 0);
  const minStock = Number(product?.minStockLevel || 0);
  const isLowStock = minStock > 0 && currentStock <= minStock;
  const sellingPrice = insights?.sellingPrice ?? Number(product?.sellingPrice || 0);
  const tabs = TABS.filter(t => !t.managers || isManager);
  const tabProps = { productId: id || '', productName: product.name, companyId, companyName, range, onRange: setRange };

  return (
    <Layout>
      <div className="w-full space-y-5">
        {/* Header */}
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
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-gray-900">{product.name}</h1>
              <p className="text-sm text-gray-500">
                {product.category?.name || 'بدون فئة'}
                {product.sku && (
                  <span className="mr-2 font-mono text-gray-400" dir="ltr">
                    {product.sku}
                  </span>
                )}
              </p>
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

        {/* Key numbers */}
        <div className={`grid grid-cols-2 gap-3 ${isManager ? 'md:grid-cols-3 xl:grid-cols-5' : 'md:grid-cols-4'}`}>
          <Tile
            label="المخزون"
            value={formatQty(currentStock, unit || 'قطعة')}
            tone={currentStock <= 0 ? 'bad' : isLowStock ? 'warn' : 'default'}
            sub={
              currentStock <= 0
                ? 'نفد من المخزون'
                : isLowStock
                  ? `أقل من حد التنبيه (${formatQty(minStock, unit)})`
                  : insights?.daysOfStock != null
                    ? `يكفي حوالي ${formatNumber(insights.daysOfStock)} يوم`
                    : insights
                      ? 'لا مبيعات آخر 30 يوم'
                      : undefined
            }
          />
          <Tile label="سعر البيع" value={sellingPrice > 0 ? formatCurrency(sellingPrice) : 'بدون سعر'} tone={sellingPrice > 0 ? 'default' : 'warn'} sub={unit ? `لكل ${unit}` : 'للقطعة'} />
          {isManager && (
            <Tile
              label="التكلفة"
              value={insights?.purchasePrice !== undefined ? formatCurrency(insights.purchasePrice) : '—'}
              tone={insights?.margin != null && insights.margin < 0 ? 'bad' : 'default'}
              sub={insights?.margin != null ? `هامش الربح ⁦${insights.margin.toFixed(1)}%⁩` : undefined}
            />
          )}
          <Tile
            label="مبيعات آخر 30 يوم"
            value={insights ? formatQty(insights.last30.qty, unit || 'قطعة') : '—'}
            sub={insights ? formatCurrency(insights.last30.revenue) : undefined}
          />
          <Tile
            label="آخر بيع"
            value={insights?.lastSale ? shopDate(insights.lastSale.at) : insights ? 'لم يُبع بعد' : '—'}
            sub={insights?.lastPurchase ? `آخر شراء ${shopDate(insights.lastPurchase.at)}` : insights ? 'لم يُشترَ بعد' : undefined}
          />
        </div>

        {/* Tabs */}
        <div className="-mx-1 overflow-x-auto px-1">
          <nav role="tablist" aria-label="بيانات المنتج" className="flex min-w-max gap-1 border-b border-gray-200">
            {tabs.map(t => {
              const Icon = t.icon;
              const selected = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(t.id)}
                  className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    selected ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div role="tabpanel">
          {tab === 'overview' && <ProductOverviewTab product={product} insights={insights} unit={unit} />}
          {tab === 'sales' && <ProductSalesTab {...tabProps} isManager={isManager} />}
          {tab === 'purchases' && isManager && <ProductPurchasesTab {...tabProps} />}
          {tab === 'prices' && isManager && <ProductPricesTab {...tabProps} />}
          {tab === 'movements' && <ProductMovementsTab {...tabProps} />}
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
