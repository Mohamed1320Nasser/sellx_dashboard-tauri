import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowRight,
  User,
  Truck,
  Phone,
  Mail,
  MapPin,
  FileText,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  Wallet,
  TrendingUp,
  RotateCcw,
  CreditCard,
  HandCoins,
  History,
  ChevronLeft,
} from 'lucide-react';
import { Layout } from '../layout';
import { Button, Card, DataTable, Badge, StatsCard } from '../ui';
import type { Column } from '../ui/DataTable';
import { DateRangeFilter, type DateRange } from '../filters';
import CollectFromClientModal from '../payments/CollectFromClientModal';
import { useSessionAuthStore } from '../../stores/sessionAuthStore';
import { clientService } from '../../services/clientService';
import { supplierService } from '../../services/supplierService';
import { formatCurrency } from '../../utils';
import { exportReportToExcel, type ReportColumn } from '../../utils/reportExport';
import {
  TYPE_LABEL,
  periodLabelOf,
  statementLinkPath,
  type StatementKind,
  type StatementRow,
} from './statementData';
import { downloadStatementPdf, printStatementA4 } from './statementExport';
import { formatTableDate } from '../../utils/dateUtils';
import { HeaderAction, HeaderDivider } from '../common/HeaderAction';

const BADGE: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error'> = {
  OPENING: 'default',
  SALE: 'primary',
  PURCHASE: 'primary',
  PAYMENT: 'success',
  RETURN: 'warning',
  REFUND: 'error',
};

type Row = StatementRow & { id: number };

/**
 * Customer / supplier statement: the ledger for a period, every row opens what it came from,
 * PDF and A4 print in the invoice template, Excel.
 */
const StatementView: React.FC<{ kind: StatementKind; id: number }> = ({ kind, id }) => {
  const navigate = useNavigate();
  const isClient = kind === 'client';
  const { company } = useSessionAuthStore();
  const companyId = Number(company?.companyId || company?.company?.id) || 0;
  const companyName = company?.name || company?.company?.name || company?.companyName || '';
  const [range, setRange] = useState<DateRange>({ startDate: '', endDate: '' });
  const [collecting, setCollecting] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'print' | 'excel' | null>(null);

  const params = {
    companyId,
    startDate: range.startDate || undefined,
    endDate: range.endDate || undefined,
  };
  const { data: res, isLoading, isFetching, refetch } = useQuery({
    queryKey: [isClient ? 'client-statement' : 'supplier-statement', id, companyId, range.startDate, range.endDate],
    queryFn: (): Promise<{ data?: any }> =>
      isClient ? clientService.getStatement(id, params) : supplierService.getStatement(id, params),
    enabled: !!id && !!companyId,
    staleTime: 60 * 1000,
  });

  const statement: any = res?.data;
  const party = isClient ? statement?.client : statement?.supplier;
  const summary = statement?.summary;
  const rows: Row[] = useMemo(
    () => (statement?.transactions || []).map((t: StatementRow, i: number) => ({ ...t, id: i })),
    [statement]
  );
  const labels = TYPE_LABEL[kind];
  const closing: number = summary ? Number(isClient ? summary.outstandingBalance : summary.closingBalance) : 0;
  const movements = rows.filter(r => r.type !== 'OPENING');
  const totalDebit = movements.reduce((s, r) => s + r.debit, 0);
  const totalCredit = movements.reduce((s, r) => s + r.credit, 0);
  const hasPeriod = !!(range.startDate || range.endDate);
  const exportInput = { kind, statement, startDate: range.startDate, endDate: range.endDate };

  const debitTone = isClient ? 'text-red-600' : 'text-green-600';
  const creditTone = isClient ? 'text-green-600' : 'text-red-600';

  const columns: Column<Row>[] = [
    {
      key: 'date',
      label: 'التاريخ',
      render: t => <span className="whitespace-nowrap text-gray-700">{formatTableDate(t.date)}</span>,
    },
    {
      key: 'type',
      label: 'النوع',
      render: t => (
        <Badge variant={BADGE[t.type] || 'default'}>
          {t.type === 'OPENING' && range.startDate ? 'رصيد سابق' : labels[t.type] || t.type}
        </Badge>
      ),
    },
    {
      key: 'reference',
      label: 'المرجع',
      render: t => {
        const path = statementLinkPath(t.link);
        return (
          <div className="min-w-0">
            {path ? (
              <Link
                to={path}
                className="group inline-flex items-center gap-1 font-medium text-primary-700 hover:text-primary-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
                title="فتح التفاصيل"
              >
                <span>{t.reference}</span>
                <ChevronLeft className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" aria-hidden />
              </Link>
            ) : (
              <span className="text-gray-600">{t.reference}</span>
            )}
            {t.note && <p className="text-xs text-gray-500 mt-0.5">{t.note}</p>}
          </div>
        );
      },
    },
    {
      key: 'debit',
      label: isClient ? 'مدين' : 'مدين (عليه)',
      render: t => (t.debit > 0 ? <span className={`${debitTone} font-medium whitespace-nowrap`}>{formatCurrency(t.debit)}</span> : <span className="text-gray-300">—</span>),
    },
    {
      key: 'credit',
      label: isClient ? 'دائن' : 'دائن (له)',
      render: t => (t.credit > 0 ? <span className={`${creditTone} font-medium whitespace-nowrap`}>{formatCurrency(t.credit)}</span> : <span className="text-gray-300">—</span>),
    },
    {
      key: 'balance',
      label: 'الرصيد',
      render: t => <span className="font-bold text-gray-900 whitespace-nowrap">{formatCurrency(t.balance)}</span>,
    },
  ];

  const run = useCallback(
    async (what: 'pdf' | 'print' | 'excel') => {
      if (!statement) return;
      if (what !== 'print' && rows.length === 0) return toast.error('لا توجد حركات للتصدير');
      setBusy(what);
      try {
        if (what === 'pdf') await downloadStatementPdf(exportInput);
        else if (what === 'print') await printStatementA4(exportInput);
        else {
          const cols: ReportColumn<Row>[] = [
            { header: 'التاريخ', accessor: t => formatTableDate(t.date) },
            { header: 'النوع', accessor: t => (t.type === 'OPENING' && range.startDate ? 'رصيد سابق' : labels[t.type] || t.type) },
            { header: 'المرجع', accessor: t => t.reference },
            { header: 'تفاصيل', accessor: t => t.note || '' },
            { header: isClient ? 'مدين' : 'مدين (عليه)', accessor: t => t.debit, format: 'currency' },
            { header: isClient ? 'دائن' : 'دائن (له)', accessor: t => t.credit, format: 'currency' },
            { header: 'الرصيد', accessor: t => t.balance, format: 'currency' },
          ];
          await exportReportToExcel(rows, cols, {
            title: isClient ? 'كشف حساب عميل' : 'كشف حساب مورد',
            companyName,
            subtitle: party ? `${party.name}${party.phone ? ` — ${party.phone}` : ''} · ${periodLabelOf(range.startDate, range.endDate)}` : undefined,
            fileName: `كشف-حساب-${party?.name || id}`,
            summary: [
              { label: isClient ? (closing < 0 ? 'رصيد دائن للعميل' : 'المستحق على العميل') : 'المستحق للمورد', value: formatCurrency(Math.abs(closing)), emphasis: true },
            ],
          });
        }
      } catch {
        toast.error(what === 'print' ? 'تعذرت الطباعة' : what === 'pdf' ? 'تعذر إنشاء ملف PDF' : 'تعذر تصدير ملف Excel');
      } finally {
        setBusy(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statement, rows, range, party, closing, companyName]
  );

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              onClick={() => navigate(isClient ? '/clients' : '/suppliers')}
              className="text-gray-600 shrink-0"
              aria-label="رجوع"
            >
              <ArrowRight className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{isClient ? 'كشف حساب عميل' : 'كشف حساب مورد'}</h1>
              <p className="text-gray-600 mt-0.5 truncate">{party?.name || '...'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HeaderAction icon={Printer} label="طباعة A4" onClick={() => run('print')} busy={busy === 'print'} disabled={!statement || !!busy} />
            <HeaderAction icon={FileText} label="PDF" onClick={() => run('pdf')} busy={busy === 'pdf'} disabled={!statement || !!busy} />
            <HeaderAction icon={FileSpreadsheet} label="Excel" onClick={() => run('excel')} busy={busy === 'excel'} disabled={!statement || !!busy} />
            <HeaderAction icon={RefreshCw} label="تحديث" onClick={() => refetch()} busy={isFetching} iconOnly />
            {isClient && closing > 0.005 && (
              <>
                <HeaderDivider />
                <HeaderAction icon={HandCoins} label="تحصيل من الحساب" onClick={() => setCollecting(true)} tone="primary" />
              </>
            )}
          </div>
        </div>

        {/* Party + period */}
        <Card padding="lg">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 shrink-0 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center text-white">
                {isClient ? <User className="w-6 h-6" /> : <Truck className="w-6 h-6" />}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-gray-900 text-lg truncate">{party?.name || '...'}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
                  {party?.phone && (
                    <a href={`tel:${party.phone}`} className="flex items-center gap-1 hover:text-primary-700">
                      <Phone className="w-3.5 h-3.5" />
                      <bdi dir="ltr">{party.phone}</bdi>
                    </a>
                  )}
                  {party?.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{party.email}</span>}
                  {party?.address && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{party.address}</span>}
                </div>
              </div>
            </div>
            <div className="w-full md:w-auto">
              <p className="text-xs font-medium text-gray-500 mb-1">الفترة</p>
              <DateRangeFilter value={range} onChange={setRange} size="sm" />
            </div>
          </div>
        </Card>

        {/* Totals of the period */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatsCard
              title={isClient ? 'المبيعات' : 'المشتريات'}
              value={formatCurrency(isClient ? summary.totalSales : summary.totalPurchases)}
              icon={TrendingUp}
              color="primary"
            />
            <StatsCard
              title={isClient ? 'المدفوعات' : 'المدفوع للمورد'}
              value={formatCurrency(summary.totalPayments)}
              icon={Wallet}
              color="success"
            />
            <StatsCard title="المرتجعات" value={formatCurrency(summary.totalReturns)} icon={RotateCcw} color="warning" />
            <StatsCard
              title={isClient ? (closing < 0 ? 'رصيد دائن للعميل' : 'الرصيد المستحق') : closing < 0 ? 'رصيد لنا عند المورد' : 'المستحق للمورد'}
              value={formatCurrency(Math.abs(closing))}
              icon={CreditCard}
              color={closing < 0 ? 'success' : 'danger'}
            />
          </div>
        )}
        {summary && (hasPeriod || Math.abs(summary.openingBalance) > 0.005 || (isClient && summary.remainingCredit !== null)) && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
            <span className="flex items-center gap-1.5 text-gray-600">
              <History className="w-4 h-4 text-gray-400" />
              {hasPeriod ? 'رصيد سابق للفترة' : 'رصيد افتتاحي'}:
              <b className="text-gray-900">{formatCurrency(summary.openingBalance)}</b>
            </span>
            {isClient && summary.totalRefunds > 0 && (
              <span className="text-gray-600">مبالغ رُدّت نقداً: <b className="text-gray-900">{formatCurrency(summary.totalRefunds)}</b></span>
            )}
            {!isClient && summary.totalRefunds > 0 && (
              <span className="text-gray-600">ردّه المورد نقداً: <b className="text-gray-900">{formatCurrency(summary.totalRefunds)}</b></span>
            )}
            {isClient && summary.creditLimit !== null && (
              <span className="text-gray-600">
                حد الائتمان: <b className="text-gray-900">{formatCurrency(summary.creditLimit)}</b>
                <span className="mx-1 text-gray-300">·</span>
                المتاح: <b className={summary.remainingCredit < 0 ? 'text-red-600' : 'text-green-700'}>{formatCurrency(summary.remainingCredit)}</b>
              </span>
            )}
            {hasPeriod && Math.abs(Number(summary.currentBalance) - closing) > 0.005 && (
              <span className="text-gray-600">الرصيد اليوم: <b className="text-gray-900">{formatCurrency(summary.currentBalance)}</b></span>
            )}
          </div>
        )}

        {/* Ledger */}
        <DataTable<Row>
          title="حركة الحساب"
          columns={columns}
          data={rows}
          loading={isLoading}
          showSearch={false}
          showPagination={rows.length > 10}
          emptyMessage={hasPeriod ? 'لا توجد حركات في هذه الفترة' : 'لا توجد حركات على هذا الحساب'}
        />
        {movements.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white">
            <span className="text-gray-300">
              {movements.length} حركة · {isClient ? 'مدين' : 'عليه'} <b className="text-white">{formatCurrency(totalDebit)}</b>
              <span className="mx-1.5 text-gray-500">·</span>
              {isClient ? 'دائن' : 'له'} <b className="text-white">{formatCurrency(totalCredit)}</b>
            </span>
            <span className="font-bold">
              {isClient ? (closing < 0 ? 'رصيد دائن للعميل' : 'المستحق على العميل') : closing < 0 ? 'رصيد لنا عند المورد' : 'المستحق للمورد'}:{' '}
              {formatCurrency(Math.abs(closing))}
            </span>
          </div>
        )}
      </div>
      {isClient && (
        <CollectFromClientModal
          client={collecting && party ? { id, name: party.name, phone: party.phone } : null}
          onClose={() => {
            setCollecting(false);
            refetch();
          }}
          companyId={companyId}
        />
      )}
    </Layout>
  );
};

export default StatementView;
