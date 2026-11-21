/**
 * What the POS asks the server, answered on the PC from the local copy (offline), with the same
 * shapes the server sends. Writes the POS needs at the till (sale, new customer, shift open / close /
 * cash in-out, park a sale) are saved in the local queue; anything else needs the internet.
 *
 * What a pending (not yet sent) action changes is shown on top of the local copy: stock goes down
 * by what was sold, customer balances go up by what was sold on credit, the shift counts the sales.
 */
import { localStore, type OfflineAction } from "./localStore";
import { enqueue, getCatalog, getPending, useOfflineStore, type Catalog } from "./runtime";
import { paymentOf, readScaleBarcode, roundMoney, roundQty, saleTotals, toMoney, type ScaleRead } from "./saleMath";

export class LocalHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface LocalRequest {
  method: string;
  path: string;
  params: Record<string, any>;
  body: any;
  idempotencyKey?: string;
}

export interface LocalReply {
  data: unknown;
  msg?: string;
  status?: number;
}

export const NEEDS_INTERNET = "هذه العملية تحتاج اتصال بالإنترنت. البيع وفتح وإغلاق الوردية وإضافة العملاء متاحة الآن، والباقي عند عودة الاتصال";
const SAVED_ON_PC = "تم الحفظ على هذا الجهاز وسيُرسل تلقائياً عند عودة الإنترنت";

const uuid = () => crypto.randomUUID();
const KEY_FORMAT = /^[A-Za-z0-9_-]{8,64}$/;

type Action = OfflineAction & { view?: any; localId?: number };

function need(): Catalog {
  const c = getCatalog();
  if (!c) throw new LocalHttpError(503, "بيانات المحل غير موجودة على هذا الجهاز بعد. اتصل بالإنترنت مرة واحدة لتنزيلها");
  return c;
}

function sessionUser(): { id: number; fullname: string; role: string; email?: string } {
  try {
    const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
    const u = raw ? JSON.parse(raw) : null;
    if (u?.id) return { id: Number(u.id), fullname: u.fullname || u.name || "", role: u.companyRole || u.role || "CASHIER", email: u.email };
  } catch {
    /* fall through */
  }
  throw new LocalHttpError(401, "سجّل الدخول أولاً");
}

const pending = () => getPending() as Action[];
const contains = (v: unknown, q: string) => String(v ?? "").toLowerCase().includes(q);
const page = <T,>(rows: T[], params: Record<string, any>, defLimit = 10) => {
  const limit = Math.max(1, Number(params.limit) || defLimit);
  const p = Math.max(1, Number(params.page) || 1);
  return { list: rows.slice((p - 1) * limit, p * limit), totalCount: rows.length, filterCount: rows.length };
};

// ---------------------------------------------------------------------------- products

/** pieces sold by pending sales, per product */
function soldPieces() {
  const m = new Map<string, number>();
  for (const a of pending()) {
    if (a.kind !== "sale.create") continue;
    for (const [id, n] of Object.entries((a.view?.pieces ?? {}) as Record<string, number>)) m.set(id, (m.get(id) || 0) + n);
  }
  return m;
}

function productView(p: any, sold: Map<string, number>) {
  const stock = roundQty(toMoney(p.stockQuantity) - (sold.get(p.id) || 0));
  const sell = toMoney(p.sellingPrice);
  return {
    ...p,
    stockQuantity: stock,
    currentStock: stock,
    profitMargin: sell > 0 ? roundMoney(((sell - toMoney(p.purchasePrice)) / sell) * 100) : 0,
  };
}

function productList(req: LocalRequest) {
  const c = need();
  const q = String(req.params.search ?? "").trim().toLowerCase();
  const sold = soldPieces();
  let rows = c.products.map(p => productView(p, sold));
  if (q) rows = rows.filter(p => contains(p.name, q) || contains(p.sku, q) || contains(p.description, q));
  if (req.params.categoryId) rows = rows.filter(p => p.categoryId === req.params.categoryId);
  if (String(req.params.lowStock) === "true") rows = rows.filter(p => p.stockQuantity <= toMoney(p.minStockLevel));
  if (String(req.params.noPrice) === "true") rows = rows.filter(p => !(toMoney(p.sellingPrice) > 0));
  return { data: page(rows, req.params) };
}

function productByBarcode(code: string) {
  const c = need();
  const sold = soldPieces();
  const trimmed = decodeURIComponent(code).trim();
  const exact = c.products.find(p => p.sku === trimmed);
  if (exact) return { data: { success: true, data: productView(exact, sold) } };
  for (const p of c.products) {
    const pack = (p.packs || []).find((k: any) => k.barcode === trimmed);
    if (pack) return { data: { success: true, data: { ...productView(p, sold), pack } } };
  }
  const scan = readScaleBarcode(trimmed, c.company);
  if (scan.ok === false) {
    const reason = (scan as Extract<ScaleRead, { ok: false }>).reason;
    if (reason === "BAD_CHECK_DIGIT") throw new LocalHttpError(400, "ملصق الميزان لم يُقرأ بشكل صحيح (رقم التحقق خطأ). امسحه مرة أخرى");
    if (reason === "ZERO_VALUE") throw new LocalHttpError(400, "ملصق الميزان عليه وزن / سعر صفر");
    return { data: { success: false, error: "المنتج غير موجود" } };
  }
  const read = scan as Extract<ScaleRead, { ok: true }>;
  const product = c.products.find(p => String(p.scaleCode ?? "") === read.plu);
  if (!product) throw new LocalHttpError(400, `كود الميزان ${read.plu} غير مربوط بأي منتج. أضفه في بيانات المنتج (كود الميزان)`);
  if (!product.allowDecimalQty) throw new LocalHttpError(400, `المنتج "${product.name}" ليس مبيعاً بالوزن، فلا يمكن بيعه بملصق الميزان`);
  const price = toMoney(product.sellingPrice);
  let quantity: number;
  if (read.mode === "WEIGHT") quantity = read.value;
  else {
    if (!(price > 0)) throw new LocalHttpError(400, `المنتج "${product.name}" ليس له سعر بيع لحساب الكمية من سعر الملصق`);
    quantity = Math.round((read.value / price) * 1000) / 1000;
    if (quantity <= 0) throw new LocalHttpError(400, "سعر الملصق أقل من أن يعطي كمية");
  }
  const { packs: _packs, ...rest } = productView(product, sold);
  return {
    data: { success: true, data: { ...rest, scale: { mode: read.mode, plu: read.plu, quantity, ...(read.mode === "PRICE" ? { labelPrice: read.value } : { weight: read.value }) } } },
  };
}

function productSingle(id: string) {
  const c = need();
  const p = c.products.find(x => x.id === id);
  if (!p) throw new LocalHttpError(404, "المنتج غير موجود");
  return { data: { ...productView(p, soldPieces()), company: { id: c.company.id, name: c.company.name } } };
}

// ---------------------------------------------------------------------------- customers

/** customers added on this PC that the server does not have yet (their action is still waiting) */
async function localClients() {
  const c = need();
  const known = new Set(c.clients.map(x => x.syncId).filter(Boolean));
  const waiting = new Set(pending().filter(a => a.kind === "client.create").map(a => a.id));
  const rows = (await localStore!.kvList<any>("localClient")).filter(x => waiting.has(x.actionId) && !known.has(x.actionId));
  return rows.sort((a, b) => b.id - a.id);
}

/** what pending sales added to a customer's debt */
function pendingDebt(clientId: number) {
  return roundMoney(pending().filter(a => a.kind === "sale.create" && a.view?.clientId === clientId).reduce((s, a) => s + (a.view?.unpaid || 0), 0));
}

function clientView(cl: any, lists: any[]) {
  return {
    id: cl.id,
    name: cl.name,
    email: cl.email ?? null,
    phone: cl.phone ?? null,
    address: cl.address ?? null,
    priceListId: cl.priceListId ?? null,
    priceList: cl.priceListId ? lists.find(l => l.id === cl.priceListId) ?? null : null,
    createdAt: cl.createdAt,
    updatedAt: cl.updatedAt ?? cl.createdAt,
    _count: { sales: 0 },
    ...(cl.offline && { offline: true }),
  };
}

async function clientList(req: LocalRequest) {
  const c = need();
  const q = String(req.params.search ?? "").trim().toLowerCase();
  let rows = [...(await localClients()), ...c.clients];
  if (q) rows = rows.filter(x => contains(x.name, q) || contains(x.phone, q) || contains(x.email, q));
  return { data: page(rows.map(x => clientView(x, c.priceLists)), req.params) };
}

async function findClient(id: number) {
  const c = need();
  if (id < 0) return (await localStore!.kvList<any>("localClient")).find(x => x.id === id) ?? null;
  return c.clients.find(x => x.id === id) ?? null;
}

async function clientSingle(id: number) {
  const c = need();
  const cl = await findClient(id);
  if (!cl) throw new LocalHttpError(404, "العميل غير موجود");
  return {
    data: {
      ...clientView(cl, c.priceLists),
      companyId: c.company.id,
      creditLimit: cl.creditLimit ?? null,
      openingBalance: toMoney(cl.openingBalance),
      outstandingBalance: roundMoney(toMoney(cl.outstandingBalance) + pendingDebt(id)),
    },
  };
}

async function clientCreate(req: LocalRequest) {
  const c = need();
  const name = String(req.body?.name ?? "").trim();
  if (!name) throw new LocalHttpError(400, "اسم العميل مطلوب");
  // same name as a customer the shop already has: use that customer (the server would link them too)
  const same = [...(await localClients()), ...c.clients].find(x => String(x.name).trim().toLowerCase() === name.toLowerCase());
  if (same) return { data: clientView(same, c.priceLists), msg: "العميل موجود بالفعل، تم اختياره" };
  const user = sessionUser();
  const localId = -(await localStore!.nextSeq("localClient"));
  const actionId = uuid();
  const now = new Date().toISOString();
  const row = { id: localId, actionId, name, email: req.body.email || null, phone: req.body.phone || null, address: req.body.address || null, priceListId: req.body.priceListId || null, creditLimit: null, openingBalance: 0, outstandingBalance: 0, createdAt: now, offline: true };
  // syncId lets the server (and this PC) recognise the customer if the action is ever sent twice
  const action: Action = { id: actionId, kind: "client.create", userId: user.id, at: now, payload: { ...req.body, syncId: actionId }, localId };
  await enqueue(action, [{ ns: "localClient", id: String(localId), data: row }]);
  return { data: clientView(row, c.priceLists), msg: SAVED_ON_PC, status: 201 };
}

// ---------------------------------------------------------------------------- price lists, taxes, categories

const priceLists = () => ({ data: need().priceLists.map(l => ({ ...l, active: true, sortOrder: 0, _count: { prices: Object.keys(need().prices[l.id] || {}).length, clients: 0 } })) });

function listPrices(id: string) {
  const c = need();
  const list = c.priceLists.find(l => l.id === id);
  if (!list) throw new LocalHttpError(400, "قائمة الأسعار غير موجودة");
  return { data: { priceList: list, prices: c.prices[id] || {} } };
}

const activeTaxes = () => ({ data: need().taxes });

function categories() {
  const c = need();
  const counts = new Map<string, number>();
  for (const p of c.products) counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
  const list = c.categories.map(k => ({ ...k, _count: { products: counts.get(k.id) || 0 } }));
  return { data: { list, totalCount: list.length, filterCount: list.length } };
}

// ---------------------------------------------------------------------------- shifts

function duration(start: string) {
  const diff = Math.max(0, Date.now() - new Date(start).getTime());
  return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`;
}

/** the user's open shift: the cloud's, or one opened on this PC, minus one closed on this PC */
function currentShift(userId: number): any | null {
  const c = need();
  let shift: any = c.openShifts.find(s => s.userId === userId) ?? null;
  for (const a of pending()) {
    if (a.kind === "shift.open" && a.userId === userId) shift = a.view?.shift ?? null;
    if (a.kind === "shift.close" && shift && a.payload.shiftId === shift.id) shift = null;
  }
  return shift;
}

/** every open shift in the shop as this PC knows it (cloud's, plus opened / minus closed here) */
function openShifts(): any[] {
  const c = need();
  let shifts: any[] = [...c.openShifts];
  for (const a of pending()) {
    if (a.kind === "shift.open" && a.view?.shift) shifts = [...shifts.filter(s => s.userId !== a.userId), a.view.shift];
    if (a.kind === "shift.close") shifts = shifts.filter(s => s.id !== a.payload.shiftId);
  }
  return shifts;
}

function registerList() {
  const shifts = openShifts();
  const now = new Date().toISOString();
  return {
    data: {
      cashRegisters: need().registers.map(r => ({
        ...r, companyId: need().company.id, isActive: true, description: null, serialNumber: null, createdAt: now, updatedAt: now,
        shifts: shifts.filter(s => s.registerId === r.id).map(s => ({ id: s.id, userId: s.userId, status: "OPEN", startTime: s.startTime, user: s.user })),
      })),
    },
  };
}

function shiftList(req: LocalRequest) {
  const status = req.params.status;
  const rows = status === "CLOSED" ? [] : openShifts().map(({ summary: _s, ...s }) => ({ ...s, sales: [], cashMovements: [] }));
  const { list, totalCount } = page(rows, req.params);
  const limit = Math.max(1, Number(req.params.limit) || 10);
  return { data: { shifts: list, pagination: { page: Number(req.params.page) || 1, limit, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / limit)) } } };
}

function shiftSummary(shift: any) {
  const base = shift.summary ?? { openingBalance: toMoney(shift.openingBalance), totalSales: 0, totalSalesAmount: 0, cashSales: 0, salesByPaymentMethod: {}, cashMovements: { count: 0, cashIn: 0, cashOut: 0, net: 0 } };
  const byMethod: Record<string, { count: number; total: number }> = JSON.parse(JSON.stringify(base.salesByPaymentMethod || {}));
  const add = (m: string, amount: number) => {
    byMethod[m] = byMethod[m] || { count: 0, total: 0 };
    byMethod[m].count++;
    byMethod[m].total = roundMoney(byMethod[m].total + amount);
  };
  let count = base.totalSales, amount = base.totalSalesAmount, cash = base.cashSales;
  let { cashIn, cashOut, count: moves } = base.cashMovements;
  const localMoves: any[] = [];
  for (const a of pending()) {
    if (a.kind === "sale.create" && a.view?.shiftId === shift.id) {
      count++;
      amount = roundMoney(amount + a.view.total);
      cash = roundMoney(cash + a.view.cash);
      for (const p of a.view.parts || []) add(p.method, p.amount);
      if (a.view.unpaid > 0.01) add("CREDIT", a.view.unpaid);
    }
    if (a.kind === "shift.cash" && a.payload.shiftId === shift.id) {
      moves++;
      const n = toMoney(a.payload.amount);
      if (["CASH_IN", "CASH_CORRECTION"].includes(a.payload.type)) cashIn += n;
      else cashOut += n;
      localMoves.push(a.view?.cashMovement);
    }
  }
  const opening = toMoney(base.openingBalance);
  return {
    summary: {
      openingBalance: opening,
      totalSales: count,
      totalSalesAmount: amount,
      cashSales: cash,
      salesByPaymentMethod: byMethod,
      cashMovements: { count: moves, cashIn, cashOut, net: cashIn - cashOut },
      expectedCash: roundMoney(opening + cash + cashIn - cashOut),
      actualCash: null,
      variance: null,
      duration: duration(shift.startTime),
    },
    localMoves,
  };
}

function shiftCurrent() {
  const shift = currentShift(sessionUser().id);
  if (!shift) return { data: { hasOpenShift: false, shift: null, summary: null } };
  const { summary, localMoves } = shiftSummary(shift);
  const { summary: _s, ...plain } = shift;
  return { data: { hasOpenShift: true, shift: { ...plain, sales: [], cashMovements: [...localMoves.filter(Boolean).reverse(), ...(plain.cashMovements || [])] }, summary } };
}

async function shiftOpen(req: LocalRequest) {
  const c = need();
  const user = sessionUser();
  if (currentShift(user.id)) throw new LocalHttpError(400, "لديك وردية مفتوحة بالفعل. أغلقها قبل فتح وردية جديدة");
  const register = c.registers.find(r => r.id === req.body?.registerId);
  if (!register) throw new LocalHttpError(400, "اختر الخزينة");
  const openingBalance = toMoney(req.body.openingBalance);
  if (openingBalance < 0) throw new LocalHttpError(400, "رصيد البداية لا يمكن أن يكون سالباً");
  const now = new Date().toISOString();
  const shiftId = uuid();
  const shift = {
    id: shiftId, registerId: register.id, userId: user.id, companyId: c.company.id, openingBalance, closingBalance: null, expectedCash: null, actualCash: null, variance: null,
    status: "OPEN", startTime: now, endTime: null, notes: req.body.notes || null, closingNotes: null, createdAt: now, updatedAt: now, deletedAt: null,
    register: { id: register.id, name: register.name, location: register.location ?? null, description: null },
    user: { id: user.id, fullname: user.fullname, email: user.email ?? "" },
    cashMovements: [], offline: true,
  };
  await enqueue({ id: uuid(), kind: "shift.open", userId: user.id, at: now, payload: { shiftId, registerId: register.id, openingBalance, notes: req.body.notes || undefined }, view: { shift } } as Action);
  return { data: { message: "Shift opened successfully", shift }, msg: SAVED_ON_PC, status: 201 };
}

async function shiftClose(req: LocalRequest, id: string) {
  const user = sessionUser();
  const shift = currentShift(user.id);
  if (!shift || shift.id !== id) throw new LocalHttpError(400, "الوردية غير مفتوحة على هذا الجهاز");
  const actualCash = toMoney(req.body?.actualCash);
  const { summary } = shiftSummary(shift);
  const variance = roundMoney(actualCash - summary.expectedCash);
  const now = new Date().toISOString();
  await enqueue({ id: uuid(), kind: "shift.close", userId: user.id, at: now, payload: { shiftId: id, actualCash, closingNotes: req.body.closingNotes || undefined } });
  void localStore!.backupNow("shift").catch(() => undefined);
  const { summary: _s, ...plain } = shift;
  return {
    data: {
      message: "Shift closed successfully",
      shift: { ...plain, status: "CLOSED", endTime: now, closingBalance: actualCash, actualCash, expectedCash: summary.expectedCash, variance, closingNotes: req.body.closingNotes || null },
      summary: { openingBalance: summary.openingBalance, totalSales: summary.totalSales, cashSales: summary.cashSales, cashMovements: summary.cashMovements.net, expectedCash: summary.expectedCash, actualCash, variance, duration: summary.duration },
    },
    msg: SAVED_ON_PC,
  };
}

const MOVE_TYPES = ["CASH_IN", "CASH_OUT", "PAYOUT", "BANK_DEPOSIT", "PETTY_CASH", "CASH_CORRECTION"];

async function cashMovement(req: LocalRequest) {
  const user = sessionUser();
  const b = req.body || {};
  const shift = currentShift(user.id);
  if (!shift || shift.id !== b.shiftId) throw new LocalHttpError(400, "الوردية غير مفتوحة على هذا الجهاز");
  const amount = toMoney(b.amount);
  if (!(amount > 0)) throw new LocalHttpError(400, "المبلغ يجب أن يكون أكبر من صفر");
  if (!MOVE_TYPES.includes(b.type)) throw new LocalHttpError(400, "نوع الحركة غير صحيح");
  if (!String(b.reason ?? "").trim()) throw new LocalHttpError(400, "السبب مطلوب");
  const now = new Date().toISOString();
  const movementId = uuid();
  const cashMovement = { id: movementId, shiftId: shift.id, companyId: need().company.id, amount, type: b.type, reason: b.reason, reference: b.reference ?? null, performedBy: user.id, notes: b.notes ?? null, createdAt: now, user: { id: user.id, fullname: user.fullname }, offline: true };
  await enqueue({ id: uuid(), kind: "shift.cash", userId: user.id, at: now, payload: { movementId, shiftId: shift.id, amount, type: b.type, reason: b.reason, reference: b.reference, notes: b.notes }, view: { cashMovement } } as Action);
  return { data: { message: "Cash movement recorded successfully", cashMovement }, msg: SAVED_ON_PC, status: 201 };
}

// ---------------------------------------------------------------------------- sales

async function saleCreate(req: LocalRequest) {
  const c = need();
  const user = sessionUser();
  const device = useOfflineStore.getState().device;
  if (!device) throw new LocalHttpError(503, NEEDS_INTERNET);
  const body = req.body || {};
  const id = req.idempotencyKey && KEY_FORMAT.test(req.idempotencyKey) ? req.idempotencyKey : uuid();

  // the same sale sent again (automatic retry): the first answer
  const earlier = pending().find(a => a.id === id);
  if (earlier?.view?.response) return { data: earlier.view.response, msg: SAVED_ON_PC, status: 201 };

  const items: any[] = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new LocalHttpError(400, "أضف منتجاً واحداً على الأقل");
  const pieces: Record<string, number> = {};
  for (const it of items) {
    const p = c.products.find(x => x.id === String(it.productId));
    if (!p) throw new LocalHttpError(400, "منتج في الفاتورة غير موجود في بيانات هذا الجهاز. احذفه من الفاتورة أو انتظر عودة الإنترنت");
    const q = Number(it.quantity);
    if (!(q > 0)) throw new LocalHttpError(400, `الكمية غير صحيحة للمنتج "${p.name}"`);
    if (!p.allowDecimalQty && !it.packId && !Number.isInteger(q)) throw new LocalHttpError(400, `المنتج "${p.name}" يباع بالقطعة فقط`);
    const pack = it.packId ? (p.packs || []).find((k: any) => k.id === it.packId) : null;
    if (it.packId && !pack) throw new LocalHttpError(400, `العبوة المختارة للمنتج "${p.name}" غير موجودة`);
    pieces[p.id] = roundQty((pieces[p.id] || 0) + q * (pack ? Number(pack.factor) : 1));
  }

  let taxRate: number | null = null;
  if (body.taxSettingId) {
    const tax = c.taxes.find(t => t.id === body.taxSettingId);
    if (!tax) throw new LocalHttpError(400, "الضريبة المختارة غير موجودة");
    taxRate = toMoney(tax.rate);
  }
  const totals = saleTotals({ items: items.map(i => ({ quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })), discountAmount: body.discountAmount, discountPercent: body.discountPercent, taxRate, additionalFee: body.additionalFee });
  const pay = paymentOf(body, totals.grandTotal);
  if (pay.paidAmount < 0) throw new LocalHttpError(400, "المبلغ المدفوع لا يمكن أن يكون سالباً");
  if (pay.paidAmount > totals.grandTotal + 0.01) throw new LocalHttpError(400, `المبلغ المدفوع (${pay.paidAmount}) أكبر من إجمالي الفاتورة (${totals.grandTotal})`);

  const clientId = body.clientId ? Number(body.clientId) : null;
  const client = clientId ? await findClient(clientId) : null;
  if (clientId && !client) throw new LocalHttpError(400, "العميل غير موجود");
  if (pay.unpaid > 0.01 && !client) throw new LocalHttpError(400, "البيع الآجل يتطلب اختيار عميل أو إضافة عميل جديد");

  const year = new Date().getFullYear();
  const seq = await localStore!.nextSeq(`receipt-${year}`);
  const receiptNumber = `${device.code}-${year}-${String(seq).padStart(6, "0")}`;
  const shift = currentShift(user.id);
  const at = new Date().toISOString();

  const payload = { ...body };
  let clientActionId: string | undefined;
  if (clientId && clientId < 0) {
    delete payload.clientId;
    clientActionId = client.actionId;
  }

  const response = {
    id,
    receiptNumber,
    companyId: c.company.id,
    clientId,
    client: client ? { id: client.id, name: client.name, phone: client.phone ?? null } : null,
    userId: user.id,
    user: { id: user.id, fullname: user.fullname },
    shiftId: shift?.id ?? null,
    saleDate: at,
    createdAt: at,
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount > 0 ? totals.discountAmount : null,
    discountPercent: body.discountPercent ? roundMoney(body.discountPercent) : null,
    taxSettingId: body.taxSettingId || null,
    taxRate: totals.taxRate,
    taxAmount: totals.taxAmount > 0 ? totals.taxAmount : null,
    additionalFee: totals.additionalFee,
    additionalFeeLabel: body.additionalFeeLabel || null,
    totalAmount: totals.grandTotal,
    paidAmount: pay.paidAmount,
    paymentMethod: pay.paymentMethod,
    paymentStatus: pay.paymentStatus,
    priceListId: body.priceListId || null,
    checkoutParts: pay.parts,
    offline: true,
  };
  const action: Action = {
    id,
    kind: "sale.create",
    userId: user.id,
    at,
    receiptNumber,
    payload,
    ...(clientActionId && { clientActionId }),
    view: { pieces, clientId, unpaid: pay.unpaid, total: totals.grandTotal, cash: pay.cash, parts: pay.parts, shiftId: shift?.id ?? null, response },
  };
  await enqueue(action);
  return { data: response, msg: SAVED_ON_PC, status: 201 };
}

// ---------------------------------------------------------------------------- parked sales (on this PC)

export const isLocalHeldId = (id: string) => id.startsWith("local-");

async function heldRows(companyId: number) {
  return (await localStore!.kvList<any>("held")).filter(r => r.companyId === companyId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function localHeldList(companyId: number) {
  return (await heldRows(companyId)).map(({ request: _r, companyId: _c, ...row }) => row);
}

async function heldNew(req: LocalRequest) {
  const user = sessionUser();
  const b = req.body || {};
  if (!Array.isArray(b.items) || !b.items.length) throw new LocalHttpError(400, "لا توجد أصناف لتعليقها");
  const client = b.clientId ? await findClient(Number(b.clientId)) : null;
  const row = {
    id: `local-${uuid()}`,
    companyId: Number(b.companyId),
    label: b.label || null,
    itemsCount: b.items.length,
    total: toMoney(b.total ?? saleTotals({ items: b.items.map((i: any) => ({ quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) || 0 })) }).grandTotal),
    createdAt: new Date().toISOString(),
    priceListId: b.priceListId || null,
    user: { id: user.id, fullname: user.fullname },
    client: client ? { id: client.id, name: client.name, phone: client.phone ?? undefined } : null,
    onThisPc: true,
    request: b,
  };
  await localStore!.kvPut("held", row.id, row);
  const { request: _r, companyId: _c, ...out } = row;
  return { data: out, msg: "تم تعليق الفاتورة على هذا الجهاز", status: 201 };
}

async function heldResume(id: string) {
  const row = await localStore!.kvGet<any>("held", id);
  if (!row) throw new LocalHttpError(404, "الفاتورة المعلقة غير موجودة");
  const c = getCatalog();
  const b = row.request;
  const sold = soldPieces();
  const listPricesMap = b.priceListId && c?.prices[b.priceListId];
  const removed: string[] = [];
  const items = [];
  for (const it of b.items) {
    const p = c?.products.find(x => x.id === it.productId);
    if (!p) {
      removed.push(it.name || it.productId);
      continue;
    }
    const pack = it.packId ? (p.packs || []).find((k: any) => k.id === it.packId) : null;
    if (it.packId && !pack) {
      removed.push(`${p.name}`);
      continue;
    }
    const base = pack ? toMoney(pack.sellingPrice) : toMoney(listPricesMap?.[p.id] ?? p.sellingPrice);
    const held = toMoney(it.unitPrice ?? base);
    const view = productView(p, sold);
    items.push({
      productId: p.id, productName: p.name, sku: p.sku, stockQuantity: view.stockQuantity, unit: p.unit, allowDecimalQty: p.allowDecimalQty,
      quantity: Number(it.quantity), heldPrice: held, unitPrice: it.negotiated ? held : base, basePrice: base, priceChanged: Math.abs(held - base) > 0.001,
      ...(it.negotiated && { negotiated: true }),
      ...(pack && { pack: { id: pack.id, name: pack.name, factor: Number(pack.factor), sellingPrice: toMoney(pack.sellingPrice) } }),
    });
  }
  await localStore!.kvPut("held", id, null);
  const client = b.clientId ? await findClient(Number(b.clientId)) : null;
  return {
    data: {
      id, label: row.label, createdAt: row.createdAt, priceListId: b.priceListId || null, items, removed,
      client: client ? { id: client.id, name: client.name, phone: client.phone ?? undefined, priceListId: client.priceListId ?? null } : null,
      discountType: b.discountType, discountAmount: b.discountAmount, discountPercent: b.discountPercent, taxSettingId: b.taxSettingId, additionalFee: b.additionalFee, additionalFeeLabel: b.additionalFeeLabel,
    },
  };
}

async function heldDelete(id: string) {
  await localStore!.kvPut("held", id, null);
  return { data: { id } };
}

// ---------------------------------------------------------------------------- routing

type Handler = (req: LocalRequest, m: RegExpMatchArray) => LocalReply | Promise<LocalReply>;

const ROUTES: [string, RegExp, Handler][] = [
  ["GET", /^\/product\/list$/, req => productList(req)],
  ["GET", /^\/product\/barcode\/(.+)$/, (_r, m) => productByBarcode(m[1])],
  ["GET", /^\/product\/single\/([^/]+)$/, (_r, m) => productSingle(m[1])],
  ["GET", /^\/client\/list$/, req => clientList(req)],
  ["GET", /^\/client\/single\/(-?\d+)$/, (_r, m) => clientSingle(Number(m[1]))],
  ["POST", /^\/client\/new$/, req => clientCreate(req)],
  ["GET", /^\/price-list\/list$/, () => priceLists()],
  ["GET", /^\/price-list\/single\/([^/]+)\/prices$/, (_r, m) => listPrices(m[1])],
  ["GET", /^\/tax\/active\/\d+$/, () => activeTaxes()],
  ["GET", /^\/company\/profile\/\d+$/, () => ({ data: { id: need().company.id, name: need().company.name } })],
  ["POST", /^\/category\/list$/, () => categories()],
  ["GET", /^\/shift\/current$/, () => shiftCurrent()],
  ["GET", /^\/shift\/list$/, req => shiftList(req)],
  ["GET", /^\/cash-register\/list$/, () => registerList()],
  ["POST", /^\/shift\/new$/, req => shiftOpen(req)],
  ["PUT", /^\/shift\/close\/([^/]+)$/, (req, m) => shiftClose(req, m[1])],
  ["POST", /^\/shift\/cash-movement$/, req => cashMovement(req)],
  ["POST", /^\/sale\/new$/, req => saleCreate(req)],
  ["GET", /^\/held-sale\/list$/, async req => ({ data: { list: await localHeldList(Number(req.params.companyId)), maxAgeDays: 7 } })],
  ["POST", /^\/held-sale\/new$/, req => heldNew(req)],
  ["POST", /^\/held-sale\/resume\/(local-[^/]+)$/, (_r, m) => heldResume(m[1])],
  ["DELETE", /^\/held-sale\/single\/(local-[^/]+)$/, (_r, m) => heldDelete(m[1])],
];

/** cached server answers are preferred for these (exact shape), the local copy is the fallback */
export const PREFER_CACHE = [/^\/price-list\/list$/, /^\/tax\/active\/\d+$/, /^\/category\/list$/, /^\/company\/profile\/\d+$/];

export function findRoute(req: LocalRequest): ((req: LocalRequest) => LocalReply | Promise<LocalReply>) | null {
  for (const [method, re, h] of ROUTES) {
    if (method !== req.method) continue;
    const m = req.path.match(re);
    if (m) return (r: LocalRequest) => h(r, m);
  }
  return null;
}

/** writes that can be answered here when the server cannot be reached */
export const isQueueableWrite = (req: LocalRequest) => req.method !== "GET" && !!findRoute(req);
