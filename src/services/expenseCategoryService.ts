import { apiClient } from "./apiClient";
import type {
  ExpenseCategory,
  CreateExpenseCategoryRequest,
  UpdateExpenseCategoryRequest,
  BackendApiResponse,
} from "../types";

export const expenseCategoryService = {
  // Create category
  create: (data: CreateExpenseCategoryRequest, companyId: number): Promise<BackendApiResponse<ExpenseCategory>> =>
    apiClient.post("/expense-category/new", data, { params: { companyId } }),

  // List categories
  getList: (params: {
    companyId: number;
    includeInactive?: boolean;
    search?: string;
  }): Promise<BackendApiResponse<ExpenseCategory[]>> =>
    apiClient.get("/expense-category/list", { params }),

  // Get single category
  getById: (id: string, companyId: number): Promise<BackendApiResponse<ExpenseCategory>> =>
    apiClient.get(`/expense-category/single/${id}`, { params: { companyId } }),

  // Update category
  update: (id: string, data: UpdateExpenseCategoryRequest, companyId: number): Promise<BackendApiResponse<ExpenseCategory>> =>
    apiClient.put(`/expense-category/single/${id}`, data, { params: { companyId } }),

  // Delete category
  delete: (id: string, companyId: number): Promise<BackendApiResponse<{ message: string }>> =>
    apiClient.delete(`/expense-category/single/${id}`, { params: { companyId } }),

  // Toggle active status
  toggleActive: (id: string, companyId: number): Promise<BackendApiResponse<ExpenseCategory>> =>
    apiClient.patch(`/expense-category/single/${id}/toggle`, {}, { params: { companyId } }),

  // Seed default categories
  seedDefaults: (companyId: number): Promise<BackendApiResponse<ExpenseCategory[]>> =>
    apiClient.post("/expense-category/seed-defaults", {}, { params: { companyId } }),
};
