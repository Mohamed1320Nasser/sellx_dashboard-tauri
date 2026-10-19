import { apiClient } from "./apiClient";

export interface CreateSupplierReturnRequest {
  companyId: number;
  purchaseId: number;
  items: { productId: string; quantity: number }[];
  /** Cash the supplier gives back; leave out to use the most allowed */
  refundAmount?: number;
  refundMethod?: string;
  reason?: string;
  notes?: string;
}

export const supplierReturnService = {
  create: (data: CreateSupplierReturnRequest): Promise<any> =>
    apiClient.post("/supplier-return/new", data),

  getList: (params: {
    companyId: number;
    page?: number;
    limit?: number;
    search?: string;
    supplierId?: number;
    purchaseId?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<any> => apiClient.get("/supplier-return/list", { params }),

  delete: (id: string, companyId: number): Promise<any> =>
    apiClient.delete(`/supplier-return/single/${id}`, { params: { companyId } }),
};
