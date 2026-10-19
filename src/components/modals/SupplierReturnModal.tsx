/**
 * Send goods from a purchase back to the supplier. The goods leave stock at once and
 * their value comes off what the shop owes; only money already paid beyond that
 * can come back as cash (the server checks the same rule).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Button, Modal, Select } from "../ui";
import { formatCurrency } from "../../utils/currencyUtils";
import { useCreateSupplierReturn } from "../../hooks/api/usePurchases";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  companyId: number;
  purchase: any;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function SupplierReturnModal({ isOpen, onClose, companyId, purchase }: Props) {
  const createReturn = useCreateSupplierReturn();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [refund, setRefund] = useState("");
  const [refundTouched, setRefundTouched] = useState(false);
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [reason, setReason] = useState("");

  // One row per product: bought, already returned, value of one unit (tax share included)
  const rows = useMemo(() => {
    const items: any[] = purchase?.items || [];
    const subtotal = items.reduce((s, i) => s + Number(i.totalPrice || 0), 0);
    const taxFactor = subtotal > 0 ? (subtotal + Number(purchase?.taxAmount || 0)) / subtotal : 1;
    const map = new Map<string, { productId: string; name: string; bought: number; value: number }>();
    for (const item of items) {
      const row = map.get(item.productId) || { productId: item.productId, name: item.product?.name || "", bought: 0, value: 0 };
      row.bought += item.quantity;
      row.value += Number(item.totalPrice || 0);
      map.set(item.productId, row);
    }
    return [...map.values()].map(r => {
      const returned = purchase?.returnedQuantities?.[r.productId] || 0;
      return { ...r, returned, left: r.bought - returned, unitValue: round((r.value / r.bought) * taxFactor) };
    });
  }, [purchase]);

  useEffect(() => {
    if (!isOpen) return;
    setQuantities({});
    setRefund("");
    setRefundTouched(false);
    setRefundMethod("CASH");
    setReason("");
  }, [isOpen]);

  const value = round(rows.reduce((s, r) => s + (quantities[r.productId] || 0) * r.unitValue, 0));
  const owed = Math.max(0, Number(purchase?.remainingAmount || 0));
  const maxRefund = round(Math.max(0, value - owed));
  const refundValue = refundTouched ? Number(refund) || 0 : maxRefund;
  const refundTooBig = refundValue > maxRefund + 0.01;
  const chosen = rows.filter(r => (quantities[r.productId] || 0) > 0);

  const submit = async () => {
    try {
      await createReturn.mutateAsync({
        companyId,
        purchaseId: purchase.id,
        items: chosen.map(r => ({ productId: r.productId, quantity: quantities[r.productId] })),
        refundAmount: refundValue,
        refundMethod: refundValue > 0 ? refundMethod : undefined,
        reason: reason || undefined,
      });
      onClose();
    } catch {
      // the hook shows the server's message; keep the window open to correct it
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`مرتجع للمورد - فاتورة ${purchase?.invoiceNumber || ""}`} size="lg">
      <div className="space-y-4" dir="rtl">
        <div className="border rounded-lg divide-y">
          {rows.map(r => (
            <div key={r.productId} className="flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{r.name}</div>
                <div className="text-xs text-gray-500">
                  مشترى {r.bought} · مرتجع سابقاً {r.returned} · قيمة الوحدة {formatCurrency(r.unitValue)}
                </div>
              </div>
              <input
                type="number"
                min={0}
                max={r.left}
                disabled={r.left <= 0}
                value={quantities[r.productId] ?? ""}
                placeholder="0"
                onChange={e => {
                  const q = Math.min(r.left, Math.max(0, parseInt(e.target.value) || 0));
                  setQuantities(prev => ({ ...prev, [r.productId]: q }));
                }}
                className="w-20 text-center border border-gray-300 rounded-lg py-1 disabled:bg-gray-100"
              />
              <span className="text-xs text-gray-500 w-16">من {r.left}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">سبب الإرجاع</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="تالف، منتهي الصلاحية، خطأ في الطلب..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">مبلغ يرده المورد نقداً</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={refundTouched ? refund : String(maxRefund)}
              onChange={e => {
                setRefundTouched(true);
                setRefund(e.target.value);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
            {refundTooBig && <p className="mt-1 text-sm text-danger-600">الحد الأقصى {formatCurrency(maxRefund)}</p>}
          </div>
        </div>

        {refundValue > 0 && (
          <Select
            label="طريقة الاسترداد"
            value={refundMethod}
            onChange={setRefundMethod}
            options={[
              { value: "CASH", label: "نقدي (يدخل درج الوردية)" },
              { value: "BANK_TRANSFER", label: "تحويل بنكي" },
              { value: "MOBILE_WALLET", label: "محفظة إلكترونية" },
            ]}
          />
        )}

        <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between"><span>قيمة البضاعة المرتجعة</span><span className="font-semibold">{formatCurrency(value)}</span></div>
          <div className="flex justify-between"><span>المستحق للمورد قبل المرتجع</span><span>{formatCurrency(owed)}</span></div>
          <div className="flex justify-between"><span>يُخصم من المستحق</span><span>{formatCurrency(round(value - refundValue))}</span></div>
          <div className="flex justify-between"><span>يرده المورد نقداً</span><span>{formatCurrency(refundValue)}</span></div>
          <p className="text-xs text-gray-500 pt-1">
            المورد يرد نقداً فقط ما دفعته زيادة عن المستحق عليك. البضاعة تخرج من المخزون فوراً.
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            className="flex-1"
            onClick={submit}
            disabled={chosen.length === 0 || refundTooBig || createReturn.isPending}
          >
            {createReturn.isPending ? "جاري الحفظ..." : "تسجيل المرتجع"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default SupplierReturnModal;
