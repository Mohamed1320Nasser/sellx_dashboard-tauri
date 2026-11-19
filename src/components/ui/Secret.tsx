import React, { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** How long a revealed figure stays visible before it hides again */
const AUTO_HIDE_MS = 60_000;

/**
 * Profit and cost are hidden until asked for: the screen may face a customer at the till.
 * Hidden again every time the page opens, and a minute after being shown.
 */
export function useReveal(): [boolean, () => void] {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(false), AUTO_HIDE_MS);
    return () => clearTimeout(t);
  }, [shown]);
  const toggle = useCallback(() => setShown(s => !s), []);
  return [shown, toggle];
}

export const RevealButton: React.FC<{ shown: boolean; onToggle: () => void; what?: string; className?: string; withText?: boolean }> = ({
  shown,
  onToggle,
  what = "الربح",
  className = "",
  withText = false,
}) => {
  const Icon = shown ? EyeOff : Eye;
  const label = shown ? `إخفاء ${what}` : `إظهار ${what}`;
  return (
    <button
      type="button"
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      title={label}
      aria-label={label}
      aria-pressed={shown}
      className={`inline-flex items-center gap-1 rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 ${className}`}
    >
      <Icon className="h-4 w-4" />
      {withText && <span className="text-xs font-medium">{label}</span>}
    </button>
  );
};

/** The value, or dots while hidden */
export const Masked: React.FC<{ shown: boolean; children: React.ReactNode }> = ({ shown, children }) =>
  shown ? <>{children}</> : <span className="select-none tracking-widest text-gray-400">•••••</span>;
