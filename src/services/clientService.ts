import { apiClient } from "./apiClient";
import type { Client, PaginatedResponse, BackendApiResponse } from "../types";

interface CreateClientRequest {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  companyId: number;
  creditLimit?: number;
  openingBalance?: number;
}

export interface ClientStatementTransaction {
  date: string;
  type: "OPENING" | "SALE" | "PAYMENT" | "RETURN" | "REFUND";
  reference: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface ClientStatementResponse {
  client: {
    id: number;
    name: string;
    email?: string | null;
    phone: string;
    address?: string | null;
    creditLimit: number | null;
    openingBalance: number;
  };
  summary: {
    openingBalance: number;
    totalSales: number;
    totalPayments: number;
    totalReturns: number;
    totalRefunds?: number;
    outstandingBalance: number;
    currentBalance?: number;
    creditLimit: number | null;
    remainingCredit: number | null;
  };
  transactions: ClientStatementTransaction[];
}

export const clientService = {
  create: (data: CreateClientRequest): Promise<Client> =>
    apiClient.post("/client/new", data),

  getList: (params: {
    companyId: number;
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<BackendApiResponse<PaginatedResponse<Client>>> =>
    apiClient.get("/client/list", { params }),

  // companyId is required by the server's role check
  getById: (id: number, companyId: number): Promise<Client> =>
    apiClient.get(`/client/single/${id}`, { params: { companyId } }),

  edit: (id: number, data: Partial<CreateClientRequest>): Promise<Client> =>
    apiClient.put(`/client/single/${id}`, data),

  delete: (id: number, companyId: number): Promise<void> =>
    apiClient.delete(`/client/single/${id}`, { params: { companyId } }),

  getStatement: (
    id: number,
    params: { companyId: number; startDate?: string; endDate?: string }
  ): Promise<BackendApiResponse<ClientStatementResponse>> =>
    apiClient.get(`/client/single/${id}/statement`, { params }),
};
