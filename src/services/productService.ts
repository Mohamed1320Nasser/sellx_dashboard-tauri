import { apiClient } from "./apiClient";
import type { Product, PaginatedResponse, BackendApiResponse } from "../types";

interface CreateProductRequest {
  name: string;
  sku: string;
  description?: string;
  originalBarcode?: string; // Factory/manufacturer barcode
  localBarcode?: string; // System-generated barcode
  barcodeFormat?: string; // Barcode format (CODE128, EAN13, etc.)
  purchasePrice: number;
  sellingPrice: number;
  stockQuantity: number;
  minStockLevel: number;
  /** Unit label (e.g. "كجم"); null = piece */
  unit?: string | null;
  /** Sold by weight / length: fractional quantities allowed */
  allowDecimalQty?: boolean;
  categoryId: string;
  companyId: number;
}

export const productService = {
  // Create product - returns nested structure: { msg, status, data: { success, data: Product } }
  create: (data: CreateProductRequest): Promise<any> =>
    apiClient.post("/product/new", data),

  // List products
  getList: (params: {
    companyId: number;
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    lowStock?: boolean;
    noPrice?: boolean;
  }): Promise<BackendApiResponse<PaginatedResponse<Product>>> =>
    apiClient.get("/product/list", { params }),

  // Get single product
  getById: (id: string, companyId: number): Promise<{ data: Product }> =>
    apiClient.get(`/product/single/${id}`, { params: { companyId } }),

  // Edit product
  edit: (id: string, data: Partial<CreateProductRequest>): Promise<Product> =>
    apiClient.put(`/product/single/${id}`, data),

  // Delete product
  delete: (id: string, companyId: number): Promise<void> =>
    apiClient.delete(`/product/single/${id}`, {
      params: { companyId },
    }),

  // Bulk soft-delete products. Returns per-item breakdown:
  //   { requested, deletedCount, failedCount, deletedIds, failed: [{id, reason}] }
  bulkDelete: (companyId: number, productIds: string[]): Promise<any> =>
    apiClient.post("/product/bulk/delete", { companyId, productIds }),

  // Bulk reassign products to a category.
  //   Returns { requested, movedCount, categoryId, categoryName }
  bulkMoveCategory: (
    companyId: number,
    productIds: string[],
    categoryId: string
  ): Promise<any> =>
    apiClient.post("/product/bulk/move-category", {
      companyId,
      productIds,
      categoryId,
    }),

  // Generate barcode - returns nested structure: { msg, status, data: { success, data: { barcode, format } } }
  generateBarcode: (companyId: number, prefix: string = 'PROD'): Promise<any> =>
    apiClient.post("/product/barcode/generate", { companyId, prefix }),

  // Validate barcode - returns nested structure
  validateBarcode: (barcode: string): Promise<any> =>
    apiClient.post("/product/barcode/validate", { barcode }),

  // Find product by barcode. Response shape (after apiClient unwraps response.data):
  //   hit : { msg, status, data: { success: true,  data: <product> }, error: false }
  //   miss: { msg, status, data: { success: false, error: string   }, error: false }
  findByBarcode: (barcode: string, companyId: number): Promise<any> =>
    apiClient.get(`/product/barcode/${barcode}`, { params: { companyId } }),
};
