import { apiClient } from "./apiClient";

export type PriceFormulaBase = "COST" | "BASE_PRICE";
export type PriceSource = "BASE" | "OVERRIDE" | "FORMULA" | "FALLBACK";

export interface PriceList {
  id: string;
  name: string;
  isDefault: boolean;
  active: boolean;
  sortOrder: number;
  formulaBase: PriceFormulaBase | null;
  formulaPercent: number | null;
  _count?: { prices: number; clients: number };
}

export interface PriceGridProduct {
  id: string;
  name: string;
  sku: string;
  purchasePrice: number;
  sellingPrice: number;
  category?: { id: string; name: string } | null;
  prices: Record<string, { price: number; source: PriceSource }>;
}

export interface PriceListInput {
  companyId: number;
  name?: string;
  active?: boolean;
  sortOrder?: number;
  formulaBase?: PriceFormulaBase | null;
  formulaPercent?: number | null;
}

/** How a list prices products, in words */
export const describeFormula = (list: Pick<PriceList, "isDefault" | "formulaBase" | "formulaPercent">) => {
  if (list.isDefault) return "سعر البيع الأساسي للمنتج";
  if (!list.formulaBase || list.formulaPercent === null) return "أسعار تُكتب لكل منتج (وإلا السعر الأساسي)";
  const p = list.formulaPercent;
  const sign = p > 0 ? "+" : p < 0 ? "−" : "";
  return list.formulaBase === "COST"
    ? `التكلفة ${sign} ${Math.abs(p)}%`
    : `السعر الأساسي ${sign} ${Math.abs(p)}%`;
};

export const priceListService = {
  getList: (companyId: number, all = false): Promise<any> =>
    apiClient.get("/price-list/list", { params: { companyId, ...(all && { all: "true" }) } }),

  create: (data: PriceListInput & { name: string }): Promise<any> => apiClient.post("/price-list/new", data),

  edit: (id: string, data: PriceListInput): Promise<any> => apiClient.put(`/price-list/single/${id}`, data),

  remove: (id: string, companyId: number): Promise<any> =>
    apiClient.delete(`/price-list/single/${id}`, { params: { companyId } }),

  /** { priceList, prices: { productId: price } } */
  getPrices: (id: string, companyId: number): Promise<any> =>
    apiClient.get(`/price-list/single/${id}/prices`, { params: { companyId } }),

  getGrid: (params: { companyId: number; page?: number; limit?: number; search?: string; categoryId?: string; productId?: string }): Promise<any> =>
    apiClient.get("/price-list/products", { params }),

  setPrices: (companyId: number, prices: { productId: string; priceListId: string; price: number | null }[]): Promise<any> =>
    apiClient.put("/price-list/products/prices", { companyId, prices }),

  adjust: (data: { companyId: number; priceListId: string; categoryId?: string; percent: number }): Promise<any> =>
    apiClient.post("/price-list/products/adjust", data),
};
