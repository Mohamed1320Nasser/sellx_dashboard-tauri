import React, { useEffect, useMemo, useState } from "react";
import { Minus, Plus, ClipboardCheck } from "lucide-react";
import { Modal } from "../ui";
import { useCreateStockMovement } from "../../hooks/api/useStockMovements";
import { addQty, formatQty, normalizeDigits, parseQty, qtyTimes, subQty } from "../../utils/quantity";

type Mode = "IN" | "OUT" | "COUNT";
const REASONS = ["جرد", "تالف", "منتهي الصلاحية", "هدية / عينة", "فقد أو سرقة", "تصحيح خطأ إدخال", "أخرى"];

interface Pack {
  id: string;
  name: string;
  factor: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  product: { id: string; name: string; stock: number; unit?: string | null; allowDecimalQty?: boolean; packs?: Pack[] };
}

/** Add, deduct or count a product's stock, with a reason: saved as a stock movement and in the activity log */
const StockAdjustModal: React.FC<Props> = ({ isOpen, onClose, product }) => {
  const [mode, setMode] = useState<Mode>("IN");
  const [qtyText, setQtyText] = useState("");
  const [packId, setPackId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const create = useCreateStockMovement();

  useEffect(() => {
    if (isOpen) {
      setMode("IN");
      setQtyText("");
      setPackId("");
      setReason("");
      setNote("");
      setTried(false);
    }
  }, [isOpen]);

  const unitWord = product.allowDecimalQty ? product.unit || "وحدة" : product.unit || "قطعة";
  const pack = (product.packs || []).find(p => p.id === packId) || null;
  // packs are counted whole; pieces follow the product's rule
  const typed = parseQty(normalizeDigits(qtyText), { allowDecimalQty: pack ? false : !!product.allowDecimalQty });
  const pieces = typed === null ? null : pack ? qtyTimes(typed, pack.factor) : typed;
  const after = useMemo(() => {
    if (pieces === null) return null;
    if (mode === "IN") return addQty(product.stock, pieces);
    if (mode === "OUT") return subQty(product.stock, pieces);
    return pieces;
  }, [mode, pieces, product.stock]);
  const change = after === null ? null : subQty(after, product.stock);

  const qtyError =
    qtyText.trim() === ""
      ? mode === "COUNT" ? "اكتب الكمية الموجودة فعلاً" : "اكتب الكمية"
      : typed === null || (mode !== "COUNT" && typed <= 0) || typed < 0
        ? product.allowDecimalQty && !pack ? "كمية غير صحيحة (حتى 3 أرقام عشرية)" : "اكتب رقماً صحيحاً"
        : after !== null && after < 0
          ? `أكبر من المتاح (${formatQty(product.stock, unitWord)})`
          : change === 0
            ? "الكمية لم تتغير"
            : null;
  const reasonError = !reason ? "اختر السبب" : reason === "أخرى" && !note.trim() ? "اكتب السبب" : null;

  const submit = async () => {
    setTried(true);
    if (qtyError || reasonError || change === null || change === 0) return;
    const text = [reason === "أخرى" ? note.trim() : reason, reason !== "أخرى" && note.trim() ? note.trim() : "", mode === "COUNT" ? `العدد الفعلي ${formatQty(after!, unitWord)}` : ""]
      .filter(Boolean)
      .join(" - ");
    try {
      await create.mutateAsync({ productId: product.id, direction: change > 0 ? "IN" : "OUT", quantity: Math.abs(change), reason: text });
      onClose();
    } catch {
      // the hook shows the server's message
    }
  };

  const modes: { value: Mode; label: string; icon: React.ElementType }[] = [
    { value: "IN", label: "إضافة", icon: Plus },
    { value: "OUT", label: "خصم", icon: Minus },
    { value: "COUNT", label: "جرد (الكمية الفعلية)", icon: ClipboardCheck },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`تعديل كمية: ${product.name}`} size="md">
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 text-sm">
          <span className="text-gray-600">المخزون الحالي</span>
          <span className="text-lg font-bold text-gray-900">{formatQty(product.stock, unitWord)}</span>
        </div>

        <div role="radiogroup" aria-label="نوع التعديل" className="grid grid-cols-3 gap-2">
          {modes.map(m => {
            const Icon = m.icon;
            const selected = mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(m.value)}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 text-sm font-medium transition-colors ${
                  selected ? "border-primary-500 bg-primary-50 text-primary-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                <Icon className="h-4 w-4" />
                {m.label}
              </button>
            );
          })}
        </div>

        <div>
          <label htmlFor="adjust-qty" className="mb-1 block text-sm font-medium text-gray-700">
            {mode === "COUNT" ? "الكمية الموجودة فعلاً" : mode === "IN" ? "الكمية المضافة" : "الكمية المخصومة"}
          </label>
          <div className="flex gap-2">
            <input
              id="adjust-qty"
              autoFocus
              value={qtyText}
              inputMode={product.allowDecimalQty && !pack ? "decimal" : "numeric"}
              onChange={e => setQtyText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="0"
              dir="ltr"
              className={`w-full rounded-lg border px-3 py-2 text-right text-lg font-semibold focus:ring-2 ${
                tried && qtyError ? "border-red-400 focus:ring-red-400" : "border-gray-300 focus:border-primary-500 focus:ring-primary-500"
              }`}
            />
            {(product.packs || []).length > 0 && (
              <div role="radiogroup" aria-label="بالقطعة أو بالعبوة" className="flex flex-shrink-0 overflow-hidden rounded-lg border border-gray-300 text-sm">
                {[{ id: "", label: unitWord }, ...(product.packs || []).map(p => ({ id: p.id, label: `${p.name} ${formatQty(p.factor)}` }))].map((o, k) => (
                  <button
                    key={o.id || "piece"}
                    type="button"
                    role="radio"
                    aria-checked={packId === o.id}
                    onClick={() => setPackId(o.id)}
                    className={`px-3 font-medium ${k > 0 ? "border-r border-gray-300" : ""} ${packId === o.id ? "bg-primary-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {tried && qtyError ? (
            <p className="mt-1 text-sm text-red-600">{qtyError}</p>
          ) : after !== null && change !== 0 ? (
            <p className="mt-1 text-sm text-gray-600">
              المخزون: {formatQty(product.stock)} ← <span className="font-semibold text-gray-900">{formatQty(after, unitWord)}</span>{" "}
              <span className={change! > 0 ? "text-green-700" : "text-red-600"}>
                ({change! > 0 ? "+" : ""}
                {formatQty(change!)})
              </span>
              {pack && pieces !== null && mode !== "COUNT" && <span className="text-gray-500"> · {formatQty(pieces, unitWord)}</span>}
            </p>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">السبب</p>
          <div role="radiogroup" aria-label="السبب" className="flex flex-wrap gap-2">
            {REASONS.map(r => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={reason === r}
                onClick={() => setReason(r)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  reason === r ? "border-primary-500 bg-primary-600 font-medium text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={200}
            placeholder={reason === "أخرى" ? "اكتب السبب" : "ملاحظة (اختياري)"}
            className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 ${
              tried && reasonError === "اكتب السبب" ? "border-red-400 focus:ring-red-400" : "border-gray-300 focus:border-primary-500 focus:ring-primary-500"
            }`}
          />
          {tried && reasonError && <p className="mt-1 text-sm text-red-600">{reasonError}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            إلغاء
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={create.isPending}
            className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {create.isPending ? "جاري الحفظ..." : "حفظ التعديل"}
          </button>
        </div>
        <p className="-mt-2 text-xs text-gray-500">يُسجَّل في حركة المخزون وسجل العمليات باسمك.</p>
      </div>
    </Modal>
  );
};

export default StockAdjustModal;
