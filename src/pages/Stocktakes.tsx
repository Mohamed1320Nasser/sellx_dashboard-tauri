import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, Plus, ArrowLeft, Eye } from "lucide-react";
import { Layout } from "../components/layout";
import { Button, DataTable, Modal } from "../components/ui";
import type { Column } from "../components/ui/DataTable";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { useCategories } from "../hooks/api/useCategories";
import { useStartStocktake, useStocktakes } from "../hooks/api/useStocktakes";
import type { Stocktake, StocktakeStatus } from "../services/stocktakeService";
import { formatCurrency, formatNumber } from "../utils/currencyUtils";
import { formatDateTime } from "../utils/dateUtils";

export const STOCKTAKE_STATUS: Record<StocktakeStatus, { label: string; className: string }> = {
  IN_PROGRESS: { label: "جاري العد", className: "bg-amber-100 text-amber-800 border-amber-200" },
  COMPLETED: { label: "معتمد", className: "bg-green-100 text-green-800 border-green-200" },
  CANCELLED: { label: "ملغي", className: "bg-gray-100 text-gray-600 border-gray-200" },
};

const Stocktakes: React.FC = () => {
  const navigate = useNavigate();
  const { company, user } = useSessionAuthStore();
  const companyId = company?.companyId || 0;
  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState<StocktakeStatus | "">("");
  const [showStart, setShowStart] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useStocktakes({ companyId, page, limit: pageSize, ...(status && { status }) });
  const { data: openData } = useStocktakes({ companyId, page: 1, limit: 1, status: "IN_PROGRESS" });
  const { data: categoriesData } = useCategories({ companyId, page: 1, limit: 100 });
  const startMutation = useStartStocktake();

  const stocktakes: Stocktake[] = data?.data?.stocktakes || [];
  const totalCount: number = data?.data?.totalCount || 0;
  const openCount: Stocktake | undefined = openData?.data?.stocktakes?.[0];
  const categories: { id: string; name: string }[] = categoriesData?.data?.list || [];

  const start = async () => {
    try {
      const res = await startMutation.mutateAsync({ companyId, ...(categoryId && { categoryId }), ...(notes.trim() && { notes: notes.trim() }) });
      setShowStart(false);
      setCategoryId("");
      setNotes("");
      if (res?.data?.id) navigate(`/stocktakes/${res.data.id}`);
    } catch {
      /* toast shown by the hook */
    }
  };

  const columns: Column<Stocktake>[] = useMemo(
    () => [
      {
        key: "stocktakeNumber",
        label: "رقم الجرد",
        render: (s: Stocktake) => (
          <button type="button" onClick={() => navigate(`/stocktakes/${s.id}`)} className="font-mono font-semibold text-indigo-700 hover:underline">
            {s.stocktakeNumber}
          </button>
        ),
      },
      {
        key: "scope",
        label: "النطاق",
        render: (s: Stocktake) => <span className="text-gray-700">{s.category ? `فئة: ${s.category.name}` : "كل المنتجات"}</span>,
      },
      {
        key: "status",
        label: "الحالة",
        render: (s: Stocktake) => (
          <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${STOCKTAKE_STATUS[s.status].className}`}>
            {STOCKTAKE_STATUS[s.status].label}
          </span>
        ),
      },
      {
        key: "progress",
        label: "تم عده",
        render: (s: Stocktake) => (
          <span className="text-gray-700">
            {formatNumber(s.summary.counted)} / {formatNumber(s.summary.totalItems)}
          </span>
        ),
      },
      {
        key: "shortage",
        label: "العجز",
        render: (s: Stocktake) =>
          s.summary.shortageQty ? (
            <span className="text-red-600 font-medium">
              {formatNumber(s.summary.shortageQty)} قطعة ({formatCurrency(s.summary.shortageValue)})
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          ),
      },
      {
        key: "surplus",
        label: "الزيادة",
        render: (s: Stocktake) =>
          s.summary.surplusQty ? (
            <span className="text-green-700 font-medium">
              {formatNumber(s.summary.surplusQty)} قطعة ({formatCurrency(s.summary.surplusValue)})
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          ),
      },
      {
        key: "startedAt",
        label: "البداية",
        render: (s: Stocktake) => (
          <div className="text-sm">
            <div className="text-gray-800">{formatDateTime(s.startedAt)}</div>
            <div className="text-gray-500">{s.user?.fullname}</div>
          </div>
        ),
      },
    ],
    [navigate]
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <ClipboardCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">جرد المخزون</h1>
              <p className="text-gray-600 text-sm">عُد المنتجات بالباركود أو بكتابة الكمية، ثم اعتمد الجرد لتصحيح المخزون</p>
            </div>
          </div>
          {isManager && !openCount && (
            <Button onClick={() => setShowStart(true)}>
              <Plus className="w-4 h-4 ml-2" />
              بدء جرد جديد
            </Button>
          )}
        </div>

        {openCount && (
          <button
            type="button"
            onClick={() => navigate(`/stocktakes/${openCount.id}`)}
            className="w-full flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-right hover:bg-amber-100 transition"
          >
            <div>
              <div className="font-semibold text-amber-900">
                جرد مفتوح: {openCount.stocktakeNumber} ({openCount.category ? openCount.category.name : "كل المنتجات"})
              </div>
              <div className="text-sm text-amber-800">
                تم عد {formatNumber(openCount.summary.counted)} من {formatNumber(openCount.summary.totalItems)} منتج
              </div>
            </div>
            <span className="inline-flex items-center gap-2 font-medium text-amber-900">
              متابعة العد
              <ArrowLeft className="w-4 h-4" />
            </span>
          </button>
        )}

        <div className="flex flex-wrap gap-2">
          {([["", "الكل"], ["IN_PROGRESS", "جاري العد"], ["COMPLETED", "معتمد"], ["CANCELLED", "ملغي"]] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                status === value ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <DataTable<Stocktake>
          title="عمليات الجرد"
          data={stocktakes}
          columns={columns}
          loading={isLoading}
          emptyMessage="لا توجد عمليات جرد بعد"
          showSearch={false}
          actions={[{ icon: Eye, label: "عرض", onClick: (s) => navigate(`/stocktakes/${s.id}`), variant: "primary" }]}
          currentPage={page}
          pageSize={pageSize}
          totalItems={totalCount}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      <Modal isOpen={showStart} onClose={() => setShowStart(false)} title="بدء جرد جديد" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ماذا تريد أن تجرد؟</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">كل المنتجات</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  فئة: {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات (اختياري)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="مثال: جرد نهاية الشهر"
            />
          </div>
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
            العد لا يغيّر المخزون. يمكن البيع أثناء الجرد بشكل طبيعي، وعند الاعتماد تُطبَّق الفروقات فقط على المنتجات التي تم عدها.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowStart(false)}>
              إلغاء
            </Button>
            <Button onClick={start} disabled={startMutation.isPending}>
              {startMutation.isPending ? "جاري البدء..." : "بدء الجرد"}
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};

export default Stocktakes;
