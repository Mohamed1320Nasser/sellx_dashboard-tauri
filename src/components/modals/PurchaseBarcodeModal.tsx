/**
 * Print barcode labels for every product of a purchase in one go.
 * Shown right after a purchase is saved, and from the purchase details page.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Printer, Tag } from "lucide-react";
import toast from "react-hot-toast";
import { Button, Modal } from "../ui";
import { printBarcode } from "../../services/smartPrintService";
import { isTauri } from "../../services/tauriBridge";

export interface PurchaseLabelItem {
  productId: string;
  name: string;
  sku?: string | null;
  /** Quantity received on this purchase */
  purchasedQty: number;
  /** Stock after the purchase */
  stock: number;
}

type Preset = "purchased" | "stock" | "one";

const MAX_LABELS_PER_PRODUCT = 999;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: PurchaseLabelItem[];
}

export function PurchaseBarcodeModal({ isOpen, onClose, items }: Props) {
  // One row per product, even if it was on several lines of the purchase
  const products = useMemo(() => {
    const map = new Map<string, PurchaseLabelItem>();
    for (const item of items) {
      const existing = map.get(item.productId);
      if (existing) existing.purchasedQty += item.purchasedQty;
      else map.set(item.productId, { ...item });
    }
    return [...map.values()];
  }, [items]);

  const [preset, setPreset] = useState<Preset>("purchased");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancelled = useRef(false);

  const qtyFor = (p: PurchaseLabelItem, which: Preset) =>
    Math.min(MAX_LABELS_PER_PRODUCT, Math.max(0, which === "purchased" ? p.purchasedQty : which === "stock" ? p.stock : 1));

  const applyPreset = (which: Preset) => {
    setPreset(which);
    setCopies(Object.fromEntries(products.map(p => [p.productId, qtyFor(p, which)])));
  };

  useEffect(() => {
    if (!isOpen) return;
    setSelected(Object.fromEntries(products.map(p => [p.productId, !!p.sku])));
    applyPreset("purchased");
    setProgress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, products]);

  const chosen = products.filter(p => selected[p.productId] && p.sku && (copies[p.productId] || 0) > 0);
  const totalLabels = chosen.reduce((sum, p) => sum + (copies[p.productId] || 0), 0);
  const printing = progress !== null;

  const handlePrint = async () => {
    if (chosen.length === 0) return;
    cancelled.current = false;
    setProgress({ done: 0, total: chosen.length });
    let printed = 0;
    try {
      for (const p of chosen) {
        if (cancelled.current) break;
        await printBarcode({ barcode: p.sku!, productName: p.name }, copies[p.productId]);
        printed += copies[p.productId];
        setProgress(prev => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
      if (cancelled.current) {
        toast(`تم إيقاف الطباعة بعد ${printed} ملصق`);
      } else {
        toast.success(`تمت طباعة ${printed} ملصق باركود`);
        onClose();
      }
    } catch (error: any) {
      toast.error(error?.message || "فشلت طباعة الباركود");
    } finally {
      setProgress(null);
    }
  };

  const presetButton = (which: Preset, label: string) => (
    <button
      type="button"
      onClick={() => applyPreset(which)}
      disabled={printing}
      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
        preset === which
          ? "bg-primary-600 text-white border-primary-600"
          : "bg-white text-gray-700 border-gray-300 hover:border-primary-400"
      }`}
    >
      {label}
    </button>
  );

  return (
    <Modal isOpen={isOpen} onClose={printing ? () => undefined : onClose} title="طباعة باركود للمنتجات المضافة" size="lg">
      <div className="space-y-4" dir="rtl">
        {!isTauri && (
          <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
            طباعة الباركود متاحة في تطبيق سطح المكتب فقط.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600 ml-1">عدد الملصقات:</span>
          {presetButton("purchased", "الكمية المشتراة")}
          {presetButton("stock", "كل المخزون الحالي")}
          {presetButton("one", "ملصق واحد لكل منتج")}
        </div>

        <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
          {products.map(p => (
            <label key={p.productId} className={`flex items-center gap-3 p-3 ${p.sku ? "cursor-pointer" : "opacity-60"}`}>
              <input
                type="checkbox"
                checked={!!selected[p.productId]}
                disabled={!p.sku || printing}
                onChange={e => setSelected(s => ({ ...s, [p.productId]: e.target.checked }))}
                className="rounded border-gray-300 text-primary-600"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{p.name}</div>
                <div className="text-xs text-gray-500">
                  {p.sku ? p.sku : "لا يوجد باركود لهذا المنتج"} · مشترى {p.purchasedQty} · المخزون {p.stock}
                </div>
              </div>
              <input
                type="number"
                min={0}
                max={MAX_LABELS_PER_PRODUCT}
                value={copies[p.productId] ?? 0}
                disabled={!p.sku || printing}
                onChange={e => {
                  const value = Math.min(MAX_LABELS_PER_PRODUCT, Math.max(0, parseInt(e.target.value) || 0));
                  setCopies(c => ({ ...c, [p.productId]: value }));
                }}
                className="w-20 text-center border border-gray-300 rounded-lg py-1"
              />
            </label>
          ))}
        </div>

        {printing && (
          <div className="text-sm text-gray-700">
            جاري الطباعة... منتج {Math.min(progress!.done + 1, progress!.total)} من {progress!.total}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {printing ? (
            <Button variant="secondary" className="flex-1" onClick={() => (cancelled.current = true)}>
              إيقاف بعد المنتج الحالي
            </Button>
          ) : (
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              تخطي
            </Button>
          )}
          <Button className="flex-1" onClick={handlePrint} disabled={printing || !isTauri || totalLabels === 0}>
            {printing ? <Tag className="w-5 h-5 ml-2" /> : <Printer className="w-5 h-5 ml-2" />}
            {printing ? "جاري الطباعة..." : `طباعة الكل (${totalLabels} ملصق)`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default PurchaseBarcodeModal;
