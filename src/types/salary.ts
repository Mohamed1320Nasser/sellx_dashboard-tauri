// ==================== ENUMS ====================

export enum SalaryStatus {
  DRAFT = "DRAFT",           // Not yet paid
  PAID = "PAID",             // Successfully paid
  CANCELLED = "CANCELLED",   // Cancelled payment
  APPROVED = "APPROVED",     // Approved for payment
  ACTIVE = "ACTIVE",         // Active salary template
  INACTIVE = "INACTIVE",     // Inactive salary template
}

export enum PaymentMethod {
  BANK_TRANSFER = "BANK_TRANSFER",
  CASH = "CASH",
  CHECK = "CHECK",
}

export enum PaymentSource {
  ACTIVE_SHIFT = "ACTIVE_SHIFT",
  MAIN_VAULT = "MAIN_VAULT",
  OWNER_DRAWER = "OWNER_DRAWER",
}

// Dynamic payment status (calculated on frontend)
export enum PaymentStatus {
  PAID = "PAID",         // Paid for current month
  UNPAID = "UNPAID",     // Not paid yet
  OVERDUE = "OVERDUE",   // Paid in past but not current month
}

// ==================== INTERFACES ====================

export interface Salary {
  id: string;
  userId: number;
  companyId: number;
  baseSalary: number;
  allowances: number;
  deductions: number;
  overtime: number;
  bonuses: number;
  netSalary: number;
  status: SalaryStatus;

  // Current period (for individual salary records)
  month?: number;
  year?: number;
  workingDays?: number;
  absentDays?: number;
  paymentDate?: string;

  // Last payment tracking
  lastPaidMonth?: number;
  lastPaidYear?: number;
  lastPaidAmount?: number;
  lastPaymentDate?: string;

  notes?: string;
  createdBy: number;
  lastPaidBy?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;

  // Relations
  user?: {
    id: number;
    fullname: string;
    email: string;
  };
  creator?: {
    id: number;
    fullname: string;
  };
  lastPayer?: {
    id: number;
    fullname: string;
  };
  salaryPayments?: SalaryPayment[];

  // Dynamic field (added on frontend)
  paymentStatus?: PaymentStatus;
}

export interface SalaryPayment {
  id: string;
  salaryId: string;
  userId: number;
  companyId: number;
  month: number;
  year: number;
  paidAmount: number;
  workingDays: number;
  absentDays: number;
  paymentMethod: PaymentMethod;
  paymentSource?: PaymentSource;
  notes?: string;
  paidBy: number;
  paidAt: string;
  expenseId: string;
  createdAt: string;
  deletedAt?: string;

  // Relations
  salary?: Salary;
  user?: {
    id: number;
    fullname: string;
    email: string;
  };
  payer?: {
    id: number;
    fullname: string;
  };
  expense?: any;
}

// ==================== REQUEST DTOS ====================

export interface CreateSalaryRequest {
  userId: string;
  baseSalary: number;
  allowances?: number;
  deductions?: number;
  overtime?: number;
  bonuses?: number;
  notes?: string;
}

export interface UpdateSalaryRequest {
  baseSalary?: number;
  allowances?: number;
  deductions?: number;
  overtime?: number;
  bonuses?: number;
  status?: SalaryStatus;
  notes?: string;
}

export interface PaymentPreviewRequest {
  companyId: number;
  month: number;
  year: number;
}

export interface PaymentPreviewResponse {
  salary: {
    id: string;
    user: {
      id: number;
      fullname: string;
      email: string;
    };
    baseSalary: number;
    allowances: number;
    deductions: number;
    overtime: number;
    bonuses: number;
  };
  period: {
    month: number;
    year: number;
  };
  calculation: {
    totalWorkingDays: number;
    workingDays: number;
    absentDays: number;
    perDayAmount: number;
    absentDeduction: number;
    finalAmount: number;
  };
  absences?: Array<{
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    status: string;
  }>;
}

export interface PaySalaryRequest {
  companyId: number;
  month: number;
  year: number;
  paymentMethod: PaymentMethod;
  paymentSource?: PaymentSource;
  shiftId?: string;
  notes?: string;
}

export interface GetSalaryListRequest {
  companyId: number;
  page?: number;
  limit?: number;
  search?: string;
  userId?: string;
  status?: SalaryStatus;
  month?: number;  // Filter by lastPaidMonth
  year?: number;   // Filter by lastPaidYear
}

// ==================== RESPONSE DTOS ====================

export interface GetSalaryListResponse {
  list: Salary[];
  totalCount: number;
  filterCount: number;
}

export interface SalarySummaryResponse {
  totalSalaries: number;
  paidThisMonth: number;
  unpaidCount: number;
  totalPaidAmount: number;
  recentPayments: Array<{
    id: string;
    month: number;
    year: number;
    paidAmount: number;
    paidAt: string;
    user: {
      fullname: string;
    };
  }>;
}
