import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, X, ShoppingCart, Plus, Minus, Trash2, Search, Package, AlertTriangle, PauseCircle, ListRestart, Keyboard } from "lucide-react";
import { Layout } from "../components/layout";
import { Button, Input, Select, Modal } from "../components/ui";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { useCreateSale } from "../hooks/api/useSales";
import { useCreateClient, useClientBalance } from "../hooks/api/useClients";
import ClientPicker, { PickedClient } from "../components/sales/ClientPicker";
import { usePriceLists, usePriceListPrices } from "../hooks/api/usePriceLists";
import { useCurrentShift } from "../hooks/api/useShifts";
import { useProductsInfinite } from "../hooks/api/useProducts";
import { useCategories } from "../hooks/api/useCategories";
import { useActiveTaxSettings } from "../hooks/api/useTax";
import { productService } from "../services/productService";
import { useForm } from "react-hook-form";
import { formatCurrency, formatNumber } from "../utils/currencyUtils";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { printReceipt } from "../services/printService";
import AfterSalePrintMenu from "../components/printer/AfterSalePrintMenu";
import { AFTER_SALE_OPTIONS, getAfterSaleMode, setAfterSaleMode, type AfterSaleMode } from "../utils/afterSalePrint";
import { saleToReceiptData } from "../services/receiptHtmlTemplate";
import { PrintReceiptPreview } from "../components/printer/PrintReceiptPreview";
import { usePrinterConfigStore } from "../stores/printerConfigStore";
import { companyService } from "../services/companyService";
import QtyInput from "../components/ui/QtyInput";
import LinePrice from "../components/sales/LinePrice";
import { NEGOTIATION_WARN_PERCENT, priceGap } from "../utils/negotiation";
import { addQty, allowsDecimal, cartCountLabel, formatQty, normalizeDigits, qtyTimes, toQty, unitOf } from "../utils/quantity";
import { MAX_SPLIT_PARTS, SPLIT_PART_METHODS, partsLabel, type SplitPartMethod } from "../utils/paymentMethods";
import { useQueryClient } from "@tanstack/react-query";
import HeldSalesModal, { heldSalesKey, useHeldSales } from "../components/sales/HeldSalesModal";
import { heldSaleError, heldSaleService, type HeldSaleRow, type ResumedSale } from "../services/heldSaleService";
import { usePermissionStore } from "../stores/permissionStore";
import { useUIStore } from "../stores/uiStore";

// Number inputs registered with valueAsNumber give NaN when left empty: treat that as "not entered"
const isBlank = (v: unknown) => v === "" || v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
const blankAsZero = (schema: z.ZodTypeAny) => z.preprocess((v) => (isBlank(v) ? 0 : v), schema);
const blankAsUndefined = (schema: z.ZodTypeAny) => z.preprocess((v) => (isBlank(v) ? undefined : v), schema);

// Define the base schema without refine for proper type inference
const saleBaseSchema = z.object({
  clientType: z.enum(["cash", "existing", "new"]),
  clientId: z.number().optional(),
  paymentMethod: z.enum(["CASH", "CARD", "MOBILE_WALLET", "CREDIT", "SPLIT"]),
  additionalFee: blankAsZero(z.coerce.number().min(0, "الرسوم الإضافية يجب أن تكون أكبر من أو تساوي صفر")) as unknown as z.ZodDefault<z.ZodNumber>,
  additionalFeeLabel: z.string().optional(),
  notes: z.string().optional(),
  // Tax and Discount fields
  taxSettingId: z.string().optional(),
  discountType: z.enum(["none", "amount", "percent"]).default("none"),
  discountAmount: blankAsZero(z.coerce.number().min(0, "الخصم يجب أن يكون أكبر من أو يساوي صفر")) as unknown as z.ZodDefault<z.ZodNumber>,
  discountPercent: blankAsZero(z.coerce.number().min(0).max(100, "نسبة الخصم يجب أن تكون بين 0 و 100")) as unknown as z.ZodDefault<z.ZodNumber>,
  // empty = nothing paid now (credit sale)
  paidAmount: blankAsUndefined(z.coerce.number().min(0, "المبلغ المدفوع يجب أن يكون أكبر من أو يساوي صفر").optional()) as unknown as z.ZodOptional<z.ZodNumber>,
  // New client fields
  newClientName: z.string().optional(),
  newClientPhone: z.string().optional(),
  newClientEmail: z.string().email("البريد الإلكتروني غير صحيح").optional().or(z.literal("")).or(z.undefined()),
  newClientAddress: z.string().optional(),
});

// Use the base schema for type inference
type SaleFormData = z.infer<typeof saleBaseSchema>;

// Create the refined schema for validation
const saleSchema = saleBaseSchema
  .refine((data) => {
    if (data.clientType === "new") {
      return data.newClientName && data.newClientName.length > 0;
    }
    return true;
  }, {
    message: "اسم العميل الجديد مطلوب",
    path: ["newClientName"],
  })
  .refine((data) => {
    if (data.clientType === "new") {
      return data.newClientPhone && data.newClientPhone.length > 0;
    }
    return true;
  }, {
    message: "رقم هاتف العميل مطلوب",
    path: ["newClientPhone"],
  });

interface SaleItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  /** The product's default (retail) price, so the line can be repriced when the list changes */
  basePrice: number;
  total: number;
  stock: number;
  /** Sold by weight / length: fractional quantity allowed */
  allowDecimalQty?: boolean;
  unit?: string | null;
  /** Sold as a pack (carton of 12 ...): quantity = packs, unitPrice = price of one pack */
  packId?: string | null;
  packName?: string | null;
  packFactor?: number | null;
  /** The product's packs, to switch the line between piece and pack */
  packs?: ProductPack[];
  /** The product sold by the piece (price, weighed or not), to switch a pack line back */
  piece?: { sellingPrice: number; allowDecimalQty: boolean };
  /** A manager agreed another price with the customer: unitPrice is that price, listPrice the original */
  negotiated?: boolean;
  listPrice?: number;
}

/** The line's price before any negotiation */
const originalPrice = (item: SaleItem) => (item.negotiated ? item.listPrice ?? item.unitPrice : item.unitPrice);

interface ProductPack {
  id: string;
  name: string;
  factor: number;
  sellingPrice: number;
  barcode?: string | null;
}

/** One cart line per product and pack: pieces and cartons of the same product sit side by side */
const lineKey = (item: { productId: number | string; packId?: string | null }) => `${item.productId}|${item.packId || ""}`;
/** Pieces a line takes from stock */
const piecesOf = (item: SaleItem) => (item.packFactor ? qtyTimes(item.quantity, item.packFactor) : item.quantity);

const SalesCreate: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { company, user } = useSessionAuthStore();
  const companyId = company?.companyId || company?.company?.id;

  // Form state
  // Every cart change starts from the latest cart, not the one this render saw: fast scans and
  // bulk adds run one after another before React re-renders (they used to drop items)
  const [items, setItemsState] = useState<SaleItem[]>([]);
  const itemsRef = useRef<SaleItem[]>([]);
  // Weighed goods: after adding, the cursor goes to the weight field
  const qtyInputRefs = useRef(new Map<string, HTMLInputElement>());
  const [focusQtyFor, setFocusQtyForState] = useState<string | null>(null);
  // While true, the "back to the barcode box" focus is skipped so the weight field keeps the cursor
  const weightFocusRef = useRef(false);
  const setFocusQtyFor = (key: string) => {
    weightFocusRef.current = true;
    setFocusQtyForState(key);
  };
  useEffect(() => {
    if (focusQtyFor === null) return;
    const el = qtyInputRefs.current.get(focusQtyFor);
    if (el) {
      el.focus();
      el.select();
    }
    setFocusQtyForState(null);
    setTimeout(() => {
      weightFocusRef.current = false;
    }, 100);
  });
  const setItems = useCallback((next: SaleItem[] | ((prev: SaleItem[]) => SaleItem[])) => {
    const value = typeof next === "function" ? next(itemsRef.current) : next;
    itemsRef.current = value;
    setItemsState(value);
  }, []);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // The cashier can turn the confirmation step off (kept on this device only)
  const [skipConfirm, setSkipConfirm] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sellx.sale.skipConfirm") === "1";
    } catch {
      return false;
    }
  });
  // What this device does after a sale (first time: the shop's old auto-print switch)
  const [afterSaleMode, setAfterSaleModeState] = useState<AfterSaleMode>(() => getAfterSaleMode(usePrinterConfigStore.getState().autoPrintOnPayment));
  const changeAfterSaleMode = (mode: AfterSaleMode) => {
    setAfterSaleMode(mode);
    setAfterSaleModeState(mode);
    toast.success(`بعد البيع: ${AFTER_SALE_OPTIONS.find(o => o.value === mode)!.label}`, { id: "after-sale-mode", duration: 1500 });
  };
  const toggleSkipConfirm = (value: boolean) => {
    setSkipConfirm(value);
    try {
      localStorage.setItem("sellx.sale.skipConfirm", value ? "1" : "0");
    } catch {
      /* storage unavailable: the choice lasts for this screen only */
    }
  };
  const [showPrintModal, setShowPrintModal] = useState(false);
  // Closing the preview starts the next sale, unless it was opened later from the "تم البيع" message
  const previewResetsRef = useRef(true);
  const [printableSale, setPrintableSale] = useState<any>(null);
  const [clientType, setClientType] = useState<"cash" | "existing" | "new">("cash");
  const [productSearch, setProductSearch] = useState("");
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedClient, setSelectedClient] = useState<PickedClient | null>(null);
  const [showFees, setShowFees] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [lastScannedBarcode, setLastScannedBarcode] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // The cashier's open shift: cash sales without one never reach a drawer (warning only)
  const { data: currentShiftData, isLoading: shiftLoading } = useCurrentShift(companyId || 0);
  const hasOpenShift = !!currentShiftData?.hasOpenShift;

  const {
    data: productsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useProductsInfinite({
    companyId: companyId!,
    limit: 50,
    search: debouncedProductSearch || undefined,
    categoryId: selectedCategory || undefined,
  });

  const { data: categoriesData } = useCategories({
    companyId: companyId!,
    limit: 100,
  });

  // Fetch tax settings
  const { data: taxSettingsData } = useActiveTaxSettings(companyId!);

  // Mutations
  const createSaleMutation = useCreateSale();
  const createClientMutation = useCreateClient();

  // Sale form
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<SaleFormData>({
    resolver: zodResolver(saleSchema) as any,
    defaultValues: {
      clientType: "cash",
      paymentMethod: "CASH",
      additionalFee: 0,
      discountType: "none",
      discountAmount: 0,
      discountPercent: 0,
    },
  });

  // Balance and credit limit of the chosen customer, shown before the sale is saved
  const selectedClientId = watch("clientId");
  const { data: clientBalance } = useClientBalance(clientType === "existing" ? selectedClientId : undefined, companyId || 0);

  // Price list: filled in from the customer, and can be changed for this sale
  const { data: priceLists = [] } = usePriceLists(companyId || 0);
  const defaultPriceList = priceLists.find((l) => l.isDefault);
  const [chosenPriceListId, setChosenPriceListId] = useState("");
  const selectedPriceList = priceLists.find((l) => l.id === chosenPriceListId) || defaultPriceList;
  const listIsDefault = !selectedPriceList || selectedPriceList.isDefault;
  const { data: listPrices, isFetching: listPricesLoading } = usePriceListPrices(
    companyId || 0,
    listIsDefault ? null : selectedPriceList!.id
  );
  const priceFor = useCallback(
    (productId: string | number, basePrice: number) => {
      if (listIsDefault) return Number(basePrice) || 0;
      const price = listPrices?.[String(productId)];
      return price === undefined ? Number(basePrice) || 0 : price;
    },
    [listIsDefault, listPrices]
  );

  // A customer brings their own list; cash and new customers buy at the default list
  const customerPriceListId =
    clientType === "existing" ? selectedClient?.priceListId ?? (clientBalance as any)?.priceListId ?? null : null;
  // A resumed held cart comes back on the list it was held with (once, then the usual rules)
  const pendingPriceListRef = useRef<string | null>(null);
  useEffect(() => {
    if (!defaultPriceList) return;
    const pending = pendingPriceListRef.current && priceLists.find((l) => l.id === pendingPriceListRef.current);
    if (pending) {
      pendingPriceListRef.current = null;
      setChosenPriceListId(pending.id);
      return;
    }
    const fromCustomer = priceLists.find((l) => l.id === customerPriceListId);
    setChosenPriceListId(fromCustomer ? fromCustomer.id : defaultPriceList.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientType, selectedClientId, customerPriceListId, defaultPriceList?.id]);

  // Reprice the cart whenever the list (or its prices) change
  useEffect(() => {
    if (!listIsDefault && !listPrices) return;
    setItems((prev) =>
      prev.map((item) => {
        if (item.packId) return item; // a pack has its own price, not the list's
        const unitPrice = priceFor(item.productId, item.basePrice);
        // an agreed price stays; only the original it is compared with follows the list
        if (item.negotiated) return item.listPrice === unitPrice ? item : { ...item, listPrice: unitPrice };
        return unitPrice === item.unitPrice ? item : { ...item, unitPrice, total: qtyTimes(item.quantity, unitPrice) };
      })
    );
  }, [priceFor, listIsDefault, listPrices]);

  // Get watched form values
  const watchedTaxSettingId = watch("taxSettingId");
  const watchedDiscountType = watch("discountType");
  const watchedDiscountAmount = watch("discountAmount") || 0;
  const watchedDiscountPercent = watch("discountPercent") || 0;
  const watchedAdditionalFee = watch("additionalFee") || 0;

  // Get selected tax setting
  const selectedTax = useMemo(() => {
    if (!watchedTaxSettingId || !taxSettingsData) return null;
    const taxList = Array.isArray(taxSettingsData) ? taxSettingsData : (taxSettingsData as any)?.data || [];
    return taxList.find((t: any) => t.id === watchedTaxSettingId) || null;
  }, [watchedTaxSettingId, taxSettingsData]);

  // Calculate totals with tax and discount
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);

  // Calculate discount
  const discountAmount = useMemo(() => {
    if (watchedDiscountType === "amount") {
      return Math.min(watchedDiscountAmount, subtotal);
    } else if (watchedDiscountType === "percent") {
      return Math.round((subtotal * watchedDiscountPercent / 100) * 100) / 100;
    }
    return 0;
  }, [watchedDiscountType, watchedDiscountAmount, watchedDiscountPercent, subtotal]);

  // Calculate tax
  const taxableAmount = subtotal - discountAmount;
  const taxRate = selectedTax?.rate || 0;
  const taxAmount = Math.round((taxableAmount * taxRate / 100) * 100) / 100;

  // Calculate total
  const additionalFee = watchedAdditionalFee;
  const total = taxableAmount + taxAmount + additionalFee;
  const roundedTotal = Math.round(total * 100) / 100;

  // Split payment (تقسيم): the amount paid with each method; the unpaid rest is the customer's debt
  const [splitRows, setSplitRows] = useState<{ method: SplitPartMethod; amount: string }[]>([]);
  const splitAmountRefs = useRef<(HTMLInputElement | null)[]>([]);
  const isSplit = watch("paymentMethod") === "SPLIT";
  const splitAmount = (text: string) => {
    const n = Number(normalizeDigits(text).trim());
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  };
  const splitPaid = Math.round(splitRows.reduce((sum, r) => sum + splitAmount(r.amount), 0) * 100) / 100;
  const splitRest = Math.round((roundedTotal - splitPaid) * 100) / 100;
  const splitCash = Math.round(
    splitRows.filter((r) => r.method === "CASH").reduce((sum, r) => sum + splitAmount(r.amount), 0) * 100
  ) / 100;

  // Cash tendered by the customer and the change to hand back (split: change from the cash part only)
  const [received, setReceived] = useState("");
  const cashDue = isSplit ? splitCash : roundedTotal;
  const changeDue = received.trim() === "" ? null : Math.round((Number(normalizeDigits(received)) - cashDue) * 100) / 100;
  const takesCash = watch("paymentMethod") === "CASH" || (isSplit && splitCash > 0);
  const cashShortRef = useRef(false);
  cashShortRef.current = takesCash && changeDue !== null && changeDue < 0;
  // Why a split payment can't be finished yet (checked before the confirm dialog opens)
  const splitProblemRef = useRef<string | null>(null);

  // Barcode scanning handler - now uses the new barcode API
  const handleBarcodeScan = async (barcode: string) => {
    setLastScannedBarcode(barcode);

    try {
      // Use authenticated productService
      const result = await productService.findByBarcode(barcode, companyId);

      // apiClient returns response.data. Backend wraps as:
      //   { msg, status, data: { success: true, data: <product> } }   — on hit
      //   { msg, status, data: { success: false, error } }             — on miss
      const inner = result?.data;
      const product = inner?.success ? inner.data : null;

      if (product?.scale) {
        // Scale label: the packet's weight is on the label
        setBarcodeInput("");
        const qty = Number(product.scale.quantity);
        if (addItem(product, qty)) {
          toast.success(`تمت الإضافة: ${product.name} - ${formatQty(qty, unitOf(product))}`, { id: "pos-scan", duration: 1800 });
        }
        setTimeout(() => barcodeInputRef.current?.focus(), 100);
      } else if (product) {
        setBarcodeInput(""); // Clear input
        // the carton's own barcode adds a carton
        if (addItem(product, undefined, product.pack ?? null)) {
          // one short message that the next scan replaces (they used to pile up)
          toast.success(`تمت الإضافة: ${product.name}${product.pack ? ` - ${product.pack.name}` : ""}`, { id: "pos-scan", duration: 1500 });
        }

        // Auto-focus barcode input for next scan
        setTimeout(() => {
          barcodeInputRef.current?.focus();
        }, 100);
      } else {
        toast.error(`المنتج غير موجود: ${barcode}`, { id: "pos-scan" });
        setBarcodeInput(""); // Clear input
      }
    } catch (error: any) {
      console.error('Error scanning barcode:', error);
      const errorMsg = error?.response?.data?.msg || error?.message || 'حدث خطأ أثناء البحث عن المنتج';
      toast.error(errorMsg, { id: "pos-scan" });
      setBarcodeInput(""); // Clear input
    }
  };

  // Handle manual barcode input
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (barcodeInput.trim()) {
      await handleBarcodeScan(barcodeInput.trim());
    }
  };

  // Auto-focus barcode input on mount
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Debounce product search so we don't fire a request on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedProductSearch(productSearch), 300);
    return () => clearTimeout(timer);
  }, [productSearch]);

  // Infinite scroll: load the next page of products when the sentinel
  // at the bottom of the grid scrolls into view
  const productScrollSentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = productScrollSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // All products loaded so far across every fetched page
  const allLoadedProducts = useMemo(() => {
    const pages = (productsData as any)?.pages || [];
    return pages.flatMap((page: any) => page?.data?.list || []);
  }, [productsData]);

  // Get product stock by ID (undefined if the product isn't in any currently
  // loaded product page, e.g. it was added via barcode scan)
  const getProductStock = (productId: number): number | undefined => {
    const product = allLoadedProducts.find((p: any) => p.id === productId);
    if (!product) return undefined;
    return product.currentStock ?? product.stockQuantity ?? 0;
  };

  // Add item to sale
  // labelQty: the weight read from a scale label (the whole packet is added at once)
  // pack: sell as this pack (scanned the carton's barcode, or chosen on the line)
  const addItem = (product: any, labelQty?: number, pack?: ProductPack | null): boolean => {
    const stock = toQty(product.currentStock || product.stockQuantity || 0);
    const current = itemsRef.current;
    const key = lineKey({ productId: product.id, packId: pack?.id });
    const existingItem = current.find(item => lineKey(item) === key);
    const weighed = allowsDecimal(product);
    const packs: ProductPack[] = Array.isArray(product.packs) ? product.packs : [];
    // pieces already taken by the product's other lines (pieces and packs share one stock)
    const otherPieces = current
      .filter(item => item.productId === product.id && lineKey(item) !== key)
      .reduce((sum, item) => addQty(sum, piecesOf(item)), 0);
    const piecesFor = (qty: number) => (pack ? qtyTimes(qty, pack.factor) : qty);
    const fits = (qty: number) => addQty(otherPieces, piecesFor(qty)) <= stock;
    const notEnough = () =>
      toast.error(`لا يكفي المخزون - المتاح: ${formatQty(Math.max(0, stock - otherPieces), unitOf(product))}`, { id: "pos-scan" });

    // A product without a selling price can't be sold until it is priced
    if (!pack && !(priceFor(product.id, product.sellingPrice) > 0)) {
      toast.error(`"${product.name}" بدون سعر بيع. حدّد سعره من قوائم الأسعار أولاً`, { id: "pos-scan" });
      return false;
    }

    // Scale label: the packet's weight
    if (labelQty && labelQty > 0 && !pack) {
      const newQuantity = addQty(existingItem?.quantity || 0, labelQty);
      if (!fits(newQuantity)) {
        notEnough();
        return false;
      }
      if (existingItem) {
        setItems(current.map(item =>
          lineKey(item) === key ? { ...item, quantity: newQuantity, total: qtyTimes(newQuantity, item.unitPrice), stock } : item
        ));
      } else {
        const unitPrice = priceFor(product.id, product.sellingPrice);
        setItems([...current, {
          productId: product.id,
          productName: product.name,
          quantity: labelQty,
          unitPrice,
          basePrice: Number(product.sellingPrice) || 0,
          total: qtyTimes(labelQty, unitPrice),
          stock,
          allowDecimalQty: weighed,
          unit: unitOf(product) || null,
          packs,
          piece: { sellingPrice: Number(product.sellingPrice) || 0, allowDecimalQty: weighed },
        }]);
      }
      return true;
    }

    // Weighed goods by the piece line: scanning again doesn't add "one more kilo", it opens the weight to edit
    if (existingItem && weighed && !pack) {
      setFocusQtyFor(key);
      return true;
    }

    const newQuantity = existingItem ? addQty(existingItem.quantity, 1) : weighed && !pack ? Math.min(1, stock - otherPieces) : 1;
    if (newQuantity <= 0 || !fits(newQuantity)) {
      notEnough();
      return false;
    }

    if (existingItem) {
      setItems(current.map(item =>
        lineKey(item) === key ? { ...item, quantity: newQuantity, total: qtyTimes(newQuantity, item.unitPrice), stock } : item
      ));
    } else {
      // pack: its own price; piece: the price list's. Weighed by the piece: 1 kg, then type the weight
      const unitPrice = pack ? pack.sellingPrice : priceFor(product.id, product.sellingPrice);
      const newItem: SaleItem = {
        productId: product.id,
        productName: product.name,
        quantity: newQuantity,
        unitPrice,
        basePrice: pack ? pack.sellingPrice : Number(product.sellingPrice) || 0,
        total: qtyTimes(newQuantity, unitPrice),
        stock,
        allowDecimalQty: pack ? false : weighed,
        unit: unitOf(product) || null,
        packs,
        piece: { sellingPrice: Number(product.sellingPrice) || 0, allowDecimalQty: weighed },
        ...(pack && { packId: pack.id, packName: pack.name, packFactor: pack.factor }),
      };
      setItems([...current, newItem]);
      if (weighed && !pack) setFocusQtyFor(key);
    }
    return true;
  };

  /** A manager's agreed price for a line; `null` = back to the original price */
  const setLinePrice = (key: string, price: number | null) => {
    setItems((prev) =>
      prev.map((item) => {
        if (lineKey(item) !== key) return item;
        const original = originalPrice(item);
        const unitPrice = price === null ? original : price;
        const negotiated = Math.abs(unitPrice - original) >= 0.005;
        return { ...item, unitPrice, total: qtyTimes(item.quantity, unitPrice), negotiated, listPrice: negotiated ? original : undefined };
      })
    );
  };

  /** Switch a cart line between piece and one of the product's packs */
  const changeLinePack = (key: string, packId: string) => {
    const line = itemsRef.current.find(item => lineKey(item) === key);
    if (!line) return;
    const pack = (line.packs || []).find(p => p.id === packId) || null;
    if ((pack?.id || null) === (line.packId || null)) return;
    const rest = itemsRef.current.filter(item => lineKey(item) !== key);
    itemsRef.current = rest;
    const product = {
      id: line.productId,
      name: line.productName,
      currentStock: getProductStock(line.productId) ?? line.stock,
      sellingPrice: line.piece?.sellingPrice ?? line.basePrice,
      unit: line.unit,
      allowDecimalQty: line.piece?.allowDecimalQty ?? !!line.allowDecimalQty,
      packs: line.packs,
    };
    if (!addItem(product, undefined, pack)) {
      setItems([...rest, line]); // didn't fit: keep the line as it was
    }
  };

  // Bulk pre-fill: when navigated here from Products "إضافة للفاتورة" with a list
  // of product ids, add each once. Fetches each product by id directly rather
  // than relying on the (paginated/search-filtered) picker list, since the
  // selected products may not be part of whatever page/search is loaded here.
  const bulkPrefillDoneRef = useRef(false);
  useEffect(() => {
    if (bulkPrefillDoneRef.current) return;
    const bulkIds = (location.state as any)?.bulkProductIds as (string | number)[] | undefined;
    if (!bulkIds || bulkIds.length === 0) return;
    if (!companyId) return;

    bulkPrefillDoneRef.current = true;

    (async () => {
      let added = 0;
      for (const id of bulkIds) {
        try {
          const result = await productService.getById(String(id), companyId);
          const product = (result as any)?.data?.data || (result as any)?.data;
          if (product) {
            addItem(product);
            added += 1;
          }
        } catch {
          // skip products that fail to load; continue with the rest
        }
      }
      if (added > 0) {
        toast.success(`تمت إضافة ${added} منتج إلى الفاتورة`);
      }
      // Clear navigation state so a refresh/back doesn't re-add
      navigate(location.pathname, { replace: true, state: {} });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, location.state]);

  // Update a line's quantity (packs for a pack line)
  const updateQuantity = (key: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(key);
      return;
    }

    const currentItem = itemsRef.current.find(item => lineKey(item) === key);
    if (!currentItem) return;
    const currentQuantity = currentItem.quantity;

    // Only validate stock when INCREASING quantity; pieces and packs of the product share one stock
    if (quantity > currentQuantity) {
      // Prefer live stock from the loaded product list, but fall back to the
      // stock captured when the item was added (e.g. via barcode scan for a
      // product not present in the currently loaded product page).
      const stock = getProductStock(currentItem.productId) ?? currentItem.stock ?? 0;
      const otherPieces = itemsRef.current
        .filter(item => item.productId === currentItem.productId && lineKey(item) !== key)
        .reduce((sum, item) => addQty(sum, piecesOf(item)), 0);
      const pieces = currentItem.packFactor ? qtyTimes(quantity, currentItem.packFactor) : quantity;
      if (addQty(otherPieces, pieces) > stock) {
        // one message per line, not one per key typed
        toast.error(`الكمية المطلوبة تتجاوز المخزون المتاح: ${formatQty(Math.max(0, stock - otherPieces), currentItem.unit)}`, { id: `stock-${key}` });
        return;
      }
    }

    const newItems = itemsRef.current.map(item =>
      lineKey(item) === key
        ? {
            ...item,
            quantity,
            total: qtyTimes(quantity, item.unitPrice),
          }
        : item
    );
    setItems(newItems);
  };

  // Remove a line
  const removeItem = (key: string) => {
    setItems(prev => prev.filter(item => lineKey(item) !== key));
  };

  // Check if product is already selected (any line: piece or pack)
  const isProductSelected = (productId: number) => {
    return items.some(item => item.productId === productId);
  };

  // Pieces of the product in the cart (a carton of 12 counts 12)
  const getSelectedQuantity = (productId: number) => {
    return items.filter(item => item.productId === productId).reduce((sum, item) => addQty(sum, piecesOf(item)), 0);
  };


  // Show confirmation modal before sale
  splitProblemRef.current = !isSplit
    ? null
    : splitPaid <= 0
      ? "أدخل المبلغ المدفوع بكل طريقة"
      : splitRest < -0.01
        ? `مجموع طرق الدفع أكبر من الإجمالي بـ ${formatCurrency(-splitRest)}`
        : splitRest > 0.01 && (clientType === "cash" || (clientType === "existing" && !watch("clientId")))
          ? `الباقي (${formatCurrency(splitRest)}) يُسجل على العميل: اختر عميلاً أو أكمل المبلغ`
          : null;

  const handleShowConfirm = useCallback(() => {
    if (itemsRef.current.length === 0) {
      toast.error("يجب إضافة منتجات للبيع");
      return;
    }
    if (cashShortRef.current) {
      toast.error("المبلغ المستلم أقل من الإجمالي");
      return;
    }
    if (splitProblemRef.current) {
      toast.error(splitProblemRef.current);
      return;
    }
    if (skipConfirm) {
      handleSubmitRef.current?.();
      return;
    }
    setShowConfirmModal(true);
  }, [skipConfirm]);

  // Ctrl/Cmd + Enter completes the sale from anywhere on the screen
  const handleSubmitRef = useRef<(() => void) | null>(null);
  const holdDialogOpenRef = useRef(false);
  const selectPaymentRef = useRef<(method: SaleFormData["paymentMethod"]) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // the hold dialogs own the keyboard while open
      if (holdDialogOpenRef.current) return;
      // F2 barcode, F3 product search, F6-F9 payment method (no dialog open)
      if (!showConfirmModal && !showPrintModal) {
        const payKeys: Record<string, SaleFormData["paymentMethod"]> = {
          F6: "CASH",
          F7: "CARD",
          F8: "MOBILE_WALLET",
          F9: "CREDIT",
          F10: "SPLIT",
        };
        if (e.key === "F2") {
          e.preventDefault();
          barcodeInputRef.current?.focus();
          return;
        }
        if (e.key === "F3") {
          e.preventDefault();
          productSearchRef.current?.focus();
          return;
        }
        if (e.key === "F4") {
          e.preventDefault();
          openHoldRef.current();
          return;
        }
        if (payKeys[e.key]) {
          e.preventDefault();
          selectPaymentRef.current(payKeys[e.key]);
          return;
        }
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        // never a second sale while one is saving or its receipt is on screen
        if (createSaleMutation.isPending || showPrintModal) return;
        if (showConfirmModal) handleSubmitRef.current?.();
        else handleShowConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleShowConfirm, showConfirmModal, showPrintModal, createSaleMutation.isPending]);

  // Handle sale submission
  const handleSaleSubmit = useCallback(async (data: SaleFormData) => {
    setShowConfirmModal(false);

    if (items.length === 0) {
      toast.error("يجب إضافة منتجات للبيع");
      return;
    }
    if (data.paymentMethod === "CASH" && changeDue !== null && changeDue < 0) {
      toast.error("المبلغ المستلم أقل من الإجمالي");
      return;
    }
    if (data.paymentMethod === "SPLIT") {
      if (splitPaid <= 0) {
        toast.error("أدخل المبلغ المدفوع بكل طريقة");
        return;
      }
      if (splitRest < -0.01) {
        toast.error(`مجموع طرق الدفع أكبر من الإجمالي بـ ${formatCurrency(-splitRest)}`);
        return;
      }
      if (splitRest > 0.01 && (data.clientType === "cash" || (data.clientType === "existing" && !data.clientId))) {
        toast.error(`الباقي (${formatCurrency(splitRest)}) يُسجل على العميل: اختر عميلاً أو أكمل المبلغ`);
        return;
      }
      if (splitCash > 0 && changeDue !== null && changeDue < 0) {
        toast.error("المبلغ المستلم نقداً أقل من الجزء النقدي");
        return;
      }
    }
    if (!listIsDefault && (listPricesLoading || !listPrices)) {
      toast.error("جاري تحميل أسعار القائمة، حاول بعد لحظة");
      return;
    }

    // A credit sale is a debt: it must belong to a customer
    if (data.paymentMethod === "CREDIT" && (data.clientType === "cash" || (data.clientType === "existing" && !data.clientId))) {
      toast.error("البيع الآجل يتطلب اختيار عميل أو إضافة عميل جديد");
      return;
    }

    try {
      let clientId = data.clientId;

      // If new client is selected, create the client first
      if (data.clientType === "new" && data.newClientName) {
        const res: any = await createClientMutation.mutateAsync({
          name: data.newClientName,
          email: data.newClientEmail || undefined,
          phone: data.newClientPhone || undefined,
          address: data.newClientAddress || undefined,
          companyId: companyId!,
        });
        // The API answers { msg, status, data: client }
        const newClient = [res?.data?.data, res?.data, res].find((x: any) => x && x.id);
        if (!newClient) throw new Error("no client returned");
        clientId = Number(newClient.id);
        // From now on this customer exists: if the sale fails, trying again must not create them twice
        const picked = { id: clientId, name: newClient.name, phone: newClient.phone, priceListId: newClient.priceListId ?? null };
        setSelectedClient(picked);
        setClientType("existing");
        setValue("clientType", "existing");
        setValue("clientId", clientId);
      }

      const saleData: any = {
        // receiptNumber will be auto-generated by backend
        clientId: clientId,
        paymentMethod: data.paymentMethod,
        saleDate: new Date().toISOString(),
        items: items.map(item => ({
          productId: String(item.productId), // Convert to string as backend expects
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          ...(item.packId && { packId: item.packId }),
        })),
        companyId: companyId!,
        ...(selectedPriceList && { priceListId: selectedPriceList.id }),
      };

      // Add tax if selected
      if (data.taxSettingId) {
        saleData.taxSettingId = data.taxSettingId;
      }

      // Add discount if applicable
      if (data.discountType === "amount" && discountAmount > 0) {
        saleData.discountAmount = discountAmount;
      } else if (data.discountType === "percent" && data.discountPercent > 0) {
        saleData.discountPercent = data.discountPercent;
      }

      // Split: the amount per method; the server adds them up and the rest is the customer's debt.
      // Credit (آجل): only the down payment typed in the field is paid (empty = nothing paid).
      // Every other method is paid in full at the till.
      if (data.paymentMethod === "SPLIT") {
        delete saleData.paymentMethod;
        saleData.payments = splitRows
          .map((r) => ({ method: r.method, amount: splitAmount(r.amount) }))
          .filter((r) => r.amount > 0);
      } else if (data.paymentMethod === "CREDIT") {
        const downPayment = Number.isFinite(data.paidAmount) ? Number(data.paidAmount) : 0;
        saleData.paidAmount = Math.min(Math.max(downPayment, 0), roundedTotal);
      } else {
        saleData.paidAmount = roundedTotal;
      }

      // Only add additionalFee if it's greater than 0
      if (data.additionalFee && data.additionalFee > 0) {
        saleData.additionalFee = data.additionalFee;
        saleData.additionalFeeLabel = data.additionalFeeLabel || undefined;
      }

      const createdSale = await createSaleMutation.mutateAsync(saleData);
      // Note: Success toast is shown in useSales hook



      // Extract the actual sale data from the response
      const saleData_fromAPI = (createdSale as any)?.data || {};

      // Prepare sale with items for printing
      const saleWithItems = {
        ...saleData_fromAPI,  // Data returned from API
        ...saleData,          // Original sale data (fallback)
        // "payments" on a sale means later debt payments; the split parts are checkoutParts
        payments: [],
        checkoutParts: saleData_fromAPI.checkoutParts || saleData.payments,
        change: takesCash && changeDue !== null && changeDue > 0 ? changeDue : 0,
        // cash handed over by the customer (printed as المستلم next to the change)
        received: takesCash && changeDue !== null && changeDue >= 0 ? Number(normalizeDigits(received)) : undefined,
        clientName:
          saleData_fromAPI.client?.name ||
          (clientId && selectedClient?.id === clientId ? selectedClient.name : undefined) ||
          (data.clientType === "new" ? data.newClientName : undefined),
        items: items.map(item => ({
          ...item,
          // a pack line prints as "juice - كرتونة 12", counted in cartons
          productName: item.packName ? `${item.productName} - ${item.packName} ${formatQty(item.packFactor || 0)}` : item.productName,
          product: item.packName
            ? { name: item.productName, unit: item.packName, allowDecimalQty: false }
            : { name: item.productName, unit: item.unit, allowDecimalQty: item.allowDecimalQty }
        })),
      };


      // After the sale: as chosen on this device (preview / print directly / no print)
      if (afterSaleMode === "none") {
        resetForNextSale();
        toast.custom(
          (t) => (
            <div className={`flex items-center gap-3 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-lg transition-opacity duration-200 ${t.visible ? "opacity-100" : "opacity-0"}`}>
              <span>تم البيع {saleWithItems.receiptNumber ? `(${saleWithItems.receiptNumber})` : ""}</span>
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(t.id);
                  // the cart is already the next customer's: closing this preview must not clear it
                  previewResetsRef.current = false;
                  setPrintableSale(saleWithItems);
                  setShowPrintModal(true);
                }}
                className="rounded-md bg-white/15 px-2.5 py-1 font-medium hover:bg-white/25"
              >
                طباعة
              </button>
            </div>
          ),
          { id: "sale-done", duration: 8000, position: "bottom-center" }
        );
      } else if (afterSaleMode === "print") {
        try {
          // Fetch full company profile with logo
          const companyId = company?.companyId || company?.id;
          let fullCompany = company?.company || { name: 'POS System' };
          if (companyId) {
            try {
              fullCompany = await companyService.getProfile(companyId);
            } catch (err) {
              console.warn('Could not fetch company profile, using default data');
            }
          }

          // Same mapping as the preview: payment method, paid / remaining and the customer
          await printReceipt(saleToReceiptData({ sale: saleWithItems, company: fullCompany, cashier: user }));
          toast.success('تم الطباعة تلقائياً');
        } catch (printError) {
          console.error('Auto-print error:', printError);
          toast.error('فشلت الطباعة التلقائية');
        }
        resetForNextSale();
      } else {
        // Show print preview modal
        previewResetsRef.current = true;
        setPrintableSale(saleWithItems);
        setShowPrintModal(true);
      }
    } catch (error: any) {
      // The sale/client mutations already showed the server's message
      console.error("[SalesCreate] Error creating sale:", error);
    }
  }, [items, createSaleMutation, createClientMutation, companyId, roundedTotal, changeDue, discountAmount, received, selectedClient, selectedPriceList, listIsDefault, listPricesLoading, listPrices,
    splitRows, splitPaid, splitRest, splitCash, takesCash]);
  // A form that does not pass validation must say why (it used to do nothing at all)
  const handleInvalid = (formErrors: Record<string, any>) => {
    const first = Object.values(formErrors)[0];
    toast.error(first?.message || "تحقق من بيانات البيع");
  };
  handleSubmitRef.current = () => handleSubmit(handleSaleSubmit, handleInvalid)();

  // After a sale the screen is ready for the next customer (no trip through the sales list)
  const resetForNextSale = () => {
    setItems([]);
    setReceived("");
    setSplitRows([]);
    setSelectedClient(null);
    setClientType("cash");
    setShowFees(false);
    reset({
      clientType: "cash",
      paymentMethod: "CASH",
      additionalFee: 0,
      additionalFeeLabel: undefined,
      discountType: "none",
      discountAmount: 0,
      discountPercent: 0,
      taxSettingId: watch("taxSettingId"),
    });
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  // ------------------------------------------------------------ hold sale (تعليق)
  const queryClient = useQueryClient();
  const role = usePermissionStore((state) => state.role);
  // the server allows a changed price for managers and owners only (and logs it)
  const canNegotiate = role === "ADMIN" || role === "MANAGER";
  const { data: heldData } = useHeldSales(companyId || 0);
  const heldCount = heldData?.list?.length || 0;
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  const [showHeldList, setShowHeldList] = useState(false);
  const [holding, setHolding] = useState(false);

  /** Park the current cart on the server; the screen is then ready for the next customer */
  const holdCurrentCart = async (label: string) => {
    if (itemsRef.current.length === 0) {
      toast.error("السلة فارغة");
      return false;
    }
    const v = watch();
    setHolding(true);
    try {
      await heldSaleService.hold({
        companyId: companyId!,
        label: label.trim() || undefined,
        clientId: clientType === "existing" ? v.clientId : undefined,
        priceListId: selectedPriceList?.id,
        items: itemsRef.current.map((i) => ({
          productId: String(i.productId),
          name: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          ...(i.packId && { packId: i.packId }),
          ...(i.negotiated && { negotiated: true }),
        })),
        discountType: v.discountType,
        discountAmount: Number(v.discountAmount) || 0,
        discountPercent: Number(v.discountPercent) || 0,
        taxSettingId: v.taxSettingId || undefined,
        additionalFee: Number(v.additionalFee) || 0,
        additionalFeeLabel: v.additionalFeeLabel || undefined,
        total: roundedTotal,
      });
      queryClient.invalidateQueries({ queryKey: heldSalesKey(companyId || 0) });
      toast.success("تم تعليق الفاتورة");
      resetForNextSale();
      return true;
    } catch (error) {
      toast.error(heldSaleError(error, "تعذر تعليق الفاتورة"));
      return false;
    } finally {
      setHolding(false);
    }
  };

  const openHoldModal = () => {
    if (itemsRef.current.length === 0) {
      toast.error("السلة فارغة: لا يوجد ما يُعلّق");
      return;
    }
    setHoldLabel(clientType === "existing" && selectedClient ? selectedClient.name : "");
    setShowHoldModal(true);
  };

  /** Put a resumed cart back on the screen */
  const applyResumed = (held: ResumedSale) => {
    setReceived("");
    setSplitRows([]);
    pendingPriceListRef.current = held.priceListId;
    setItems(
      held.items.map((i) => ({
        productId: i.productId as unknown as number,
        productName: i.productName,
        quantity: i.quantity,
        // an agreed price comes back as it was; the original follows today's list
        unitPrice: i.negotiated ? i.heldPrice : i.unitPrice,
        basePrice: i.basePrice,
        total: qtyTimes(i.quantity, i.negotiated ? i.heldPrice : i.unitPrice),
        ...(i.negotiated && Math.abs(i.heldPrice - i.unitPrice) >= 0.005 && { negotiated: true, listPrice: i.unitPrice }),
        stock: i.stockQuantity,
        allowDecimalQty: i.pack ? false : i.allowDecimalQty,
        unit: i.unit,
        ...(i.pack && { packId: i.pack.id, packName: i.pack.name, packFactor: i.pack.factor }),
      }))
    );
    reset({
      clientType: held.client ? "existing" : "cash",
      clientId: held.client?.id,
      paymentMethod: "CASH",
      additionalFee: held.additionalFee || 0,
      additionalFeeLabel: held.additionalFeeLabel,
      discountType: held.discountType || "none",
      discountAmount: held.discountAmount || 0,
      discountPercent: held.discountPercent || 0,
      taxSettingId: held.taxSettingId,
    });
    setShowFees((held.additionalFee || 0) > 0);
    if (held.client) {
      setSelectedClient({ id: held.client.id, name: held.client.name, phone: held.client.phone, priceListId: held.client.priceListId ?? null } as PickedClient);
      setClientType("existing");
    } else {
      setSelectedClient(null);
      setClientType("cash");
    }
    const changed = held.items.filter((i) => i.priceChanged);
    if (changed.length) {
      toast(
        `تغير السعر منذ التعليق: ${changed.map((i) => `${i.productName} (${formatCurrency(i.heldPrice)} ← ${formatCurrency(i.unitPrice)})`).join("، ")}`,
        { icon: "⚠️", duration: 8000 }
      );
    }
    if (held.removed.length) {
      toast.error(`منتجات حُذفت من النظام ولم تعد للسلة: ${held.removed.join("، ")}`, { duration: 8000 });
    }
    if (!changed.length && !held.removed.length) toast.success("تم استئناف الفاتورة");
    setTimeout(() => barcodeInputRef.current?.focus(), 50);
  };

  const resumeHeld = async (row: HeldSaleRow) => {
    // nothing in the cart is lost: it is held first
    if (itemsRef.current.length > 0) {
      const held = await holdCurrentCart("");
      if (!held) return;
    }
    try {
      const data = await heldSaleService.resume(row.id, companyId!);
      applyResumed(data);
      setShowHeldList(false);
    } catch (error) {
      toast.error(heldSaleError(error, "تعذر استئناف الفاتورة"));
    }
  };
  holdDialogOpenRef.current = showHoldModal || showHeldList;
  const openHoldRef = useRef(openHoldModal);
  openHoldRef.current = openHoldModal;

  const selectPayment = (method: SaleFormData["paymentMethod"]) => {
    setValue("paymentMethod", method);
    // Split: start with cash + card, cursor in the first amount
    if (method === "SPLIT") {
      if (splitRows.length === 0) {
        setSplitRows([
          { method: "CASH", amount: "" },
          { method: "CARD", amount: "" },
        ]);
      }
      setTimeout(() => splitAmountRefs.current[0]?.focus(), 0);
    }
    // A credit sale is a debt, so it needs a customer: go straight to the customer box
    if (method === "CREDIT" && clientType === "cash") {
      setClientType("existing");
      setValue("clientType", "existing");
    }
  };
  selectPaymentRef.current = selectPayment;

  // The sale area fills the window down to its bottom edge, so the total and the pay button
  // are always on screen (whatever sits above it: shift warning, shortcuts line...)
  const posGridRef = useRef<HTMLDivElement>(null);
  const [posHeight, setPosHeight] = useState<number | null>(null);
  useEffect(() => {
    const fit = () => {
      const el = posGridRef.current;
      if (!el || window.innerWidth < 1024) {
        setPosHeight(null);
        return;
      }
      const top = el.getBoundingClientRect().top + window.scrollY;
      setPosHeight(Math.max(420, Math.floor(window.innerHeight - top - 12)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [hasOpenShift, shiftLoading]);

  // The menu is not needed while selling: fold the sidebar to its icon rail, give it back on leaving
  useEffect(() => {
    useUIStore.getState().setPosFold(true);
    return () => useUIStore.getState().setPosFold(false);
  }, []);

  // Back to the barcode box after a click in the cart, so the next scan is not lost
  const focusScan = () =>
    setTimeout(() => {
      if (!weightFocusRef.current) barcodeInputRef.current?.focus();
    }, 0);

  // Handle cancel
  const handleCancel = useCallback(() => {
    navigate('/sales');
  }, [navigate]);



  // Product options for display — search and category filtering happen
  // server-side (see useProductsInfinite above), so this is just every
  // product page fetched so far.
  const productOptions = allLoadedProducts.map((product: any) => ({
    value: product.id,
    label: `${product.name} - ${formatCurrency(priceFor(product.id, product.sellingPrice))} (المتاح: ${formatQty(product.currentStock || product.stockQuantity, unitOf(product))})`,
    product,
  }));

  // Category options for filter
  const categoryOptions = [
    { value: "", label: "جميع الفئات" },
    ...((categoriesData as any)?.data?.list || []).map((category: any) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  return (
    <Layout compact>
      <div className="w-full space-y-3">
        {/* One header row: back, scan box, options. The work area gets the rest of the screen. */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => navigate('/sales')}
            title="العودة إلى المبيعات"
            className="flex-shrink-0 px-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowRight className="w-5 h-5" />
          </Button>
          <h1 className="hidden flex-shrink-0 text-lg font-bold text-gray-900 xl:block">بيع جديد</h1>
          <form onSubmit={handleBarcodeSubmit} className="flex min-w-0 flex-1 gap-2">
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="امسح الباركود أو اكتبه ثم Enter (F2)"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-right text-base focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
            <Button
              type="submit"
              disabled={!barcodeInput.trim()}
              className="flex-shrink-0 bg-primary-600 px-5 hover:bg-primary-700"
            >
              إضافة
            </Button>
          </form>
          <details className="relative flex-shrink-0">
            <summary
              title="اختصارات لوحة المفاتيح"
              className="flex h-10 cursor-pointer list-none items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-600 hover:bg-gray-50 [&::-webkit-details-marker]:hidden"
            >
              <Keyboard className="h-4 w-4" />
            </summary>
            <div className="absolute left-0 top-12 z-40 w-64 rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-lg">
              <p className="mb-2 font-semibold text-gray-800">اختصارات لوحة المفاتيح</p>
              <ul className="space-y-1 text-gray-600">
                {[
                  ["F2", "خانة الباركود"],
                  ["F3", "البحث عن منتج"],
                  ["F4", "تعليق الفاتورة"],
                  ["F6", "نقدي"],
                  ["F7", "بطاقة"],
                  ["F8", "محفظة"],
                  ["F9", "آجل"],
                  ["F10", "تقسيم الدفع"],
                  ["Ctrl+Enter", "إتمام البيع"],
                ].map(([key, label]) => (
                  <li key={key} className="flex justify-between">
                    <span>{label}</span>
                    <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 text-xs font-mono">{key}</kbd>
                  </li>
                ))}
              </ul>
            </div>
          </details>
          <AfterSalePrintMenu value={afterSaleMode} onChange={changeAfterSaleMode} />
          <label
            className="hidden flex-shrink-0 cursor-pointer select-none items-center gap-1 text-xs text-gray-500 lg:flex"
            title="عند الإيقاف يُحفظ البيع مباشرة بدون نافذة التأكيد (Ctrl+Enter للحفظ)"
          >
            <input
              type="checkbox"
              checked={!skipConfirm}
              onChange={(e) => toggleSkipConfirm(!e.target.checked)}
            />
            تأكيد قبل الحفظ
          </label>
          <Button
            onClick={handleCancel}
            variant="outline"
            className="flex-shrink-0 text-gray-600 hover:text-gray-900"
          >
            <X className="w-4 h-4 ml-1" />
            إلغاء
          </Button>
        </div>

        {/* No open shift: the sale is still allowed, but its cash is not counted in any drawer */}
        {!shiftLoading && !hasOpenShift && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">
                لا توجد وردية مفتوحة لك. يمكنك البيع، لكن نقدية هذه المبيعات لن تُحسب في أي درج نقدية.
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => navigate("/shifts")}
              className="flex-shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100"
            >
              فتح وردية
            </Button>
          </div>
        )}

        {/* POS Layout - Products Left, Cart Right */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleShowConfirm();
          }}
        >
          <div
            ref={posGridRef}
            className="grid grid-cols-1 gap-3 lg:grid-cols-12"
            style={posHeight ? { height: posHeight } : undefined}
          >

            {/* Products: wide screens = products | cart | payment; smaller = products | (cart over payment) */}
            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white lg:col-span-6 xl:col-span-4 2xl:col-span-5">
              {/* Category Tabs */}
              <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 p-2">
                <div className="flex gap-2 overflow-x-auto scrollbar-thin">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("")}
                    className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                      selectedCategory === ""
                        ? "bg-primary-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                    }`}
                  >
                    الكل
                  </button>
                  {(categoriesData as any)?.data?.list?.map((category: any) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategory(category.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                        selectedCategory === category.id
                          ? "bg-primary-600 text-white"
                          : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search */}
              <div className="flex-shrink-0 p-3 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    ref={productSearchRef}
                    placeholder="البحث عن منتج... (F3)"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Products Grid */}
              <div className="flex-1 overflow-y-auto p-3">
                {productOptions.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2 2xl:grid-cols-3">
                    {productOptions.map((option) => {
                      const isSelected = isProductSelected(option.product.id);
                      const selectedQuantity = getSelectedQuantity(option.product.id);
                      const stock = option.product.currentStock || option.product.stockQuantity;
                      const isOutOfStock = stock <= 0;
                      const isMaxReached = selectedQuantity >= stock;
                      // no selling price yet: shown, but can't be added (and says why)
                      const cardPrice = priceFor(option.product.id, option.product.sellingPrice);
                      const noPrice = !(cardPrice > 0);

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            addItem(option.product);
                            focusScan();
                          }}
                          disabled={isOutOfStock}
                          aria-disabled={noPrice}
                          title={noPrice ? "بدون سعر: حدّد سعره من قوائم الأسعار" : undefined}
                          className={`relative p-3 rounded-lg border text-right transition-all duration-200 ${
                            noPrice
                              ? "border-dashed border-gray-300 bg-gray-50 cursor-not-allowed"
                              : isSelected
                              ? isMaxReached
                                ? "border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50 shadow-md shadow-amber-100"
                                : "border-primary-400 bg-gradient-to-br from-primary-50 to-green-50 shadow-md shadow-primary-100"
                              : isOutOfStock
                              ? "border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed"
                              : "border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white"
                          }`}
                        >
                          {/* Selected Badge - Modern Style */}
                          {isSelected && (
                            <div className={`absolute -top-2 -right-2 px-2 py-0.5 text-white text-xs rounded-md font-bold shadow-sm flex items-center gap-1 ${
                              isMaxReached
                                ? "bg-gradient-to-r from-amber-500 to-orange-500"
                                : "bg-gradient-to-r from-primary-500 to-green-500"
                            }`}>
                              <span>×{selectedQuantity}</span>
                            </div>
                          )}

                          {/* Checkmark indicator */}
                          {isSelected && !isMaxReached && (
                            <div className="absolute top-2 left-2 w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}

                          {/* Max reached indicator */}
                          {isMaxReached && isSelected && (
                            <div className="absolute top-2 left-2 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                              </svg>
                            </div>
                          )}

                          <div className={`font-medium text-sm truncate mb-1 ${isSelected ? "text-gray-900" : "text-gray-700"}`}>
                            {option.product.name}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className={`text-xs ${
                              isMaxReached
                                ? "text-amber-600 font-medium"
                                : isSelected
                                  ? "text-primary-600"
                                  : "text-gray-500"
                            }`}>
                              {formatQty(stock, unitOf(option.product))} متاح
                            </span>
                            {noPrice ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">بدون سعر</span>
                            ) : (
                              <span className={`font-bold text-sm ${isSelected ? "text-primary-700" : "text-primary-600"}`}>
                                {formatCurrency(cardPrice)}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <Package className="w-12 h-12 mb-2 text-gray-300" />
                    <p className="text-sm">لا توجد منتجات</p>
                  </div>
                )}

                {/* Infinite scroll sentinel + loading indicator */}
                {productOptions.length > 0 && (
                  <div ref={productScrollSentinelRef} className="py-3 text-center">
                    {isFetchingNextPage && (
                      <span className="text-xs text-gray-400">جاري تحميل المزيد...</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Cart + payment. On wide screens this wrapper disappears and they become two columns. */}
            <div className="flex min-h-0 flex-col gap-3 lg:col-span-6 xl:contents">
              {/* Cart: takes all the height it can, scrolls on its own */}
              <div className="flex min-h-0 flex-1 basis-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white xl:col-span-4">
                <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2">
                  <h3 className="flex items-center gap-1.5 text-base font-semibold text-gray-900">
                    <ShoppingCart className="h-5 w-5" />
                    السلة
                  </h3>
                  <span className="text-sm text-gray-600">
                    {items.length === 0
                      ? "فارغة"
                      : items.some((i) => i.allowDecimalQty)
                        ? `${items.length} صنف`
                        : `${items.length} صنف · ${cartCountLabel(items)}`}
                  </span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  {items.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {items.map((item) => {
                        const key = lineKey(item);
                        const stock = getProductStock(item.productId) ?? item.stock ?? 0;
                        const productPieces = getSelectedQuantity(item.productId);
                        // another one of this line (a piece, or a whole pack) would not fit
                        const isMaxReached = addQty(productPieces, item.packFactor || 1) > stock;

                        return (
                          <div
                            key={key}
                            className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 transition-colors ${isMaxReached ? "bg-amber-50" : "hover:bg-gray-50"}`}
                          >
                            {/* name keeps at least ~9rem; on a narrow cart the controls drop to a second line */}
                            <div className="min-w-[9rem] flex-1">
                              <p className="truncate text-sm font-medium text-gray-900" title={item.productName}>{item.productName}</p>
                              {item.packs && item.packs.length > 0 && (
                                <div role="radiogroup" aria-label="البيع بالقطعة أو بالعبوة" className="mt-1 inline-flex overflow-hidden rounded-md border border-gray-200 text-xs">
                                  {[{ id: "", label: item.piece?.allowDecimalQty ? item.unit || "وحدة" : "قطعة" }, ...item.packs.map((p) => ({ id: p.id, label: `${p.name} ${formatQty(p.factor)}` }))].map((opt, k) => {
                                    const selected = (item.packId || "") === opt.id;
                                    return (
                                      <button
                                        key={opt.id || "piece"}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        onClick={() => {
                                          changeLinePack(key, opt.id);
                                          focusScan();
                                        }}
                                        className={`px-2 py-1 font-medium transition-colors ${k > 0 ? "border-r border-gray-200" : ""} ${
                                          selected ? "bg-primary-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-500">
                                <LinePrice
                                  price={item.unitPrice}
                                  original={originalPrice(item)}
                                  suffix={item.packName ? ` / ${item.packName}` : item.allowDecimalQty && item.unit ? ` / ${item.unit}` : ""}
                                  editable={canNegotiate}
                                  onChange={(price) => setLinePrice(key, price)}
                                  onDone={focusScan}
                                />
                                {item.packFactor ? <span className="whitespace-nowrap text-gray-400">= {formatQty(piecesOf(item), item.piece?.allowDecimalQty ? item.unit : "قطعة")}</span> : null}
                                {isMaxReached && <span className="whitespace-nowrap text-amber-600">· آخر الكمية</span>}
                              </p>
                            </div>
                            <div className="mr-auto flex flex-shrink-0 items-center gap-2">
                            <div className="flex items-center gap-1">
                              {!item.allowDecimalQty && (
                                <button
                                  type="button"
                                  aria-label="إنقاص الكمية"
                                  onClick={() => {
                                    updateQuantity(key, item.quantity - 1);
                                    focusScan();
                                  }}
                                  className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-gray-100 transition-all hover:bg-gray-200 active:scale-95"
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                              )}
                              <QtyInput
                                ref={(el) => {
                                  if (el) qtyInputRefs.current.set(key, el);
                                  else qtyInputRefs.current.delete(key);
                                }}
                                product={item}
                                value={item.quantity}
                                aria-label={item.allowDecimalQty ? `الوزن / الكمية (${item.unit || "وحدة"})` : "الكمية"}
                                onChange={(q) => updateQuantity(key, q)}
                                onInvalid={(m) => toast.error(m)}
                                onKeyDown={(e) => {
                                  // Enter = done with this line: back to scanning, not "save the sale"
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    focusScan();
                                  }
                                }}
                                className={`${item.allowDecimalQty ? "w-20" : "w-12"} h-8 rounded-md border border-gray-300 px-1 text-center text-base font-bold focus:border-primary-500 focus:ring-1 focus:ring-primary-500 ${
                                  isMaxReached ? "text-amber-600" : "text-gray-900"
                                }`}
                              />
                              {item.allowDecimalQty && item.unit && (
                                <span className="w-8 text-xs text-gray-500">{item.unit}</span>
                              )}
                              {!item.allowDecimalQty && (
                                <button
                                  type="button"
                                  aria-label="زيادة الكمية"
                                  onClick={() => {
                                    updateQuantity(key, item.quantity + 1);
                                    focusScan();
                                  }}
                                  disabled={isMaxReached}
                                  className={`flex h-8 w-8 items-center justify-center rounded-md border transition-all active:scale-95 ${
                                    isMaxReached
                                      ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                                      : "border-primary-200 bg-primary-50 text-primary-600 hover:bg-primary-100"
                                  }`}
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                            <span className="w-24 whitespace-nowrap text-left text-base font-bold text-gray-900">
                              {formatCurrency(item.total)}
                            </span>
                            <button
                              type="button"
                              aria-label="حذف من السلة"
                              title="حذف"
                              onClick={() => {
                                removeItem(key);
                                focusScan();
                              }}
                              className="flex-shrink-0 rounded p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center py-8 text-gray-400">
                      <ShoppingCart className="mb-2 h-12 w-12" />
                      <p className="text-sm">امسح باركود أو اختر منتجاً</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment: options scroll, totals + buttons stay at the bottom */}
              <div className="flex min-h-0 flex-1 basis-0 flex-col gap-3 xl:col-span-4 2xl:col-span-3">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3">
                {/* Client Type - Compact */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">العميل</label>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { value: "cash", label: "نقدي" },
                      { value: "existing", label: "مسجل" },
                      { value: "new", label: "جديد" },
                    ].map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => {
                          setClientType(type.value as any);
                          setValue("clientType", type.value as any);
                          if (type.value !== "existing") {
                            setValue("clientId", undefined);
                            setSelectedClient(null);
                          }
                        }}
                        className={`h-9 px-2 rounded-md text-sm font-medium transition-all ${
                          clientType === type.value
                            ? "bg-primary-600 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Client Selection */}
                {clientType === "existing" && (
                  <ClientPicker
                    companyId={companyId!}
                    value={selectedClient}
                    onChange={(client) => {
                      setSelectedClient(client);
                      setValue("clientId", client ? client.id : undefined);
                    }}
                  />
                )}
                {clientType === "existing" && clientBalance && (() => {
                  const owes = clientBalance.outstandingBalance || 0;
                  const limit = clientBalance.creditLimit;
                  const newDebt = watch("paymentMethod") === "CREDIT"
                    ? Math.max(0, roundedTotal - (Number(watch("paidAmount")) || 0))
                    : isSplit
                      ? Math.max(0, splitRest)
                      : 0;
                  const over = limit !== null && owes + newDebt > limit + 0.01;
                  return (
                    <div className={`rounded px-2 py-1.5 text-xs ${over ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-600"}`}>
                      <span>المديونية الحالية: <b>{formatCurrency(owes)}</b></span>
                      {limit !== null && <span> — حد الائتمان: <b>{formatCurrency(limit)}</b></span>}
                      {over && <div className="mt-0.5 font-medium">هذا البيع الآجل يتجاوز حد الائتمان</div>}
                    </div>
                  );
                })()}

                {priceLists.length > 1 && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">قائمة الأسعار</label>
                    <div className="flex flex-wrap gap-1">
                      {priceLists.map((list) => (
                        <button
                          key={list.id}
                          type="button"
                          onClick={() => setChosenPriceListId(list.id)}
                          className={`h-8 px-3 rounded-md text-sm font-medium transition-all ${
                            selectedPriceList?.id === list.id
                              ? "bg-emerald-600 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          {list.name}
                        </button>
                      ))}
                    </div>
                    {customerPriceListId && selectedPriceList?.id === customerPriceListId && (
                      <p className="mt-1 text-xs text-emerald-700">قائمة العميل</p>
                    )}
                  </div>
                )}

                {clientType === "new" && (
                  <div className="space-y-2">
                    <Input
                      placeholder="اسم العميل *"
                      {...register("newClientName")}
                      className="text-sm"
                      error={errors.newClientName?.message}
                    />
                    <Input
                      placeholder="رقم الهاتف *"
                      {...register("newClientPhone")}
                      className="text-sm"
                      error={errors.newClientPhone?.message}
                    />
                  </div>
                )}

                {/* Payment Method - Compact */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">الدفع</label>
                  <div className="grid grid-cols-5 gap-1">
                    {[
                      { value: "CASH", label: "نقدي", key: "F6" },
                      { value: "CARD", label: "بطاقة", key: "F7" },
                      { value: "MOBILE_WALLET", label: "محفظة", key: "F8" },
                      { value: "CREDIT", label: "آجل", key: "F9" },
                      { value: "SPLIT", label: "تقسيم", key: "F10" },
                    ].map((method) => (
                      <button
                        key={method.value}
                        type="button"
                        title={method.key}
                        onClick={() => selectPayment(method.value as SaleFormData["paymentMethod"])}
                        className={`h-9 px-2 rounded-md text-sm font-medium transition-all ${
                          watch("paymentMethod") === method.value
                            ? "bg-primary-600 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {method.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tax & Discount - Compact Row */}
                <div className="grid grid-cols-2 gap-2">
                  <Select
                    options={[
                      { value: "", label: "بدون ضريبة" },
                      ...(Array.isArray(taxSettingsData)
                        ? taxSettingsData
                        : (taxSettingsData as any)?.data || []
                      ).map((tax: any) => ({
                        value: tax.id,
                        label: `${tax.rate}%`,
                      })),
                    ]}
                    value={watch("taxSettingId") || ""}
                    onChange={(value) => setValue("taxSettingId", value || undefined)}
                    placeholder="ضريبة"
                  />
                  <Select
                    options={[
                      { value: "none", label: "بدون خصم" },
                      { value: "amount", label: "مبلغ" },
                      { value: "percent", label: "نسبة %" },
                    ]}
                    value={watch("discountType") || "none"}
                    onChange={(value) => setValue("discountType", value as any)}
                  />
                </div>

                {watch("discountType") === "amount" && (
                  <Input
                    type="number"
                    placeholder="مبلغ الخصم"
                    {...register("discountAmount", { valueAsNumber: true })}
                    className="text-sm"
                  />
                )}

                {watch("discountType") === "percent" && (
                  <Input
                    type="number"
                    placeholder="نسبة الخصم %"
                    {...register("discountPercent", { valueAsNumber: true })}
                    className="text-sm"
                  />
                )}

                {watch("paymentMethod") === "CREDIT" && (
                  <div className="space-y-1">
                    <Input
                      type="number"
                      min={0}
                      placeholder="المبلغ المدفوع مقدماً (اتركه فارغاً إن لم يُدفع شيء)"
                      {...register("paidAmount", { valueAsNumber: true })}
                      className="text-sm"
                    />
                    {clientType === "cash" && (
                      <p className="text-xs text-amber-700">البيع الآجل يتطلب اختيار عميل</p>
                    )}
                  </div>
                )}

                {isSplit && (
                  <div className="space-y-1.5 rounded-lg border border-purple-200 bg-purple-50/40 p-2">
                    {splitRows.map((row, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <select
                          aria-label="طريقة الدفع"
                          value={row.method}
                          onChange={(e) =>
                            setSplitRows((rows) => rows.map((r, j) => (j === i ? { ...r, method: e.target.value as SplitPartMethod } : r)))
                          }
                          className="h-9 rounded-md border border-gray-300 bg-white px-1 text-sm"
                        >
                          {SPLIT_PART_METHODS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                        <input
                          ref={(el) => { splitAmountRefs.current[i] = el; }}
                          inputMode="decimal"
                          placeholder="المبلغ"
                          value={row.amount}
                          onChange={(e) =>
                            setSplitRows((rows) => rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))
                          }
                          onKeyDown={(e) => {
                            // Enter moves to the next amount (never finishes the sale by itself)
                            if (e.key === "Enter") {
                              e.preventDefault();
                              splitAmountRefs.current[i + 1]?.focus();
                            }
                          }}
                          className="h-9 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 text-base"
                        />
                        <button
                          type="button"
                          title="ضع الباقي في هذه الطريقة"
                          disabled={splitRest <= 0}
                          onClick={() =>
                            setSplitRows((rows) =>
                              rows.map((r, j) =>
                                j === i ? { ...r, amount: String(Math.round((splitAmount(r.amount) + splitRest) * 100) / 100) } : r
                              )
                            )
                          }
                          className="h-9 rounded-md bg-white px-2 text-xs font-medium text-purple-700 border border-purple-200 hover:bg-purple-50 disabled:opacity-40"
                        >
                          الباقي
                        </button>
                        {splitRows.length > 1 && (
                          <button
                            type="button"
                            aria-label="حذف"
                            onClick={() => setSplitRows((rows) => rows.filter((_, j) => j !== i))}
                            className="h-9 w-7 rounded text-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs">
                      {splitRows.length < MAX_SPLIT_PARTS ? (
                        <button
                          type="button"
                          onClick={() => {
                            const used = new Set(splitRows.map((r) => r.method));
                            const next = SPLIT_PART_METHODS.find((m) => !used.has(m.value))?.value || "CASH";
                            setSplitRows((rows) => [...rows, { method: next, amount: "" }]);
                            setTimeout(() => splitAmountRefs.current[splitRows.length]?.focus(), 0);
                          }}
                          className="font-medium text-purple-700 hover:underline"
                        >
                          + طريقة أخرى
                        </button>
                      ) : <span />}
                      <span className={`font-semibold ${splitRest < -0.01 ? "text-red-600" : splitRest > 0.01 ? "text-amber-700" : "text-green-700"}`}>
                        {splitRest < -0.01
                          ? `أكبر من الإجمالي بـ ${formatCurrency(-splitRest)}`
                          : splitRest > 0.01
                            ? `المتبقي: ${formatCurrency(splitRest)}`
                            : "تم تغطية الإجمالي"}
                      </span>
                    </div>
                    {splitRest > 0.01 && (
                      <p className="text-xs text-amber-700">
                        {clientType === "cash" ? "المتبقي يُسجل آجلاً على العميل: اختر عميلاً أو أكمل المبلغ" : "المتبقي يُسجل آجلاً على العميل"}
                      </p>
                    )}
                  </div>
                )}

                {takesCash && (
                  <div className="space-y-1">
                    <Input
                      type="number"
                      min={0}
                      placeholder={isSplit ? `المستلم نقداً (الجزء النقدي ${formatCurrency(splitCash)}) — اختياري` : "المبلغ المستلم من العميل"}
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                      onKeyDown={(e) => {
                        // type the cash handed over, Enter = finish the sale
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (!isSplit) handleShowConfirm();
                        }
                      }}
                      className="text-sm"
                    />
                    {changeDue !== null && (
                      <p className={`text-sm font-semibold ${changeDue >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {changeDue >= 0 ? `الباقي للعميل: ${formatCurrency(changeDue)}` : `المبلغ غير كافٍ، ينقص ${formatCurrency(-changeDue)}`}
                      </p>
                    )}
                  </div>
                )}

                {/* Additional fees: rarely used, so one link until needed */}
                {!showFees && !(watch("additionalFee") > 0) ? (
                  <button
                    type="button"
                    onClick={() => setShowFees(true)}
                    className="text-xs font-medium text-primary-700 hover:underline"
                  >
                    + رسوم إضافية (توصيل، تغليف...)
                  </button>
                ) : (
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-600">رسوم إضافية</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        placeholder="المبلغ"
                        {...register("additionalFee", { valueAsNumber: true })}
                        className="text-sm"
                        min="0"
                        step="0.01"
                      />
                      <Input type="text" placeholder="الوصف (مثلاً توصيل)" {...register("additionalFeeLabel")} className="text-sm" />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setValue("additionalFee", 0);
                        setValue("additionalFeeLabel", undefined);
                        setShowFees(false);
                      }}
                      className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                    >
                      <X className="w-3 h-3" />
                      إزالة الرسوم
                    </button>
                  </div>
                )}
              </div>

              {/* Totals & Submit */}
              <div className="flex-shrink-0 bg-white rounded-lg border border-gray-200 p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
                <div className="space-y-1 text-sm mb-3">
                  <div className="flex justify-between text-gray-600">
                    <span>المجموع الفرعي</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>الخصم</span>
                      <span>-{formatCurrency(discountAmount)}</span>
                    </div>
                  )}
                  {taxAmount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>الضريبة</span>
                      <span>+{formatCurrency(taxAmount)}</span>
                    </div>
                  )}
                  {additionalFee > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>{watch("additionalFeeLabel") || "رسوم إضافية"}</span>
                      <span>+{formatCurrency(additionalFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200">
                    <span>المجموع</span>
                    <span className="text-primary-600">{formatCurrency(total)}</span>
                  </div>
                </div>

                <div className="mb-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    title="تعليق الفاتورة (F4)"
                    onClick={openHoldModal}
                    disabled={items.length === 0 || holding}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-40"
                  >
                    <PauseCircle className="h-4 w-4" />
                    تعليق
                  </button>
                  <button
                    type="button"
                    title="الفواتير المعلقة"
                    onClick={() => setShowHeldList(true)}
                    className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium ${
                      heldCount > 0
                        ? "border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <ListRestart className="h-4 w-4" />
                    معلقة{heldCount > 0 ? ` (${heldCount})` : ""}
                  </button>
                </div>
                <Button
                  type="button"
                  onClick={handleShowConfirm}
                  disabled={createSaleMutation.isPending || items.length === 0}
                  className={`w-full py-3 text-lg font-bold ${
                    items.length === 0
                      ? "bg-gray-300 cursor-not-allowed"
                      : "bg-primary-600 hover:bg-primary-700"
                  }`}
                >
                  {createSaleMutation.isPending ? "جاري الإنشاء..." : `إتمام البيع - ${formatCurrency(total)}`}
                </Button>
              </div>
              </div>
            </div>
          </div>
        </form>

        {/* Confirmation Modal */}
        <Modal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          title="تأكيد عملية البيع"
          size="md"
        >
          <div className="space-y-4">
            {/* Summary: what the cashier gets wrong most is who pays and how */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">العميل:</span>
                <span className="font-medium">
                  {clientType === "cash"
                    ? "عميل نقدي"
                    : clientType === "new"
                      ? `${watch("newClientName") || "-"} (جديد)`
                      : selectedClient?.name || "لم يُختر عميل"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">طريقة الدفع:</span>
                <span className="font-medium">
                  {isSplit
                    ? partsLabel(splitRows.map((r) => ({ method: r.method, amount: splitAmount(r.amount) })).filter((r) => r.amount > 0))
                    : { CASH: "نقدي", CARD: "بطاقة", MOBILE_WALLET: "محفظة", CREDIT: "آجل", SPLIT: "تقسيم" }[watch("paymentMethod")]}
                </span>
              </div>
              {priceLists.length > 1 && selectedPriceList && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">قائمة الأسعار:</span>
                  <span className="font-medium">{selectedPriceList.name}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">عدد المنتجات:</span>
                <span className="font-medium">{items.length} منتج</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">إجمالي الكمية:</span>
                <span className="font-medium">{cartCountLabel(items)}</span>
              </div>
              {(() => {
                const changed = items.filter((i) => i.negotiated);
                if (!changed.length) return null;
                const far = changed.filter((i) => Math.abs(priceGap(i.unitPrice, originalPrice(i))) > NEGOTIATION_WARN_PERCENT + 1e-9).length;
                const diff = changed.reduce((sum, i) => sum + qtyTimes(i.quantity, i.unitPrice) - qtyTimes(i.quantity, originalPrice(i)), 0);
                return (
                  <div className={`flex justify-between gap-2 text-sm ${far ? "text-amber-700" : "text-gray-600"}`}>
                    <span className="inline-flex items-center gap-1">
                      {far > 0 && <AlertTriangle className="h-3.5 w-3.5" />}
                      سعر متفاوض عليه: {changed.length} منتج{far > 0 ? ` (${far} بفرق أكثر من ${NEGOTIATION_WARN_PERCENT}%)` : ""}
                    </span>
                    <span className="whitespace-nowrap font-medium">{diff >= 0 ? "+" : "-"}{formatCurrency(Math.abs(diff))}</span>
                  </div>
                );
              })()}
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-red-600">
                  <span>الخصم:</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">الضريبة:</span>
                  <span>+{formatCurrency(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
                <span>المجموع الكلي:</span>
                <span className="text-primary-600">{formatCurrency(total)}</span>
              </div>
              {isSplit && splitRest > 0.01 && (
                <div className="flex justify-between text-sm font-semibold text-amber-700">
                  <span>الباقي على العميل (آجل):</span>
                  <span>{formatCurrency(splitRest)}</span>
                </div>
              )}
              {takesCash && changeDue !== null && changeDue >= 0 && (
                <div className="flex justify-between text-sm font-semibold text-green-700">
                  <span>المستلم {formatCurrency(Number(received))} — الباقي للعميل:</span>
                  <span>{formatCurrency(changeDue)}</span>
                </div>
              )}
              {watch("paymentMethod") === "CREDIT" && (
                <div className="flex justify-between text-sm font-semibold text-amber-700">
                  <span>مدفوع مقدماً {formatCurrency(Math.min(Number(watch("paidAmount")) || 0, roundedTotal))} — الباقي على العميل:</span>
                  <span>{formatCurrency(Math.max(roundedTotal - (Number(watch("paidAmount")) || 0), 0))}</span>
                </div>
              )}
            </div>

            {/* Confirmation message */}
            <p className="text-gray-600 text-center">
              هل أنت متأكد من إتمام عملية البيع؟
            </p>
            <label className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <input
                type="checkbox"
                checked={skipConfirm}
                onChange={(e) => toggleSkipConfirm(e.target.checked)}
              />
              لا تسألني مرة أخرى (الحفظ مباشرة — اختصار Ctrl+Enter)
            </label>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowConfirmModal(false)}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleSubmit(handleSaleSubmit, handleInvalid)}
                disabled={createSaleMutation.isPending}
                className="bg-primary-600 hover:bg-primary-700"
              >
                {createSaleMutation.isPending ? "جاري الإنشاء..." : "تأكيد البيع"}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Hold sale: an optional name so the cart is easy to find later */}
        <Modal isOpen={showHoldModal} onClose={() => setShowHoldModal(false)} title="تعليق الفاتورة" size="sm">
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (holding) return;
              const ok = await holdCurrentCart(holdLabel);
              if (ok) setShowHoldModal(false);
            }}
          >
            <p className="text-sm text-gray-600">
              {items.length} صنف — {formatCurrency(roundedTotal)}. تُحفظ السلة ويمكن إكمالها من أي جهاز في المحل.
            </p>
            <Input
              autoFocus
              placeholder="اسم أو ملاحظة (اختياري) — مثال: أحمد، البدلة الزرقاء"
              value={holdLabel}
              maxLength={100}
              onChange={(e) => setHoldLabel(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={holding} className="flex-1">
                {holding ? "جاري التعليق..." : "تعليق"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowHoldModal(false)}>
                إلغاء
              </Button>
            </div>
          </form>
        </Modal>

        <HeldSalesModal
          isOpen={showHeldList}
          onClose={() => setShowHeldList(false)}
          companyId={companyId || 0}
          currentUserId={user?.id}
          canDeleteAny={role === "ADMIN" || role === "MANAGER"}
          cartHasItems={items.length > 0}
          onResume={resumeHeld}
        />

        {/* Print Receipt Preview Modal */}
        {printableSale && (
          <PrintReceiptPreview
            sale={printableSale}
            companyId={company?.companyId || company?.id || 0}
            cashier={user}
            isOpen={showPrintModal}
            onClose={() => {
              setShowPrintModal(false);
              setPrintableSale(null);
              if (previewResetsRef.current) resetForNextSale();
              else setTimeout(() => barcodeInputRef.current?.focus(), 50);
            }}
          />
        )}
      </div>
    </Layout>
  );
};

export default SalesCreate;
