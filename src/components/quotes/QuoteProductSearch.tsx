import React, { useEffect, useRef, useState } from "react";
import { Loader2, PackagePlus, ScanLine, Search } from "lucide-react";
import toast from "react-hot-toast";
import { useProducts } from "../../hooks/api/useProducts";
import { productService } from "../../services/productService";
import { formatCurrency } from "../../utils/currencyUtils";
import { formatQty, unitOf } from "../../utils/quantity";

export interface PickedProduct {
  product: any;
  /** scanned carton / pack */
  pack?: { id: string; name: string; factor: number; sellingPrice: number } | null;
  /** weight read from a scale label */
  quantity?: number;
}

interface Props {
  companyId: number;
  onPick: (picked: PickedProduct) => void;
  /** "add as an item that is not in the system" with what was typed */
  onAddCustom: (name: string) => void;
  priceFor: (productId: string, basePrice: number) => number;
}

/**
 * Find a product by name or barcode (searches the server, not only the first page),
 * scan a barcode / carton / scale label, or add what was typed as a custom item.
 */
const QuoteProductSearch: React.FC<Props> = ({ companyId, onPick, onAddCustom, priceFor }) => {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [scanning, setScanning] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 200);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isFetching } = useProducts({ companyId, page: 1, limit: 8, search: debounced || undefined });
  const results: any[] = debounced ? (data as any)?.data?.list || [] : [];

  useEffect(() => setActive(0), [debounced]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const done = () => {
    setText("");
    setDebounced("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const pick = (product: any) => {
    onPick({ product });
    done();
  };

  /** Enter: an exact barcode first (cartons and scale labels too), else the highlighted result */
  const submit = async () => {
    const code = text.trim();
    if (!code) return;
    if (open && results[active] && results[active].sku !== code && !/^\d{6,}$/.test(code)) {
      pick(results[active]);
      return;
    }
    setScanning(true);
    try {
      const res: any = await productService.findByBarcode(code, companyId);
      const product = res?.data?.success ? res.data.data : null;
      if (product) {
        onPick({ product, pack: product.pack ?? null, quantity: product.scale ? Number(product.scale.quantity) : undefined });
        done();
        return;
      }
    } catch {
      /* not a barcode: fall through */
    } finally {
      setScanning(false);
    }
    if (results[active]) {
      pick(results[active]);
      return;
    }
    toast.error(`لا يوجد منتج "${code}". يمكنك إضافته كبند غير مسجل`, { id: "quote-search" });
    setOpen(true);
  };

  const showList = open && debounced.length > 0;

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          value={text}
          onChange={e => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive(a => Math.min(a + 1, Math.max(results.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive(a => Math.max(a - 1, 0));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="ابحث باسم المنتج أو امسح الباركود، ثم Enter"
          aria-label="إضافة منتج للعرض"
          role="combobox"
          aria-expanded={showList}
          aria-controls="quote-product-results"
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-10 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          {isFetching || scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
        </span>
      </div>

      {showList && (
        <div
          id="quote-product-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {results.map((p, k) => {
            const price = priceFor(String(p.id), Number(p.sellingPrice) || 0);
            const stock = Number(p.currentStock ?? p.stockQuantity ?? 0);
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={k === active}
                onMouseEnter={() => setActive(k)}
                onClick={() => pick(p)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-right ${k === active ? "bg-primary-50" : "hover:bg-gray-50"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900">{p.name}</span>
                  <span className="block text-xs text-gray-500">
                    <span dir="ltr">{p.sku}</span> · {formatQty(stock, unitOf(p) || "قطعة")} متاح
                    {p.packs?.length ? ` · ${p.packs.map((pk: any) => pk.name).join("، ")}` : ""}
                  </span>
                </span>
                {price > 0 ? (
                  <span className="whitespace-nowrap text-sm font-semibold text-gray-800">{formatCurrency(price)}</span>
                ) : (
                  <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">بدون سعر</span>
                )}
              </button>
            );
          })}
          {!isFetching && results.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">لا توجد منتجات بهذا الاسم</p>}
          <button
            type="button"
            onClick={() => {
              onAddCustom(text.trim());
              setText("");
              setDebounced("");
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2.5 text-right text-sm font-medium text-primary-700 hover:bg-primary-50"
          >
            <PackagePlus className="h-4 w-4" />
            إضافة "{text.trim()}" كبند غير مسجل في النظام
          </button>
        </div>
      )}
    </div>
  );
};

export default QuoteProductSearch;
