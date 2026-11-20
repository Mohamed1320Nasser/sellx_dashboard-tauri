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

export const reportService = {
  /** one shop day (yyyy-MM-dd, Cairo) */
  async endOfDay(companyId: number, date: string): Promise<EndOfDayReport> {
    const res: any = await apiClient.get('/report/end-of-day', { params: { companyId, date } });
    return res?.data?.data ?? res?.data;
  },
};
