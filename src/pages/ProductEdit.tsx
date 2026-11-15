import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ProductListPrices from '../components/products/ProductListPrices';
import { ArrowRight, Save, X, Package, AlertCircle } from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, Input, Textarea, Select, Card } from '../components/ui';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { useUpdateProduct, useProduct } from '../hooks/api/useProducts';
import { useCategories } from '../hooks/api/useCategories';
import toast from 'react-hot-toast';

const ProductEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    description: '',
    purchasePrice: '',
    sellingPrice: '',
    stockQuantity: '',
    minStockLevel: '',
    categoryId: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch product — seeded from list cache by the hook, so fields appear instantly when navigating from the list
  const { data: product, isLoading, isFetching } = useProduct(id!, companyId!);

  // Fetch categories
  const { data: categoriesData } = useCategories({
    companyId: companyId!,
    page: 1,
    limit: 100,
  });

  // Update mutation
  const updateMutation = useUpdateProduct();

  // Fill the form once per product: a background refresh must not wipe what the user is typing
  const filledFor = useRef<string | null>(null);
  const loadedStock = useRef<string>('');
  useEffect(() => {
    if (product && filledFor.current !== id) {
      filledFor.current = id!;
      loadedStock.current = ((product as any).currentStock ?? (product as any).stockQuantity ?? 0).toString();
      setFormData({
        name: (product as any).name || '',
        sku: (product as any).sku || '',
        description: (product as any).description || '',
        purchasePrice: (product as any).purchasePrice?.toString() || '',
        sellingPrice: (product as any).sellingPrice?.toString() || '',
        stockQuantity: loadedStock.current,
        minStockLevel: ((product as any).minStockLevel || 0).toString(),
        categoryId: (product as any).categoryId || '',
      });
    }
  }, [product, id]);

  // Handle form input changes
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Validate form
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'اسم المنتج مطلوب';
    }

    if (!formData.sku.trim()) {
      newErrors.sku = 'رمز المنتج مطلوب';
    }

    if (!formData.categoryId) {
      newErrors.categoryId = 'الفئة مطلوبة';
    }

    if (!formData.purchasePrice || parseFloat(formData.purchasePrice) <= 0) {
      newErrors.purchasePrice = 'سعر الشراء يجب أن يكون أكبر من صفر';
    }

    if (!formData.sellingPrice || parseFloat(formData.sellingPrice) <= 0) {
      newErrors.sellingPrice = 'سعر البيع يجب أن يكون أكبر من صفر';
    }

    const qty = Number(formData.stockQuantity);
    if (formData.stockQuantity === '' || !Number.isInteger(qty) || qty < 0) {
      newErrors.stockQuantity = 'الكمية رقم صحيح صفر أو أكثر';
    }

    const min = Number(formData.minStockLevel);
    if (formData.minStockLevel === '' || !Number.isInteger(min) || min < 0) {
      newErrors.minStockLevel = 'الحد الأدنى للمخزون يجب أن يكون أكبر من أو يساوي صفر';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('يرجى تصحيح الأخطاء في النموذج');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: id!,
        data: {
          name: formData.name.trim(),
          sku: formData.sku.trim(),
          description: formData.description.trim(),
          purchasePrice: parseFloat(formData.purchasePrice),
          sellingPrice: parseFloat(formData.sellingPrice),
          // Only a quantity the user changed is sent: sending the number loaded when the page
          // opened would undo any sale made meanwhile (the server records it as an adjustment)
          ...(formData.stockQuantity.trim() !== loadedStock.current && {
            stockQuantity: parseInt(formData.stockQuantity),
          }),
          minStockLevel: parseInt(formData.minStockLevel),
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

  // Handle cancel
  const handleCancel = () => {
    navigate('/products');
  };

  // Error state — only when the fetch finished and returned nothing
  if (!isLoading && !isFetching && !product) {
    return (
      <Layout>
        <div className="text-center py-12">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">خطأ في تحميل المنتج</h2>
          <p className="text-gray-600 mb-4">لم يتم العثور على المنتج المطلوب</p>
          <Button onClick={() => navigate('/products')}>
            العودة إلى قائمة المنتجات
          </Button>
        </div>
      </Layout>
    );
  }

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
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Button
              variant="ghost"
              onClick={() => navigate('/products')}
              className="flex items-center space-x-2 space-x-reverse text-gray-600 hover:text-gray-900"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">تعديل المنتج</h1>
              <p className="text-gray-500 text-sm">
                {(product as any)?.name || (isFetching ? 'جاري التحميل...' : '')}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 space-x-reverse">
            <Button
              onClick={handleCancel}
              variant="outline"
              className="text-gray-600 hover:text-gray-900"
            >
              <X className="w-4 h-4 ml-1" />
              إلغاء
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={updateMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Save className="w-4 h-4 ml-1" />
              {updateMutation.isPending ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </Button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
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
                    <Input
                      label="اسم المنتج"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      error={errors.name}
                      placeholder="أدخل اسم المنتج"
                      required
                    />
                  </div>

                  <div>
                    <Input
                      label="رمز المنتج (SKU)"
                      value={formData.sku}
                      onChange={(e) => handleInputChange('sku', e.target.value)}
                      error={errors.sku}
                      placeholder="أدخل رمز المنتج"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Select
                      label="الفئة"
                      options={categoryOptions}
                      value={formData.categoryId}
                      onChange={(value) => handleInputChange('categoryId', value)}
                      error={errors.categoryId}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Textarea
                      label="الوصف"
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      placeholder="أدخل وصف المنتج"
                      rows={4}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Pricing & Stock Card */}
            <Card padding="lg">
              <div className="space-y-6">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Package className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mr-3">التسعير والمخزون</h3>
                </div>

                <div className="space-y-4">
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
                    <p className={`-mt-2 text-xs ${margin < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      هامش الربح: {margin}%{margin < 0 ? ' (سعر البيع أقل من سعر الشراء)' : ''}
                    </p>
                  )}

                  <Input
                    label="الكمية المتاحة"
                    type="number"
                    value={formData.stockQuantity}
                    onChange={(e) => handleInputChange('stockQuantity', e.target.value)}
                    error={errors.stockQuantity}
                    placeholder="0"
                    required
                  />
                  {formData.stockQuantity.trim() !== loadedStock.current && formData.stockQuantity !== '' && (
                    <p className="-mt-2 text-xs text-amber-700">
                      سيُسجَّل الفرق ({Number(formData.stockQuantity) - Number(loadedStock.current) > 0 ? '+' : ''}
                      {Number(formData.stockQuantity) - Number(loadedStock.current)}) كتسوية مخزون باسمك
                    </p>
                  )}

                  <Input
                    label="الحد الأدنى للمخزون"
                    type="number"
                    value={formData.minStockLevel}
                    onChange={(e) => handleInputChange('minStockLevel', e.target.value)}
                    error={errors.minStockLevel}
                    placeholder="0"
                    required
                  />
                </div>
              </div>
            </Card>
          </div>
        </form>
        {id && companyId && (
          <div className="mt-6">
            <ProductListPrices productId={id} companyId={Number(companyId)} />
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ProductEdit;
