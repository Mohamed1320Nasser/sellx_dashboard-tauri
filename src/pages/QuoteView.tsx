import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Printer,
  FileDown,
  Mail,
  ShoppingCart,
  Edit,
  Trash2,
  FileText,
  DollarSign,
  Package,
  AlertTriangle,
  Download,
  Building2,
  Phone,
  Mail as MailIcon,
  MapPin,
  User,
  CheckCircle,
} from "lucide-react";
import { Layout } from "../components/layout";
import { Button, Card, Badge, Modal } from "../components/ui";
import { useQuote, useDeleteQuote, useConvertQuoteToSale, useEmailQuote } from "../hooks/api/useQuotes";
import { useClients } from "../hooks/api/useClients";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { formatTableDate } from "../utils/dateUtils";
import { formatCurrency, formatNumber } from "../utils/currencyUtils";
import { downloadQuotePdf, printQuoteA4, printQuoteThermal } from "../services/quotePrintService";
import toast from "react-hot-toast";
import type { Quote } from "../types";
import { formatQty, unitOf } from '../utils/quantity';

const QuoteView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id || 0;
  const [convertingQuote, setConvertingQuote] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const { data: quote, isLoading, error } = useQuote(id || "", companyId);
  const deleteMutation = useDeleteQuote();
  const convertToSaleMutation = useConvertQuoteToSale();
  const [convertClientId, setConvertClientId] = useState("");
  const { data: clientsData } = useClients({ companyId: companyId || 0, page: 1, limit: 100 });
  const clients: any[] = (clientsData as any)?.data?.list || [];
  const emailMutation = useEmailQuote();

  // Helper function to check if quote is expired
  const isExpired = (validUntil?: string) => {
    if (!validUntil) return false;
    return new Date(validUntil) < new Date();
  };

  const handleBack = () => {
    navigate("/quotes");
  };

  /** One runner for every print button: shows progress, then success or the reason it failed */
  const runPrint = async (job: () => Promise<void>, busy: string, done: string) => {
    if (!quote) return;
    const toastId = "quote-print";
    toast.loading(busy, { id: toastId });
    try {
      await job();
      toast.success(done, { id: toastId });
    } catch (error: any) {
      console.error("Quote print error:", error);
      toast.error(error?.message || "فشلت الطباعة", { id: toastId });
    }
  };

  const handlePrintA4 = () =>
    runPrint(() => printQuoteA4(quote), "جاري تجهيز الطباعة...", "تم فتح نافذة الطباعة");

  const handlePrintThermal = () =>
    runPrint(() => printQuoteThermal(quote), "جاري الطباعة...", "تم إرسال العرض السعري للطابعة");

  const handleEmailQuote = () => {
    if (id && companyId) {
      emailMutation.mutate({ id, companyId });
    }
  };

  const handleEdit = () => {
    navigate(`/quotes`);
  };

  const handleDelete = () => {
    if (id && window.confirm("هل أنت متأكد من حذف هذا العرض السعري؟")) {
      deleteMutation.mutate(id, {
        onSuccess: () => {
          navigate("/quotes");
        },
      });
    }
  };

  const handleConvertToSale = () => {
    // Pre-pick the customer the quote was written for (same phone, or else same name)
    const contact = quote?.customerContact?.trim();
    const name = quote?.customerName?.trim();
    const match =
      (contact && clients.find((c) => c.phone?.trim() === contact)) ||
      (name && clients.find((c) => c.name?.trim() === name));
    setConvertClientId(match ? String(match.id) : "");
    setConvertingQuote(true);
  };

  const confirmConvertToSale = () => {
    if (id && companyId) {
      convertToSaleMutation.mutate(
        { id, companyId, clientId: convertClientId ? Number(convertClientId) : undefined },
        {
          onSuccess: (data: any) => {
            setConvertingQuote(false);
            if (data?.data?.saleId) {
              navigate(`/sales/${data.data.saleId}`);
            }
          },
          onError: () => {
            setConvertingQuote(false);
          },
        }
      );
    }
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    await runPrint(() => downloadQuotePdf(quote), "جاري إنشاء ملف PDF...", "تم تحميل ملف PDF");
    setIsGeneratingPDF(false);
  };

  // Loading state - skeleton like SalesDetails
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

  // Error state - no company ID
  if (!companyId) {
    return (
      <Layout>
        <div className="w-full space-y-6">
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">خطأ في البيانات</h2>
            <p className="text-gray-600 mb-4">لم يتم العثور على معرف الشركة</p>
            <Button onClick={handleBack}>العودة إلى قائمة العروض السعرية</Button>
          </div>
        </div>
      </Layout>
    );
  }

  // Error state
  if (error) {
    return (
      <Layout>
        <div className="w-full space-y-6">
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">خطأ في تحميل العرض السعري</h2>
            <p className="text-gray-600 mb-4">{(error as any)?.message || "حدث خطأ أثناء تحميل بيانات العرض السعري"}</p>
            <div className="text-sm text-gray-500 mb-4">
              <p>معرف العرض: {id}</p>
              <p>معرف الشركة: {companyId}</p>
            </div>
            <Button onClick={handleBack}>العودة إلى قائمة العروض السعرية</Button>
          </div>
        </div>
      </Layout>
    );
  }

  // Not found state
  if (!quote) {
    return (
      <Layout>
        <div className="w-full space-y-6">
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">العرض السعري غير موجود</h2>
            <p className="text-gray-600 mb-4">لم يتم العثور على العرض السعري المطلوب</p>
            <Button onClick={handleBack}>العودة إلى قائمة العروض السعرية</Button>
          </div>
        </div>
      </Layout>
    );
  }

  const expired = isExpired(quote.validUntil);

  const statusMap: Record<string, { label: string; variant: "default" | "primary" | "success" | "warning" | "error" }> = {
    DRAFT: { label: "مسودة", variant: "default" },
    SENT: { label: "مرسل", variant: "primary" },
    PRINTED: { label: "مطبوع", variant: "success" },
    ACCEPTED: { label: "مقبول", variant: "success" },
    REJECTED: { label: "مرفوض", variant: "error" },
  };
  const status = statusMap[quote.status] || statusMap.DRAFT;

  const statusColor: Record<string, string> = {
    DRAFT: "text-gray-600 bg-gray-50",
    SENT: "text-blue-600 bg-blue-50",
    PRINTED: "text-green-600 bg-green-50",
    ACCEPTED: "text-green-600 bg-green-50",
    REJECTED: "text-red-600 bg-red-50",
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
              <h1 className="text-2xl font-bold text-gray-900">عرض سعري رقم {quote.quoteNumber}</h1>
              <p className="text-gray-500 text-sm">تفاصيل العرض السعري</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 space-x-reverse">
            <Button onClick={handlePrintThermal} variant="outline" size="sm" className="text-green-600 border-green-200 hover:bg-green-50">
              <Printer className="w-4 h-4 ml-1" />
              طباعة حرارية
            </Button>
            <Button onClick={handlePrintA4} variant="outline" size="sm" className="text-blue-600 border-blue-200 hover:bg-blue-50">
              <FileDown className="w-4 h-4 ml-1" />
              طباعة A4
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
            {quote.customerEmail && quote.status === "DRAFT" && (
              <Button
                onClick={handleEmailQuote}
                variant="outline"
                size="sm"
                disabled={emailMutation.isPending}
                className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              >
                <Mail className="w-4 h-4 ml-1" />
                {emailMutation.isPending ? "جاري الإرسال..." : "إرسال بالبريد"}
              </Button>
            )}
            {!quote.convertedToSaleId && quote.status !== "REJECTED" && (
              <Button onClick={handleConvertToSale} size="sm" className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
                <ShoppingCart className="w-4 h-4 ml-1" />
                تحويل لفاتورة
              </Button>
            )}
          </div>
        </div>

        {/* Quote Overview Section */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quote Information Card */}
            <Card padding="lg" className="lg:col-span-2">
              <div className="space-y-6">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mr-3">معلومات العرض السعري</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">رقم العرض</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900 font-mono">{quote.quoteNumber}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الحالة</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          statusColor[quote.status] || "text-gray-600 bg-gray-50"
                        }`}
                      >
                        {status.label}
                      </span>
                      {expired && quote.status !== "ACCEPTED" && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-red-600 bg-red-50 mr-2">
                          <AlertTriangle className="w-3 h-3 ml-1" />
                          منتهي الصلاحية
                        </span>
                      )}
                      {quote.convertedToSaleId && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-green-600 bg-green-50 mr-2">
                          تم التحويل
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">اسم العميل</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">{quote.customerName || "غير محدد"}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">رقم الهاتف</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">{quote.customerContact || "-"}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">{quote.customerEmail || "-"}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">العملة</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">{quote.currency}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ الإنشاء</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-gray-900">{quote.createdAt ? formatTableDate(quote.createdAt) : "غير محدد"}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">صالح حتى</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className={expired ? "text-red-600 font-medium" : "text-gray-900"}>
                        {quote.validUntil ? formatTableDate(quote.validUntil) : "غير محدد"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes Section */}
                {quote.notes && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <p className="text-gray-900 whitespace-pre-wrap">{quote.notes}</p>
                    </div>
                  </div>
                )}
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

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">المجموع الفرعي</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-lg font-medium text-gray-900">
                        {formatCurrency(quote.subtotal)} {quote.currency}
                      </span>
                    </div>
                  </div>

                  {quote.totalDiscount > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">إجمالي الخصومات</label>
                      <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                        <span className="text-lg font-medium text-green-600">
                          -{formatCurrency(quote.totalDiscount)} {quote.currency}
                        </span>
                      </div>
                    </div>
                  )}

                  {quote.taxPercent > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">الضريبة ({quote.taxPercent}%)</label>
                      <div className="bg-gray-50 rounded-lg p-3 border">
                        <span className="text-lg font-medium text-gray-900">
                          {formatCurrency(quote.taxAmount)} {quote.currency}
                        </span>
                      </div>
                    </div>
                  )}

                  {(quote as any).additionalFee > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {(quote as any).additionalFeeLabel || "رسوم إضافية"}
                      </label>
                      <div className="bg-gray-50 rounded-lg p-3 border">
                        <span className="text-lg font-medium text-gray-900">
                          {formatCurrency((quote as any).additionalFee)} {quote.currency}
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">المجموع الكلي</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-2xl font-bold text-green-600">
                        {formatCurrency(quote.total)} {quote.currency}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">عدد المنتجات</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-lg font-semibold text-gray-900">{quote.items?.length || 0}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">إجمالي الكمية</label>
                    <div className="bg-gray-50 rounded-lg p-3 border">
                      <span className="text-lg font-semibold text-gray-900">
                        {quote.items?.reduce((sum, item) => sum + item.quantity, 0) || 0}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                {!quote.convertedToSaleId && (
                  <div className="pt-4 border-t space-y-2">
                    <Button variant="outline" onClick={handleEdit} className="w-full justify-center">
                      <Edit className="w-4 h-4 ml-2" />
                      تعديل العرض
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleDelete}
                      loading={deleteMutation.isPending}
                      className="w-full justify-center text-red-600 hover:bg-red-50 border-red-200"
                    >
                      <Trash2 className="w-4 h-4 ml-2" />
                      حذف العرض
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Quote Items Section */}
          <Card padding="lg">
            <div className="space-y-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Package className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mr-3">منتجات العرض السعري</h3>
              </div>

              {quote.items && quote.items.length > 0 ? (
                <div className="overflow-hidden border border-gray-200 rounded-lg">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">المنتج</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">السعر</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الكمية</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">الخصم</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">المجموع</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {quote.items.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{item.productName || "منتج غير محدد"}</div>
                              {item.productSku && <div className="text-sm text-gray-500">SKU: {item.productSku}</div>}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(item.unitPrice)} {quote.currency}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatQty(item.quantity, unitOf(item.product))}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {item.lineDiscount > 0 ? (
                              <span className="text-green-600">
                                -{formatCurrency(item.lineDiscount)} {quote.currency}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {formatCurrency(item.lineTotal)} {quote.currency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={4} className="px-6 py-2 text-right text-sm text-gray-600">
                          المجموع الفرعي:
                        </td>
                        <td className="px-6 py-2 text-sm font-medium text-gray-900">
                          {formatCurrency(quote.subtotal)} {quote.currency}
                        </td>
                      </tr>
                      {quote.totalDiscount > 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-2 text-right text-sm text-gray-600">
                            إجمالي الخصومات:
                          </td>
                          <td className="px-6 py-2 text-sm font-medium text-green-600">
                            -{formatCurrency(quote.totalDiscount)} {quote.currency}
                          </td>
                        </tr>
                      )}
                      {quote.taxPercent > 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-2 text-right text-sm text-gray-600">
                            الضريبة ({quote.taxPercent}%):
                          </td>
                          <td className="px-6 py-2 text-sm font-medium text-gray-900">
                            {formatCurrency(quote.taxAmount)} {quote.currency}
                          </td>
                        </tr>
                      )}
                      {(quote as any).additionalFee > 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-2 text-right text-sm text-gray-600">
                            {(quote as any).additionalFeeLabel || "رسوم إضافية"}:
                          </td>
                          <td className="px-6 py-2 text-sm font-medium text-gray-900">
                            {formatCurrency((quote as any).additionalFee)} {quote.currency}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan={4} className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                          المجموع الكلي:
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-green-600">
                          {formatCurrency(quote.total)} {quote.currency}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">لا توجد منتجات في هذا العرض السعري</p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Convert to Sale Confirmation Modal */}
        <Modal isOpen={convertingQuote} onClose={() => setConvertingQuote(false)} title="تحويل العرض السعري إلى فاتورة بيع" size="md">
          <div className="space-y-6">
            {/* Quote Summary */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                  <FileText className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{quote.quoteNumber}</h3>
                  <p className="text-gray-600">{quote.customerName || "عميل غير محدد"}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">المجموع الفرعي:</span>
                  <span className="text-gray-900">
                    {formatCurrency(quote.subtotal)} {quote.currency}
                  </span>
                </div>
                {quote.totalDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">الخصم:</span>
                    <span className="text-green-600">
                      -{formatCurrency(quote.totalDiscount)} {quote.currency}
                    </span>
                  </div>
                )}
                {quote.taxAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">الضريبة ({quote.taxPercent}%):</span>
                    <span className="text-gray-900">
                      {formatCurrency(quote.taxAmount)} {quote.currency}
                    </span>
                  </div>
                )}
                {Number(quote.additionalFee) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{quote.additionalFeeLabel || "رسوم إضافية"}:</span>
                    <span className="text-gray-900">
                      {formatCurrency(Number(quote.additionalFee))} {quote.currency}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold pt-2 border-t border-indigo-200">
                  <span className="text-gray-900">المجموع الكلي:</span>
                  <span className="text-indigo-600">
                    {formatCurrency(quote.total)} {quote.currency}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer account for the invoice */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">العميل (حساب الفاتورة)</label>
              <select
                value={convertClientId}
                onChange={(e) => setConvertClientId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">بدون عميل</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` - ${c.phone}` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                الفاتورة تُنشأ غير مدفوعة، لذلك يُفضّل ربطها بعميل حتى تظهر في كشف حسابه.
              </p>
            </div>

            {expired && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                انتهت صلاحية هذا العرض السعري. تأكد من الأسعار قبل التحويل.
              </div>
            )}

            {/* Conversion Info */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-amber-800 mb-1">ملاحظة مهمة</h4>
                  <p className="text-sm text-amber-700">
                    سيتم إنشاء فاتورة بيع جديدة بنفس تفاصيل العرض السعري. لن يمكن تعديل أو حذف العرض السعري بعد التحويل.
                  </p>
                </div>
              </div>
            </div>

            {/* Items Preview */}
            <div className="border rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b">
                <h4 className="font-medium text-gray-900">المنتجات ({quote.items?.length || 0})</h4>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {quote.items?.map((item, index) => (
                  <div key={index} className="px-4 py-2 flex justify-between items-center border-b last:border-b-0 hover:bg-gray-50">
                    <div>
                      <span className="text-gray-900">{item.productName}</span>
                      <span className="text-gray-500 text-sm mr-2">× {item.quantity}</span>
                    </div>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(item.lineTotal)} {quote.currency}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setConvertingQuote(false)}>
                إلغاء
              </Button>
              <Button
                onClick={confirmConvertToSale}
                loading={convertToSaleMutation.isPending}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              >
                <ShoppingCart className="w-4 h-4 ml-2" />
                تأكيد التحويل لفاتورة بيع
              </Button>
            </div>
          </div>
        </Modal>

      </div>
    </Layout>
  );
};

export default QuoteView;
