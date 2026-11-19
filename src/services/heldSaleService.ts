import { apiClient } from "./apiClient";

/** Hold sale (تعليق): carts parked at the POS, shared by all tills of the shop */
export interface HeldSaleRow {
  id: string;
  label: string | null;
  itemsCount: number;
  total: number;
  createdAt: string;
  priceListId: string | null;
  user: { id: number; fullname: string };
  client: { id: number; name: string; phone?: string } | null;
}

export interface HeldSaleItemInput {
  productId: string;
  name?: string;
  quantity: number;
  unitPrice?: number;
  packId?: string;
}

export interface HoldSaleRequest {
  companyId: number;
  label?: string;
  clientId?: number;
  priceListId?: string;
  items: HeldSaleItemInput[];
  discountType?: "none" | "amount" | "percent";
  discountAmount?: number;
  discountPercent?: number;
  taxSettingId?: string;
  additionalFee?: number;
  additionalFeeLabel?: string;
  total?: number;
}

export interface ResumedItem {
  productId: string;
  productName: string;
  sku?: string;
  stockQuantity: number;
  unit: string | null;
  allowDecimalQty: boolean;
  quantity: number;
  /** price when it was held */
  heldPrice: number;
  /** price from the price list now (what the cart uses) */
  unitPrice: number;
  basePrice: number;
  priceChanged: boolean;
  /** Held as a pack: quantity and prices are per pack */
  pack?: { id: string; name: string; factor: number; sellingPrice: number };
}

export interface ResumedSale {
  id: string;
  label: string | null;
  createdAt: string;
  client: { id: number; name: string; phone?: string; priceListId?: string | null } | null;
  priceListId: string | null;
  items: ResumedItem[];
  /** names of products deleted while the cart was on hold */
  removed: string[];
  discountType?: "none" | "amount" | "percent";
  discountAmount?: number;
  discountPercent?: number;
  taxSettingId?: string;
  additionalFee?: number;
  additionalFeeLabel?: string;
}

const payload = <T,>(res: any): T => (res && typeof res === "object" && "data" in res ? res.data : res) as T;

/** The server's Arabic message from a failed call */
export const heldSaleError = (error: any, fallback: string) =>
  error?.response?.data?.msg || error?.response?.data?.message || fallback;

export const heldSaleService = {
  hold: async (data: HoldSaleRequest) => payload<HeldSaleRow>(await apiClient.post("/held-sale/new", data)),
  list: async (companyId: number) =>
    payload<{ list: HeldSaleRow[]; maxAgeDays: number }>(await apiClient.get("/held-sale/list", { params: { companyId } })),
  resume: async (id: string, companyId: number) =>
    payload<ResumedSale>(await apiClient.post(`/held-sale/resume/${id}`, { companyId })),
  remove: async (id: string, companyId: number) =>
    apiClient.delete(`/held-sale/single/${id}`, { params: { companyId } }),
};
