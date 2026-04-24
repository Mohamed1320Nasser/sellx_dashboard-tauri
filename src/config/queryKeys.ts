export const qk = {
  products: {
    all: ["products"] as const,
    lists: () => ["products", "list"] as const,
    list: (params: Record<string, unknown>) =>
      ["products", "list", params] as const,
    details: () => ["products", "detail"] as const,
    detail: (id: string | number, companyId: string | number) =>
      ["products", "detail", String(id), String(companyId)] as const,
  },
  categories: {
    all: ["categories"] as const,
    lists: () => ["categories", "list"] as const,
    list: (params: Record<string, unknown>) =>
      ["categories", "list", params] as const,
    details: () => ["categories", "detail"] as const,
    detail: (id: string | number) => ["categories", "detail", String(id)] as const,
  },
  sales: {
    all: ["sales"] as const,
    lists: () => ["sales", "list"] as const,
    list: (params: Record<string, unknown>) => ["sales", "list", params] as const,
    details: () => ["sales", "detail"] as const,
    detail: (id: string | number, companyId: string | number) =>
      ["sales", "detail", String(id), String(companyId)] as const,
  },
  purchases: {
    all: ["purchases"] as const,
    lists: () => ["purchases", "list"] as const,
    list: (params: Record<string, unknown>) =>
      ["purchases", "list", params] as const,
    details: () => ["purchases", "detail"] as const,
    detail: (id: string | number, companyId: string | number) =>
      ["purchases", "detail", String(id), String(companyId)] as const,
  },
  quotes: {
    all: ["quotes"] as const,
    lists: () => ["quotes", "list"] as const,
    list: (params: Record<string, unknown>) =>
      ["quotes", "list", params] as const,
    details: () => ["quotes", "detail"] as const,
    detail: (id: string | number, companyId: string | number) =>
      ["quotes", "detail", String(id), String(companyId)] as const,
  },
  returns: {
    all: ["returns"] as const,
    lists: () => ["returns", "list"] as const,
    list: (params: Record<string, unknown>) =>
      ["returns", "list", params] as const,
    details: () => ["returns", "detail"] as const,
    detail: (id: string | number) => ["returns", "detail", String(id)] as const,
  },
  expenses: {
    all: ["expenses"] as const,
    lists: () => ["expenses", "list"] as const,
    list: (params: Record<string, unknown>) =>
      ["expenses", "list", params] as const,
    details: () => ["expenses", "detail"] as const,
    detail: (id: string | number, companyId: string | number) =>
      ["expenses", "detail", String(id), String(companyId)] as const,
  },
  salaries: {
    all: ["salaries"] as const,
    lists: () => ["salaries", "list"] as const,
    list: (params: Record<string, unknown>) =>
      ["salaries", "list", params] as const,
    details: () => ["salaries", "detail"] as const,
    detail: (id: string | number, companyId: string | number) =>
      ["salaries", "detail", String(id), String(companyId)] as const,
  },
  clients: {
    all: ["clients"] as const,
    lists: () => ["clients", "list"] as const,
    list: (params: Record<string, unknown>) =>
      ["clients", "list", params] as const,
    details: () => ["clients", "detail"] as const,
    detail: (id: string | number, companyId: string | number) =>
      ["clients", "detail", String(id), String(companyId)] as const,
  },
  suppliers: {
    all: ["suppliers"] as const,
    lists: () => ["suppliers", "list"] as const,
    list: (params: Record<string, unknown>) =>
      ["suppliers", "list", params] as const,
    details: () => ["suppliers", "detail"] as const,
    detail: (id: string | number, companyId: string | number) =>
      ["suppliers", "detail", String(id), String(companyId)] as const,
  },
  cashRegisters: {
    all: ["cash-registers"] as const,
    lists: () => ["cash-registers", "list"] as const,
    list: (companyId: string | number) =>
      ["cash-registers", "list", String(companyId)] as const,
    details: () => ["cash-registers", "detail"] as const,
    detail: (id: string | number, companyId: string | number) =>
      ["cash-registers", "detail", String(id), String(companyId)] as const,
  },
  shifts: {
    all: ["shifts"] as const,
    lists: () => ["shifts", "list"] as const,
    list: (params: Record<string, unknown>) =>
      ["shifts", "list", params] as const,
    details: () => ["shifts", "detail"] as const,
    detail: (id: string | number, companyId: string | number) =>
      ["shifts", "detail", String(id), String(companyId)] as const,
    current: (companyId: string | number) =>
      ["shifts", "current", String(companyId)] as const,
  },
  users: {
    all: ["users"] as const,
    systemUsers: (params: Record<string, unknown>) =>
      ["users", "system", params] as const,
    companyUsers: (params: Record<string, unknown>) =>
      ["users", "company", params] as const,
    companyUser: (id: string | number) =>
      ["users", "company", "detail", String(id)] as const,
  },
  stockMovements: {
    all: ["stock-movements"] as const,
    list: (companyId: string | number, filters: Record<string, unknown>) =>
      ["stock-movements", "list", String(companyId), filters] as const,
    detail: (id: string | number) =>
      ["stock-movements", "detail", String(id)] as const,
  },
  analytics: {
    all: ["analytics"] as const,
    by: (
      type: string,
      companyId: string | number,
      filters: Record<string, unknown>,
    ) => ["analytics", type, String(companyId), filters] as const,
  },
} as const;
