import React, { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Edit, Trash2, FileText, Eye, Printer, Mail, CheckCircle, Clock, XCircle, Calendar, User, FileDown, ShoppingCart, TrendingUp, Package, AlertTriangle } from "lucide-react";
import { Layout } from "../components/layout";
import { Button, Card, ConfirmDialog, DataTable, Badge } from "../components/ui";
import type { Column, TableFilter } from "../components/ui/DataTable";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import {
  useQuotes,
  useDeleteQuote,
  useEmailQuote,
} from "../hooks/api/useQuotes";
import { formatTableDate } from "../utils/dateUtils";
import { formatCurrency } from "../utils/currencyUtils";
import { downloadQuotePdf, printQuoteA4, printQuoteThermal } from "../services/quotePrintService";
import toast from "react-hot-toast";
import type { Quote } from "../types";

const Quotes: React.FC = () => {
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleting, setDeleting] = useState<Quote | null>(null);

  // API hooks
  const { data: quotesData, isLoading } = useQuotes({
    companyId: company?.companyId || 0,
    page: currentPage,
    limit: pageSize,
    search: searchTerm,
    status: statusFilter,
  });

  const deleteMutation = useDeleteQuote();
  const emailMutation = useEmailQuote();

  // Helper function to check if quote is expired
  const isExpired = (validUntil?: string) => {
    if (!validUntil) return false;
    return new Date(validUntil) < new Date();
  };

  // Table columns
  const columns: Column<Quote>[] = [
    {
      key: "quoteNumber",
      label: "رقم العرض",
      render: (quote: Quote) => (
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-500" />
          <span className="font-bold text-indigo-600">{quote.quoteNumber}</span>
        </div>
      ),
    },
    {
      key: "customerName",
      label: "العميل",
      render: (quote: Quote) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
            {(quote.customerName || "غ")[0]}
          </div>
          <span className="font-medium text-gray-900 text-sm">{quote.customerName || "غير محدد"}</span>
        </div>
      ),
    },
    {
      key: "items",
      label: "الأصناف",
      render: (quote: Quote) => (
        <div className="flex items-center gap-1 text-gray-600">
          <Package className="w-4 h-4" />
          <span className="font-medium">{quote.items?.length || 0}</span>
        </div>
      ),
    },
    {
      key: "total",
      label: "المبلغ",
      render: (quote: Quote) => (
        <span className="font-bold text-gray-900">
          {formatCurrency(quote.total)}
        </span>
      ),
    },
    {
      key: "status",
      label: "الحالة",
      render: (quote: Quote) => {
        const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'error'; icon: React.ReactNode }> = {
          DRAFT: { label: "مسودة", variant: "default", icon: <Clock className="w-3 h-3 ml-1" /> },
          SENT: { label: "مرسل", variant: "primary", icon: <Mail className="w-3 h-3 ml-1" /> },
          PRINTED: { label: "مطبوع", variant: "success", icon: <Printer className="w-3 h-3 ml-1" /> },
          ACCEPTED: { label: "مقبول", variant: "success", icon: <CheckCircle className="w-3 h-3 ml-1" /> },
          REJECTED: { label: "مرفوض", variant: "error", icon: <XCircle className="w-3 h-3 ml-1" /> },
        };
        const status = statusMap[quote.status] || statusMap.DRAFT;

        // Check for special states
        if (quote.convertedToSaleId) {
          return (
            <Badge variant="success">
              <ShoppingCart className="w-3 h-3 ml-1" />
              تم البيع
            </Badge>
          );
        }

        if (isExpired(quote.validUntil) && quote.status !== "ACCEPTED" && quote.status !== "REJECTED") {
          return (
            <Badge variant="error">
              <AlertTriangle className="w-3 h-3 ml-1" />
              منتهي
            </Badge>
          );
        }

        return (
          <Badge variant={status.variant}>
            {status.icon}
            {status.label}
          </Badge>
        );
      },
    },
    {
      key: "validUntil",
      label: "صالح حتى",
      render: (quote: Quote) => {
        if (!quote.validUntil) return <span className="text-gray-400 text-sm">-</span>;
        const expired = isExpired(quote.validUntil);
        return (
          <span className={`text-sm ${expired ? "text-red-600 font-medium" : "text-gray-600"}`}>
            {formatTableDate(quote.validUntil)}
          </span>
        );
      },
    },
    {
      key: "createdAt",
      label: "التاريخ",
      render: (quote: Quote) => (
        <span className="text-gray-600 text-sm">
          {formatTableDate(quote.createdAt)}
        </span>
      ),
    },
  ];



  /** One runner for every print button: shows progress, then success or the reason it failed */
  const runPrint = async (job: () => Promise<void>, busy: string, done: string) => {
    const id = "quote-print";
    toast.loading(busy, { id });
    try {
      await job();
      toast.success(done, { id });
    } catch (error: any) {
      console.error("Quote print error:", error);
      toast.error(error?.message || "فشلت الطباعة", { id });
    }
  };

  const handlePrintA4 = (quote: Quote) =>
    runPrint(() => printQuoteA4(quote), "جاري تجهيز الطباعة...", "تم فتح نافذة الطباعة");

  const handleDownloadPdf = (quote: Quote) =>
    runPrint(() => downloadQuotePdf(quote), "جاري إنشاء ملف PDF...", "تم تحميل ملف PDF");

  /** Converting happens on the quote page: the customer and any unregistered items are settled there */
  const handleConvertToSale = (quote: Quote) => navigate(`/quotes/${quote.id}?convert=1`);

  const handleEmailQuote = (id: string) => {
    const companyId = company?.companyId || 0;
    emailMutation.mutate({ id, companyId });
  };

  const handlePrintThermal = (quote: Quote) =>
    runPrint(() => printQuoteThermal(quote), "جاري الطباعة...", "تم إرسال العرض السعري للطابعة");

  const statusOptions = useMemo(() => [
    { value: "", label: "جميع الحالات" },
    { value: "DRAFT", label: "مسودة" },
    { value: "SENT", label: "مرسل" },
    { value: "PRINTED", label: "مطبوع" },
    { value: "ACCEPTED", label: "مقبول" },
    { value: "REJECTED", label: "مرفوض" },
  ], []);

  // Filter handlers
  const handleStatusFilter = useCallback((value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setStatusFilter("");
    setCurrentPage(1);
  }, []);

  // Table filters configuration
  const tableFilters: TableFilter[] = useMemo(() => [
    {
      key: 'status',
      label: 'الحالة',
      type: 'select',
      options: statusOptions,
      value: statusFilter,
      onChange: (value) => handleStatusFilter(value as string),
    },
  ], [statusOptions, statusFilter, handleStatusFilter]);

  // Calculate statistics
  const quotesList = quotesData?.data?.list || [];
  const totalQuotes = quotesData?.data?.totalCount || 0;
  const totalValue = quotesList.reduce((sum: number, quote: any) => sum + (Number(quote.total) || 0), 0);
  const draftQuotes = quotesList.filter((q: any) => q.status === 'DRAFT').length;
  const acceptedQuotes = quotesList.filter((q: any) => q.status === 'ACCEPTED').length;
  const rejectedQuotes = quotesList.filter((q: any) => q.status === 'REJECTED').length;
  const convertedQuotes = quotesList.filter((q: any) => q.convertedToSaleId).length;

  return (
    <Layout>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">العروض السعرية</h1>
            <p className="text-gray-600 mt-1">إدارة العروض السعرية للعملاء</p>
          </div>
          <Button
            onClick={() => navigate('/quotes/create')}
            className="flex items-center space-x-2 space-x-reverse"
          >
            <Plus className="w-4 h-4" />
            <span>عرض سعري جديد</span>
          </Button>
        </div>

        {/* Summary Cards - 2 rows, 3 cards each */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* Row 1 - Main Stats */}
          <Card padding="sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center text-white shadow-md">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">العروض</p>
                <p className="text-lg font-bold text-gray-900">{totalQuotes}</p>
              </div>
            </div>
          </Card>

          <Card padding="sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white shadow-md">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">القيمة</p>
                <p className="text-lg font-bold text-blue-600">{formatCurrency(totalValue)}</p>
              </div>
            </div>
          </Card>

          <Card padding="sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center text-white shadow-md">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">تم البيع</p>
                <p className="text-lg font-bold text-green-600">{convertedQuotes}</p>
              </div>
            </div>
          </Card>

          {/* Row 2 - Status Stats */}
          <Card padding="sm">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-gray-400" />
              <div>
                <p className="text-xs text-gray-500">مسودة</p>
                <p className="text-lg font-bold text-gray-600">{draftQuotes}</p>
              </div>
            </div>
          </Card>

          <Card padding="sm">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-xs text-gray-500">مقبول</p>
                <p className="text-lg font-bold text-green-600">{acceptedQuotes}</p>
              </div>
            </div>
          </Card>

          <Card padding="sm">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-xs text-gray-500">مرفوض</p>
                <p className="text-lg font-bold text-red-600">{rejectedQuotes}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Quotes Table with integrated search and filters */}
        <DataTable<Quote>
          title="جميع عروض الأسعار"
          columns={columns}
          data={quotesData?.data?.list || []}
          loading={isLoading}
          searchPlaceholder="البحث في عروض الأسعار (رقم العرض، اسم العميل...)"
          onSearch={handleSearch}
          filters={tableFilters}
          onClearFilters={handleClearFilters}
          actions={[
            {
              icon: Eye,
              label: "عرض التفاصيل",
              onClick: (quote) => navigate(`/quotes/${quote.id}`),
              variant: "primary",
            },
            {
              icon: ShoppingCart,
              label: "تحويل لفاتورة بيع",
              onClick: (quote) => handleConvertToSale(quote),
              variant: "success",
              show: (quote) => !quote.convertedToSaleId && quote.status !== "REJECTED",
            },
            {
              icon: Mail,
              label: "إرسال بالبريد",
              onClick: (quote) => handleEmailQuote(quote.id),
              variant: "primary",
              show: (quote) => quote.customerEmail && quote.status === "DRAFT",
            },
            {
              icon: FileDown,
              label: "تحميل PDF",
              onClick: (quote) => handleDownloadPdf(quote),
              variant: "primary",
            },
            {
              icon: FileText,
              label: "طباعة A4",
              onClick: (quote) => handlePrintA4(quote),
              variant: "primary",
            },
            {
              icon: Printer,
              label: "طباعة حرارية",
              onClick: (quote) => handlePrintThermal(quote),
              variant: "primary",
            },
            {
              icon: Edit,
              label: "تعديل",
              onClick: (quote) => navigate(`/quotes/${quote.id}/edit`),
              variant: "warning",
              show: (quote) => !quote.convertedToSaleId,
            },
            {
              icon: Trash2,
              label: "حذف",
              onClick: (quote) => setDeleting(quote),
              variant: "danger",
              show: (quote) => !quote.convertedToSaleId,
            },
          ]}
          totalItems={quotesData?.data?.totalCount || 0}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setCurrentPage(1);
          }}
          emptyMessage="لا توجد عروض أسعار حتى الآن. قم بإضافة عرض سعري جديد للبدء!"
        />

        <ConfirmDialog
          isOpen={!!deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleting && deleteMutation.mutate(deleting.id, { onSettled: () => setDeleting(null) })}
          title="حذف العرض السعري"
          message={`سيُحذف العرض ${deleting?.quoteNumber || ""} نهائياً. لا يمكن التراجع عن ذلك.`}
          confirmText="حذف"
          isLoading={deleteMutation.isPending}
        />
      </div>
    </Layout>
  );
};

export default Quotes;

