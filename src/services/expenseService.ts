import { apiClient } from "./apiClient";
import type {
  Expense,
  CreateExpenseRequest,
  UpdateExpenseRequest,
  GetExpenseListRequest,
  GetExpenseListResponse,
  ExpenseSummaryResponse,
  BackendApiResponse,
} from "../types";

export const expenseService = {
  // Create expense
  create: (data: CreateExpenseRequest, companyId: number): Promise<BackendApiResponse<Expense>> =>
    apiClient.post("/expense/new", { ...data, companyId }, { params: { companyId } }),

  // List expenses with filters
  getList: (params: GetExpenseListRequest): Promise<BackendApiResponse<GetExpenseListResponse>> =>
    apiClient.post("/expense/list", params),

  // Get single expense
  getById: (id: string, companyId: number): Promise<BackendApiResponse<Expense>> =>
    apiClient.get(`/expense/single/${id}`, { params: { companyId } }),

  // Update expense
  update: (id: string, data: UpdateExpenseRequest, companyId: number): Promise<BackendApiResponse<Expense>> =>
    apiClient.put(`/expense/single/${id}`, { ...data, companyId }, { params: { companyId } }),

  // Delete expense
  delete: (id: string, companyId: number): Promise<BackendApiResponse<{ message: string }>> =>
    apiClient.delete(`/expense/single/${id}`, { params: { companyId } }),

  // Get expense summary
  getSummary: (params: {
    companyId: number;
    startDate?: string;
    endDate?: string;
  }): Promise<BackendApiResponse<ExpenseSummaryResponse>> =>
    apiClient.get("/expense/summary", { params }),
};
