import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, Truck } from "lucide-react";

export interface SupplierOption {
  id: number;
  name: string;
  phone?: string | null;
}

interface Props {
  suppliers: SupplierOption[];
  value: string;
  onChange: (id: string) => void;
  /** Open the new-supplier form, with what was typed as the name */
  onCreate: (name: string) => void;
  error?: boolean;
}

/** Supplier field you can type in: filters by name or phone, with "add new" at the end */
const SupplierPicker: React.FC<Props> = ({ suppliers, value, onChange, onCreate, error }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = suppliers.find(s => String(s.id) === String(value));

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? suppliers.filter(s => s.name.toLowerCase().includes(q) || (s.phone || "").includes(q))
      : suppliers;
    return list.slice(0, 50);
  }, [suppliers, query]);

  useEffect(() => setActive(0), [query, open]);

  const pick = (s: SupplierOption) => {
    onChange(String(s.id));
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive(a => Math.min(a + 1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active < filtered.length && filtered[active]) pick(filtered[active]);
      else {
        setOpen(false);
        onCreate(query.trim());
      }
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <div
        className={`flex items-center gap-2 rounded-lg border bg-white px-3 py-2 ${
          error ? "border-danger-400" : "border-gray-300"
        } focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500`}
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {open ? <Search className="h-4 w-4 text-gray-400" /> : <Truck className="h-4 w-4 text-blue-600" />}
        <input
          ref={inputRef}
          value={open ? query : selected?.name || ""}
          onChange={e => {
            // Typing into a closed box replaces the shown supplier name
            setQuery(open ? e.target.value : e.target.value.replace(selected?.name || "", ""));
            setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder={selected ? selected.name : "ابحث باسم المورد أو الهاتف..."}
          className="flex-1 border-0 bg-transparent p-0 text-right text-sm focus:outline-none focus:ring-0"
          aria-label="المورد"
        />
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </div>

      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(s)}
              className={`flex w-full items-center justify-between px-3 py-2 text-right text-sm ${
                i === active ? "bg-primary-50" : ""
              }`}
            >
              <span>
                <span className="font-medium text-gray-900">{s.name}</span>
                {s.phone && <span className="mr-2 text-xs text-gray-500">{s.phone}</span>}
              </span>
              {String(s.id) === String(value) && <Check className="h-4 w-4 text-primary-600" />}
            </button>
          ))}
          {filtered.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">لا يوجد مورد بهذا الاسم</div>}
          <button
            type="button"
            onMouseEnter={() => setActive(filtered.length)}
            onClick={() => {
              setOpen(false);
              onCreate(query.trim());
            }}
            className={`flex w-full items-center gap-2 border-t px-3 py-2 text-right text-sm font-medium text-primary-700 ${
              active === filtered.length ? "bg-primary-50" : ""
            }`}
          >
            <Plus className="h-4 w-4" />
            {query.trim() ? `إضافة "${query.trim()}" كمورد جديد` : "مورد جديد"}
          </button>
        </div>
      )}
    </div>
  );
};

export default SupplierPicker;
