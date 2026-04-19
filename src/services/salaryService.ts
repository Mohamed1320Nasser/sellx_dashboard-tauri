import { apiClient } from "./apiClient";
import type {
  Salary,
  BackendApiResponse,
  CreateSalaryRequest,
  UpdateSalaryRequest,
  PaySalaryRequest,
  PaymentPreviewRequest,
  PaymentPreviewResponse,
  GetSalaryListRequest,
  GetSalaryListResponse,
  SalarySummaryResponse,
} from "../types";

export const salaryService = {
  // Create new salary template
  create: (data: CreateSalaryRequest, companyId: number): Promise<BackendApiResponse<Salary>> =>
    apiClient.post("/salary/new", { ...data, companyId }),

  // Get paginated list
  getList: (params: GetSalaryListRequest): Promise<BackendApiResponse<GetSalaryListResponse>> =>
    apiClient.get("/salary/list", { params }),

  // Get single salary by ID
  getById: (id: string, companyId: number): Promise<BackendApiResponse<Salary>> =>
    apiClient.get(`/salary/single/${id}`, { params: { companyId } }),

  // Update salary template
  update: (id: string, data: UpdateSalaryRequest, companyId: number): Promise<BackendApiResponse<Salary>> =>
    apiClient.put(`/salary/single/${id}`, { ...data, companyId }),

  // Get payment preview (calculate absent days and final amount)
  getPaymentPreview: (id: string, data: PaymentPreviewRequest): Promise<BackendApiResponse<PaymentPreviewResponse>> =>
    apiClient.post(`/salary/payment-preview/${id}`, data),

  // Pay salary for specific month/year
  pay: (id: string, data: PaySalaryRequest): Promise<BackendApiResponse<any>> =>
    apiClient.put(`/salary/pay/${id}`, data),

  // Delete salary template (only if no payments)
  delete: (id: string, companyId: number): Promise<BackendApiResponse<{ message: string }>> =>
    apiClient.delete(`/salary/single/${id}`, { params: { companyId } }),

  // Get salary summary/statistics
  getSummary: (companyId: number): Promise<BackendApiResponse<SalarySummaryResponse>> =>
    apiClient.get("/salary/summary", { params: { companyId } }),

  // Generate monthly salaries for all employees
  generateMonthlySalaries: (companyId: number, month: number, year: number): Promise<BackendApiResponse<any>> =>
    apiClient.post("/salary/generate-monthly", { companyId, month, year }),

  // Edit salary payment (for SalariesEdit page)
  edit: (id: string, data: UpdateSalaryRequest, companyId: number): Promise<BackendApiResponse<Salary>> =>
    apiClient.put(`/salary/single/${id}`, { ...data, companyId }),
};
