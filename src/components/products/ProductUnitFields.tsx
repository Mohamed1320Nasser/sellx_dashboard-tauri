import React from "react";
import { Toggle } from "../ui";
import { DEFAULT_DECIMAL_UNIT, UNIT_PRESETS } from "../../utils/quantity";

interface Props {
  allowDecimalQty: boolean;
  unit: string;
  onChange: (next: { allowDecimalQty: boolean; unit: string }) => void;
  disabled?: boolean;
}

/** "Sold by weight / length" switch and the unit label, shared by the product forms. */
const ProductUnitFields: React.FC<Props> = ({ allowDecimalQty, unit, onChange, disabled }) => (
  <div className="col-span-2 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
    <Toggle
      enabled={allowDecimalQty}
      disabled={disabled}
      onChange={on => onChange({ allowDecimalQty: on, unit: on && !unit.trim() ? DEFAULT_DECIMAL_UNIT : unit })}
      label="يباع بالوزن أو الطول"
      description={
        allowDecimalQty
          ? "الكمية تقبل كسوراً حتى 3 أرقام عشرية (مثل 1.25 كجم). السعر والتكلفة للوحدة الواحدة."
          : "يباع بالقطعة: الكميات أرقام صحيحة فقط."
      }
    />
    <div>
      <label htmlFor="product-unit" className="mb-1 block text-sm font-medium text-gray-700">
        وحدة القياس {allowDecimalQty ? "" : "(اختياري)"}
      </label>
      <input
        id="product-unit"
        list="product-unit-presets"
        value={unit}
        maxLength={20}
        disabled={disabled}
        onChange={e => onChange({ allowDecimalQty, unit: e.target.value })}
        placeholder={allowDecimalQty ? "كجم، متر، لتر..." : "قطعة"}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
      />
      <datalist id="product-unit-presets">
        {UNIT_PRESETS.map(u => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <p className="mt-1 text-xs text-gray-500">تظهر بجانب الكمية في الفاتورة والإيصال والتقارير.</p>
    </div>
  </div>
);

export default ProductUnitFields;
