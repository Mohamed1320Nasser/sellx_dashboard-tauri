import React, { useEffect, useState } from "react";
import { Tags, Plus, Edit, Trash2, Percent, Search, X, Users, ChevronRight, ChevronLeft } from "lucide-react";
import { Layout } from "../components/layout";
import { Button, ConfirmDialog, Modal } from "../components/ui";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { useCategories } from "../hooks/api/useCategories";
import {
  useAdjustPrices,
  useDeletePriceList,
  usePriceGrid,
  usePriceLists,
  useSavePriceList,
  useSetPrices,
  useTogglePriceList,
} from "../hooks/api/usePriceLists";
import { describeFormula, type PriceFormulaBase, type PriceGridProduct, type PriceList } from "../services/priceListService";
import { formatCurrency, formatNumber } from "../utils/currencyUtils";

type Method = "manual" | PriceFormulaBase;

const SOURCE_LABEL: Record<string, string> = {
  FORMULA: "بالمعادلة",
  FALLBACK: "= الأساسي",
};

/** One price cell. Default list: the selling price. Other lists: own price, or empty = automatic. */
export const PriceCell: React.FC<{
  product: PriceGridProduct;
  list: PriceList;
  saving: boolean;
  onSave: (product: PriceGridProduct, list: PriceList, price: number | null) => void;
}> = ({ product, list, saving, onSave }) => {
  const resolved = product.prices[list.id];
  const own = list.isDefault || resolved?.source === "OVERRIDE";
  // a base price of 0 means "no price yet": shown empty and marked
  const unpriced = list.isDefault && !(Number(resolved?.price) > 0);
  const initial = own && resolved && !unpriced ? String(resolved.price) : "";
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);

  const commit = () => {
    const text = value.trim();
    if (text === initial) return;
    if (text === "") {
      if (list.isDefault) {
        setValue(initial);
        return;
      }
      onSave(product, list, null);
      return;
    }
    const price = Number(text);
    if (!Number.isFinite(price) || price < 0) {
      setValue(initial);
      return;
    }
    onSave(product, list, price);
  };

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <input
          type="number"
          min={0}
          step="0.01"
          value={value}
          disabled={saving}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setValue(initial);
          }}
          placeholder={unpriced ? "بدون سعر" : resolved ? String(resolved.price) : ""}
          title={unpriced ? "بدون سعر: لا يُباع حتى تكتب سعره" : undefined}
          className={`w-24 rounded-lg border px-2 py-1 text-center text-sm focus:border-indigo-500 focus:ring-indigo-500 ${
            unpriced
              ? "border-amber-400 bg-amber-50 placeholder:text-xs placeholder:text-amber-700"
              : own ? "border-gray-300 font-semibold text-gray-900" : "border-dashed border-gray-300 placeholder:text-gray-500"
          }`}
        />
      </div>
      {!list.isDefault && own && (
        <button
          type="button"
          title="رجوع للسعر التلقائي"
          onClick={() => onSave(product, list, null)}
          className="text-gray-400 hover:text-red-600"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {!own && resolved && <span className="text-[10px] text-gray-400 whitespace-nowrap">{SOURCE_LABEL[resolved.source]}</span>}
    </div>
  );
};

const PriceLists: React.FC = () => {
  const { company, user } = useSessionAuthStore();
  const companyId = company?.companyId || 0;
  const isManager = user?.role === "MANAGER" || user?.role === "ADMIN";

  // Lists
  const { data: lists = [] } = usePriceLists(companyId, true);
  const saveList = useSavePriceList();
  const toggleList = useTogglePriceList();
  const deleteList = useDeletePriceList();
  const [editing, setEditing] = useState<PriceList | "new" | null>(null);
  const [form, setForm] = useState<{ name: string; method: Method; percent: string }>({ name: "", method: "manual", percent: "" });
  const [toDelete, setToDelete] = useState<PriceList | null>(null);

  const openForm = (list: PriceList | "new") => {
    setEditing(list);
    setForm(
      list === "new"
        ? { name: "", method: "BASE_PRICE", percent: "-10" }
        : {
            name: list.name,
            method: list.formulaBase || "manual",
            percent: list.formulaPercent === null ? "" : String(list.formulaPercent),
          }
    );
  };

  const submitForm = async () => {
    if (!editing) return;
    const isDefault = editing !== "new" && editing.isDefault;
    const formula =
      isDefault || form.method === "manual"
        ? { formulaBase: null, formulaPercent: null }
        : { formulaBase: form.method as PriceFormulaBase, formulaPercent: Number(form.percent) };
    if (!isDefault && form.method !== "manual" && (form.percent.trim() === "" || !Number.isFinite(Number(form.percent)))) {
      return;
    }
    try {
      await saveList.mutateAsync({
        id: editing === "new" ? undefined : editing.id,
        data: { companyId, name: form.name.trim(), ...(isDefault ? {} : formula) },
      });
      setEditing(null);
    } catch {
      /* toast shown by the hook */
    }
  };

  // Price editor
  const activeLists = lists.filter((l) => l.active);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [noPriceOnly, setNoPriceOnly] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data: grid, isFetching } = usePriceGrid({
    companyId,
    page,
    limit: 25,
    ...(debounced && { search: debounced }),
    ...(categoryId && { categoryId }),
    ...(noPriceOnly && { noPrice: true }),
  });
  const { data: categoriesData } = useCategories({ companyId, page: 1, limit: 100 });
  const categories: { id: string; name: string }[] = categoriesData?.data?.list || [];
  const setPrices = useSetPrices();

  const savePrice = (product: PriceGridProduct, list: PriceList, price: number | null) => {
    setPrices.mutate({ companyId, prices: [{ productId: product.id, priceListId: list.id, price }] });
  };

  // Bulk change
  const adjust = useAdjustPrices();
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ priceListId: "", categoryId: "", percent: "" });
  const adjustList = lists.find((l) => l.id === adjustForm.priceListId);
  const submitAdjust = async () => {
    const percent = Number(adjustForm.percent);
    if (!adjustForm.priceListId || !percent) return;
    try {
      await adjust.mutateAsync({
        companyId,
        priceListId: adjustForm.priceListId,
        percent,
        ...(adjustForm.categoryId && { categoryId: adjustForm.categoryId }),
      });
      setShowAdjust(false);
    } catch {
      /* toast shown by the hook */
    }
  };

  const gridProducts: PriceGridProduct[] = grid?.products || [];
  const gridLists: PriceList[] = grid?.lists || activeLists;
  const totalPages: number = grid?.totalPages || 1;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Tags className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">قوائم الأسعار</h1>
              <p className="text-gray-600 text-sm">أسعار مختلفة لنفس المنتج: قطاعي، جملة، موزعين... وتُختار تلقائياً حسب العميل في شاشة البيع</p>
            </div>
          </div>
          {isManager && (
            <Button onClick={() => openForm("new")}>
              <Plus className="w-4 h-4 ml-2" />
              قائمة جديدة
            </Button>
          )}
        </div>

        {/* Lists */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lists.map((list) => (
            <div
              key={list.id}
              className={`rounded-xl border bg-white p-4 space-y-3 ${list.active ? "border-gray-200" : "border-dashed border-gray-300 opacity-70"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900">{list.name}</h3>
                    {list.isDefault && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">الأساسية</span>}
                    {!list.active && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">موقوفة</span>}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{describeFormula(list)}</p>
                </div>
                {isManager && (
                  <div className="flex gap-1">
                    <button type="button" title="تعديل" onClick={() => openForm(list)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100">
                      <Edit className="w-4 h-4" />
                    </button>
                    {!list.isDefault && (
                      <button type="button" title="حذف" onClick={() => setToDelete(list)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {list.isDefault ? "كل العملاء الآخرين" : `${formatNumber(list._count?.clients || 0)} عميل`}
                  {!list.isDefault && ` · ${formatNumber(list._count?.prices || 0)} سعر خاص`}
                </span>
                {isManager && !list.isDefault && (
                  <button
                    type="button"
                    onClick={() => toggleList.mutate({ id: list.id, companyId, active: !list.active })}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    {list.active ? "إيقاف" : "تفعيل"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Price editor */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">أسعار المنتجات</h2>
              <p className="text-xs text-gray-500">
                اكتب السعر واضغط Enter. الخانة المنقطة = سعر تلقائي من معادلة القائمة؛ اكتب فيها لتثبيت سعر خاص للمنتج.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث بالاسم أو الباركود"
                  className="w-56 rounded-lg border border-gray-300 pr-9 pl-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="">كل الفئات</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-pressed={noPriceOnly}
                onClick={() => {
                  setNoPriceOnly((v) => !v);
                  setPage(1);
                }}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  noPriceOnly ? "border-amber-400 bg-amber-50 text-amber-800" : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                بدون سعر
              </button>
              {isManager && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAdjustForm({ priceListId: activeLists[0]?.id || "", categoryId, percent: "" });
                    setShowAdjust(true);
                  }}
                >
                  <Percent className="w-4 h-4 ml-2" />
                  تعديل جماعي
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">المنتج</th>
                  <th className="px-4 py-3 text-right font-medium">التكلفة</th>
                  {gridLists.map((list) => (
                    <th key={list.id} className="px-4 py-3 text-right font-medium whitespace-nowrap">
                      {list.name}
                      <div className="text-[10px] font-normal text-gray-400">{describeFormula(list)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y divide-gray-100 ${isFetching ? "opacity-60" : ""}`}>
                {gridProducts.map((product) => (
                  <tr key={product.id}>
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{product.name}</div>
                      <div className="font-mono text-xs text-gray-500">{product.sku}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{formatCurrency(product.purchasePrice)}</td>
                    {gridLists.map((list) => (
                      <td key={list.id} className="px-4 py-2">
                        {isManager ? (
                          <PriceCell product={product} list={list} saving={setPrices.isPending} onSave={savePrice} />
                        ) : (
                          <span>{formatCurrency(product.prices[list.id]?.price ?? 0)}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {gridProducts.length === 0 && (
                  <tr>
                    <td colSpan={2 + gridLists.length} className="px-4 py-10 text-center text-gray-500">
                      لا توجد منتجات
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 border-t border-gray-100 p-3 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-gray-600">
                صفحة {formatNumber(page)} من {formatNumber(totalPages)}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-gray-200 p-1.5 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* List form */}
      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "قائمة أسعار جديدة" : "تعديل قائمة الأسعار"} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">اسم القائمة</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: جملة"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
          {editing !== "new" && editing?.isDefault ? (
            <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">أسعار هذه القائمة هي سعر البيع المسجل في كل منتج.</p>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">كيف تُحسب أسعارها؟</label>
                <div className="space-y-2">
                  {(
                    [
                      ["BASE_PRICE", "نسبة من السعر الأساسي", "مثال: -10 = خصم 10% من سعر القطاعي"],
                      ["COST", "نسبة فوق التكلفة", "مثال: 15 = التكلفة + 15%"],
                      ["manual", "أكتب سعر كل منتج بنفسي", "المنتج بدون سعر يُباع بالسعر الأساسي"],
                    ] as [Method, string, string][]
                  ).map(([value, label, hint]) => (
                    <label
                      key={value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                        form.method === value ? "border-indigo-500 bg-indigo-50" : "border-gray-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="method"
                        checked={form.method === value}
                        onChange={() => setForm({ ...form, method: value })}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-900">{label}</span>
                        <span className="block text-xs text-gray-500">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {form.method !== "manual" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">النسبة %</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.percent}
                    onChange={(e) => setForm({ ...form, percent: e.target.value })}
                    className="w-40 rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
                    dir="ltr"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    تُقرَّب الأسعار حسب إعداد التقريب في الشركة، وتتغير تلقائياً عند تغيّر التكلفة أو السعر الأساسي. يمكنك تثبيت سعر خاص لأي منتج من الجدول.
                  </p>
                </div>
              )}
            </>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditing(null)}>
              إلغاء
            </Button>
            <Button onClick={submitForm} disabled={saveList.isPending || !form.name.trim()}>
              {saveList.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk change */}
      <Modal isOpen={showAdjust} onClose={() => setShowAdjust(false)} title="تعديل جماعي للأسعار" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">القائمة</label>
              <select
                value={adjustForm.priceListId}
                onChange={(e) => setAdjustForm({ ...adjustForm, priceListId: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
              >
                {activeLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">المنتجات</label>
              <select
                value={adjustForm.categoryId}
                onChange={(e) => setAdjustForm({ ...adjustForm, categoryId: e.target.value })}
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
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">نسبة التغيير %</label>
            <input
              type="number"
              step="0.01"
              value={adjustForm.percent}
              onChange={(e) => setAdjustForm({ ...adjustForm, percent: e.target.value })}
              placeholder="مثال: 10 للزيادة أو -5 للتخفيض"
              className="w-56 rounded-lg border border-gray-300 px-3 py-2 focus:border-indigo-500 focus:ring-indigo-500"
              dir="ltr"
            />
          </div>
          {adjustList && !adjustList.isDefault && adjustList.formulaBase && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              هذه القائمة محسوبة بمعادلة. التعديل الجماعي يثبّت سعراً خاصاً لكل منتج فلا يتبع المعادلة بعدها. لتغيير القائمة كلها يكفي تعديل نسبة المعادلة.
            </p>
          )}
          {adjustList?.isDefault && (
            <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              سيتغير سعر البيع الأساسي، ومعه كل قائمة محسوبة كنسبة من السعر الأساسي.
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowAdjust(false)}>
              إلغاء
            </Button>
            <Button onClick={submitAdjust} disabled={adjust.isPending || !Number(adjustForm.percent)}>
              {adjust.isPending ? "جاري التعديل..." : "تطبيق"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await deleteList.mutateAsync({ id: toDelete.id, companyId });
          } catch {
            /* toast shown by the hook */
          }
          setToDelete(null);
        }}
        type="danger"
        title="حذف قائمة الأسعار"
        message={`سيتم حذف قائمة "${toDelete?.name}" وأسعارها الخاصة، ويعود عملاؤها (${toDelete?._count?.clients || 0}) للقائمة الأساسية. الفواتير القديمة لا تتأثر.`}
        confirmText="حذف"
        cancelText="رجوع"
        isLoading={deleteList.isPending}
      />
    </Layout>
  );
};

export default PriceLists;
