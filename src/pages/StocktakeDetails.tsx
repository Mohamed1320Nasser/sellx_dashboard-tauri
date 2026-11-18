import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Barcode, CheckCircle2, Printer, Search, X, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { Layout } from "../components/layout";
import { Button, ConfirmDialog } from "../components/ui";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { useCancelStocktake, useCompleteStocktake, useCountStocktakeItem, useStocktake } from "../hooks/api/useStocktakes";
import type { Stocktake, StocktakeItem, StocktakeItemFilter } from "../services/stocktakeService";
import { formatCurrency, formatNumber } from "../utils/currencyUtils";
import { formatDateTime } from "../utils/dateUtils";
import { handleApiError } from "../utils/errorHandler";
import { STOCKTAKE_STATUS } from "./Stocktakes";
import { formatQty, normalizeDigits, parseQty, toQty, unitOf } from "../utils/quantity";

/** Rows drawn at once; search narrows a big count */
const MAX_ROWS = 400;

const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Print an A4 page through a hidden frame (works on the web and in the desktop app) */
function printA4(title: string, body: string) {
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: Tahoma, Arial, sans-serif; font-size: 12px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #444; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 5px 6px; text-align: right; }
  th { background: #eee; }
  td.blank { width: 90px; }
  .neg { color: #b91c1c; } .pos { color: #15803d; }
  tfoot td { font-weight: bold; background: #f6f6f6; }
  .sign { margin-top: 28px; display: flex; justify-content: space-between; }
</style></head><body>${body}</body></html>`;
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 1000);
  }, 300);
}

const DiffBadge: React.FC<{ value: number | null }> = ({ value }) => {
  if (value === null) return <span className="text-gray-400">-</span>;
  if (value === 0) return <span className="text-gray-600">مطابق</span>;
  return (
    <span className={`font-semibold ${value < 0 ? "text-red-600" : "text-green-700"}`} dir="ltr">
      {value > 0 ? `+${formatQty(value)}` : formatQty(value)}
    </span>
  );
};

/** Counted quantity typed straight into the table row */
const CountCell: React.FC<{ item: StocktakeItem; disabled: boolean; onSave: (item: StocktakeItem, value: string) => void }> = ({
  item,
  disabled,
  onSave,
}) => {
  const shown = item.countedQty === null ? "" : formatQty(item.countedQty);
  const [value, setValue] = useState(shown);
  useEffect(() => setValue(shown), [shown]);
  const commit = () => {
    const typed = normalizeDigits(value);
    if (typed === shown || (typed !== "" && shown !== "" && toQty(typed) === toQty(item.countedQty))) return;
    onSave(item, typed);
  };
  return (
    <input
      type="text"
      inputMode={item.product.allowDecimalQty ? "decimal" : "numeric"}
      value={value}
      disabled={disabled}
      aria-label={`المعدود من ${item.product.name}`}
      onChange={(e) => setValue(normalizeDigits(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder="لم يُعد"
      className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-center focus:border-indigo-500 focus:ring-indigo-500 disabled:bg-gray-50"
    />
  );
};

const StocktakeDetails: React.FC = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { company, user } = useSessionAuthStore();
  const companyId = company?.companyId || 0;
  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";

  const [filter, setFilter] = useState<StocktakeItemFilter>("all");
  const [search, setSearch] = useState("");
  const [barcode, setBarcode] = useState("");
  const [scanQty, setScanQty] = useState("1");
  const [lastScan, setLastScan] = useState<{ ok: boolean; text: string; item?: StocktakeItem } | null>(null);
  const [confirm, setConfirm] = useState<"complete" | "cancel" | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useStocktake(id, { companyId, filter, ...(search.trim() && { search: search.trim() }) });
  const countMutation = useCountStocktakeItem(id);
  const completeMutation = useCompleteStocktake();
  const cancelMutation = useCancelStocktake();

  const stocktake: Stocktake | undefined = data?.data;
  const items: StocktakeItem[] = stocktake?.items || [];
  const open = stocktake?.status === "IN_PROGRESS";
  const summary = stocktake?.summary;
  // "قطعة" only when nothing in the count is weighed
  const qtyWord = items.some((i) => i.product.allowDecimalQty) ? "وحدة" : "قطعة";

  useEffect(() => {
    if (open) scanRef.current?.focus();
  }, [open]);

  const submitScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    const quantity = toQty(normalizeDigits(scanQty)) || 1;
    setBarcode("");
    try {
      const res = await countMutation.mutateAsync({ companyId, barcode: code, mode: "add", quantity });
      const item: StocktakeItem = res.data;
      setLastScan({ ok: true, text: `${item.product.name}: المعدود ${formatQty(item.countedQty ?? 0, unitOf(item.product))}`, item });
    } catch (error) {
      const message = handleApiError(error);
      setLastScan({ ok: false, text: message });
      toast.error(message);
    }
    setScanQty("1");
    scanRef.current?.focus();
  };

  const saveRow = async (item: StocktakeItem, value: string) => {
    try {
      if (value === "") {
        await countMutation.mutateAsync({ companyId, productId: item.productId, mode: "clear" });
      } else {
        const quantity = parseQty(value, item.product);
        if (quantity === null || quantity < 0) {
          toast.error(
            item.product.allowDecimalQty
              ? "الكمية صفر أو أكثر (حتى 3 أرقام عشرية)"
              : "الكمية يجب أن تكون رقماً صحيحاً من صفر فأكثر"
          );
          return;
        }
        await countMutation.mutateAsync({ companyId, productId: item.productId, mode: "set", quantity });
      }
    } catch (error) {
      toast.error(handleApiError(error));
    }
  };

  const doConfirm = async () => {
    try {
      if (confirm === "complete") await completeMutation.mutateAsync({ id, companyId });
      if (confirm === "cancel") await cancelMutation.mutateAsync({ id, companyId });
    } catch {
      /* toast shown by the hook */
    }
    setConfirm(null);
  };

  const scopeLabel = stocktake?.category ? `فئة: ${stocktake.category.name}` : "كل المنتجات";

  const printSheet = () => {
    if (!stocktake) return;
    const rows = items
      .map(
        (item, i) =>
          `<tr><td>${i + 1}</td><td>${escapeHtml(item.product.name)}</td><td>${escapeHtml(item.product.sku)}</td><td>${escapeHtml(
            item.product.category?.name || ""
          )}</td><td class="blank"></td></tr>`
      )
      .join("");
    printA4(
      `ورقة جرد ${stocktake.stocktakeNumber}`,
      `<h1>ورقة جرد ${escapeHtml(stocktake.stocktakeNumber)}</h1>
       <div class="meta">${escapeHtml(scopeLabel)} · ${escapeHtml(formatDateTime(stocktake.startedAt))} · ${items.length} منتج</div>
       <table><thead><tr><th>#</th><th>المنتج</th><th>الباركود</th><th>الفئة</th><th>الكمية المعدودة</th></tr></thead><tbody>${rows}</tbody></table>
       <div class="sign"><span>اسم القائم بالعد: ..................</span><span>التوقيع: ..................</span></div>`
    );
  };

  const printDifferences = () => {
    if (!stocktake || !summary) return;
    const diffItems = items.filter((i) => i.difference);
    const rows = diffItems
      .map((item, i) => {
        const diff = item.difference || 0;
        const system = item.systemQty;
        const u = escapeHtml(unitOf(item.product));
        return `<tr><td>${i + 1}</td><td>${escapeHtml(item.product.name)}</td><td>${escapeHtml(item.product.sku)}</td><td>${
          system === null || system === undefined ? "" : formatQty(system)
        }</td><td>${item.countedQty === null ? "" : formatQty(item.countedQty)}</td><td class="${diff < 0 ? "neg" : "pos"}" dir="ltr">${diff > 0 ? "+" : ""}${formatQty(diff)} ${u}</td><td>${escapeHtml(
          formatCurrency(item.differenceValue || 0)
        )}</td></tr>`;
      })
      .join("");
    printA4(
      `فروقات الجرد ${stocktake.stocktakeNumber}`,
      `<h1>تقرير فروقات الجرد ${escapeHtml(stocktake.stocktakeNumber)}</h1>
       <div class="meta">${escapeHtml(scopeLabel)} · ${escapeHtml(STOCKTAKE_STATUS[stocktake.status].label)} · تم عد ${summary.counted} من ${
        summary.totalItems
      } منتج</div>
       <table><thead><tr><th>#</th><th>المنتج</th><th>الباركود</th><th>بالنظام</th><th>المعدود</th><th>الفرق</th><th>القيمة بالتكلفة</th></tr></thead>
       <tbody>${rows || `<tr><td colspan="7">لا توجد فروقات</td></tr>`}</tbody>
       <tfoot>
         <tr><td colspan="5">العجز</td><td class="neg">${formatQty(summary.shortageQty)}</td><td>${escapeHtml(formatCurrency(summary.shortageValue))}</td></tr>
         <tr><td colspan="5">الزيادة</td><td class="pos">${formatQty(summary.surplusQty)}</td><td>${escapeHtml(formatCurrency(summary.surplusValue))}</td></tr>
         <tr><td colspan="6">الصافي</td><td>${escapeHtml(formatCurrency(summary.netValue))}</td></tr>
       </tfoot></table>
       <div class="sign"><span>المسؤول: ..................</span><span>التوقيع: ..................</span></div>`
    );
  };

  const shown = useMemo(() => items.slice(0, MAX_ROWS), [items]);

  if (isLoading && !stocktake) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24 text-gray-500">جاري التحميل...</div>
      </Layout>
    );
  }
  if (!stocktake || !summary) {
    return (
      <Layout>
        <div className="text-center py-24">
          <p className="text-gray-600 mb-4">الجرد غير موجود</p>
          <Button variant="outline" onClick={() => navigate("/stocktakes")}>
            العودة للجرد
          </Button>
        </div>
      </Layout>
    );
  }

  const tabs: [StocktakeItemFilter, string][] = [
    ["all", "الكل"],
    ["counted", "تم عده"],
    ["uncounted", "لم يُعد"],
    ["diff", "الفروقات"],
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button type="button" onClick={() => navigate("/stocktakes")} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
              <ArrowRight className="w-4 h-4" />
              كل عمليات الجرد
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 font-mono">{stocktake.stocktakeNumber}</h1>
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${STOCKTAKE_STATUS[stocktake.status].className}`}>
                {STOCKTAKE_STATUS[stocktake.status].label}
              </span>
            </div>
            <p className="text-gray-600 text-sm mt-1">
              {scopeLabel} · بدأه {stocktake.user?.fullname} في {formatDateTime(stocktake.startedAt)}
              {stocktake.completedAt && ` · ${stocktake.status === "COMPLETED" ? "اعتمده" : "ألغاه"} ${stocktake.completedBy?.fullname || ""} في ${formatDateTime(stocktake.completedAt)}`}
            </p>
            {stocktake.notes && <p className="text-gray-500 text-sm mt-1">{stocktake.notes}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={printSheet}>
              <Printer className="w-4 h-4 ml-2" />
              ورقة العد
            </Button>
            <Button variant="outline" onClick={printDifferences}>
              <Printer className="w-4 h-4 ml-2" />
              تقرير الفروقات
            </Button>
            {open && isManager && (
              <>
                <Button variant="success" onClick={() => setConfirm("complete")} disabled={summary.counted === 0}>
                  <CheckCircle2 className="w-4 h-4 ml-2" />
                  اعتماد الجرد
                </Button>
                <Button variant="destructive" onClick={() => setConfirm("cancel")}>
                  <XCircle className="w-4 h-4 ml-2" />
                  إلغاء
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm text-gray-500">تم عده</div>
            <div className="text-2xl font-bold text-gray-900">
              {formatNumber(summary.counted)} <span className="text-base font-normal text-gray-500">/ {formatNumber(summary.totalItems)}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-indigo-500" style={{ width: `${summary.totalItems ? (summary.counted / summary.totalItems) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <div className="text-sm text-red-700">العجز</div>
            <div className="text-2xl font-bold text-red-700">{formatQty(summary.shortageQty)} {qtyWord}</div>
            <div className="text-sm text-red-700">{formatCurrency(summary.shortageValue)} بالتكلفة</div>
          </div>
          <div className="rounded-xl border border-green-100 bg-green-50 p-4">
            <div className="text-sm text-green-800">الزيادة</div>
            <div className="text-2xl font-bold text-green-800">{formatQty(summary.surplusQty)} {qtyWord}</div>
            <div className="text-sm text-green-800">{formatCurrency(summary.surplusValue)} بالتكلفة</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm text-gray-500">الصافي</div>
            <div className={`text-2xl font-bold ${summary.netValue < 0 ? "text-red-700" : "text-gray-900"}`} dir="ltr">
              {formatCurrency(summary.netValue)}
            </div>
            <div className="text-sm text-gray-500">{formatNumber(summary.uncounted)} منتج لم يُعد</div>
          </div>
        </div>

        {/* Scanner */}
        {open && (
          <form onSubmit={submitScan} className="rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]">
                <label className="block text-sm font-medium text-indigo-900 mb-1">امسح الباركود (كل مسحة تضيف القطع للعدد)</label>
                <div className="relative">
                  <Barcode className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400" />
                  <input
                    ref={scanRef}
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="امسح أو اكتب الباركود ثم Enter"
                    className="w-full rounded-lg border border-indigo-300 bg-white pr-10 pl-3 py-3 text-lg focus:border-indigo-500 focus:ring-indigo-500"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-indigo-900 mb-1">الكمية</label>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="الكمية لكل مسح"
                  value={scanQty}
                  onChange={(e) => setScanQty(normalizeDigits(e.target.value))}
                  className="w-24 rounded-lg border border-indigo-300 bg-white px-3 py-3 text-lg text-center focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <Button type="submit" disabled={countMutation.isPending}>
                إضافة
              </Button>
            </div>
            {lastScan && (
              <div
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2 text-sm ${
                  lastScan.ok ? "bg-green-100 text-green-900" : "bg-red-100 text-red-800"
                }`}
              >
                <span className="font-medium">{lastScan.text}</span>
                {lastScan.item && (
                  <span className="flex items-center gap-2">
                    الفرق: <DiffBadge value={lastScan.item.difference} />
                  </span>
                )}
              </div>
            )}
            <p className="text-xs text-indigo-800">للتصحيح: اكتب الكمية الصحيحة مباشرة في الجدول، أو امسح بعدد قطع سالب (مثلاً -1).</p>
          </form>
        )}

        {/* Items */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4">
            <div className="flex flex-wrap gap-2">
              {tabs.map(([value, label]) => {
                const count =
                  value === "all" ? summary.totalItems : value === "counted" ? summary.counted : value === "uncounted" ? summary.uncounted : summary.withDifference;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                      filter === value ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {label} ({formatNumber(count)})
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الباركود"
                className="w-64 rounded-lg border border-gray-300 pr-9 pl-8 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">المنتج</th>
                  <th className="px-4 py-3 text-right font-medium">الباركود</th>
                  <th className="px-4 py-3 text-right font-medium">{open ? "المخزون الآن" : "بالنظام"}</th>
                  <th className="px-4 py-3 text-right font-medium">المعدود</th>
                  <th className="px-4 py-3 text-right font-medium">الفرق</th>
                  <th className="px-4 py-3 text-right font-medium">القيمة</th>
                  <th className="px-4 py-3 text-right font-medium">عدّه</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((item) => {
                  const system = open ? item.product.stockQuantity : (item.systemQty ?? item.expectedQty);
                  return (
                    <tr key={item.id} className={item.difference ? (item.difference < 0 ? "bg-red-50/40" : "bg-green-50/40") : ""}>
                      <td className="px-4 py-2 font-medium text-gray-900">{item.product.name}</td>
                      <td className="px-4 py-2 font-mono text-gray-600">{item.product.sku}</td>
                      <td className="px-4 py-2 text-gray-700">{formatQty(system, unitOf(item.product))}</td>
                      <td className="px-4 py-2">
                        {open ? (
                          <CountCell item={item} disabled={countMutation.isPending} onSave={saveRow} />
                        ) : (
                          <span>{item.countedQty === null ? <span className="text-gray-400">لم يُعد</span> : formatQty(item.countedQty, unitOf(item.product))}</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <DiffBadge value={item.difference} />
                      </td>
                      <td className="px-4 py-2 text-gray-700" dir="ltr">
                        {item.differenceValue ? formatCurrency(item.differenceValue) : "-"}
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {item.countedBy ? (
                          <>
                            <div>{item.countedBy.fullname}</div>
                            {item.countedAt && <div>{formatDateTime(item.countedAt)}</div>}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                      لا توجد منتجات هنا
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {items.length > MAX_ROWS && (
            <div className="border-t border-gray-100 p-3 text-center text-sm text-gray-500">
              يظهر أول {formatNumber(MAX_ROWS)} من {formatNumber(items.length)} منتج. استخدم البحث للوصول لمنتج معين.
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={doConfirm}
        type={confirm === "cancel" ? "danger" : "warning"}
        title={confirm === "cancel" ? "إلغاء الجرد" : "اعتماد الجرد"}
        message={
          confirm === "cancel"
            ? "سيتم إلغاء الجرد دون أي تغيير في المخزون. هل أنت متأكد؟"
            : `سيتم تصحيح مخزون ${formatNumber(summary.withDifference)} منتج (عجز ${formatQty(summary.shortageQty)} ${qtyWord}، زيادة ${formatQty(
                summary.surplusQty
              )} ${qtyWord}). المنتجات التي لم تُعد (${formatNumber(summary.uncounted)}) تبقى كما هي. لا يمكن التراجع بعد الاعتماد.`
        }
        confirmText={confirm === "cancel" ? "إلغاء الجرد" : "اعتماد"}
        cancelText="رجوع"
        isLoading={completeMutation.isPending || cancelMutation.isPending}
      />
    </Layout>
  );
};

export default StocktakeDetails;
