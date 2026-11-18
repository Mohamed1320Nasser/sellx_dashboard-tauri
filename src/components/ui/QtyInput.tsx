import React, { useEffect, useRef, useState } from "react";
import { allowsDecimal, formatQty, normalizeDigits, parseQty, qtyError, type QtyProduct } from "../../utils/quantity";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  /** Called with every valid quantity while typing (and on blur). */
  onChange: (quantity: number) => void;
  product: QtyProduct;
  /** Shown under invalid input; defaults to a message based on the product. */
  onInvalid?: (message: string) => void;
};

/**
 * Quantity field that keeps what the cashier types ("1." / "0.5" / "١٫٢٥") instead of
 * re-formatting on every key, accepts decimals only for weighed / measured products,
 * and reports the parsed number.
 */
const QtyInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, product, onInvalid, onBlur, onFocus, className = "", ...rest }, ref) => {
    const [draft, setDraft] = useState(() => formatQty(value));
    const [invalid, setInvalid] = useState(false);
    const editing = useRef(false);

    // Follow outside changes (+/- buttons) unless the user is typing
    useEffect(() => {
      if (!editing.current) setDraft(formatQty(value));
    }, [value]);

    return (
      <input
        ref={ref}
        {...rest}
        type="text"
        inputMode={allowsDecimal(product) ? "decimal" : "numeric"}
        autoComplete="off"
        value={draft}
        aria-invalid={invalid || undefined}
        title={invalid ? qtyError(product) : rest.title}
        onFocus={e => {
          editing.current = true;
          e.target.select();
          onFocus?.(e);
        }}
        onChange={e => {
          const text = normalizeDigits(e.target.value);
          setDraft(text);
          const q = parseQty(text, product);
          setInvalid(q === null && text !== "");
          if (q !== null && q > 0) onChange(q);
        }}
        onBlur={e => {
          editing.current = false;
          const q = parseQty(draft, product);
          if (q === null || q <= 0) {
            if (draft !== "" && q === null) onInvalid?.(qtyError(product));
            setDraft(formatQty(value));
          } else {
            setDraft(formatQty(q));
          }
          setInvalid(false);
          onBlur?.(e);
        }}
        className={`${className} ${invalid ? "!border-red-400 !text-red-600" : ""}`}
      />
    );
  }
);
QtyInput.displayName = "QtyInput";
export default QtyInput;
