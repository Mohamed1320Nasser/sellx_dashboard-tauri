import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, User, X } from "lucide-react";
import { useClients } from "../../hooks/api/useClients";

export interface PickedClient {
  id: number;
  name: string;
  phone?: string | null;
  priceListId?: string | null;
}

interface Props {
  companyId: number;
  value: PickedClient | null;
  onChange: (client: PickedClient | null) => void;
}

/**
 * Customer field you can type in: searches the server by name or phone,
 * so every customer can be found (not only the first page).
 */
const ClientPicker: React.FC<Props> = ({ companyId, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isFetching } = useClients({ companyId, page: 1, limit: 20, search: search || undefined });
  const results: PickedClient[] = ((data as any)?.data?.list || []).map((c: any) => ({
    id: Number(c.id),
    name: c.name,
    phone: c.phone,
    priceListId: c.priceListId ?? null,
  }));

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

  useEffect(() => setActive(0), [search, open]);

  const pick = (c: PickedClient) => {
    onChange(c);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      // never submit the sale from the customer box
      e.preventDefault();
      if (open && results[active]) pick(results[active]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <div
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-2 py-1.5 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500"
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {open ? <Search className="h-4 w-4 text-gray-400" /> : <User className="h-4 w-4 text-primary-600" />}
        <input
          ref={inputRef}
          value={open ? query : value ? `${value.name}${value.phone ? ` - ${value.phone}` : ""}` : ""}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="ابحث باسم العميل أو رقم الهاتف..."
          className="flex-1 border-0 bg-transparent p-0 text-right text-sm focus:outline-none focus:ring-0"
          aria-label="العميل"
        />
        {value && !open ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="text-gray-400 hover:text-red-600"
            aria-label="إزالة العميل"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </div>

      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(c)}
              className={`flex w-full items-center justify-between px-3 py-2 text-right text-sm ${
                i === active ? "bg-primary-50" : ""
              }`}
            >
              <span>
                <span className="font-medium text-gray-900">{c.name}</span>
                {c.phone && <span className="mr-2 text-xs text-gray-500">{c.phone}</span>}
              </span>
              {value?.id === c.id && <Check className="h-4 w-4 text-primary-600" />}
            </button>
          ))}
          {results.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">
              {isFetching ? "جاري البحث..." : "لا يوجد عميل بهذا الاسم أو الرقم"}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientPicker;
