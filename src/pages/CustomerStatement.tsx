import React, { useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  FileSpreadsheet,
  RefreshCw,
  Wallet,
  TrendingUp,
  RotateCcw,
  CreditCard,
} from 'lucide-react';
import { Layout } from '../components/layout';
import { Button, Card, DataTable, Badge, StatsCard } from '../components/ui';
import type { Column } from '../components/ui/DataTable';
import { useSessionAuthStore } from '../stores/sessionAuthStore';
import { useQuery } from '@tanstack/react-query';
import { clientService } from '../services/clientService';
import type { ClientStatementTransaction } from '../services/clientService';
import { formatCurrency } from '../utils';
import { formatTableDate } from '../utils/dateUtils';
import {
  exportReportToPdf,
  exportReportToExcel,
  type ReportColumn,
} from '../utils/reportExport';
import toast from 'react-hot-toast';

const typeConfig: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'error' }> = {
  OPENING: { label: 'رصيد افتتاحي', variant: 'default' },
  SALE: { label: 'فاتورة بيع', variant: 'primary' },
  PAYMENT: { label: 'دفعة', variant: 'success' },
  RETURN: { label: 'مرتجع', variant: 'warning' },
};

const CustomerStatement: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;
  const companyName = company?.name || company?.company?.name || company?.companyName || '';

  const { data: statementData, isLoading, refetch } = useQuery({
    queryKey: ['client-statement', id, companyId],
    queryFn: () => clientService.getStatement(Number(id), { companyId: companyId! }),
    enabled: !!id && !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const statement = statementData?.data;
  const client = statement?.client;
  const summary = statement?.summary;
  const transactions = useMemo(
    () => (statement?.transactions || []).map((t, i) => ({ ...t, id: i })),
    [statement]
  );

  type Row = ClientStatementTransaction & { id: number };

  const columns: Column<Row>[] = [
    { key: 'date', label: 'التاريخ', render: (t) => formatTableDate(t.date) },
    {
      key: 'type',
      label: 'النوع',
      render: (t) => {
        const cfg = typeConfig[t.type] || typeConfig.SALE;
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
      },
    },
    { key: 'reference', label: 'المرجع', render: (t) => <span className="text-gray-700">{t.reference}</span> },
    {
      key: 'debit',
      label: 'مدين',
      render: (t) => (t.debit > 0 ? <span className="text-red-600 font-medium">{formatCurrency(t.debit)}</span> : '—'),
    },
    {
      key: 'credit',
      label: 'دائن',
      render: (t) => (t.credit > 0 ? <span className="text-green-600 font-medium">{formatCurrency(t.credit)}</span> : '—'),
    },
    { key: 'balance', label: 'الرصيد', render: (t) => <span className="font-bold text-gray-900">{formatCurrency(t.balance)}</span> },
  ];

  const exportColumns: ReportColumn<Row>[] = useMemo(
    () => [
      { header: 'التاريخ', accessor: (t) => formatTableDate(t.date) },
      { header: 'النوع', accessor: (t) => (typeConfig[t.type] || typeConfig.SALE).label },
      { header: 'المرجع', accessor: (t) => t.reference },
      { header: 'مدين', accessor: (t) => t.debit, format: 'currency' },
      { header: 'دائن', accessor: (t) => t.credit, format: 'currency' },
      { header: 'الرصيد', accessor: (t) => t.balance, format: 'currency' },
    ],
    []
  );

  const buildMeta = useCallback(() => {
    return {
      title: 'كشف حساب عميل',
      companyName,
      subtitle: client ? `${client.name} — ${client.phone}` : undefined,
      fileName: `كشف-حساب-${client?.name || id}`,
      info: client
        ? [
            ...(client.email ? [{ label: 'البريد', value: client.email }] : []),
            ...(client.address ? [{ label: 'العنوان', value: client.address }] : []),
          ]
        : undefined,
      summary: summary
        ? [
            { label: 'الرصيد الافتتاحي', value: formatCurrency(summary.openingBalance) },
            { label: 'إجمالي المبيعات', value: formatCurrency(summary.totalSales) },
            { label: 'إجمالي المدفوعات', value: formatCurrency(summary.totalPayments) },
            { label: 'إجمالي المرتجعات', value: formatCurrency(summary.totalReturns) },
            ...(summary.creditLimit !== null
              ? [{ label: 'حد الائتمان', value: formatCurrency(summary.creditLimit) }]
              : []),
            ...(summary.remainingCredit !== null
              ? [{ label: 'الائتمان المتبقي', value: formatCurrency(summary.remainingCredit) }]
              : []),
            { label: 'الرصيد المستحق', value: formatCurrency(summary.outstandingBalance), emphasis: true },
          ]
        : undefined,
    };
  }, [companyName, client, summary, id]);

  const handleExportPdf = useCallback(async () => {
    if (transactions.length === 0) return toast.error('لا توجد بيانات للتصدير');
    try {
      await exportReportToPdf(transactions, exportColumns, buildMeta());
    } catch {
      toast.error('تعذر تصدير ملف PDF');
    }
  }, [transactions, exportColumns, buildMeta]);

  const handleExportExcel = useCallback(async () => {
    if (transactions.length === 0) return toast.error('لا توجد بيانات للتصدير');
    try {
      await exportReportToExcel(transactions, exportColumns, buildMeta());
    } catch {
      toast.error('تعذر تصدير ملف Excel');
    }
  }, [transactions, exportColumns, buildMeta]);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/clients')} className="text-gray-600">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">كشف حساب عميل</h1>
              <p className="text-gray-600 mt-1">{client?.name || '...'}</p>
            </div>
          </div>
          <div className="flex space-x-3 space-x-reverse">
            <Button variant="outline" onClick={handleExportPdf} className="flex items-center">
              <FileText className="w-4 h-4 ml-1" /> PDF
            </Button>
            <Button variant="outline" onClick={handleExportExcel} className="flex items-center">
              <FileSpreadsheet className="w-4 h-4 ml-1" /> Excel
            </Button>
            <Button variant="outline" onClick={() => refetch()} className="flex items-center">
              <RefreshCw className="w-4 h-4 ml-1" /> تحديث
            </Button>
          </div>
        </div>

        {/* Client info */}
        {client && (
          <Card padding="lg">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center text-white">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-lg">{client.name}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                    <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{client.phone}</span>
                    {client.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{client.email}</span>}
                    {client.address && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{client.address}</span>}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Financial summary */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="إجمالي المبيعات"
              value={formatCurrency(summary.totalSales)}
              icon={TrendingUp}
              color="primary"
            />
            <StatsCard
              title="إجمالي المدفوعات"
              value={formatCurrency(summary.totalPayments)}
              icon={Wallet}
              color="success"
            />
            <StatsCard
              title="المرتجعات"
              value={formatCurrency(summary.totalReturns)}
              icon={RotateCcw}
              color="warning"
            />
            <StatsCard
              title="الرصيد المستحق"
              value={formatCurrency(summary.outstandingBalance)}
              icon={CreditCard}
              color="danger"
            />
            {summary.remainingCredit !== null && (
              <StatsCard
                title="الائتمان المتبقي"
                value={formatCurrency(summary.remainingCredit)}
                icon={CreditCard}
                color="success"
              />
            )}
          </div>
        )}

        {/* Transactions ledger */}
        <DataTable<Row>
          title="حركة الحساب"
          columns={columns}
          data={transactions}
          loading={isLoading}
          showSearch={false}
          showPagination={transactions.length > 10}
          emptyMessage="لا توجد حركات على هذا الحساب"
        />
      </div>
    </Layout>
  );
};

export default CustomerStatement;
