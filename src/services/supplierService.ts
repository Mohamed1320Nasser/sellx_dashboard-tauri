import { apiClient } from "./apiClient";
import type { Supplier, PaginatedResponse, BackendApiResponse } from "../types";

interface CreateSupplierRequest {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  companyId: number;
}

export interface SupplierStatementTransaction {
  date: string;
  type: "OPENING" | "PURCHASE" | "PAYMENT" | "RETURN" | "REFUND";
  reference: string;
  /** Lowers what the shop owes the supplier (payments, goods sent back) */
  debit: number;
  /** Raises what the shop owes the supplier (purchases, cash refunded by the supplier) */
  credit: number;
  balance: number;
}

export interface SupplierStatementResponse {
  supplier: { id: number; name: string; email?: string; phone?: string; address?: string };
  summary: {
    openingBalance: number;
    totalPurchases: number;
    totalPayments: number;
    totalReturns: number;
    totalRefunds: number;
    closingBalance: number;
    currentBalance: number;
  };
  transactions: SupplierStatementTransaction[];
  period: { startDate: string | null; endDate: string | null };
}

export const supplierService = {
  create: (data: CreateSupplierRequest): Promise<Supplier> =>
    apiClient.post("/supplier/new", data),

  getList: (params: {
    companyId: number;
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<BackendApiResponse<PaginatedResponse<Supplier>>> =>
    apiClient.get("/supplier/list", { params }),

  getById: (id: number): Promise<Supplier> =>
    apiClient.get(`/supplier/single/${id}`),

  edit: (id: number, data: Partial<CreateSupplierRequest>): Promise<Supplier> =>
    apiClient.put(`/supplier/single/${id}`, data),

  getStatement: (
    id: number,
    params: { companyId: number; startDate?: string; endDate?: string }
  ): Promise<BackendApiResponse<SupplierStatementResponse>> =>
    apiClient.get(`/supplier/single/${id}/statement`, { params }),

  delete: (id: number, companyId: number): Promise<void> =>
    apiClient.delete(`/supplier/single/${id}`, { params: { companyId } }),
};
