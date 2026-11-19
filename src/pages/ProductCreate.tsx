import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Layout } from '../components/layout';
import { Input, Textarea, Select } from '../components/ui';
import ProductFormSection from '../components/products/ProductFormSection';
import FormSaveBar from '../components/products/FormSaveBar';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { useCreateProduct, useProducts } from '../hooks/api/useProducts';
import { useCategories } from '../hooks/api/useCategories';
import { productService } from '../services/productService';
import toast from 'react-hot-toast';
import { validateBarcodeFormat } from '../services/barcodeService';
import ProductUnitFields from '../components/products/ProductUnitFields';
import ProductPacksEditor, { packsProblem, rowsToPacks, type PackRow } from '../components/products/ProductPacksEditor';
import { normalizeDigits, parseQty, toQty } from '../utils/quantity';

const ProductCreate: React.FC = () => {
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;

  // Form state
  const [packRows, setPackRows] = useState<PackRow[]>([]);
  const [showPackErrors, setShowPackErrors] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '', // Single barcode field
    barcodeFormat: '',
    description: '',
    purchasePrice: '',
    sellingPrice: '',
    stockQuantity: '0',
    minStockLevel: '0',
    categoryId: '',
    unit: '',
    allowDecimalQty: false,
    scaleCode: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [barcodeSource, setBarcodeSource] = useState<'scanned' | 'generated' | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [barcodeInputValue, setBarcodeInputValue] = useState('');

  // Fetch categories
  const { data: categoriesData } = useCategories({
    companyId: companyId!,
    page: 1,
    limit: 100,
  });

  // Fetch products for barcode checking
  const { data: productsData } = useProducts({
    companyId: companyId!,
    page: 1,
    limit: 1000,
  });

  // Create mutation
  const createMutation = useCreateProduct();

  // Check if barcode exists
  const checkBarcodeExists = useCallback((barcode: string) => {
    const products = (productsData as any)?.data?.list || [];
    return products.find((p: any) =>
      p.originalBarcode === barcode || p.localBarcode === barcode || p.sku === barcode
    );
  }, [productsData]);

  // Handle barcode scan (original barcode from product)
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    // Validate format
    const validation = validateBarcodeFormat(barcode);
    if (!validation.isValid) {
      toast.error(validation.error || 'باركود غير صالح');
      return;
    }

    // Check if exists
    const existing = checkBarcodeExists(barcode);
    if (existing) {
      toast.error(`الباركود موجود مسبقاً: ${existing.name}`);
      setErrors(prev => ({ ...prev, barcode: 'الباركود موجود مسبقاً' }));
      return;
    }

    // Set barcode - use original barcode as-is for SKU
    // Original barcode should be saved without any prefix
    setBarcodeSource('scanned');
    setFormData(prev => ({
      ...prev,
      barcode,
      sku: barcode,  // Use original barcode as SKU (no prefix)
      barcodeFormat: validation.format || 'CODE128'
    }));
    setErrors(prev => ({ ...prev, barcode: '' }));
    toast.success('تم مسح الباركود بنجاح');
  }, [checkBarcodeExists]);


  // Generate barcode
  const generateBarcode = useCallback(async () => {
    if (!companyId) return;

    setIsGenerating(true);
    try {
      const result = await productService.generateBarcode(companyId, 'PROD');
      if (result?.data?.data?.barcode) {
        const barcode = result.data.data.barcode;
        setBarcodeSource('generated');
        setFormData(prev => ({
          ...prev,
          barcode,
          sku: barcode,
          barcodeFormat: result.data.data.format || 'CODE128'
        }));
        setErrors(prev => ({ ...prev, barcode: '' }));
        toast.success('تم توليد الباركود');
      }
    } catch {
      toast.error('فشل توليد الباركود');
    } finally {
      setIsGenerating(false);
    }
  }, [companyId]);

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

    if (!formData.name.trim()) newErrors.name = 'اسم المنتج مطلوب';
    // A code typed without pressing Enter is used as the factory barcode; it must be valid and free
    const typed = barcodeInputValue.trim();
    if (!formData.barcode && typed) {
      const v = validateBarcodeFormat(typed);
      const existing = checkBarcodeExists(typed);
      if (!v.isValid) newErrors.barcode = v.error || 'باركود غير صالح';
      else if (existing) newErrors.barcode = `الباركود موجود مسبقاً: ${existing.name}`;
    }
    if (!formData.categoryId) newErrors.categoryId = 'الفئة مطلوبة';
    // Both prices are optional: no selling price = the product can't be sold until it is priced
    const money = (v: string) => Number(normalizeDigits(v));
    if (formData.sellingPrice.trim() && !(money(formData.sellingPrice) >= 0)) newErrors.sellingPrice = 'سعر غير صحيح';
    if (formData.purchasePrice.trim() && !(money(formData.purchasePrice) >= 0)) newErrors.purchasePrice = 'تكلفة غير صحيحة';
    const qtyRule = { allowDecimalQty: formData.allowDecimalQty };
    const qty = parseQty(formData.stockQuantity, qtyRule);
    if (qty === null || qty < 0) {
      newErrors.stockQuantity = formData.allowDecimalQty ? 'الكمية صفر أو أكثر (حتى 3 أرقام عشرية)' : 'الكمية رقم صحيح صفر أو أكثر';
    }
    const min = parseQty(formData.minStockLevel, qtyRule);
    if (min === null || min < 0) {
      newErrors.minStockLevel = formData.allowDecimalQty ? 'الحد الأدنى صفر أو أكثر (حتى 3 أرقام عشرية)' : 'الحد الأدنى رقم صحيح صفر أو أكثر';
    }

    const packProblem = packsProblem(packRows, formData.allowDecimalQty);
    if (packProblem) {
      newErrors.packs = packProblem;
      setShowPackErrors(true);
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };


  // Handle submit
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!validateForm()) {
      // one message: the pack problem when there is one, else the general one
      toast.error(packsProblem(packRows, formData.allowDecimalQty) ?? 'يرجى تصحيح الأخطاء', { id: 'form-problem' });
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: formData.name.trim(),
        // empty sku: the server generates a local barcode
        sku: formData.sku.trim() || barcodeInputValue.trim(),
        originalBarcode:
          barcodeSource === 'scanned' ? formData.barcode : barcodeInputValue.trim() || undefined,
        localBarcode: barcodeSource === 'generated' ? formData.barcode : undefined,
        barcodeFormat: formData.barcodeFormat || undefined,
        description: formData.description.trim(),
        purchasePrice: Number(normalizeDigits(formData.purchasePrice)) || 0,
        sellingPrice: Number(normalizeDigits(formData.sellingPrice)) || 0,
        stockQuantity: toQty(normalizeDigits(formData.stockQuantity)),
        minStockLevel: toQty(normalizeDigits(formData.minStockLevel)),
        unit: formData.unit.trim() || null,
        allowDecimalQty: formData.allowDecimalQty,
        ...(formData.allowDecimalQty && formData.scaleCode.trim() && { scaleCode: formData.scaleCode.trim() }),
        ...(rowsToPacks(packRows).length && { packs: rowsToPacks(packRows) }),
        categoryId: formData.categoryId,
        companyId: companyId!,
      });

      // The success / error message comes from useCreateProduct (one message, not two)
      navigate('/products');
    } catch {
      // error message already shown by useCreateProduct
    }
  }, [formData, packRows, barcodeSource, barcodeInputValue, validateForm, createMutation, companyId, navigate]);

  const costValue = Number(normalizeDigits(formData.purchasePrice));
  const sellingValue = Number(normalizeDigits(formData.sellingPrice));
  const margin =
    costValue > 0 && sellingValue > 0 ? Math.round(((sellingValue - costValue) / sellingValue) * 1000) / 10 : null;
  const unitLabel = formData.unit.trim() || (formData.allowDecimalQty ? 'وحدة' : 'قطعة');

  // Category options
  const categoryOptions = [
    { value: '', label: 'اختر الفئة' },
    ...((categoriesData as any)?.data?.list || []).map((category: any) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  return (
    <Layout>
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-4xl space-y-5">
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
          <div>
            <h1 className="text-xl font-bold text-gray-900">إضافة منتج جديد</h1>
            <p className="text-sm text-gray-500">البيانات الأساسية للمنتج. الأسعار والكميات لاحقاً من قوائم الأسعار وحركة المخزون.</p>
          </div>
        </div>

        <ProductFormSection step={1} title="المعلومات الأساسية">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                label="اسم المنتج"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                error={errors.name}
                placeholder="مثل: شاي العروسة 250 جم"
                required
              />
            </div>

            {/* Barcode: scan / type + Enter, or generate, or leave empty (generated on save) */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">الباركود</label>
              {formData.barcode ? (
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <span className="font-mono text-base font-semibold text-gray-900">{formData.barcode}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      barcodeSource === 'scanned' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {barcodeSource === 'scanned' ? 'باركود المصنع' : 'باركود محلي'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, barcode: '', sku: '' }));
                      setBarcodeSource(null);
                      setBarcodeInputValue('');
                    }}
                    className="mr-auto text-xs text-primary-600 hover:underline"
                  >
                    تغيير
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={barcodeInputValue}
                    onChange={(e) => {
                      setBarcodeInputValue(e.target.value);
                      if (errors.barcode) setErrors(prev => ({ ...prev, barcode: '' }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        // Scanners end with Enter: take the code, don't submit the form
                        e.preventDefault();
                        if (barcodeInputValue.trim()) {
                          handleBarcodeScan(barcodeInputValue.trim());
                          setBarcodeInputValue('');
                        }
                      }
                    }}
                    placeholder="امسح أو اكتب (فارغ = يُولَّد تلقائياً)"
                    className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-right font-mono placeholder:font-sans focus:border-primary-500 focus:ring-2 focus:ring-primary-500 ${
                      errors.barcode ? 'border-red-400' : 'border-gray-300'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={generateBarcode}
                    disabled={isGenerating}
                    className="flex-shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {isGenerating ? 'جاري...' : 'توليد'}
                  </button>
                </div>
              )}
              {errors.barcode && <p className="mt-1 text-sm text-red-600">{errors.barcode}</p>}
            </div>

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
              piecePrice={sellingValue || 0}
              unit={formData.unit.trim()}
              allowDecimalQty={formData.allowDecimalQty}
              showErrors={showPackErrors}
            />
          </div>
        </ProductFormSection>

        <ProductFormSection
          step={3}
          title="سعر البيع"
          description="اختياري. بدون سعر يُحفظ المنتج ولا يُباع حتى تحدد سعره من قوائم الأسعار."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Input
                label={`سعر ${unitLabel}`}
                type="text"
                inputMode="decimal"
                value={formData.sellingPrice}
                onChange={(e) => handleInputChange('sellingPrice', e.target.value)}
                error={errors.sellingPrice}
                placeholder="بدون سعر"
              />
              {margin !== null && (
                <p className={`mt-1 text-xs ${margin < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  هامش الربح: {margin}%{margin < 0 ? ' (أقل من التكلفة)' : ''}
                </p>
              )}
            </div>
            <p className="self-center text-xs text-gray-500 sm:pt-5">
              يُحفظ كسعر القائمة الأساسية. القوائم الأخرى (جملة، عملاء...) تحسب منه أو تُضبط من قوائم الأسعار.
            </p>
          </div>
        </ProductFormSection>

        <ProductFormSection
          step={4}
          title="المخزون الافتتاحي"
          description="اختياري. الكمية الموجودة الآن تُسجَّل كرصيد افتتاحي في حركة المخزون، وبعدها تتغير بالمشتريات والمبيعات والتعديلات."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label={`الكمية الموجودة (${unitLabel})`}
              type="text"
              inputMode={formData.allowDecimalQty ? 'decimal' : 'numeric'}
              value={formData.stockQuantity}
              onChange={(e) => handleInputChange('stockQuantity', e.target.value)}
              error={errors.stockQuantity}
              placeholder="0"
            />
            <Input
              label={`تكلفة ${unitLabel}`}
              type="text"
              inputMode="decimal"
              value={formData.purchasePrice}
              onChange={(e) => handleInputChange('purchasePrice', e.target.value)}
              error={errors.purchasePrice}
              placeholder="0.00"
            />
            <Input
              label="تنبيه عند وصول الكمية إلى"
              type="text"
              inputMode={formData.allowDecimalQty ? 'decimal' : 'numeric'}
              value={formData.minStockLevel}
              onChange={(e) => handleInputChange('minStockLevel', e.target.value)}
              error={errors.minStockLevel}
              placeholder="0"
            />
          </div>
        </ProductFormSection>

        <FormSaveBar
          onCancel={() => navigate('/products')}
          saving={createMutation.isPending}
          saveLabel="حفظ المنتج"
          hint={!formData.sellingPrice.trim() ? 'سيُحفظ بدون سعر بيع' : undefined}
        />
      </form>
    </Layout>
  );
};

export default ProductCreate;
