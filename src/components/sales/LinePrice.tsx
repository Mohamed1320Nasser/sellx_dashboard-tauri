import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Pencil, RotateCcw } from "lucide-react";
import { formatCurrency } from "../../utils";
import { normalizeDigits } from "../../utils/quantity";
import { NEGOTIATION_WARN_PERCENT, priceGap } from "../../utils/negotiation";


const pctText = (p: number) => {
  const a = Math.abs(p);
  return `⁦${a < 10 ? Number(a.toFixed(1)) : Math.round(a)}%⁩`;
};

/** "15% below the original price" style note; amber past ±10% */
const GapNote: React.FC<{ price: number; original: number }> = ({ price, original }) => {
  const gap = priceGap(price, original);
  if (Math.abs(price - original) < 0.005) return null;
  const warn = Math.abs(gap) > NEGOTIATION_WARN_PERCENT + 1e-9;
  if (!warn) {
    return (
      <span className="whitespace-nowrap text-gray-500">
        {gap < 0 ? "خصم" : "زيادة"} {pctText(gap)}
      </span>
    );
  }
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-1.5 py-px font-medium text-amber-800"
    >
      <AlertTriangle className="h-3 w-3" />
      {gap < 0 ? "أقل" : "أعلى"} من السعر الأصلي بـ {pctText(gap)}
    </span>
  );
};

type Props = {
  /** the price the line is sold at */
  price: number;
  /** the price before negotiation (price list / pack price) */
  original: number;
  /** "/ كرتونة", "/ كجم" ... */
  suffix?: string;
  /** managers and owners: may change the price */
  editable: boolean;
  /** a new price; `null` = back to the original */
  onChange: (price: number | null) => void;
  /** back to scanning when done */
  onDone?: () => void;
};

/**
 * The line's unit price. A manager taps it to type the price agreed with the customer:
 * Enter / leaving the field keeps it, Esc cancels. A changed price shows the original
 * struck through, and a warning when it is more than 10% below or above it.
 */
const LinePrice: React.FC<Props> = ({ price, original, suffix = "", editable, onChange, onDone }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const negotiated = Math.abs(price - original) >= 0.005;

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const parsed = (() => {
    const t = normalizeDigits(draft).replace(/,/g, "").trim();
    if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(t)) return null;
    const n = Number(t);
    return n > 0 ? Math.round(n * 100) / 100 : null;
  })();

  const finish = (keep: boolean) => {
    setEditing(false);
    if (keep && parsed !== null && Math.abs(parsed - price) >= 0.005) onChange(parsed);
    onDone?.();
  };

  if (editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label="سعر الوحدة المتفق عليه"
          aria-invalid={parsed === null || undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (parsed === null) return; // stays open; the red border says why
              finish(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              finish(false);
            }
          }}
          onBlur={() => finish(true)}
          className={`h-7 w-24 rounded-md border px-1.5 text-center text-sm font-bold text-gray-900 focus:outline-none focus:ring-1 ${
            parsed === null ? "border-red-400 focus:border-red-500 focus:ring-red-500" : "border-primary-400 focus:border-primary-500 focus:ring-primary-500"
          }`}
        />
        {suffix && <span className="text-gray-500">{suffix.trim()}</span>}
        {parsed !== null ? (
          <GapNote price={parsed} original={original} />
        ) : (
          <span className="whitespace-nowrap text-red-600">اكتب سعراً أكبر من صفر</span>
        )}
        {negotiated && (
          <button
            type="button"
            // before the field loses focus, so the typed price isn't kept first
            onMouseDown={(e) => {
              e.preventDefault();
              setEditing(false);
              onChange(null);
              onDone?.();
            }}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1 text-primary-700 hover:bg-primary-50"
          >
            <RotateCcw className="h-3 w-3" /> السعر الأصلي {formatCurrency(original)}
          </button>
        )}
      </span>
    );
  }

  const label = (
    <>
      <span className={negotiated ? "font-semibold text-gray-900" : ""}>{formatCurrency(price)}</span>
      {suffix}
    </>
  );

  return (
    <>
      {editable ? (
        <button
          type="button"
          title="تفاوض على السعر"
          aria-label={`سعر الوحدة ${formatCurrency(price)}، اضغط لتغييره`}
          onClick={() => {
            setDraft(String(price));
            setEditing(true);
          }}
          className="group -mx-1 inline-flex items-center gap-1 whitespace-nowrap rounded px-1 transition-colors hover:bg-primary-50 hover:text-primary-700"
        >
          {label}
          <Pencil className="h-3 w-3 text-gray-400 group-hover:text-primary-600" />
        </button>
      ) : (
        <span className="whitespace-nowrap">{label}</span>
      )}
      {negotiated && (
        <>
          <s className="whitespace-nowrap text-gray-400" title="السعر الأصلي">{formatCurrency(original)}</s>
          <GapNote price={price} original={original} />
        </>
      )}
    </>
  );
};

export default LinePrice;
