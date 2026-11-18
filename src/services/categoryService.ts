import { apiClient } from "./apiClient";
import type { Category, PaginatedResponse, BackendApiResponse } from "../types";

interface CreateCategoryRequest {
  name: string;
  description?: string;
  companyId: number;
}

export const categoryService = {
  // Create category
  create: (data: CreateCategoryRequest): Promise<Category> =>
    apiClient.post("/category/new", data),

  // List categories
  getList: (params: {
    companyId: number;
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<BackendApiResponse<PaginatedResponse<Category>>> =>
    apiClient.post("/category/list", params),

  // Get single category
  getById: (id: string): Promise<Category> =>
    apiClient.get(`/category/single/${id}`),

  // Edit category
  edit: (id: string, data: Partial<CreateCategoryRequest>): Promise<Category> =>
    apiClient.put(`/category/single/${id}`, data),

  // Delete category
  delete: (id: string, companyId: number): Promise<void> =>
    apiClient.delete(`/category/single/${id}`, {
      params: { companyId },
    }),

  // Category report — products grouped by category with stock/prices/status + totals
  getReport: (params: {
    companyId: number;
    categoryId?: string;
    search?: string;
  }): Promise<BackendApiResponse<CategoryReportResponse>> =>
    apiClient.get("/category/report", { params }),
};

export interface CategoryReportProduct {
  id: string;
  name: string;
  sku: string;
  purchasePrice: number;
  sellingPrice: number;
  stockQuantity: number;
  unit?: string | null;
  minStockLevel: number;
  stockValue: number;
  retailValue: number;
  status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
}

export interface CategoryReportCategory {
  id: string;
  name: string;
  description?: string | null;
  productCount: number;
  stockUnits: number;
  stockValue: number;
  retailValue: number;
  potentialProfit: number;
  lowStockCount: number;
  products: CategoryReportProduct[];
}

export interface CategoryReportResponse {
  categories: CategoryReportCategory[];
  summary: {
    totalCategories: number;
    totalProducts: number;
    totalStockUnits: number;
    totalStockValue: number;
    totalRetailValue: number;
    totalPotentialProfit: number;
    totalLowStock: number;
  };
}
