import { apiClient } from "./apiClient";
import type { Purchase, PaginatedResponse, BackendApiResponse } from "../types";

interface CreatePurchaseRequest {
  companyId: number;
  invoiceNumber: string;
  supplierId: number;
  totalAmount: number;
  paidAmount: number;
  paymentMethod?: string;
  taxRate?: number;
  taxAmount?: number;
  dueDate?: string;
  purchaseDate?: string;
  reminderEnabled?: boolean;
  reminderDate?: string;
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
    updateProductPrice?: boolean;
    newProductPrice?: number;
  }[];
}

interface PurchaseFilters {
  companyId: number;
  page?: number;
  limit?: number;
  search?: string;
  supplierId?: number;
  startDate?: string;
  endDate?: string;
}

export const purchaseService = {
  create: (data: CreatePurchaseRequest | FormData): Promise<Purchase> =>
    apiClient.post("/purchase/new", data),

  getList: (
    params: PurchaseFilters
  ): Promise<BackendApiResponse<PaginatedResponse<Purchase>>> =>
    apiClient.get("/purchase/list", { params }),

  getById: (id: number, companyId: number): Promise<Purchase> =>
    apiClient.get(`/purchase/single/${id}`, { params: { companyId } }),

  edit: (id: number, data: Partial<CreatePurchaseRequest> | FormData): Promise<Purchase> =>
    apiClient.put(`/purchase/single/${id}`, data),

  delete: (id: number, companyId: number): Promise<void> =>
    apiClient.delete(`/purchase/single/${id}`, { params: { companyId } }),

  /** Last price paid to this supplier per product */
  getLastCosts: (
    companyId: number,
    supplierId: number,
    productIds: string[]
  ): Promise<{ data: Record<string, LastSupplierCost> }> =>
    apiClient.get("/purchase/last-costs", {
      params: { companyId, supplierId, productIds: productIds.join(",") },
    }),

  /** Unpaid purchases due soon or overdue */
  getDue: (companyId: number, days = 7): Promise<{ data: DuePurchases }> =>
    apiClient.get("/purchase/due", { params: { companyId, days } }),

  /** Put back the selling prices a purchase changed */
  revertPrices: (
    id: number,
    companyId: number,
    productIds?: string[]
  ): Promise<{ data: { reverted: string[]; skipped: { productId: string; name: string; reason: string }[] } }> =>
    apiClient.post(`/purchase/single/${id}/revert-prices`, { companyId, productIds }),
};

export interface LastSupplierCost {
  unitPrice: number;
  purchaseDate: string;
  invoiceNumber: string;
}

export interface DuePurchase {
  id: number;
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number;
  remaining: number;
  dueDate: string | null;
  reminderDate: string | null;
  daysLeft: number | null;
  overdue: boolean;
  supplier: { id: number; name: string };
}

export interface DuePurchases {
  list: DuePurchase[];
  totalRemaining: number;
  overdueCount: number;
}
