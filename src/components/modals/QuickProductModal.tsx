import React, { useEffect, useRef, useState } from "react";
import { PackagePlus } from "lucide-react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Select } from "../ui";
import { productService } from "../../services/productService";
import { handleApiError } from "../../utils/errorHandler";
import { qk } from "../../config/queryKeys";

export interface QuickCreatedProduct {
  id: string;
  name: string;
  sku?: string | null;
  purchasePrice: number;
  sellingPrice: number;
  stockQuantity: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  companyId: number;
  categories: { id: string; name: string }[];
  /** Barcode that was scanned and not found, or a name typed in the search box */
  initialBarcode?: string;
  initialName?: string;
  /** Called with the new product and the quantity / cost to put on the invoice */
  onCreated: (product: QuickCreatedProduct, quantity: number, unitCost: number) => void;
}

const LAST_CATEGORY_KEY = "sellx.quickProduct.categoryId";

/**
 * Add a product that is not in the system yet without leaving the purchase screen.
 * The product starts with zero stock: the purchase itself brings the goods in.
 */
const QuickProductModal: React.FC<Props> = ({
  isOpen,
  onClose,
  companyId,
  categories,
  initialBarcode,
  initialName,
  onCreated,
}) => {
  const queryClient = useQueryClient();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cost, setCost] = useState("");
  const [selling, setSelling] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialName || "");
    setBarcode(initialBarcode || "");
    let last = "";
    try {
      last = localStorage.getItem(LAST_CATEGORY_KEY) || "";
    } catch {
      // storage blocked: no remembered category
    }
    setCategoryId(categories.some(c => c.id === last) ? last : categories.length === 1 ? categories[0].id : "");
    setCost("");
    setSelling("");
    setQuantity("1");
    setErrors({});
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [isOpen, initialBarcode, initialName, categories]);

  const costValue = parseFloat(cost);
  const sellingValue = parseFloat(selling);
  const margin =
    costValue > 0 && sellingValue > 0 ? Math.round(((sellingValue - costValue) / sellingValue) * 1000) / 10 : null;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "اسم المنتج مطلوب";
    if (!categoryId) e.categoryId = "اختر التصنيف";
    if (!(costValue > 0)) e.cost = "سعر الشراء يجب أن يكون أكبر من صفر";
    if (!(sellingValue > 0)) e.selling = "سعر البيع يجب أن يكون أكبر من صفر";
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1) e.quantity = "الكمية رقم صحيح 1 أو أكثر";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    try {
      const res: any = await productService.create({
        name: name.trim(),
        sku: barcode.trim(), // empty: the server generates a local barcode
        purchasePrice: costValue,
        sellingPrice: sellingValue,
        stockQuantity: 0,
        minStockLevel: 0,
        categoryId,
        companyId,
      });
      const created = [res?.data?.data, res?.data, res].find((x: any) => x && x.id);
      if (!created) throw new Error("no product returned");
      try {
        localStorage.setItem(LAST_CATEGORY_KEY, categoryId);
      } catch {
        // not remembered; fine
      }
      queryClient.invalidateQueries({ queryKey: qk.products.all });
      toast.success(`تم إضافة المنتج ${created.name}`);
      onCreated(
        {
          id: created.id,
          name: created.name,
          sku: created.sku,
          purchasePrice: Number(created.purchasePrice) || costValue,
          sellingPrice: Number(created.sellingPrice) || sellingValue,
          stockQuantity: 0,
        },
        Number(quantity),
        costValue
      );
    } catch (error) {
      toast.error(handleApiError(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="منتج جديد" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg bg-primary-50 p-3 text-sm text-primary-800">
          <PackagePlus className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>يُضاف المنتج برصيد صفر، ثم تُدخل الكمية المشتراة للمخزون مع حفظ الفاتورة.</span>
        </div>

        <Input
          ref={nameRef}
          label="اسم المنتج *"
          value={name}
          onChange={e => setName(e.target.value)}
          error={errors.name}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="الباركود"
            value={barcode}
            onChange={e => setBarcode(e.target.value)}
            placeholder="فارغ = يُولَّد تلقائياً"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">التصنيف *</label>
            <Select
              placeholder="اختر التصنيف"
              options={[{ value: "", label: "اختر التصنيف" }, ...categories.map(c => ({ value: c.id, label: c.name }))]}
              value={categoryId}
              onChange={setCategoryId}
            />
            {errors.categoryId && <p className="mt-1 text-sm text-danger-600">{errors.categoryId}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="سعر الشراء *"
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={e => setCost(e.target.value)}
            error={errors.cost}
          />
          <Input
            label="سعر البيع *"
            type="number"
            min="0"
            step="0.01"
            value={selling}
            onChange={e => setSelling(e.target.value)}
            error={errors.selling}
          />
          <Input
            label="الكمية المشتراة *"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            error={errors.quantity}
          />
        </div>
        {margin !== null && (
          <p className={`text-xs ${margin < 0 ? "text-danger-600" : "text-gray-500"}`}>
            هامش الربح: {margin}%{margin < 0 ? " (سعر البيع أقل من سعر الشراء)" : ""}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ وإضافة للفاتورة"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default QuickProductModal;
