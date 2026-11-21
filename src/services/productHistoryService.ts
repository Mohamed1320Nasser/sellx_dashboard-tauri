import { apiClient } from './apiClient';

/** Shop days (yyyy-MM-dd, Cairo) and the page of one history tab */
export interface HistoryQuery {
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  type?: MovementType;
}

export type MovementType = 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'RETURN' | 'STOCKTAKE';

interface Paged {
  total: number;
  page: number;
  limit: number;
}

export interface ProductInsights {
  asOf: string;
  stock: number;
  minStock: number;
  daysOfStock: number | null;
  sellingPrice: number;
  /** managers and owners only */
  purchasePrice?: number;
  margin?: number | null;
  last30: { qty: number; revenue: number; profit?: number; daily: { day: string; qty: number; revenue: number }[] };
  lastSale: { at: string; saleId: number; receiptNumber: string; unitPrice: number } | null;
  lastPurchase: { at: string; purchaseId?: number; invoiceNumber?: string; supplier?: string | null; unitCost?: number } | null;
  prices: { id: string; name: string; isDefault: boolean; price: number; source: 'BASE' | 'OVERRIDE' | 'FORMULA' | 'FALLBACK' }[];
  packs: { id: string; name: string; factor: number; sellingPrice: number; barcode: string | null }[];
}

export interface ProductSales extends Paged {
  unit: string | null;
  summary: {
    invoices: number;
    qty: number;
    revenue: number;
    avgPrice: number | null;
    minPrice: number | null;
    maxPrice: number | null;
    profit?: number;
    topCustomers: { id: number; name: string; qty: number; revenue: number }[];
  };
  rows: {
    id: number;
    saleId: number;
    receiptNumber: string;
    date: string;
    paymentStatus: string;
    client: { id: number; name: string } | null;
    cashier: string | null;
    qty: number;
    pack: { name: string; qty: number; price: number } | null;
    unitPrice: number;
    total: number;
    returnedQty: number;
    /** set when sold at another price than the list's */
    listPrice?: number;
    profit?: number;
  }[];
}

export interface ProductPurchases extends Paged {
  unit: string | null;
  summary: {
    invoices: number;
    qty: number;
    total: number;
    avgCost: number | null;
    lastCost: number | null;
    suppliers: { id: number; name: string; qty: number; avgCost: number; minCost: number; lastCost: number; lastAt: string }[];
  };
  rows: {
    id: string;
    purchaseId: number;
    invoiceNumber: string;
    date: string;
    paymentStatus: string;
    supplier: { id: number; name: string } | null;
    user: string | null;
    qty: number;
    unitPrice: number;
    unitCost: number | null;
    total: number;
    returnedQty: number;
  }[];
}

export interface ProductPrices extends Paged {
  current: { purchasePrice: number; sellingPrice: number };
  chart: { at: string; purchasePrice: number; sellingPrice: number }[];
  rows: {
    id: string;
    at: string;
    source: string;
    user: string | null;
    priceList: { id: string; name: string } | null;
    purchase: { id: number; invoiceNumber: string } | null;
    reason: string | null;
    purchasePrice: { from: number; to: number };
    sellingPrice: { from: number; to: number };
  }[];
}

export interface ProductMovements extends Paged {
  unit: string | null;
  byType: { type: MovementType; count: number; qty: number }[];
  rows: {
    id: string;
    type: MovementType;
    at: string;
    qty: number;
    before: number;
    after: number;
    reference: string | null;
    reason: string | null;
    user: string | null;
    unitCost?: number | null;
  }[];
}

const get = async <T,>(productId: string, tab: string, companyId: number, q: HistoryQuery = {}): Promise<T> => {
  const params: Record<string, unknown> = { companyId };
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') params[k] = v;
  const res: any = await apiClient.get(`/product/single/${productId}/${tab}`, { params });
  return res?.data?.data ?? res?.data;
};

export const productHistoryService = {
  insights: (productId: string, companyId: number) => get<ProductInsights>(productId, 'insights', companyId),
  sales: (productId: string, companyId: number, q: HistoryQuery) => get<ProductSales>(productId, 'sales', companyId, q),
  purchases: (productId: string, companyId: number, q: HistoryQuery) => get<ProductPurchases>(productId, 'purchases', companyId, q),
  prices: (productId: string, companyId: number, q: HistoryQuery) => get<ProductPrices>(productId, 'prices', companyId, q),
  movements: (productId: string, companyId: number, q: HistoryQuery) => get<ProductMovements>(productId, 'movements', companyId, q),
};
