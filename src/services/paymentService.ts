import { apiClient } from "./apiClient";

export enum PaymentMethod {
  CASH = "CASH",
  CARD = "CARD",
  MOBILE_WALLET = "MOBILE_WALLET",
  BANK_TRANSFER = "BANK_TRANSFER",
}

/** Kept for older screens; every payment is saved as COMPLETED */
export enum PaymentStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

export type PaymentMethodCode = "CASH" | "CARD" | "MOBILE_WALLET" | "BANK_TRANSFER";

interface PartyRef {
  id: number;
  name: string;
  phone?: string | null;
}

export interface Payment {
  id: string;
  purchaseId?: number | null;
  saleId?: number | null;
  companyId: number;
  userId: number;
  amount: number;
  paymentMethod: PaymentMethodCode;
  paymentStatus: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  reference?: string | null;
  notes?: string | null;
  paymentDate: string;
  createdAt: string;
  updatedAt: string;
  /** IN = collected for a sale, OUT = paid to a supplier */
  direction?: "IN" | "OUT";
  sale?: { id: number; receiptNumber: string; totalAmount: number; paidAmount: number; client?: PartyRef | null } | null;
  purchase?: { id: number; invoiceNumber: string; totalAmount: number; paidAmount: number; supplier?: PartyRef | null } | null;
  user?: { id: number; fullname: string } | null;
}

export interface PaymentDrawerMovement {
  id: string;
  amount: number;
  type: string;
  reason: string;
  createdAt: string;
  shift: { id: string; status: "OPEN" | "CLOSED"; startTime: string; register?: { name: string } | null };
}

export interface PaymentDetail extends Payment {
  /** what is still owed on the invoice */
  documentRemaining: number | null;
  /** the drawer movement(s) of a cash payment */
  drawer: PaymentDrawerMovement[];
  /** the viewer may edit / delete */
  canManage: boolean;
}

export interface PaymentListSummary {
  totalIn: number;
  totalOut: number;
  net: number;
  countIn: number;
  countOut: number;
  byMethod: Record<string, { in: number; out: number }>;
  canSeeSupplierPayments: boolean;
}

export interface PaymentListParams {
  companyId: number;
  page?: number;
  limit?: number;
  search?: string;
  paymentMethod?: string;
  type?: "IN" | "OUT";
  startDate?: string;
  endDate?: string;
}

export interface OpenInvoice {
  type: "sale" | "purchase";
  id: number;
  number: string;
  date: string;
  totalAmount: number;
  paidAmount: number;
  remaining: number;
  party?: PartyRef | null;
}

export interface CreatePaymentRequest {
  purchaseId?: number;
  saleId?: number;
  companyId: number;
  amount: number;
  paymentMethod: PaymentMethodCode;
  /** ignored by the server (always completed); kept for older callers */
  paymentStatus?: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
  reference?: string;
  notes?: string;
  paymentDate?: string;
}

export interface UpdatePaymentRequest {
  companyId: number;
  amount?: number;
  paymentMethod?: PaymentMethodCode;
  reference?: string;
  notes?: string;
  paymentDate?: string;
}

export interface CollectFromClientRequest {
  companyId: number;
  amount: number;
  paymentMethod: PaymentMethodCode;
  reference?: string;
  notes?: string;
  paymentDate?: string;
}

export interface CollectFromClientResult {
  batch: string;
  total: number;
  owedBefore: number;
  owedAfter: number;
  allocations: { saleId: number; receiptNumber: string; amount: number; remainingAfter: number; paymentId: string }[];
}

export interface SupplierPaymentSummary {
  supplierId: number;
  totalPurchases: number;
  totalPaid: number;
  outstanding: number;
  purchases: {
    id: number;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    paymentStatus: string;
  }[];
}

/** apiClient resolves to the {msg, status, data} envelope */
type Envelope<T> = { data: T; msg?: string; status?: number };

export const paymentService = {
  create: (data: CreatePaymentRequest): Promise<Envelope<Payment>> => apiClient.post("/payment/create", data),

  getList: (
    params: PaymentListParams
  ): Promise<Envelope<{ list: Payment[]; totalCount: number; page: number; limit: number; totalPages: number; summary: PaymentListSummary }>> =>
    apiClient.get("/payment/list", { params }),

  getById: (paymentId: string, companyId: number): Promise<Envelope<PaymentDetail>> =>
    apiClient.get(`/payment/${paymentId}`, { params: { companyId } }),

  getByPurchase: (purchaseId: number, companyId: number): Promise<Payment[]> =>
    apiClient.get(`/payment/purchase/${purchaseId}`, { params: { companyId } }),

  getBySale: (saleId: number, companyId: number): Promise<Payment[]> =>
    apiClient.get(`/payment/sale/${saleId}`, { params: { companyId } }),

  update: (paymentId: string, data: UpdatePaymentRequest): Promise<Envelope<Payment>> => apiClient.put(`/payment/${paymentId}`, data),

  delete: (paymentId: string, companyId: number): Promise<{ success: boolean }> =>
    apiClient.delete(`/payment/${paymentId}`, { params: { companyId } }),

  /** Unpaid invoices, searched on the server */
  openInvoices: (params: {
    companyId: number;
    type: "sale" | "purchase";
    search?: string;
    clientId?: number;
    supplierId?: number;
  }): Promise<Envelope<{ list: OpenInvoice[]; totalRemaining: number }>> => apiClient.get("/payment/open-invoices", { params }),

  /** One amount over the customer's oldest unpaid invoices */
  collectFromClient: (clientId: number, data: CollectFromClientRequest): Promise<Envelope<CollectFromClientResult>> =>
    apiClient.post(`/payment/client/${clientId}/collect`, data),

  getSupplierSummary: (supplierId: number, companyId: number): Promise<SupplierPaymentSummary> =>
    apiClient.get(`/payment/supplier/${supplierId}/summary`, { params: { companyId } }),
};
