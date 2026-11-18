import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, X, ShoppingCart, Plus, Minus, Trash2, Search, Package, AlertTriangle } from "lucide-react";
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
import { saleToReceiptData } from "../services/receiptHtmlTemplate";
import { PrintReceiptPreview } from "../components/printer/PrintReceiptPreview";
import { usePrinterConfigStore } from "../stores/printerConfigStore";
import { companyService } from "../services/companyService";
import QtyInput from "../components/ui/QtyInput";
import { addQty, allowsDecimal, cartCountLabel, formatQty, qtyTimes, toQty, unitOf } from "../utils/quantity";

// Number inputs registered with valueAsNumber give NaN when left empty: treat that as "not entered"
const isBlank = (v: unknown) => v === "" || v === null || v === undefined || (typeof v === "number" && Number.isNaN(v));
const blankAsZero = (schema: z.ZodTypeAny) => z.preprocess((v) => (isBlank(v) ? 0 : v), schema);
const blankAsUndefined = (schema: z.ZodTypeAny) => z.preprocess((v) => (isBlank(v) ? undefined : v), schema);

// Define the base schema without refine for proper type inference
const saleBaseSchema = z.object({
  clientType: z.enum(["cash", "existing", "new"]),
  clientId: z.number().optional(),
  paymentMethod: z.enum(["CASH", "CARD", "MOBILE_WALLET", "CREDIT"]),
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
}

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
  const qtyInputRefs = useRef(new Map<number, HTMLInputElement>());
  const [focusQtyFor, setFocusQtyForState] = useState<number | null>(null);
  // While true, the "back to the barcode box" focus is skipped so the weight field keeps the cursor
  const weightFocusRef = useRef(false);
  const setFocusQtyFor = (productId: number) => {
    weightFocusRef.current = true;
    setFocusQtyForState(productId);
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
  const toggleSkipConfirm = (value: boolean) => {
    setSkipConfirm(value);
    try {
      localStorage.setItem("sellx.sale.skipConfirm", value ? "1" : "0");
    } catch {
      /* storage unavailable: the choice lasts for this screen only */
    }
  };
  const [showPrintModal, setShowPrintModal] = useState(false);
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
  useEffect(() => {
    if (!defaultPriceList) return;
    const fromCustomer = priceLists.find((l) => l.id === customerPriceListId);
    setChosenPriceListId(fromCustomer ? fromCustomer.id : defaultPriceList.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientType, selectedClientId, customerPriceListId, defaultPriceList?.id]);

  // Reprice the cart whenever the list (or its prices) change
  useEffect(() => {
    if (!listIsDefault && !listPrices) return;
    setItems((prev) =>
      prev.map((item) => {
        const unitPrice = priceFor(item.productId, item.basePrice);
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

  // Cash tendered by the customer and the change to hand back
  const [received, setReceived] = useState("");
  const changeDue = received.trim() === "" ? null : Math.round((Number(received) - roundedTotal) * 100) / 100;
  const cashShortRef = useRef(false);
  cashShortRef.current = watch("paymentMethod") === "CASH" && changeDue !== null && changeDue < 0;

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

      if (product) {
        addItem(product);
        setBarcodeInput(""); // Clear input
        // one short message that the next scan replaces (they used to pile up)
        toast.success(`تمت الإضافة: ${product.name}`, { id: "pos-scan", duration: 1500 });

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
      toast.error(errorMsg);
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
  const addItem = (product: any) => {
    const stock = toQty(product.currentStock || product.stockQuantity || 0);
    const current = itemsRef.current;
    const existingItem = current.find(item => item.productId === product.id);
    const currentQuantity = existingItem?.quantity || 0;
    const weighed = allowsDecimal(product);

    // Weighed goods: scanning again doesn't add "one more kilo", it opens the weight to edit
    if (existingItem && weighed) {
      setFocusQtyFor(product.id);
      return;
    }

    // Check stock validation
    if (currentQuantity >= stock) {
      toast.error(`لا يمكن إضافة المزيد - الكمية المتاحة: ${formatQty(stock, unitOf(product))}`);
      return;
    }

    if (existingItem) {
      // Update quantity
      const newQuantity = addQty(existingItem.quantity, 1);
      const newItems = current.map(item =>
        item.productId === product.id
          ? {
              ...item,
              quantity: newQuantity,
              total: qtyTimes(newQuantity, item.unitPrice),
              stock,
            }
          : item
      );
      setItems(newItems);
    } else {
      // Add new item: 1 piece, or 1 unit (kg / m) for weighed goods, then type the weight
      const unitPrice = priceFor(product.id, product.sellingPrice);
      const quantity = weighed ? Math.min(1, stock) : 1;
      const newItem: SaleItem = {
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice,
        basePrice: Number(product.sellingPrice) || 0,
        total: qtyTimes(quantity, unitPrice),
        stock,
        allowDecimalQty: weighed,
        unit: unitOf(product) || null,
      };
      setItems([...current, newItem]);
      if (weighed) setFocusQtyFor(product.id);
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

  // Update item quantity
  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }

    // Get current quantity to check if increasing
    const currentItem = itemsRef.current.find(item => item.productId === productId);
    const currentQuantity = currentItem?.quantity || 0;

    // Only validate stock when INCREASING quantity
    if (quantity > currentQuantity) {
      // Prefer live stock from the loaded product list, but fall back to the
      // stock captured when the item was added (e.g. via barcode scan for a
      // product not present in the currently loaded product page).
      const stock = getProductStock(productId) ?? currentItem?.stock ?? 0;
      if (quantity > stock) {
        toast.error(`الكمية المطلوبة تتجاوز المخزون المتاح: ${formatQty(stock, currentItem?.unit)}`);
        return;
      }
    }

    const newItems = itemsRef.current.map(item =>
      item.productId === productId
        ? {
            ...item,
            quantity,
            total: qtyTimes(quantity, item.unitPrice),
          }
        : item
    );
    setItems(newItems);
  };

  // Remove item
  const removeItem = (productId: number) => {
    setItems(prev => prev.filter(item => item.productId !== productId));
  };

  // Check if product is already selected
  const isProductSelected = (productId: number) => {
    return items.some(item => item.productId === productId);
  };

  // Get selected item quantity
  const getSelectedQuantity = (productId: number) => {
    const item = items.find(item => item.productId === productId);
    return item ? item.quantity : 0;
  };


  // Show confirmation modal before sale
  const handleShowConfirm = useCallback(() => {
    if (itemsRef.current.length === 0) {
      toast.error("يجب إضافة منتجات للبيع");
      return;
    }
    if (cashShortRef.current) {
      toast.error("المبلغ المستلم أقل من الإجمالي");
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
  const selectPaymentRef = useRef<(method: SaleFormData["paymentMethod"]) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // F2 barcode, F3 product search, F6-F9 payment method (no dialog open)
      if (!showConfirmModal && !showPrintModal) {
        const payKeys: Record<string, SaleFormData["paymentMethod"]> = {
          F6: "CASH",
          F7: "CARD",
          F8: "MOBILE_WALLET",
          F9: "CREDIT",
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

      // Credit (آجل): only the down payment typed in the field is paid (empty = nothing paid).
      // Every other method is paid in full at the till.
      if (data.paymentMethod === "CREDIT") {
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


      // Get printer config to check auto-print setting
      const printerConfig = usePrinterConfigStore.getState();

      // Extract the actual sale data from the response
      const saleData_fromAPI = (createdSale as any)?.data || {};

      // Prepare sale with items for printing
      const saleWithItems = {
        ...saleData_fromAPI,  // Data returned from API
        ...saleData,          // Original sale data (fallback)
        change: data.paymentMethod === "CASH" && changeDue !== null && changeDue > 0 ? changeDue : 0,
        // cash handed over by the customer (printed as المستلم next to the change)
        received: data.paymentMethod === "CASH" && changeDue !== null && changeDue >= 0 ? Number(received) : undefined,
        clientName:
          saleData_fromAPI.client?.name ||
          (clientId && selectedClient?.id === clientId ? selectedClient.name : undefined) ||
          (data.clientType === "new" ? data.newClientName : undefined),
        items: items.map(item => ({
          ...item,
          productName: item.productName,
          product: { name: item.productName, unit: item.unit, allowDecimalQty: item.allowDecimalQty }
        })),
      };


      // Auto-print if enabled
      if (printerConfig.autoPrintOnPayment) {
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
        setPrintableSale(saleWithItems);
        setShowPrintModal(true);
      }
    } catch (error: any) {
      // The sale/client mutations already showed the server's message
      console.error("[SalesCreate] Error creating sale:", error);
    }
  }, [items, createSaleMutation, createClientMutation, companyId, roundedTotal, changeDue, discountAmount, received, selectedClient, selectedPriceList, listIsDefault, listPricesLoading, listPrices]);
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

  const selectPayment = (method: SaleFormData["paymentMethod"]) => {
    setValue("paymentMethod", method);
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
    <Layout>
      <div className="w-full space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Button
              variant="ghost"
              onClick={() => navigate('/sales')}
              className="flex items-center space-x-2 space-x-reverse text-gray-600 hover:text-gray-900"
            >
              <ArrowRight className="w-4 h-4" />
              <span>العودة</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">عملية بيع جديدة</h1>
            </div>
          </div>
          <div className="flex items-center space-x-2 space-x-reverse">
            <label
              className="flex items-center gap-1 text-xs text-gray-500 ml-2 cursor-pointer select-none"
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
              className="text-gray-600 hover:text-gray-900"
            >
              <X className="w-4 h-4 ml-1" />
              إلغاء
            </Button>
          </div>
        </div>

        {/* No open shift: the sale is still allowed, but its cash is not counted in any drawer */}
        {!shiftLoading && !hasOpenShift && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
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

        {/* Barcode Scanner Input */}
        <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="امسح الباركود أو اكتبه ثم Enter (F2)"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-right"
              autoFocus
            />
          </div>
          <Button
            type="submit"
            disabled={!barcodeInput.trim()}
            className="bg-primary-600 hover:bg-primary-700 px-6"
          >
            إضافة
          </Button>
        </form>
        <p className="-mt-2 text-[11px] text-gray-400">
          اختصارات: F2 الباركود · F3 البحث · F6 نقدي · F7 بطاقة · F8 محفظة · F9 آجل · Ctrl+Enter إتمام البيع
        </p>

        {/* POS Layout - Products Left, Cart Right */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleShowConfirm();
          }}
        >
          <div
            ref={posGridRef}
            className="grid grid-cols-1 lg:grid-cols-12 gap-4"
            style={posHeight ? { height: posHeight } : undefined}
          >

            {/* LEFT SIDE - Products (8 columns) */}
            <div className="lg:col-span-8 flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {productOptions.map((option) => {
                      const isSelected = isProductSelected(option.product.id);
                      const selectedQuantity = getSelectedQuantity(option.product.id);
                      const stock = option.product.currentStock || option.product.stockQuantity;
                      const isOutOfStock = stock <= 0;
                      const isMaxReached = selectedQuantity >= stock;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            addItem(option.product);
                            focusScan();
                          }}
                          disabled={isOutOfStock}
                          className={`relative p-3 rounded-lg border text-right transition-all duration-200 ${
                            isSelected
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
                            <span className={`font-bold text-sm ${isSelected ? "text-primary-700" : "text-primary-600"}`}>
                              {formatCurrency(priceFor(option.product.id, option.product.sellingPrice))}
                            </span>
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

            {/* RIGHT SIDE - Cart & Info (4 columns) */}
            <div className="lg:col-span-4 flex min-h-0 flex-col gap-3">
              {/* Cart and sale options scroll; the totals and the pay button below always stay on screen */}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
              {/* Cart Items */}
              <div className="bg-white rounded-lg border border-gray-200 flex flex-col">
                <div className="px-2 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
                      <ShoppingCart className="w-4 h-4" />
                      السلة
                    </h3>
                    <span className="text-xs text-gray-500">{items.length} منتج</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {items.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {items.map((item) => {
                        const stock = getProductStock(item.productId) ?? item.stock ?? 0;
                        const isMaxReached = item.quantity >= stock;

                        return (
                          <div key={item.productId} className={`px-2 py-2 transition-colors ${isMaxReached ? "bg-amber-50" : "hover:bg-gray-50"}`}>
                            <div className="flex justify-between items-center">
                              <span className="flex-1 ml-1 min-w-0">
                                <span className="block font-medium text-gray-900 text-xs truncate">{item.productName}</span>
                                <span className="block text-[11px] text-gray-500">
                                  {formatQty(item.quantity, item.unit)} × {formatCurrency(item.unitPrice)}
                                  {item.allowDecimalQty && item.unit ? ` / ${item.unit}` : ""}
                                </span>
                              </span>
                              <button
                                type="button"
                                aria-label="حذف من السلة"
                                onClick={() => {
                                  removeItem(item.productId);
                                  focusScan();
                                }}
                                className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between mt-1.5">
                              <div className="flex items-center gap-0.5">
                                {!item.allowDecimalQty && <button
                                  type="button"
                                  aria-label="إنقاص الكمية"
                                  onClick={() => {
                                    updateQuantity(item.productId, item.quantity - 1);
                                    focusScan();
                                  }}
                                  className="w-7 h-7 rounded bg-gray-100 border border-gray-200 flex items-center justify-center hover:bg-gray-200 active:scale-95 transition-all"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>}
                                <QtyInput
                                  ref={(el) => {
                                    if (el) qtyInputRefs.current.set(item.productId, el);
                                    else qtyInputRefs.current.delete(item.productId);
                                  }}
                                  product={item}
                                  value={item.quantity}
                                  aria-label={item.allowDecimalQty ? `الوزن / الكمية (${item.unit || "وحدة"})` : "الكمية"}
                                  onChange={(q) => updateQuantity(item.productId, q)}
                                  onInvalid={(m) => toast.error(m)}
                                  onKeyDown={(e) => {
                                    // Enter = done with this line: back to scanning, not "save the sale"
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      focusScan();
                                    }
                                  }}
                                  className={`${item.allowDecimalQty ? "w-20" : "w-12"} rounded border border-gray-200 px-1 py-0.5 text-center text-sm font-bold focus:border-primary-500 focus:ring-1 focus:ring-primary-500 ${
                                    isMaxReached ? "text-amber-600" : "text-gray-900"
                                  }`}
                                />
                                {item.allowDecimalQty && item.unit && (
                                  <span className="text-[11px] text-gray-500">{item.unit}</span>
                                )}
                                {!item.allowDecimalQty && <button
                                  type="button"
                                  aria-label="زيادة الكمية"
                                  onClick={() => {
                                    updateQuantity(item.productId, item.quantity + 1);
                                    focusScan();
                                  }}
                                  disabled={isMaxReached}
                                  className={`w-7 h-7 rounded border flex items-center justify-center active:scale-95 transition-all ${
                                    isMaxReached
                                      ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                                      : "bg-primary-50 border-primary-200 text-primary-600 hover:bg-primary-100"
                                  }`}
                                >
                                  <Plus className="w-3 h-3" />
                                </button>}
                              </div>
                              <span className="font-bold text-sm text-primary-600">
                                {formatCurrency(item.total)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 py-6">
                      <ShoppingCart className="w-10 h-10 mb-1" />
                      <p className="text-xs">السلة فارغة</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Sale Info - Compact */}
              <div className="bg-white rounded-lg border border-gray-200 p-3 space-y-3">
                {/* Client Type - Compact */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">العميل</label>
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
                        className={`py-1.5 px-2 rounded text-xs font-medium transition-all ${
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
                    <label className="block text-xs font-medium text-gray-600 mb-1">قائمة الأسعار</label>
                    <div className="flex flex-wrap gap-1">
                      {priceLists.map((list) => (
                        <button
                          key={list.id}
                          type="button"
                          onClick={() => setChosenPriceListId(list.id)}
                          className={`py-1.5 px-3 rounded text-xs font-medium transition-all ${
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
                      <p className="mt-1 text-[11px] text-emerald-700">قائمة العميل</p>
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">الدفع</label>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { value: "CASH", label: "نقدي", key: "F6" },
                      { value: "CARD", label: "بطاقة", key: "F7" },
                      { value: "MOBILE_WALLET", label: "محفظة", key: "F8" },
                      { value: "CREDIT", label: "آجل", key: "F9" },
                    ].map((method) => (
                      <button
                        key={method.value}
                        type="button"
                        title={method.key}
                        onClick={() => selectPayment(method.value as SaleFormData["paymentMethod"])}
                        className={`py-1.5 px-2 rounded text-xs font-medium transition-all ${
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

                {watch("paymentMethod") === "CASH" && (
                  <div className="space-y-1">
                    <Input
                      type="number"
                      min={0}
                      placeholder="المبلغ المستلم من العميل"
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                      onKeyDown={(e) => {
                        // type the cash handed over, Enter = finish the sale
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleShowConfirm();
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
                  {{ CASH: "نقدي", CARD: "بطاقة", MOBILE_WALLET: "محفظة", CREDIT: "آجل" }[watch("paymentMethod")]}
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
              {watch("paymentMethod") === "CASH" && changeDue !== null && changeDue >= 0 && (
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
              resetForNextSale();
            }}
          />
        )}
      </div>
    </Layout>
  );
};

export default SalesCreate;
