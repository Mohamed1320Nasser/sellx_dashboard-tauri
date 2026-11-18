import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Save, Package } from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, Input, Textarea, Select, Card, Modal } from '../components/ui';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { useCreateProduct, useProducts } from '../hooks/api/useProducts';
import { useCategories } from '../hooks/api/useCategories';
import { productService } from '../services/productService';
import toast from 'react-hot-toast';
import { validateBarcodeFormat } from '../services/barcodeService';
import type { Product } from '../types';
import { BarcodePreview } from '../components/barcode/BarcodePreview';
import { usePrinterConfigStore } from '../stores/printerConfigStore';
import ProductUnitFields from '../components/products/ProductUnitFields';
import { normalizeDigits, parseQty, toQty } from '../utils/quantity';

const ProductCreate: React.FC = () => {
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;
  const printerConfig = usePrinterConfigStore();

  // Form state
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
    } catch (error) {
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
    if (!formData.purchasePrice || parseFloat(formData.purchasePrice) <= 0) {
      newErrors.purchasePrice = 'سعر الشراء مطلوب';
    }
    if (!formData.sellingPrice || parseFloat(formData.sellingPrice) <= 0) {
      newErrors.sellingPrice = 'سعر البيع مطلوب';
    }
    const qtyRule = { allowDecimalQty: formData.allowDecimalQty };
    const qty = parseQty(formData.stockQuantity, qtyRule);
    if (qty === null || qty < 0) {
      newErrors.stockQuantity = formData.allowDecimalQty ? 'الكمية صفر أو أكثر (حتى 3 أرقام عشرية)' : 'الكمية رقم صحيح صفر أو أكثر';
    }
    const min = parseQty(formData.minStockLevel, qtyRule);
    if (min === null || min < 0) {
      newErrors.minStockLevel = formData.allowDecimalQty ? 'الحد الأدنى صفر أو أكثر (حتى 3 أرقام عشرية)' : 'الحد الأدنى رقم صحيح صفر أو أكثر';
    }

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
        name: formData.name.trim(),
        // empty sku: the server generates a local barcode
        sku: formData.sku.trim() || barcodeInputValue.trim(),
        originalBarcode:
          barcodeSource === 'scanned' ? formData.barcode : barcodeInputValue.trim() || undefined,
        localBarcode: barcodeSource === 'generated' ? formData.barcode : undefined,
        barcodeFormat: formData.barcodeFormat || undefined,
        description: formData.description.trim(),
        purchasePrice: parseFloat(formData.purchasePrice),
        sellingPrice: parseFloat(formData.sellingPrice),
        stockQuantity: toQty(normalizeDigits(formData.stockQuantity)),
        minStockLevel: toQty(normalizeDigits(formData.minStockLevel)),
        unit: formData.unit.trim() || null,
        allowDecimalQty: formData.allowDecimalQty,
        categoryId: formData.categoryId,
        companyId: companyId!,
      });

      // The success / error message comes from useCreateProduct (one message, not two)
      navigate('/products');
    } catch {
      // error message already shown by useCreateProduct
    }
  }, [formData, barcodeSource, barcodeInputValue, validateForm, createMutation, companyId, navigate]);

  const costValue = parseFloat(formData.purchasePrice);
  const sellingValue = parseFloat(formData.sellingPrice);
  const margin =
    costValue > 0 && sellingValue > 0 ? Math.round(((sellingValue - costValue) / sellingValue) * 1000) / 10 : null;

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
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate('/products')}
              className="text-gray-600"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">إضافة منتج جديد</h1>
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

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Product Info */}
          <Card padding="lg">
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4" />
                معلومات المنتج
              </h3>

              <Input
                label="اسم المنتج"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                error={errors.name}
                placeholder="أدخل اسم المنتج"
                required
              />

              {/* Barcode: one row. Scan / type + Enter, or generate, or leave empty (generated on save) */}
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
                      className="mr-auto text-xs text-blue-600 hover:underline"
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
                      placeholder="امسح أو اكتب الباركود (فارغ = يُولَّد تلقائياً)"
                      className={`flex-1 rounded-lg border px-3 py-2 text-right font-mono placeholder:font-sans focus:border-primary-500 focus:ring-2 focus:ring-primary-500 ${
                        errors.barcode ? 'border-red-400' : 'border-gray-300'
                      }`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={generateBarcode}
                      disabled={isGenerating}
                      className="whitespace-nowrap"
                    >
                      {isGenerating ? 'جاري...' : '✨ توليد'}
                    </Button>
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

              <Textarea
                label="الوصف (اختياري)"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="وصف المنتج"
                rows={2}
              />
            </div>
          </Card>

          {/* Pricing & Stock */}
          <Card padding="lg">
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">التسعير والمخزون</h3>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="سعر الشراء"
                  type="number"
                  step="0.01"
                  value={formData.purchasePrice}
                  onChange={(e) => handleInputChange('purchasePrice', e.target.value)}
                  error={errors.purchasePrice}
                  placeholder="0.00"
                  required
                />

                <Input
                  label="سعر البيع"
                  type="number"
                  step="0.01"
                  value={formData.sellingPrice}
                  onChange={(e) => handleInputChange('sellingPrice', e.target.value)}
                  error={errors.sellingPrice}
                  placeholder="0.00"
                  required
                />

                {margin !== null && (
                  <p className={`col-span-2 -mt-2 text-xs ${margin < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                    هامش الربح: {margin}%{margin < 0 ? ' (سعر البيع أقل من سعر الشراء)' : ''}
                  </p>
                )}

                <ProductUnitFields
                  allowDecimalQty={formData.allowDecimalQty}
                  unit={formData.unit}
                  onChange={next => setFormData(prev => ({ ...prev, ...next }))}
                />

                <Input
                  label={`الكمية الافتتاحية${formData.unit.trim() ? ` (${formData.unit.trim()})` : ''}`}
                  type="text"
                  inputMode={formData.allowDecimalQty ? 'decimal' : 'numeric'}
                  value={formData.stockQuantity}
                  onChange={(e) => handleInputChange('stockQuantity', e.target.value)}
                  error={errors.stockQuantity}
                  placeholder="0"
                  required
                />

                <Input
                  label="الحد الأدنى"
                  type="text"
                  inputMode={formData.allowDecimalQty ? 'decimal' : 'numeric'}
                  value={formData.minStockLevel}
                  onChange={(e) => handleInputChange('minStockLevel', e.target.value)}
                  error={errors.minStockLevel}
                  placeholder="0"
                  required
                />
              </div>
            </div>
          </Card>
        </form>
      </div>
    </Layout>
  );
};

export default ProductCreate;
