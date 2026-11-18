import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save, X, RotateCcw, Plus, Minus, Search, Package } from "lucide-react";
import { Layout } from "../components/layout";
import { Button, Input, Select, Card } from "../components/ui";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { useCreateReturn } from "../hooks/api/useReturns";
import { useSales } from "../hooks/api/useSales";
import { useForm } from "react-hook-form";
import { formatCurrency, formatNumber } from "../utils/currencyUtils";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { saleService } from "../services/saleService";
import QtyInput from '../components/ui/QtyInput';
import { addQty, allowsDecimal, cartCountLabel, formatQty, qtyTimes, subQty, sumQty, toQty, unitOf } from '../utils/quantity';

const round2 = (n: number) => Math.round(n * 100) / 100;

const returnSchema = z.object({
  originalSaleId: z.number().min(1, "رقم البيع الأصلي مطلوب"),
  reason: z.string().optional(),
  notes: z.string().optional(),
  refundAmount: z.number().min(0, "مبلغ الاسترداد يجب أن يكون موجب").optional(),
});

type ReturnFormData = z.infer<typeof returnSchema>;

interface ReturnItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  reason?: string;
  allowDecimalQty?: boolean;
  unit?: string | null;
}

const ReturnsCreate: React.FC = () => {
  const navigate = useNavigate();
  const { company, user } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;

  // Form state
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  // Managers can approve right away; a cashier's return waits for a manager
  const canApprove = user?.role === "MANAGER" || user?.role === "ADMIN";
  const [completeNow, setCompleteNow] = useState(true);
  const productsRef = React.useRef<HTMLDivElement>(null);
  const [productSearch, setProductSearch] = useState("");

  // Fetch data
  const { data: salesData } = useSales({
    companyId: companyId!,
    page: 1,
    limit: 100,
  });

  // Full invoice: what was already returned and what the client still owes on it
  const { data: saleDetails } = useQuery({
    queryKey: ["sale", selectedSale?.id, companyId],
    queryFn: () => saleService.getById(String(selectedSale.id), companyId!),
    enabled: !!selectedSale?.id && !!companyId,
    select: (data: any) => data?.data || data,
  });

  // Price the customer actually paid per unit: line price with the invoice discount and tax spread over it
  const priceFactor = useMemo(() => {
    const sale = saleDetails || selectedSale;
    const subtotal = Number(sale?.subtotal) || 0;
    if (subtotal <= 0) return 1;
    return (subtotal - (Number(sale?.discountAmount) || 0) + (Number(sale?.taxAmount) || 0)) / subtotal;
  }, [saleDetails, selectedSale]);

  const saleLines = (productId: any) =>
    (selectedSale?.items || []).filter((item: any) => item.product.id === productId);
  const soldQtyOf = (productId: any) => sumQty(saleLines(productId).map((l: any) => l.quantity));
  const unitPriceOf = (productId: any) => {
    const lines = saleLines(productId);
    const qty = sumQty(lines.map((l: any) => l.quantity));
    const value = lines.reduce((s: number, l: any) => s + toQty(l.quantity) * Number(l.unitPrice), 0);
    return qty ? round2((value / qty) * priceFactor) : 0;
  };
  const maxQtyOf = (productId: any) =>
    Math.max(0, subQty(soldQtyOf(productId), saleDetails?.returnedQuantities?.[productId] || 0));

  // Mutations
  const createReturnMutation = useCreateReturn();

  // Main form
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<ReturnFormData>({
    resolver: zodResolver(returnSchema),
  });


  // Add item to return
  const addItem = (product: any) => {
    const existingItem = items.find(item => item.productId === product.id);
    let newItems;
    
    const maxQuantity = maxQtyOf(product.id);
    if (maxQuantity <= 0) {
      toast.error("تم إرجاع كل الكمية المباعة من هذا المنتج");
      return;
    }

    if (existingItem) {
      // Check if we can increment the quantity
      if (existingItem.quantity >= maxQuantity || existingItem.allowDecimalQty) {
        return; // Can't add more than the original sale quantity; weighed goods are typed
      }
      const next = Math.min(maxQuantity, addQty(existingItem.quantity, 1));
      newItems = items.map(item =>
        item.productId === product.id
          ? { ...item, quantity: next, total: qtyTimes(next, item.unitPrice) }
          : item
      );
    } else {
      const price = unitPriceOf(product.id);
      const weighed = allowsDecimal(product);
      // Weighed goods start with all that is left to return; the cashier can type less
      const quantity = weighed ? maxQuantity : 1;
      newItems = [...items, {
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice: price,
        total: qtyTimes(quantity, price),
        allowDecimalQty: weighed,
        unit: unitOf(product) || null,
      }];
    }
    
    setItems(newItems);
  };

  // Remove item from return
  const removeItem = (productId: number) => {
    const newItems = items.filter(item => item.productId !== productId);
    setItems(newItems);
  };

  // Update item quantity
  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    
    // Limit quantity to what is still returnable on the invoice
    const maxQuantity = maxQtyOf(productId);
    if (quantity > maxQuantity) {
      quantity = maxQuantity;
    }
    
    const newItems = items.map(item =>
      item.productId === productId
        ? { ...item, quantity, total: qtyTimes(quantity, item.unitPrice) }
        : item
    );
    
    setItems(newItems);
  };

  // Check if product is selected
  const isProductSelected = (productId: number) => {
    return items.some(item => item.productId === productId);
  };

  // Get selected quantity
  const getSelectedQuantity = (productId: number) => {
    const item = items.find(item => item.productId === productId);
    return item ? item.quantity : 0;
  };

  // Handle return submission
  const handleReturnSubmit = async (data: ReturnFormData) => {
    if (items.length === 0) {
      toast.error("يجب إضافة منتجات للإرجاع");
      return;
    }

    if (!selectedSale) {
      toast.error("يجب اختيار البيع الأصلي");
      return;
    }

    try {
      const returnData = {
        originalSaleId: data.originalSaleId,
        clientId: selectedSale.clientId,
        reason: data.reason,
        notes: data.notes,
        refundAmount: data.refundAmount,
        completeNow: canApprove && completeNow,
        items: items.map(item => ({
          productId: String(item.productId),
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          reason: item.reason,
        })),
        companyId: companyId!,
      };

      await createReturnMutation.mutateAsync(returnData);
      navigate('/returns');
    } catch {
      // the mutation already showed the server's message
    }
  };


  // Handle sale selection
  const handleSaleSelection = (saleId: string) => {
    const sales = salesData?.data?.list || [];
    const sale = sales.find((s: any) => s.id.toString() === saleId);
    setSelectedSale(sale);
    setValue("originalSaleId", parseInt(saleId));
    setItems([]); // Clear existing items when sale changes
    // the products to return are further down: bring them into view
    if (sale) setTimeout(() => productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  // Return all items from the sale
  const returnAllItems = () => {
    if (!selectedSale || !selectedSale.items) return;
    
    const productIds = [...new Set(selectedSale.items.map((item: any) => item.product.id))];
    const allItems = productIds
      .map((productId: any) => {
        const line = saleLines(productId)[0];
        const quantity = maxQtyOf(productId);
        const price = unitPriceOf(productId);
        return {
          productId,
          productName: line.product.name,
          quantity,
          unitPrice: price,
          total: qtyTimes(quantity, price),
          reason: "إرجاع كامل للفاتورة",
          allowDecimalQty: allowsDecimal(line.product),
          unit: unitOf(line.product) || null,
        };
      })
      .filter((item: any) => item.quantity > 0);

    if (allItems.length === 0) {
      toast.error("تم إرجاع كل أصناف هذه الفاتورة من قبل");
      return;
    }
    setItems(allItems);
  };

  // Clear all selected items
  const clearAllItems = () => {
    setItems([]);
    setValue("refundAmount", 0);
  };

  // Handle cancel
  const handleCancel = () => {
    navigate('/returns');
  };


  // Sales options
  const salesOptions = ((salesData as any)?.data?.list || []).map((sale: any) => ({
    value: sale.id.toString(),
    label: `${sale.receiptNumber} - ${sale.client?.name || 'عميل نقدي'} - ${formatCurrency(sale.totalAmount)}`,
  }));

  // Filter products based on search (only from selected sale)
  const filteredProducts = useMemo(() => {
    if (!selectedSale) {
      return [];
    }
    
    const saleItems = selectedSale.items || [];
    
    return saleItems.filter((item: any) => {
      const matchesSearch = item.product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                           item.product.sku?.toLowerCase().includes(productSearch.toLowerCase());
      
      return matchesSearch;
    });
  }, [selectedSale, productSearch]);

  // Product options for display
  const productOptions = filteredProducts.map((item: any) => ({
    value: item.product.id,
    label: `${item.product.name} - ${formatCurrency(unitPriceOf(item.product.id))} (باع: ${formatQty(item.quantity, unitOf(item.product))})`,
    product: item.product,
  }));

  // Calculate totals
  const subtotal = round2(items.reduce((sum, item) => sum + item.total, 0));
  // Cash can only be given back for the part the customer paid; the rest reduces his debt
  const stillOwed = Number(saleDetails?.remainingAmount) || 0;
  const maxRefund = round2(Math.max(0, subtotal - stillOwed));
  const refundAmount = watch("refundAmount") ?? maxRefund;

  // Suggest the full allowed refund whenever the items change
  useEffect(() => {
    setValue("refundAmount", maxRefund);
  }, [maxRefund, setValue]);

  return (
    <Layout>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Button
              variant="ghost"
              onClick={() => navigate('/returns')}
              className="flex items-center space-x-2 space-x-reverse text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>العودة</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">إرجاع جديد</h1>
              <p className="text-gray-500 text-sm">إنشاء إرجاع جديد في النظام</p>
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
              onClick={handleSubmit(handleReturnSubmit)}
              disabled={createReturnMutation.isPending || items.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Save className="w-4 h-4 ml-1" />
              {createReturnMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء الإرجاع'}
            </Button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(handleReturnSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Return Information Card */}
            <Card padding="lg" className="lg:col-span-2">
              <div className="space-y-6">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <RotateCcw className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mr-3">معلومات الإرجاع</h3>
                </div>

                <div className="space-y-4">
                  {/* Original Sale Selection */}
                  <div>
                    <Select
                      label="البيع الأصلي"
                      options={salesOptions}
                      value={watch("originalSaleId")?.toString() || ""}
                      onChange={handleSaleSelection}
                      error={errors.originalSaleId?.message}
                      placeholder="اختر البيع الأصلي..."
                      required
                    />
                  </div>

                  {/* Client Information */}
                  {selectedSale && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 space-x-reverse mb-2">
                        <div className="p-1.5 bg-gray-100 rounded-lg">
                          <Package className="w-4 h-4 text-gray-600" />
                        </div>
                        <h4 className="text-sm font-medium text-gray-900">معلومات العميل</h4>
                      </div>
                      <div className="text-sm text-gray-600">
                        <p><span className="font-medium">العميل:</span> {selectedSale.client?.name || 'عميل نقدي'}</p>
                        {selectedSale.client?.phone && (
                          <p><span className="font-medium">الهاتف:</span> {selectedSale.client.phone}</p>
                        )}
                      </div>
                    </div>
                  )}


                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Input
                        label="سبب الإرجاع"
                        {...register("reason")}
                        error={errors.reason?.message}
                        placeholder="أدخل سبب الإرجاع"
                      />
                    </div>
                    <div>
                      <Input
                        label="مبلغ الاسترداد"
                        type="number"
                        step="0.01"
                        min="0"
                        {...register("refundAmount", { valueAsNumber: true })}
                        error={errors.refundAmount?.message}
                        placeholder="0.00"
                        value={refundAmount}
                        onChange={(e) => setValue("refundAmount", parseFloat(e.target.value) || 0)}
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        قيمة المرتجع: {formatCurrency(subtotal)} — الحد الأقصى للاسترداد النقدي: {formatCurrency(maxRefund)}
                      </div>
                      {stillOwed > 0 && subtotal > 0 && (
                        <div className="text-xs text-amber-700 mt-1">
                          على الفاتورة مبلغ متبقٍ {formatCurrency(stillOwed)}، يُخصم من قيمة المرتجع من مديونية العميل ولا يُرد نقداً
                        </div>
                      )}
                    </div>
                  </div>

                  {canApprove && (
                    <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={completeNow} onChange={(e) => setCompleteNow(e.target.checked)} />
                      اعتماد المرتجع فوراً (إرجاع المخزون وخصم المديونية / الاسترداد الآن)
                    </label>
                  )}
                  <div className="md:col-span-2">
                    <Input
                      label="ملاحظات"
                      {...register("notes")}
                      error={errors.notes?.message}
                      placeholder="أدخل أي ملاحظات إضافية"
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Return Summary Card */}
            <Card padding="lg">
              <div className="space-y-6">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Package className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mr-3">ملخص الإرجاع</h3>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">عدد المنتجات</span>
                    <span className="font-medium">
                      {cartCountLabel(items)}
                    </span>
                  </div>

                  {items.length > 0 && (
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-500 mb-2">المنتجات المرتجعة:</p>
                      <div className={`space-y-1 ${items.length > 3 ? 'max-h-20 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100' : ''}`}>
                        {items.map((item) => (
                          <div key={item.productId} className="flex justify-between text-xs">
                            <span className="text-gray-600 truncate">{item.productName}</span>
                            <span className="text-gray-900 font-medium">{formatQty(item.quantity, item.unit)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">المجموع الفرعي</span>
                      <span className="font-medium">{formatCurrency(subtotal)}</span>
                    </div>
                    
                    <div className="flex justify-between text-lg font-semibold border-t border-gray-200 pt-2">
                      <span>المجموع الكلي</span>
                      <span className="text-green-600">{formatCurrency(subtotal)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Product Selection */}
          <div ref={productsRef} />
          <Card padding="lg">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Package className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mr-3">اختيار المنتجات للإرجاع</h3>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <div className="text-sm text-gray-500">
                    {filteredProducts.length} منتج متاح
                  </div>
                  {selectedSale && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={returnAllItems}
                        className="text-green-600 border-green-200 hover:bg-green-50"
                      >
                        إرجاع الكل
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={clearAllItems}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        مسح الكل
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Search Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="البحث عن منتج أو رمز المنتج..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pr-10"
                  />
                </div>
              </div>

              {/* Products Grid */}
              {!selectedSale ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>يرجى اختيار البيع الأصلي أولاً لعرض المنتجات المتاحة للإرجاع</p>
                </div>
              ) : productOptions.length > 0 ? (
                <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pr-2">
                    {productOptions.map((option, index) => {
                      const isSelected = isProductSelected(option.product.id);
                      const selectedQuantity = getSelectedQuantity(option.product.id);
                      const originalSaleItem = filteredProducts[index];
                      const maxQuantity = maxQtyOf(option.product.id);
                      const canIncrement = selectedQuantity < maxQuantity;
                      
                      return (
                        <div
                          key={option.value}
                          className={`border rounded-lg p-4 transition-all cursor-pointer ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 shadow-md'
                              : 'border-gray-200 hover:border-blue-300 hover:shadow-sm'
                          }`}
                          onClick={() => addItem(option.product)}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 text-sm mb-1">
                                {option.product.name}
                              </h4>
                              <p className="text-xs text-gray-500 mb-2">
                                SKU: {option.product.sku}
                              </p>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-green-600">
                                  {formatCurrency(unitPriceOf(option.product.id))}
                                </span>
                                <span className="text-xs text-gray-500">
                                  باع: {formatQty(soldQtyOf(option.product.id), unitOf(option.product))} — متاح للإرجاع: {formatQty(maxQuantity, unitOf(option.product))}
                                </span>
                              </div>
                              {isSelected && selectedQuantity >= maxQuantity && (
                                <div className="mt-2 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                                  تم الوصول للحد الأقصى
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {isSelected && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-gray-600">
                                  الكمية المختارة: {formatQty(selectedQuantity)}/{formatQty(maxQuantity, unitOf(option.product))}
                                </span>
                                <div className="flex items-center space-x-2 space-x-reverse">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateQuantity(option.product.id, selectedQuantity - 1);
                                    }}
                                    className="w-6 h-6 p-0"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </Button>
                                  <span onClick={(e) => e.stopPropagation()}>
                                    <QtyInput
                                      product={option.product}
                                      value={selectedQuantity}
                                      onChange={(q) => updateQuantity(option.product.id, q)}
                                      onInvalid={(m) => toast.error(m)}
                                      aria-label={`كمية ${option.product.name}`}
                                      className={`${allowsDecimal(option.product) ? "w-16" : "w-10"} rounded border border-gray-200 px-1 text-center text-sm font-medium`}
                                    />
                                  </span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateQuantity(option.product.id, selectedQuantity + 1);
                                    }}
                                    disabled={!canIncrement}
                                    className={`w-6 h-6 p-0 ${!canIncrement ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  >
                                    <Plus className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">لا توجد منتجات متاحة</p>
                </div>
              )}
            </div>
          </Card>
        </form>

      </div>
    </Layout>
  );
};

export default ReturnsCreate;
