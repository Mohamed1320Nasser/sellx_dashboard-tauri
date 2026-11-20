import React from "react";
import { Loader2, type LucideIcon } from "lucide-react";

type Tone = "default" | "primary" | "danger";

const TONES: Record<Tone, string> = {
  default: "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50",
  primary: "border-primary-600 bg-primary-600 text-white hover:bg-primary-700",
  danger: "border-red-200 bg-white text-red-600 hover:bg-red-50",
};

/** the classes of a header action, for buttons that are not HeaderAction (menu triggers) */
export const headerActionClass = (tone: Tone = "default", iconOnly = false) =>
  `inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 disabled:cursor-not-allowed disabled:opacity-50 ${
    iconOnly ? "w-9" : "px-3"
  } ${TONES[tone]}`;

/**
 * One button in a document page's header (print, PDF, edit, delete...): all the same height,
 * label on one line, one filled main action, the rest calm; `iconOnly` for delete-like actions
 */
export const HeaderAction: React.FC<{
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: Tone;
  busy?: boolean;
  disabled?: boolean;
  iconOnly?: boolean;
}> = ({ icon: Icon, label, onClick, tone = "default", busy, disabled, iconOnly }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || busy}
    title={iconOnly ? label : undefined}
    aria-label={iconOnly ? label : undefined}
    className={headerActionClass(tone, iconOnly)}
  >
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className={`h-4 w-4 ${tone === "default" ? "text-gray-500" : ""}`} />}
    {!iconOnly && label}
  </button>
);

/** thin divider between groups of header actions (hidden when they wrap on small screens) */
export const HeaderDivider: React.FC = () => <span className="mx-1 hidden h-6 w-px bg-gray-200 sm:block" aria-hidden />;
