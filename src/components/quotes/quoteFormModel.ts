/**
 * The quote form's state and how it maps to / from the API. Shared by create and edit.
 */
import type { Quote, QuoteFormRequest, QuoteLineRequest, QuoteTerm } from "../../types";
import { normalizeDigits, parseQty, qtyTimes, toQty } from "../../utils/quantity";
import { calcQuote, type QuoteDiscountType } from "../../utils/quoteCalc";

export interface FormPack {
  id: string;
  name: string;
  factor: number;
  sellingPrice: number;
}

export interface FormLine {
  key: string;
  custom: boolean;
  productId?: string;
  name: string;
  sku?: string;
  unit: string;
  allowDecimalQty: boolean;
  packs: FormPack[];
  /** "" = by the piece */
  packId: string;
  qty: string;
  /** typed price (per pack for a pack line); used only when priceTouched */
  price: string;
  priceTouched: boolean;
  /** edit: once prices load, a price equal to the list price is not "typed" */
  checkTouched?: boolean;
  discount: string;
  description: string;
  showDetails: boolean;
  /** custom line: cost of one unit */
  cost: string;
  /** product: cost of one piece */
  pieceCost: number;
  /** product: base selling price (the price list works from it) */
  basePrice: number;
  stock: number;
}

export interface QuoteFormState {
  customerMode: "client" | "manual";
  clientId: number | null;
  clientLabel: string;
  customerName: string;
  customerContact: string;
  customerEmail: string;
  subject: string;
  priceListId: string;
  validUntil: string;
  taxSettingId: string;
  discountType: "" | QuoteDiscountType;
  discountValue: string;
  additionalFee: string;
  additionalFeeLabel: string;
  notes: string;
  terms: QuoteTerm[];
  lines: FormLine[];
}

let seq = 0;
export const newKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export const isoDateIn = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const TERMS_KEY = "sellx.quoteTerms";
/** The terms of the last saved quote on this device: a new quote starts with them */
export function lastTerms(): QuoteTerm[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TERMS_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter(t => t?.label && t?.value).slice(0, 15) : [];
  } catch {
    return [];
  }
}
export function rememberTerms(terms: QuoteTerm[]) {
  try {
    localStorage.setItem(TERMS_KEY, JSON.stringify(terms));
  } catch {
    /* private mode */
  }
}

export const num = (text: string) => Number(normalizeDigits(String(text ?? "")).trim());

export function emptyForm(): QuoteFormState {
  return {
    customerMode: "manual",
    clientId: null,
    clientLabel: "",
    customerName: "",
    customerContact: "",
    customerEmail: "",
    subject: "",
    priceListId: "",
    validUntil: isoDateIn(14),
    taxSettingId: "",
    discountType: "",
    discountValue: "",
    additionalFee: "",
    additionalFeeLabel: "",
    notes: "",
    terms: lastTerms(),
    lines: [],
  };
}

export function productLine(product: any, opts: { pack?: FormPack | null; quantity?: number } = {}): FormLine {
  const packs: FormPack[] = (product.packs || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    factor: Number(p.factor),
    sellingPrice: Number(p.sellingPrice),
  }));
  return {
    key: newKey(),
    custom: false,
    productId: String(product.id),
    name: product.name,
    sku: product.sku,
    unit: (product.unit || "").trim(),
    allowDecimalQty: !!product.allowDecimalQty,
    packs,
    packId: opts.pack?.id || "",
    qty: String(opts.quantity ?? 1),
    price: "",
    priceTouched: false,
    discount: "",
    description: "",
    showDetails: false,
    cost: "",
    pieceCost: Number(product.purchasePrice) || 0,
    basePrice: Number(product.sellingPrice) || 0,
    stock: Number(product.currentStock ?? product.stockQuantity ?? 0),
  };
}

export function customLine(name = ""): FormLine {
  return {
    key: newKey(),
    custom: true,
    name,
    unit: "",
    allowDecimalQty: true,
    packs: [],
    packId: "",
    qty: "1",
    price: "",
    priceTouched: true,
    discount: "",
    description: "",
    showDetails: false,
    cost: "",
    pieceCost: 0,
    basePrice: 0,
    stock: 0,
  };
}

export const packOf = (line: FormLine) => (line.packId ? line.packs.find(p => p.id === line.packId) || null : null);

/** The price the line shows: typed, else the pack's / price list's */
export function linePrice(line: FormLine, priceFor: (id: string, base: number) => number): number {
  if (line.custom || line.priceTouched) return num(line.price) || 0;
  const pack = packOf(line);
  return pack ? pack.sellingPrice : priceFor(line.productId!, line.basePrice);
}

/** Quantity as typed, or null when it is not valid for the line */
export function lineQty(line: FormLine): number | null {
  const q = parseQty(line.qty, { allowDecimalQty: line.packId ? false : line.allowDecimalQty });
  return q !== null && q > 0 ? q : null;
}

export function linePieces(line: FormLine): number {
  const q = lineQty(line) ?? 0;
  const pack = packOf(line);
  return pack ? toQty(q * pack.factor) : q;
}

export function totalsOf(form: QuoteFormState, priceFor: (id: string, base: number) => number, taxPercent: number) {
  return calcQuote(
    form.lines.map(l => {
      const qty = lineQty(l) ?? 0;
      return {
        qty,
        price: linePrice(l, priceFor),
        discountPercent: Math.min(100, Math.max(0, num(l.discount) || 0)),
        cost: l.custom ? qtyTimes(qty, num(l.cost) || 0) : qtyTimes(linePieces(l), l.pieceCost),
      };
    }),
    {
      discountType: form.discountType || null,
      discountValue: num(form.discountValue) || 0,
      taxPercent,
      additionalFee: num(form.additionalFee) || 0,
    }
  );
}

/** Problems that stop saving: per line (by key) and for the form */
export function validate(form: QuoteFormState, priceFor: (id: string, base: number) => number) {
  const lineErrors: Record<string, string> = {};
  const errors: Record<string, string> = {};
  if (form.customerMode === "client" && !form.clientId) errors.customer = "اختر العميل";
  if (form.customerMode === "manual" && !form.customerName.trim()) errors.customer = "اكتب اسم العميل";
  if (!form.lines.length) errors.lines = "أضف بنداً واحداً على الأقل";
  for (const l of form.lines) {
    if (l.custom && !l.name.trim()) lineErrors[l.key] = "اكتب اسم البند";
    else if (lineQty(l) === null)
      lineErrors[l.key] = l.packId ? "عدد العبوات رقم صحيح" : l.allowDecimalQty ? "كمية غير صحيحة (حتى 3 أرقام عشرية)" : "الكمية رقم صحيح أكبر من صفر";
    else if ((l.custom || l.priceTouched) && (l.price.trim() === "" || !(num(l.price) >= 0)))
      lineErrors[l.key] = "اكتب السعر";
    else if (!l.custom && !l.priceTouched && !(linePrice(l, priceFor) > 0)) lineErrors[l.key] = "المنتج بدون سعر: اكتب سعره";
    else if (l.discount.trim() && !(num(l.discount) >= 0 && num(l.discount) <= 100)) lineErrors[l.key] = "الخصم من 0 إلى 100%";
    else if (l.custom && l.cost.trim() && !(num(l.cost) >= 0)) lineErrors[l.key] = "التكلفة رقم";
  }
  if (form.discountType && form.discountValue.trim() && !(num(form.discountValue) >= 0)) errors.discount = "الخصم رقم";
  if (form.discountType === "PERCENT" && num(form.discountValue) > 100) errors.discount = "الخصم حتى 100%";
  if (form.additionalFee.trim() && !(num(form.additionalFee) >= 0)) errors.fee = "المبلغ رقم";
  return { lineErrors, errors, ok: !Object.keys(lineErrors).length && !Object.keys(errors).length };
}

export function toRequest(form: QuoteFormState, companyId: number): QuoteFormRequest {
  const items: QuoteLineRequest[] = form.lines.map(l => {
    const discountPercent = num(l.discount) || 0;
    const description = l.description.trim() || undefined;
    if (l.custom) {
      return {
        custom: true,
        name: l.name.trim(),
        description,
        unit: l.unit.trim() || undefined,
        quantity: lineQty(l)!,
        unitPrice: num(l.price) || 0,
        costPrice: num(l.cost) || 0,
        discountPercent,
      };
    }
    return {
      productId: l.productId!,
      ...(l.packId && { packId: l.packId }),
      quantity: lineQty(l)!,
      ...(l.priceTouched && { unitPrice: num(l.price) || 0 }),
      discountPercent,
      description,
    };
  });
  const terms = form.terms.map(t => ({ label: t.label.trim(), value: t.value.trim() })).filter(t => t.label && t.value);
  const fee = num(form.additionalFee) || 0;
  return {
    companyId,
    ...(form.customerMode === "client" && form.clientId ? { clientId: form.clientId } : {}),
    customerName: form.customerName.trim() || undefined,
    customerContact: form.customerContact.trim() || undefined,
    customerEmail: form.customerEmail.trim() || undefined,
    subject: form.subject.trim() || undefined,
    ...(form.priceListId && { priceListId: form.priceListId }),
    ...(form.taxSettingId && { taxSettingId: form.taxSettingId }),
    ...(form.discountType && num(form.discountValue) > 0 && { discountType: form.discountType, discountValue: num(form.discountValue) }),
    additionalFee: fee,
    additionalFeeLabel: fee > 0 ? form.additionalFeeLabel.trim() || undefined : undefined,
    notes: form.notes.trim() || undefined,
    validUntil: form.validUntil || undefined,
    terms,
    items,
  };
}

/** A saved quote back into the form (edit) */
export function fromQuote(q: Quote): QuoteFormState {
  const lines: FormLine[] = (q.items || []).map(item => {
    if (!item.productId) {
      return {
        ...customLine(item.productName),
        unit: item.unit || "",
        qty: String(Number(item.quantity)),
        price: String(Number(item.unitPrice)),
        discount: item.discountPercent ? String(item.discountPercent) : "",
        description: item.description || "",
        showDetails: !!item.description || !!item.costPrice,
        cost: item.costPrice ? String(item.costPrice) : "",
      };
    }
    const p: any = item.product || {};
    const base = productLine({ ...p, id: item.productId, name: p.name || item.productName, sku: p.sku || item.productSku });
    // a pack removed from the product since: keep the line as it was quoted
    if (item.packId && item.packFactor && !base.packs.some(pk => pk.id === item.packId)) {
      base.packs.push({ id: item.packId, name: item.packName || "عبوة", factor: Number(item.packFactor), sellingPrice: Number(item.packPrice) || 0 });
    }
    const isPack = !!item.packId && base.packs.some(pk => pk.id === item.packId);
    return {
      ...base,
      packId: isPack ? item.packId! : "",
      qty: String(isPack ? Number(item.packQty) : Number(item.quantity)),
      price: String(isPack ? Number(item.packPrice) : Number(item.unitPrice)),
      priceTouched: true,
      checkTouched: true,
      discount: item.discountPercent ? String(item.discountPercent) : "",
      description: item.description || "",
      showDetails: !!item.description,
    };
  });
  return {
    customerMode: q.clientId ? "client" : "manual",
    clientId: q.clientId ?? null,
    clientLabel: q.client?.name || q.customerName || "",
    customerName: q.customerName || "",
    customerContact: q.customerContact || "",
    customerEmail: q.customerEmail || "",
    subject: q.subject || "",
    priceListId: q.priceListId || "",
    validUntil: q.validUntil ? String(q.validUntil).slice(0, 10) : "",
    taxSettingId: q.taxSettingId || "",
    discountType: (q.orderDiscountType as QuoteDiscountType) || (q.totalDiscount > 0 ? "AMOUNT" : ""),
    discountValue: q.orderDiscountValue ? String(q.orderDiscountValue) : q.totalDiscount > 0 ? String(q.totalDiscount) : "",
    additionalFee: q.additionalFee ? String(q.additionalFee) : "",
    additionalFeeLabel: q.additionalFeeLabel || "",
    notes: q.notes || "",
    terms: q.terms || [],
    lines,
  };
}
