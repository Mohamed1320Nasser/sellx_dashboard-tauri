import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input, Select } from '../ui';
import { useProducts } from '../../hooks/api/useProducts';
import type { StockMovement } from '../../types/business';

// Form validation schema
const stockMovementSchema = z.object({
  productId: z.string().min(1, 'يرجى اختيار منتج'),
  direction: z.enum(['IN', 'OUT'], { message: 'اختر إضافة أو خصم' }),
  quantity: z.number().int('الكمية يجب أن تكون رقماً صحيحاً').min(1, 'الكمية يجب أن تكون أكبر من 0'),
  reason: z.string().optional(),
  reference: z.string().optional(),
});

type StockMovementFormData = z.infer<typeof stockMovementSchema>;

interface StockMovementFormProps {
  stockMovement?: StockMovement | null;
  companyId: number;
  onSubmit: (data: StockMovementFormData) => void;
  loading?: boolean;
  onCancel?: () => void;
}

const StockMovementForm: React.FC<StockMovementFormProps> = ({
  stockMovement,
  companyId,
  onSubmit,
  loading = false,
  onCancel,
}) => {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StockMovementFormData>({
    resolver: zodResolver(stockMovementSchema),
    defaultValues: {
      productId: stockMovement?.productId || '',
      direction: 'IN',
      quantity: 1,
      reason: '',
      reference: stockMovement?.reference || '',
    },
  });

  // Get products for dropdown
  const { data: productsData, isLoading: productsLoading } = useProducts({
    companyId,
    limit: 1000, // Get all products
  });

  const products = (productsData as any)?.data?.list || [];
  const selectedProductId = watch('productId');
  const selectedProduct = products.find(p => p.id === selectedProductId);


  // Reset form when stockMovement changes
  useEffect(() => {
    if (stockMovement) {
      reset({
        productId: stockMovement.productId,
        direction: stockMovement.quantity < 0 ? 'OUT' : 'IN',
        quantity: Math.abs(stockMovement.quantity),
        reference: stockMovement.reference || '',
      });
    }
  }, [stockMovement, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Product Selection */}
      <Select
        label="المنتج"
        placeholder="اختر منتج"
        options={products.map((product) => ({
          value: String(product.id), // Ensure ID is string
          label: `${product.name} (${product.sku}) - المخزون الحالي: ${product.stockQuantity}`,
        }))}
        value={watch('productId')}
        onChange={(value) => setValue('productId', value)}
        error={errors.productId?.message}
        disabled={loading}
        loading={productsLoading}
      />

      {/* Current Stock Display */}
      {selectedProduct && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="mr-3">
              <h3 className="text-sm font-medium text-blue-800">المخزون الحالي</h3>
              <div className="mt-2 text-sm text-blue-700">
                <p><strong>المنتج:</strong> {selectedProduct.name}</p>
                <p><strong>الكمية المتاحة:</strong> {selectedProduct.stockQuantity} وحدة</p>
                <p><strong>الحد الأدنى:</strong> {selectedProduct.minStockLevel} وحدة</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Direction: purchases, sales and returns have their own screens */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">نوع التعديل</label>
        <div className="grid grid-cols-2 gap-3">
          {([
            ['IN', 'إضافة للمخزون', 'border-green-500 bg-green-50 text-green-700'],
            ['OUT', 'خصم من المخزون', 'border-red-500 bg-red-50 text-red-700'],
          ] as const).map(([value, label, active]) => (
            <button
              key={value}
              type="button"
              disabled={loading}
              onClick={() => setValue('direction', value)}
              className={`py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                watch('direction') === value ? active : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          للجرد والتالف والفروقات فقط. المشتريات والمبيعات والمرتجعات تُسجل من شاشاتها.
        </p>
      </div>

      {/* Quantity */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          الكمية <span className="text-red-500">*</span>
        </label>
        <Input
          type="number"
          {...register('quantity', { valueAsNumber: true })}
          placeholder="أدخل الكمية"
          disabled={loading}
          min="1"
        />
        {errors.quantity && (
          <p className="mt-1 text-sm text-red-600">{errors.quantity.message}</p>
        )}
        {watch('direction') === 'OUT' && selectedProduct && (
          <p className={`mt-1 text-sm ${selectedProduct.stockQuantity - (Number(watch('quantity')) || 0) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
            المخزون بعد الخصم: {selectedProduct.stockQuantity - (Number(watch('quantity')) || 0)}
            {selectedProduct.stockQuantity - (Number(watch('quantity')) || 0) < 0 && ' — الكمية أكبر من المتاح'}
          </p>
        )}
      </div>

      {/* Reason */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          السبب (اختياري)
        </label>
        <Input
          {...register('reason')}
          placeholder="مثال: جرد، تالف، هدايا"
          disabled={loading}
        />
      </div>

      {/* Reference */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          المرجع (اختياري)
        </label>
        <Input
          {...register('reference')}
          placeholder="مثال: تعديل مخزون، إرجاع منتج، إلخ"
          disabled={loading}
        />
        {errors.reference && (
          <p className="mt-1 text-sm text-red-600">{errors.reference.message}</p>
        )}
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3 space-x-reverse pt-6 border-t border-gray-200">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            إلغاء
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={loading}
          loading={loading}
        >
          {stockMovement ? 'تحديث الحركة' : 'إنشاء الحركة'}
        </Button>
      </div>
    </form>
  );
};

export default StockMovementForm;
