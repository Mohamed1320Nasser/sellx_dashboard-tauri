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

export const reportService = {
  /** one shop day (yyyy-MM-dd, Cairo) */
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
