import { apiClient } from "./apiClient";

export type StocktakeStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type StocktakeItemFilter = "all" | "counted" | "uncounted" | "diff";
export type CountMode = "add" | "set" | "clear";

export interface StocktakeSummary {
  totalItems: number;
  counted: number;
  uncounted: number;
  withDifference: number;
  shortageQty: number;
  surplusQty: number;
  shortageValue: number;
  surplusValue: number;
  netValue: number;
}

export interface StocktakeItem {
  id: string;
  productId: string;
  expectedQty: number;
  systemQty: number | null;
  countedQty: number | null;
  unitCost: number | string;
  appliedQty: number | null;
  countedAt: string | null;
  difference: number | null;
  differenceValue: number | null;
  product: {
    id: string;
    name: string;
    sku: string;
    stockQuantity: number;
    unit?: string | null;
    allowDecimalQty?: boolean;
    category?: { id: string; name: string };
  };
  countedBy?: { id: number; fullname: string } | null;
}

export interface Stocktake {
  id: string;
  stocktakeNumber: string;
  status: StocktakeStatus;
  notes?: string | null;
  startedAt: string;
  completedAt?: string | null;
  category?: { id: string; name: string } | null;
  user?: { id: number; fullname: string };
  completedBy?: { id: number; fullname: string } | null;
  summary: StocktakeSummary;
  items?: StocktakeItem[];
}

export const stocktakeService = {
  start: (data: { companyId: number; categoryId?: string; notes?: string }): Promise<any> =>
    apiClient.post("/stocktake/new", data),

  getList: (params: { companyId: number; page?: number; limit?: number; search?: string; status?: StocktakeStatus }): Promise<any> =>
    apiClient.get("/stocktake/list", { params }),

  getById: (id: string, params: { companyId: number; filter?: StocktakeItemFilter; search?: string }): Promise<any> =>
    apiClient.get(`/stocktake/single/${id}`, { params }),

  count: (
    id: string,
    data: { companyId: number; productId?: string; barcode?: string; mode?: CountMode; quantity?: number }
  ): Promise<any> => apiClient.post(`/stocktake/single/${id}/count`, data),

  complete: (id: string, companyId: number): Promise<any> =>
    apiClient.post(`/stocktake/single/${id}/complete`, { companyId }),

  cancel: (id: string, companyId: number): Promise<any> =>
    apiClient.post(`/stocktake/single/${id}/cancel`, { companyId }),
};
