import { apiClient } from './apiClient';

export interface EndOfDayMoneyRow {
  method: string;
  atSale: number;
  onDebts: number;
  fromSuppliers: number;
  toSuppliers: number;
  expenses: number;
  refunds: number;
  net: number;
}

export interface EndOfDayShift {
  id: string;
  register: string;
  cashier: string;
  status: 'OPEN' | 'CLOSED';
  startTime: string;
  endTime: string | null;
  openingBalance: number;
  invoices: number;
  salesAmount: number;
  cashSales: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  actualCash: number | null;
  variance: number | null;
}

export interface EndOfDayReport {
  date: string;
  sales: {
    invoices: number;
    totalRevenue: number;
    discounts: number;
    tax: number;
    returns: number;
    returnOrders: number;
    netRevenue: number;
    averageOrderValue: number;
    costOfGoodsSold: number | null;
    grossProfit: number | null;
    grossProfitMargin: number | null;
    unpaid: number;
  };
  money: EndOfDayMoneyRow[];
  moneyTotals: Omit<EndOfDayMoneyRow, 'method'> & { expenseCount: number; supplierPaymentCount: number };
  shifts: EndOfDayShift[];
  cashiers: { userId: number; name: string; invoices: number; total: number }[];
  items: { productId: string | null; name: string; unit: string | null; quantity: number; total: number }[];
}

export type AgingBucket = 'notDue' | 'd0_30' | 'd31_60' | 'd61_90' | 'd90plus';
export type AgingBuckets = Record<AgingBucket, number>;
interface InCredit {
  count: number;
  total: number;
  list: { id: number; name: string; phone: string | null; credit: number }[];
}
export interface ReceivablesAging {
  asOf: string;
  buckets: AgingBuckets;
  total: number;
  customers: {
    id: number;
    name: string;
    phone: string | null;
    total: number;
    buckets: AgingBuckets;
    openInvoices: number;
    oldestDays: number | null;
    lastPaymentAt: string | null;
    creditLimit: number | null;
    overLimit: boolean;
  }[];
  /** unpaid invoices with no customer on them */
  withoutCustomer: { total: number; buckets: AgingBuckets; openInvoices: number; oldestDays: number | null } | null;
  inCredit: InCredit;
}
export interface PayablesAging {
  asOf: string;
  buckets: AgingBuckets;
  total: number;
  overdue: number;
  suppliers: {
    id: number;
    name: string;
    phone: string | null;
    total: number;
    overdue: number;
    buckets: AgingBuckets;
    openBills: number;
    oldestDays: number | null;
    nextDueAt: string | null;
  }[];
  inCredit: InCredit;
}


// ------------------------------------------------ stock and cashier reports
type Cat = { id: string; name: string } | null;

export interface StockValuation {
  asOf: string;
  totals: { products: number; costValue: number; saleValue: number; profit: number; margin: number | null; outOfStock: number; noCost: number };
  categories: { id: string; name: string; products: number; costValue: number; saleValue: number; profit: number; share: number }[];
  rows: { id: string; name: string; sku: string; unit: string | null; category: Cat; stock: number; cost: number; price: number; costValue: number; saleValue: number; profit: number; noCost: boolean; noPrice: boolean }[];
  negative: { id: string; name: string; sku: string; unit: string | null; category: Cat; stock: number; cost: number; price: number }[];
}

export type SlowBucket = 'd30_60' | 'd60_90' | 'd90_180' | 'd180plus';
export interface SlowMoving {
  asOf: string;
  days: number;
  totals: { products: number; costValue: number; neverSold: number; share: number; stockValue: number };
  buckets: Record<SlowBucket, { count: number; costValue: number }>;
  rows: { id: string; name: string; sku: string; unit: string | null; category: Cat; stock: number; cost: number; price: number; costValue: number; lastSaleAt: string | null; lastPurchaseAt: string | null; idleDays: number; neverSold: boolean }[];
}

export interface ReorderItem {
  id: string;
  name: string;
  sku: string;
  unit: string | null;
  category: Cat;
  stock: number;
  minStock: number;
  sold30: number;
  daysLeft: number | null;
  urgency: 'out' | 'urgent' | 'soon';
  suggested: number;
  inPacks?: { name: string; factor: number; count: number };
  cost: number;
  lastSupplier: { id: number; name: string } | null;
  lastCost: number | null;
  lastPurchaseAt: string | null;
  cheaper?: { id: number; name: string; avgCost: number };
  estimatedCost: number;
}
export interface Reorder {
  asOf: string;
  coverDays: number;
  totals: { products: number; out: number; urgent: number; estimatedCost: number; suppliers: number };
  groups: { supplier: { id: number; name: string; phone: string | null } | null; items: ReorderItem[]; total: number }[];
}

export interface SalesByCashier {
  startDate: string;
  endDate: string;
  totals: { cashiers: number; invoices: number; sales: number; discounts: number; returns: number; negotiated: number; shiftsNet: number };
  cashiers: {
    id: number;
    name: string;
    invoices: number;
    sales: number;
    collected: number;
    unpaid: number;
    discounts: number;
    average: number;
    share: number;
    returns: { count: number; total: number };
    negotiated: { count: number; amount: number };
    shifts: { count: number; shortage: number; overage: number; net: number; short: number };
  }[];
}

export const reportService = {
  /** one shop day (yyyy-MM-dd, Cairo) */
  async stockValuation(companyId: number): Promise<StockValuation> {
    const res: any = await apiClient.get('/report/stock-valuation', { params: { companyId } });
    return res?.data?.data ?? res?.data;
  },
  async slowMoving(companyId: number, days: number): Promise<SlowMoving> {
    const res: any = await apiClient.get('/report/slow-moving', { params: { companyId, days } });
    return res?.data?.data ?? res?.data;
  },
  async reorder(companyId: number, coverDays: number): Promise<Reorder> {
    const res: any = await apiClient.get('/report/reorder', { params: { companyId, coverDays } });
    return res?.data?.data ?? res?.data;
  },
  async salesByCashier(companyId: number, startDate: string, endDate: string): Promise<SalesByCashier> {
    const res: any = await apiClient.get('/report/sales-by-cashier', { params: { companyId, startDate, endDate } });
    return res?.data?.data ?? res?.data;
  },
  async receivablesAging(companyId: number): Promise<ReceivablesAging> {
    const res: any = await apiClient.get('/report/receivables-aging', { params: { companyId } });
    return res?.data?.data ?? res?.data;
  },
  async payablesAging(companyId: number): Promise<PayablesAging> {
    const res: any = await apiClient.get('/report/payables-aging', { params: { companyId } });
    return res?.data?.data ?? res?.data;
  },
  async endOfDay(companyId: number, date: string): Promise<EndOfDayReport> {
    const res: any = await apiClient.get('/report/end-of-day', { params: { companyId, date } });
    return res?.data?.data ?? res?.data;
  },
};
