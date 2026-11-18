import { apiClient } from "./apiClient";

/** One row of the activity log (سجل العمليات) */
export interface AuditLogRow {
  id: string;
  companyId: number;
  userId: number | null;
  role: "ADMIN" | "MANAGER" | "CASHIER" | null;
  action: string;
  entityType: string;
  entityId: string | null;
  label: string | null;
  amount: number | null;
  details: Record<string, any> | null;
  source: "WEB" | "DESKTOP" | "API";
  ip: string | null;
  createdAt: string;
  user: { id: number; fullname: string; username: string } | null;
}

export interface AuditLogQuery {
  companyId: number;
  page?: number;
  limit?: number;
  search?: string;
  userId?: number;
  action?: string;
  group?: string;
  entityType?: string;
  entityId?: string;
  /** YYYY-MM-DD (Cairo shop day) */
  from?: string;
  to?: string;
}

export interface AuditLogPage {
  list: AuditLogRow[];
  totalCount: number;
  filterCount: number;
  keepDays: number;
}

const clean = (q: AuditLogQuery) =>
  Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== ""));

export const auditLogService = {
  list: async (query: AuditLogQuery): Promise<AuditLogPage> => {
    const res: any = await apiClient.get("/audit-log/list", { params: clean(query) });
    return res.data;
  },

  /** Every row of the current filter for export (server pages of 200, at most 5000 rows) */
  listAll: async (query: AuditLogQuery): Promise<AuditLogRow[]> => {
    const out: AuditLogRow[] = [];
    for (let page = 1; page <= 25; page++) {
      const res = await auditLogService.list({ ...query, page, limit: 200 });
      out.push(...res.list);
      if (out.length >= res.filterCount || res.list.length < 200) break;
    }
    return out;
  },
};
