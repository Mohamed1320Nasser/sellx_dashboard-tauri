import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowRight, AlertCircle, AlertTriangle, History, SlidersHorizontal } from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, Input, Textarea, Select } from '../components/ui';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { usePermissionStore } from '../stores/permissionStore';
import { useUpdateProduct, useProduct } from '../hooks/api/useProducts';
import { useCategories } from '../hooks/api/useCategories';
import toast from 'react-hot-toast';
import ProductUnitFields from '../components/products/ProductUnitFields';
import ProductPacksEditor, { packsProblem, packsToRows, rowsToPacks, type PackRow } from '../components/products/ProductPacksEditor';
import ProductListPrices from '../components/products/ProductListPrices';
import ProductFormSection from '../components/products/ProductFormSection';
import FormSaveBar from '../components/products/FormSaveBar';
import StockAdjustModal from '../components/products/StockAdjustModal';
import { formatCurrency } from '../utils';
import { formatQty, normalizeDigits, parseQty, toQty } from '../utils/quantity';

/**
 * Edit a product's own data. Prices are changed in the price lists (the card below saves them
 * at once) and the quantity with a stock adjustment that has a reason, so both keep a history.
 */
const ProductEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;
  const role = usePermissionStore(s => s.role);
  const canAdjust = role === 'ADMIN' || role === 'MANAGER';

  const [packRows, setPackRows] = useState<PackRow[]>([]);
  const [showPackErrors, setShowPackErrors] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    minStockLevel: '',
    categoryId: '',
    unit: '',
    allowDecimalQty: false,
    scaleCode: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch product — seeded from list cache by the hook, so fields appear instantly when navigating from the list
  const { data: product, isLoading, isFetching } = useProduct(id!, companyId!);
  const p = product as any;

  const { data: categoriesData } = useCategories({ companyId: companyId!, page: 1, limit: 100 });
  const updateMutation = useUpdateProduct();

  // Fill the form once per product: a background refresh must not wipe what the user is typing
  const filledFor = useRef<string | null>(null);
  useEffect(() => {
    if (product && filledFor.current !== id) {
      filledFor.current = id!;
      setFormData({
        name: p.name || '',
        sku: p.sku || '',
        description: p.description || '',
        minStockLevel: formatQty(p.minStockLevel || 0),
        categoryId: p.categoryId || '',
        unit: p.unit || '',
        allowDecimalQty: !!p.allowDecimalQty,
        scaleCode: p.scaleCode || '',
      });
      setPackRows(packsToRows(p.packs));
    }
  }, [product, id, p]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'اسم المنتج مطلوب';
    if (!formData.sku.trim()) newErrors.sku = 'الباركود مطلوب';
    if (!formData.categoryId) newErrors.categoryId = 'الفئة مطلوبة';
    const min = parseQty(formData.minStockLevel, { allowDecimalQty: formData.allowDecimalQty });
    if (min === null || min < 0) {
      newErrors.minStockLevel = formData.allowDecimalQty ? 'صفر أو أكثر (حتى 3 أرقام عشرية)' : 'رقم صحيح صفر أو أكثر';
    }
    const packProblem = packsProblem(packRows, formData.allowDecimalQty);
    if (packProblem) {
      newErrors.packs = packProblem;
      setShowPackErrors(true);
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      // one message: the pack problem when there is one, else the general one
      toast.error(packsProblem(packRows, formData.allowDecimalQty) ?? 'يرجى تصحيح الأخطاء في النموذج', { id: 'form-problem' });
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: id!,
        data: {
          name: formData.name.trim(),
          sku: formData.sku.trim(),
          description: formData.description.trim(),
          minStockLevel: toQty(normalizeDigits(formData.minStockLevel)),
          unit: formData.unit.trim() || null,
          allowDecimalQty: formData.allowDecimalQty,
          scaleCode: formData.allowDecimalQty ? formData.scaleCode.trim() || null : null,
          packs: rowsToPacks(packRows),
          categoryId: formData.categoryId,
          companyId: companyId!,
        },
      });
      // Success toast is fired by the mutation's onSuccess in useProducts.ts.
      navigate('/products');
    } catch {
      // Error toast is fired by the mutation's onError in useProducts.ts.
    }
  };

  // Error state — only when the fetch finished and returned nothing
  if (!isLoading && !isFetching && !product) {
    return (
      <Layout>
        <div className="py-12 text-center">
          <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-400" />
          <h2 className="mb-2 text-xl font-semibold text-gray-900">خطأ في تحميل المنتج</h2>
          <p className="mb-4 text-gray-600">لم يتم العثور على المنتج المطلوب</p>
          <Button onClick={() => navigate('/products')}>العودة إلى قائمة المنتجات</Button>
        </div>
      </Layout>
    );
  }

  const savedUnit = (p?.unit || '').trim() || (p?.allowDecimalQty ? 'وحدة' : 'قطعة');
  const stock = toQty(p?.currentStock ?? p?.stockQuantity ?? 0);
  const minLevel = toQty(p?.minStockLevel ?? 0);
  const price = Number(p?.sellingPrice) || 0;
  const cost = Number(p?.purchasePrice) || 0;
  const low = minLevel > 0 && stock <= minLevel;

  const categoryOptions = [
    { value: '', label: 'اختر الفئة' },
    ...((categoriesData as any)?.data?.list || []).map((category: any) => ({ value: category.id, label: category.name })),
  ];

  return (
    <Layout>
      <div className="mx-auto w-full max-w-4xl space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/products')}
            aria-label="العودة للمنتجات"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-gray-900">{p?.name || (isFetching ? 'جاري التحميل...' : 'تعديل المنتج')}</h1>
            <p className="text-sm text-gray-500">تعديل بيانات المنتج</p>
          </div>
        </div>

        {/* Summary: what the product is now. Price and stock change from their own places. */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
            <p className="text-xs text-gray-500">سعر البيع / {savedUnit}</p>
            {price > 0 ? (
              <p className="mt-1 whitespace-nowrap text-sm font-bold text-gray-900 sm:text-xl">{formatCurrency(price)}</p>
            ) : (
              <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-amber-700 sm:text-base">
                <AlertTriangle className="h-4 w-4" />
                بدون سعر
              </p>
            )}
            <a href="#prices" className="mt-1 inline-block text-xs text-primary-600 hover:underline">
              تغيير السعر
            </a>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
            <p className="text-xs text-gray-500">التكلفة / {savedUnit}</p>
            <p className="mt-1 whitespace-nowrap text-sm font-bold text-gray-900 sm:text-xl">{formatCurrency(cost)}</p>
            <p className="mt-1 text-xs text-gray-500">
              {price > 0 && cost > 0 ? `هامش ${Math.round(((price - cost) / price) * 1000) / 10}%` : 'تتحدث من المشتريات'}
            </p>
          </div>
          <div className={`rounded-2xl border p-3 shadow-sm sm:p-4 ${low ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
            <p className="text-xs text-gray-500">المخزون</p>
            <p className={`mt-1 whitespace-nowrap text-sm font-bold sm:text-xl ${low ? 'text-amber-700' : 'text-gray-900'}`}>{formatQty(stock, savedUnit)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {canAdjust && (
                <button type="button" onClick={() => setShowAdjust(true)} className="flex items-center gap-1 font-medium text-primary-600 hover:underline">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  تعديل الكمية
                </button>
              )}
              <Link to="/stock-movements" className="flex items-center gap-1 text-gray-500 hover:text-gray-800 hover:underline">
                <History className="h-3.5 w-3.5" />
                الحركة
              </Link>
            </div>
          </div>
        </div>

        <form id="product-edit-form" onSubmit={handleSubmit} className="space-y-5">
        <ProductFormSection step={1} title="المعلومات الأساسية">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label="اسم المنتج"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                error={errors.name}
                placeholder="أدخل اسم المنتج"
                required
              />
            </div>
            <Input
              label="الباركود"
              value={formData.sku}
              onChange={(e) => handleInputChange('sku', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              error={errors.sku}
              dir="ltr"
              className="text-right font-mono"
              required
            />
            <Select
              label="الفئة"
              options={categoryOptions}
              value={formData.categoryId}
              onChange={(value) => handleInputChange('categoryId', value)}
              error={errors.categoryId}
              required
            />
            <div className="sm:col-span-2">
              <Textarea
                label="الوصف (اختياري)"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="وصف المنتج"
                rows={2}
              />
            </div>
          </div>
        </ProductFormSection>

        <ProductFormSection step={2} title="طريقة البيع" description="كيف يُباع المنتج ووحدته، وهل يُباع بالعبوة أيضاً.">
          <div className="space-y-5">
            <ProductUnitFields
              allowDecimalQty={formData.allowDecimalQty}
              unit={formData.unit}
              onChange={next => setFormData(prev => ({ ...prev, ...next }))}
              scaleCode={formData.scaleCode}
              onScaleCodeChange={code => setFormData(prev => ({ ...prev, scaleCode: code }))}
            />
            <ProductPacksEditor
              packs={packRows}
              onChange={setPackRows}
              piecePrice={price}
              unit={formData.unit.trim()}
              allowDecimalQty={formData.allowDecimalQty}
              showErrors={showPackErrors}
            />
          </div>
        </ProductFormSection>

        <ProductFormSection step={3} title="تنبيه المخزون" description="يظهر المنتج في تنبيهات المخزون المنخفض عند وصول الكمية إلى هذا الحد.">
          <div className="sm:w-1/2">
            <Input
              label={`تنبيه عند وصول الكمية إلى (${formData.unit.trim() || (formData.allowDecimalQty ? 'وحدة' : 'قطعة')})`}
              type="text"
              inputMode={formData.allowDecimalQty ? 'decimal' : 'numeric'}
              value={formData.minStockLevel}
              onChange={(e) => handleInputChange('minStockLevel', e.target.value)}
              error={errors.minStockLevel}
              placeholder="0"
            />
          </div>
        </ProductFormSection>

        </form>

        {/* Prices: saved at once in the price lists (outside the form, so Enter there doesn't save the product) */}
        {id && companyId && (
          <div id="prices" className="scroll-mt-24">
            <ProductListPrices productId={id} companyId={Number(companyId)} step={4} unitLabel={savedUnit} />
          </div>
        )}

        <FormSaveBar
          formId="product-edit-form"
          onCancel={() => navigate('/products')}
          saving={updateMutation.isPending}
          saveLabel="حفظ التغييرات"
          hint="الأسعار تُحفظ فوراً من بطاقة الأسعار"
        />
      </div>

      {product && (
        <StockAdjustModal
          isOpen={showAdjust}
          onClose={() => setShowAdjust(false)}
          product={{ id: id!, name: p.name, stock, unit: p.unit, allowDecimalQty: !!p.allowDecimalQty, packs: p.packs || [] }}
        />
      )}
    </Layout>
  );
};

export default ProductEdit;
