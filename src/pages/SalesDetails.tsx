import React, { useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, DollarSign, Package, Download, CheckCircle, Clock, AlertCircle, Percent, TrendingUp, Printer } from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, Card, Badge } from '../components/ui';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { useQuery } from '@tanstack/react-query';
import { saleService } from '../services/saleService';
import { formatCurrency, formatNumber } from '../utils/currencyUtils';
import { formatTableDate } from '../utils/dateUtils';
import toast from 'react-hot-toast';
import { companyService } from '../services/companyService';
import { PrintReceiptPreview } from '../components/printer/PrintReceiptPreview';
import { generateSaleInvoicePdf } from '../components/invoice/generateSaleInvoicePdf';

const SalesDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company, user } = useSessionAuthStore();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const companyId = company?.companyId || company?.company?.id;

  // Fetch sale data
  const { data: sale, isLoading, error } = useQuery({
    queryKey: ['sale', id, companyId],
    queryFn: () => saleService.getById(id!, companyId!),
    enabled: !!id && !!companyId,
    select: (data: any) => data?.data || data, // Extract the actual sale data from wrapped response
  });

  const handleBack = () => {
    navigate('/sales');
  };

  const handleDownloadPDF = async () => {
    if (!sale) {
      toast.error("لا توجد بيانات للتحميل");
      return;
    }

    setIsGeneratingPDF(true);
    const loadingToast = toast.loading("جاري إنشاء ملف PDF...");

    try {
      const companyProfile = companyId
        ? await companyService.getProfile(companyId)
        : company;
      await generateSaleInvoicePdf({ sale, company: companyProfile, cashier: user });

      toast.dismiss(loadingToast);
      toast.success("تم تحميل ملف PDF بنجاح");
    } catch (error) {
      console.error("PDF generation error:", error);
      toast.dismiss(loadingToast);
      toast.error("حدث خطأ أثناء إنشاء ملف PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handlePrintReceipt = () => {
    if (!sale) {
      toast.error("لا توجد بيانات للطباعة");
      return;
    }
    setShowPrintModal(true);
  };


  if (isLoading) {
    return (
      <Layout>
        <div className="w-full space-y-6">
          <Card padding="lg">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                <div className="h-48 bg-gray-200 rounded"></div>
                <div className="h-48 bg-gray-200 rounded"></div>
                <div className="h-48 bg-gray-200 rounded"></div>
              </div>
              <div className="h-32 bg-gray-200 rounded mt-6"></div>
            </div>
          </Card>
        </div>
      </Layout>
    );
  }

  if (!companyId) {
    return (
      <Layout>
        <div className="w-full space-y-6">
          <div className="text-center py-12">
            <Receipt className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">خطأ في البيانات</h2>
            <p className="text-gray-600 mb-4">لم يتم العثور على معرف الشركة</p>
            <Button onClick={handleBack}>
              العودة إلى قائمة المبيعات
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="w-full space-y-6">
          <div className="text-center py-12">
            <Receipt className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">خطأ في تحميل الفاتورة</h2>
            <p className="text-gray-600 mb-4">
              {error?.message || 'حدث خطأ أثناء تحميل بيانات الفاتورة'}
            </p>
            <div className="text-sm text-gray-500 mb-4">
              <p>معرف الفاتورة: {id}</p>
              <p>معرف الشركة: {companyId}</p>
            </div>
            <Button onClick={handleBack}>
              العودة إلى قائمة المبيعات
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (!sale) {
    return (
      <Layout>
        <div className="w-full space-y-6">
          <div className="text-center py-12">
            <Receipt className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">الفاتورة غير موجودة</h2>
            <p className="text-gray-600 mb-4">لم يتم العثور على الفاتورة المطلوبة</p>
            <Button onClick={handleBack}>
              العودة إلى قائمة المبيعات
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const paymentMethodText = {
    CASH: 'نقدي',
    CARD: 'بطاقة ائتمان',
    CREDIT: 'آجل'
  };

  const paymentMethodColor = {
    CASH: 'text-green-600 bg-green-50',
    CARD: 'text-blue-600 bg-blue-50',
    CREDIT: 'text-orange-600 bg-orange-50'
  };

  const paymentStatusText = {
    PAID: 'مدفوع',
    PARTIAL: 'مدفوع جزئياً',
    UNPAID: 'غير مدفوع'
  };

  const paymentStatusConfig = {
    PAID: { color: 'text-green-600 bg-green-50', icon: CheckCircle },
    PARTIAL: { color: 'text-amber-600 bg-amber-50', icon: Clock },
    UNPAID: { color: 'text-red-600 bg-red-50', icon: AlertCircle }
  };

  return (
    <Layout>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Button
              variant="ghost"
              onClick={handleBack}
              className="flex items-center space-x-2 space-x-reverse text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>العودة</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                فاتورة رقم {sale.receiptNumber}
              </h1>
              <p className="text-gray-500 text-sm">تفاصيل عملية البيع</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 space-x-reverse">
            <Button
              onClick={handlePrintReceipt}
              variant="outline"
              size="sm"
              className="text-blue-600 border-blue-200 hover:bg-blue-50"
            >
              <Printer className="w-4 h-4 ml-1" />
              طباعة الفاتورة
            </Button>
            <Button
              onClick={handleDownloadPDF}
              variant="outline"
              size="sm"
              disabled={isGeneratingPDF}
              className="text-purple-600 border-purple-200 hover:bg-purple-50"
            >
              <Download className="w-4 h-4 ml-1" />
              {isGeneratingPDF ? "جاري التحميل..." : "تحميل PDF"}
            </Button>
          </div>
        </div>

        {/* Sale Overview Section */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sale Information Card */}
            <Card padding="lg" className="lg:col-span-2">
              <div className="space-y-6">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Receipt className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mr-3">معلومات الفاتورة</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">رقم الفاتورة</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900 font-mono">{sale.receiptNumber}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ البيع</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">
                        {sale.saleDate ? formatTableDate(sale.saleDate) : 'غير محدد'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">العميل</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">
                        {sale.client?.name || 'عميل نقدي'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">طريقة الدفع</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        paymentMethodColor[sale.paymentMethod as keyof typeof paymentMethodColor] || 'text-gray-600 bg-gray-50'
                      }`}>
                        {paymentMethodText[sale.paymentMethod as keyof typeof paymentMethodText] || sale.paymentMethod}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">حالة الدفع</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      {(() => {
                        const status = sale.paymentStatus as keyof typeof paymentStatusConfig;
                        const config = paymentStatusConfig[status] || paymentStatusConfig.UNPAID;
                        const StatusIcon = config.icon;
                        return (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
                            <StatusIcon className="w-3 h-3 ml-1" />
                            {paymentStatusText[status] || sale.paymentStatus}
                          </span>
                        );
                      })()}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الإنشاء</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">
                        {sale.createdAt ? formatTableDate(sale.createdAt) : 'غير محدد'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">آخر تحديث</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">
                        {sale.updatedAt ? formatTableDate(sale.updatedAt) : 'غير محدد'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Financial Summary Card */}
            <Card padding="lg">
              <div className="space-y-6">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mr-3">الملخص المالي</h3>
                </div>

                <div className="space-y-3">
                  {/* Subtotal */}
                  {sale.subtotal && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">المجموع الفرعي</span>
                      <span className="font-medium text-gray-900">{formatCurrency(sale.subtotal)}</span>
                    </div>
                  )}

                  {/* Discount */}
                  {((sale.discountAmount && sale.discountAmount > 0) || (sale.discountPercent && sale.discountPercent > 0)) && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 flex items-center gap-1">
                        <Percent className="w-3 h-3" />
                        الخصم {sale.discountPercent ? `(${sale.discountPercent}%)` : ''}
                      </span>
                      <span className="font-medium text-red-600">-{formatCurrency(sale.discountAmount || 0)}</span>
                    </div>
                  )}

                  {/* Tax */}
                  {sale.taxAmount && sale.taxAmount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        الضريبة {sale.taxRate ? `(${sale.taxRate}%)` : ''}
                      </span>
                      <span className="font-medium text-gray-900">+{formatCurrency(sale.taxAmount)}</span>
                    </div>
                  )}

                  {/* Additional Fee */}
                  {sale.additionalFee && sale.additionalFee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {sale.additionalFeeLabel || "رسوم إضافية"}
                      </span>
                      <span className="font-medium text-gray-900">+{formatCurrency(sale.additionalFee)}</span>
                    </div>
                  )}

                  {/* Divider */}
                  <div className="border-t border-gray-200 my-2"></div>

                  {/* Total */}
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-900">المجموع الكلي</span>
                    <span className="text-2xl font-bold text-green-600">
                      {formatCurrency(sale.totalAmount)}
                    </span>
                  </div>

                  {/* Paid Amount & Remaining */}
                  {sale.paymentStatus !== 'PAID' && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">المبلغ المدفوع</span>
                        <span className="font-medium text-green-600">{formatCurrency(sale.paidAmount || 0)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">المبلغ المتبقي</span>
                        <span className="font-medium text-red-600">
                          {formatCurrency((sale.totalAmount || 0) - (sale.paidAmount || 0))}
                        </span>
                      </div>
                    </>
                  )}

                  {/* Profit Section */}
                  {sale.totalProfit !== undefined && sale.totalProfit !== null && (
                    <>
                      <div className="border-t border-gray-200 my-2"></div>
                      <div className="flex justify-between items-center bg-emerald-50 p-2 rounded-lg">
                        <span className="text-sm font-medium text-emerald-700 flex items-center gap-1">
                          <TrendingUp className="w-4 h-4" />
                          صافي الربح
                        </span>
                        <span className="font-bold text-emerald-600">
                          {formatCurrency(sale.totalProfit)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Items Count */}
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">عدد المنتجات</p>
                      <p className="text-xl font-bold text-gray-900">{sale.items?.length || 0}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">إجمالي الكمية</p>
                      <p className="text-xl font-bold text-gray-900">
                        {sale.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Sale Items Section */}
          <Card padding="lg">
            <div className="space-y-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Package className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mr-3">منتجات الفاتورة</h3>
              </div>

              {sale.items && sale.items.length > 0 ? (
                (() => {
                  // Check if any item has cost/profit data
                  const showCostProfit = sale.items.some((item: any) => item.costPrice !== undefined && item.costPrice !== null);
                  const colSpan = showCostProfit ? 5 : 3;

                  return (
                    <div className="overflow-hidden border border-gray-200 rounded-lg">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              المنتج
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              السعر
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              الكمية
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              المجموع
                            </th>
                            {showCostProfit && (
                              <>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  التكلفة
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  الربح
                                </th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {sale.items.map((item: any, index: number) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {item.product?.name || 'منتج غير محدد'}
                                  </div>
                                  {item.product?.sku && (
                                    <div className="text-sm text-gray-500">
                                      SKU: {item.product.sku}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatCurrency(item.unitPrice)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatNumber(item.quantity)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {formatCurrency(item.totalPrice)}
                              </td>
                              {showCostProfit && (
                                <>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                    {formatCurrency(item.costPrice * item.quantity)}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-emerald-600">
                                    {formatCurrency(item.profit || (item.totalPrice - (item.costPrice * item.quantity)))}
                                  </td>
                                </>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50">
                          {sale.additionalFee && sale.additionalFee > 0 && (
                            <tr>
                              <td colSpan={colSpan} className="px-6 py-2 text-right text-sm text-gray-600">
                                {sale.additionalFeeLabel || "رسوم إضافية"}:
                              </td>
                              <td className="px-6 py-2 text-sm font-medium text-gray-900">
                                {formatCurrency(sale.additionalFee)}
                              </td>
                              {showCostProfit && <td></td>}
                            </tr>
                          )}
                          <tr>
                            <td colSpan={colSpan} className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                              المجموع الكلي:
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-green-600">
                              {formatCurrency(sale.totalAmount)}
                            </td>
                            {showCostProfit && (
                              <td className="px-6 py-4 text-sm font-bold text-emerald-600">
                                {formatCurrency(sale.totalProfit || 0)}
                              </td>
                            )}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  );
                })()
              ) : (
                <div className="text-center py-8">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">لا توجد منتجات في هذه الفاتورة</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Print Receipt Preview Modal */}
      {sale && (
        <PrintReceiptPreview
          sale={sale}
          companyId={companyId}
          cashier={user}
          isOpen={showPrintModal}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </Layout>
  );
};

export default SalesDetails;
