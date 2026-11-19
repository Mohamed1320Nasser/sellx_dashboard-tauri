import React, { useEffect, useRef, useState } from "react";
import { Ban, Check, ChevronDown, Printer, PrinterCheck } from "lucide-react";
import { AFTER_SALE_OPTIONS, type AfterSaleMode } from "../../utils/afterSalePrint";

const ICONS: Record<AfterSaleMode, React.ElementType> = { preview: Printer, print: PrinterCheck, none: Ban };

interface Props {
  value: AfterSaleMode;
  onChange: (mode: AfterSaleMode) => void;
}

/** Small header control on the POS: what happens after a sale on this device */
const AfterSalePrintMenu: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const current = AFTER_SALE_OPTIONS.find(o => o.value === value)!;
  const Icon = ICONS[value];
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`بعد البيع: ${current.label}`}
        className="flex h-10 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        <Icon className={`h-4 w-4 ${value === "none" ? "text-gray-400" : "text-primary-600"}`} />
        <span className="hidden xl:inline">{current.short}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <p className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">بعد إتمام البيع (على هذا الجهاز)</p>
          {AFTER_SALE_OPTIONS.map(o => {
            const OptIcon = ICONS[o.value];
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-right transition-colors ${selected ? "bg-primary-50" : "hover:bg-gray-50"}`}
              >
                <OptIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${selected ? "text-primary-600" : "text-gray-400"}`} />
                <span className="flex-1">
                  <span className={`block text-sm font-medium ${selected ? "text-primary-700" : "text-gray-800"}`}>{o.label}</span>
                  <span className="block text-xs text-gray-500">{o.description}</span>
                </span>
                {selected && <Check className="mt-0.5 h-4 w-4 text-primary-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AfterSalePrintMenu;
