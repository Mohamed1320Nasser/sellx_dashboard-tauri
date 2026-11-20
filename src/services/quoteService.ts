import { apiClient } from "./apiClient";
import type {
  Quote,
  CreateQuoteRequest,
  CalculateQuoteRequest,
  UpdateQuoteRequest,
  GetQuoteListRequest,
  CustomLineResolution,
  BackendApiResponse,
  PaginatedResponse,
} from "../types";

export const quoteService = {
  // Calculate quote without saving
  calculate: (data: CalculateQuoteRequest): Promise<Quote> =>
    apiClient.post("/quote/calculate", data),

  // Create and save quote
  create: (data: CreateQuoteRequest): Promise<Quote> =>
    apiClient.post("/quote/new", data),

  // Get quote by ID
  getById: (id: string, companyId: number): Promise<Quote> =>
    apiClient.get(`/quote/single/${id}`, { params: { companyId } }),

  // Get quotes list
  getList: (
    params: GetQuoteListRequest
  ): Promise<BackendApiResponse<PaginatedResponse<Quote>>> =>
    apiClient.get("/quote/list", { params }),

  // Update quote
  update: (id: string, data: UpdateQuoteRequest): Promise<Quote> =>
    apiClient.put(`/quote/single/${id}`, data),

  // Delete quote
  delete: (id: string): Promise<{ success: boolean; message: string }> =>
    apiClient.delete(`/quote/single/${id}`),

  // Print quote
  print: (id: string): Promise<Quote> =>
    apiClient.get(`/quote/single/${id}/print`),

  // Convert quote to sale
  // clientId: the customer whose account carries the invoice (it is unpaid at conversion)
  // customLines: what happens to each line that is not a product (create / link / leave out)
  convertToSale: (
    id: string,
    companyId: number,
    options: { clientId?: number; customLines?: CustomLineResolution[] } = {}
  ): Promise<{ success: boolean; saleId: number; sale: any }> =>
    apiClient.post(`/quote/convert-to-sale/${id}`, {
      companyId,
      ...(options.clientId && { clientId: options.clientId }),
      ...(options.customLines?.length && { customLines: options.customLines }),
    }),

  // Email quote to customer
  /** Make (or keep) the customer link, with the PDF that goes with it */
  share: (id: string, companyId: number, pdf?: File): Promise<Quote> => {
    const form = new FormData();
    if (pdf) form.append("file", pdf, "quote.pdf");
    return apiClient.post(`/quote/single/${id}/share`, form, {
      params: { companyId },
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
  },

  /** Turn the customer link off */
  unshare: (id: string, companyId: number): Promise<Quote> =>
    apiClient.delete(`/quote/single/${id}/share`, { params: { companyId } }),

  email: (id: string, companyId: number): Promise<{ success: boolean; message: string }> =>
    apiClient.post(`/quote/email/${id}`, { companyId }),
};
