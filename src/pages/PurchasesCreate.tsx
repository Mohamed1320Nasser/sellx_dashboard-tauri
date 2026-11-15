import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Minus, ShoppingCart, Package, DollarSign, Search, ScanLine, Upload, FileText, Trash2,
  ChevronDown, ChevronUp, CheckCircle, PackagePlus, AlertTriangle, History, Bell, RotateCcw,
} from "lucide-react";
import { Layout } from "../components/layout";
import { Button, Card, Input, Select, DatePicker, ConfirmDialog } from "../components/ui";
import QuickProductModal, { type QuickCreatedProduct } from "../components/modals/QuickProductModal";
import QuickSupplierModal from "../components/modals/QuickSupplierModal";
import SupplierPicker from "../components/purchases/SupplierPicker";
import { useSessionAuthStore } from "../stores/sessionAuthStore";
import { useSuppliers } from "../hooks/api/useSuppliers";
import { useProducts } from "../hooks/api/useProducts";
import { useCategories } from "../hooks/api/useCategories";
import { useCreatePurchase } from "../hooks/api/usePurchases";
import { formatCurrency } from "../utils/currencyUtils";
import { round2, suggestedSellingPrice } from "../utils/purchasePricing";
import toast from "react-hot-toast";
import { useScanner } from "../hooks/useScanner";
import { usePrinterConfigStore } from "../stores/printerConfigStore";
import { companyService } from "../services/companyService";
import { printReceipt } from "../services/printService";
import { PrintReceiptPreview } from "../components/printer/PrintReceiptPreview";
import { PurchaseBarcodeModal, type PurchaseLabelItem } from "../components/modals/PurchaseBarcodeModal";
import { productService } from "../services/productService";
import { purchaseService, type LastSupplierCost } from "../services/purchaseService";

interface PurchaseItem {
  productId: string;
  productName: string;
  sku?: string | null;
  quantity: number;
  /** Price on the supplier's invoice */
  unitPrice: number;
  totalPrice: number;
  /** Product cost and selling price before this purchase */
  productCost: number;
  currentProductPrice: number;
  updateProductPrice: boolean;
  /** Selling price typed on the screen; null = the suggested one */
  newSellingPrice: number | null;
}

interface PurchaseDraft {
  savedAt: number;
  supplierId: string;
  invoiceNumber: string;
  purchaseDate: string;
  dueDate: string | null;
  notes: string;
  items: PurchaseItem[];
  includeTax: boolean;
  taxRate: string;
  discount: string;
  shipping: string;
  paidAmount: string;
  paymentMethod: string;
  reminderEnabled: boolean;
  reminderDate: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "نقداً",
  CARD: "بطاقة",
  MOBILE_WALLET: "محفظة إلكترونية",
  BANK_TRANSFER: "تحويل بنكي",
};

/** The local calendar day; toISOString() would give yesterday after midnight in Cairo */
const dayString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const generateInvoiceNumber = () => {
  const now = new Date();
  return `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getTime()).slice(-4)}`;
};

/** A price this much above the last one gets a warning */
const PRICE_JUMP = 0.1;

const PurchasesCreate: React.FC = () => {
  const navigate = useNavigate();
  const { company, user } = useSessionAuthStore();
  const companyId = company?.companyId || 0;
  const draftKey = `sellx.purchaseDraft.${companyId}`;

  // Invoice
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(generateInvoiceNumber);
  const [purchaseDate, setPurchaseDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDate, setReminderDate] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [triedSave, setTriedSave] = useState(false);

  // Money
  const [includeTax, setIncludeTax] = useState(false);
  const [taxRate, setTaxRate] = useState("");
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");

  // Items
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [productSearch, setProductSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [showProductBrowser, setShowProductBrowser] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Dialogs
  const [quickProduct, setQuickProduct] = useState<{ barcode?: string; name?: string } | null>(null);
  const [quickSupplier, setQuickSupplier] = useState<{ name?: string } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [draftOffer, setDraftOffer] = useState<PurchaseDraft | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printablePurchase, setPrintablePurchase] = useState<any>(null);
  const [labelItems, setLabelItems] = useState<PurchaseLabelItem[] | null>(null);
  const [afterLabels, setAfterLabels] = useState<"receipt" | "list">("list");
  const doneRef = useRef(false);

  const [roundingRule, setRoundingRule] = useState("0.50");

  // Data
  const { data: suppliersData } = useSuppliers({ companyId, limit: 1000 });
  const { data: productsData } = useProducts({
    companyId,
    limit: 1000,
    search: productSearch,
    categoryId: selectedCategory || undefined,
  });
  const { data: categoriesData } = useCategories({ companyId, limit: 100 });
  const createMutation = useCreatePurchase();

  const suppliers = useMemo(
    () => ((suppliersData as any)?.data?.list || []).map((s: any) => ({ id: Number(s.id), name: s.name, phone: s.phone })),
    [suppliersData]
  );
  const categories = useMemo(
    () => ((categoriesData as any)?.data?.list || []).map((c: any) => ({ id: String(c.id), name: c.name })),
    [categoriesData]
  );
  const supplierName = suppliers.find((s: any) => String(s.id) === supplierId)?.name;

  useEffect(() => {
    if (!companyId) return;
    companyService
      .getProfile(companyId)
      .then((p: any) => p?.priceRoundingRule && setRoundingRule(p.priceRoundingRule))
      .catch(() => {});
  }, [companyId]);

  // Last price paid to this supplier for the products on the invoice
  const productIdsKey = useMemo(() => [...new Set(items.map(i => i.productId))].sort().join(","), [items]);
  const { data: lastCosts = {} } = useQuery<Record<string, LastSupplierCost>>({
    queryKey: ["purchase-last-costs", companyId, supplierId, productIdsKey],
    queryFn: async () => {
      const res: any = await purchaseService.getLastCosts(companyId, Number(supplierId), productIdsKey.split(","));
      return (res?.data ?? res) || {};
    },
    enabled: !!companyId && !!supplierId && !!productIdsKey,
    staleTime: 60_000,
  });

  // ------------------------------------------------------------------ totals
  const subtotal = round2(items.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0));
  const discountValue = round2(Number(discount) || 0);
  const shippingValue = round2(Number(shipping) || 0);
  const discountTooBig = discountValue > subtotal + 0.001;
  const taxAmount = includeTax ? round2((subtotal - discountValue) * ((Number(taxRate) || 0) / 100)) : 0;
  const totalAmount = round2(subtotal - discountValue + taxAmount + shippingValue);
  const paidValue = round2(Number(paidAmount) || 0);
  const paidTooMuch = paidValue > totalAmount + 0.01;
  const remaining = round2(Math.max(0, totalAmount - paidValue));
  /** Each piece's real cost: its share of the discount and shipping (same rule as the server) */
  const costFactor = subtotal > 0 ? (subtotal - discountValue + shippingValue) / subtotal : 1;
  const landedCost = (item: PurchaseItem) => round2(item.unitPrice * costFactor);
  const sellingFor = (item: PurchaseItem) =>
    item.newSellingPrice ?? suggestedSellingPrice(landedCost(item), item.productCost, item.currentProductPrice, roundingRule);

  // ------------------------------------------------------------------ drafts
  useEffect(() => {
    if (!companyId) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as PurchaseDraft;
      if (draft && (draft.items?.length || draft.supplierId)) setDraftOffer(draft);
    } catch {
      // no readable draft
    }
  }, [companyId, draftKey]);

  useEffect(() => {
    if (!companyId || draftOffer || doneRef.current) return;
    if (items.length === 0 && !supplierId) return;
    const t = setTimeout(() => {
      const draft: PurchaseDraft = {
        savedAt: Date.now(),
        supplierId,
        invoiceNumber,
        purchaseDate: dayString(purchaseDate),
        dueDate: dueDate ? dayString(dueDate) : null,
        notes,
        items,
        includeTax,
        taxRate,
        discount,
        shipping,
        paidAmount,
        paymentMethod,
        reminderEnabled,
        reminderDate,
      };
      try {
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        // storage full or blocked: no draft
      }
    }, 400);
    return () => clearTimeout(t);
  }, [companyId, draftKey, draftOffer, supplierId, invoiceNumber, purchaseDate, dueDate, notes, items, includeTax, taxRate, discount, shipping, paidAmount, paymentMethod, reminderEnabled, reminderDate]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // nothing to clear
    }
  }, [draftKey]);

  const restoreDraft = () => {
    const d = draftOffer;
    if (!d) return;
    setSupplierId(d.supplierId || "");
    setInvoiceNumber(d.invoiceNumber || generateInvoiceNumber());
    if (d.purchaseDate) setPurchaseDate(new Date(`${d.purchaseDate}T00:00:00`));
    setDueDate(d.dueDate ? new Date(`${d.dueDate}T00:00:00`) : null);
    setNotes(d.notes || "");
    setItems((d.items || []).map(i => ({ ...i, newSellingPrice: i.newSellingPrice ?? null, productCost: i.productCost ?? 0 })));
    setIncludeTax(!!d.includeTax);
    setTaxRate(d.taxRate || "");
    setDiscount(d.discount || "");
    setShipping(d.shipping || "");
    setPaidAmount(d.paidAmount || "");
    setPaymentMethod(d.paymentMethod || "CASH");
    setReminderEnabled(!!d.reminderEnabled);
    setReminderDate(d.reminderDate || "");
    if (d.reminderEnabled || d.notes) setShowMore(true);
    setDraftOffer(null);
    toast.success("تم استرجاع المسودة");
  };

  const discardDraft = () => {
    clearDraft();
    setDraftOffer(null);
  };

  // ------------------------------------------------------------------ items
  const addProductToItems = useCallback((product: any, quantity = 1, unitCost?: number) => {
    const added = !itemsRef.current.some(item => item.productId === product.id);
    setItems(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        const q = existing.quantity + quantity;
        return prev.map(item =>
          item.productId === product.id ? { ...item, quantity: q, totalPrice: round2(q * item.unitPrice) } : item
        );
      }
      // The last cost, never the selling price: a product with no cost starts empty
      const cost = unitCost ?? (Number(product.purchasePrice) || 0);
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity,
          unitPrice: cost,
          totalPrice: round2(quantity * cost),
          productCost: unitCost !== undefined ? 0 : Number(product.purchasePrice) || 0,
          currentProductPrice: Number(product.sellingPrice) || 0,
          updateProductPrice: false,
          newSellingPrice: unitCost !== undefined ? Number(product.sellingPrice) || null : null,
        },
      ];
    });
    return added;
  }, []);

  const updateItem = (productId: string, change: (item: PurchaseItem) => Partial<PurchaseItem>) =>
    setItems(prev =>
      prev.map(item => {
        if (item.productId !== productId) return item;
        const next = { ...item, ...change(item) };
        return { ...next, totalPrice: round2(next.quantity * next.unitPrice) };
      })
    );

  const removeItem = (productId: string) => setItems(prev => prev.filter(item => item.productId !== productId));

  const stepQuantity = (productId: string, delta: number) => {
    const item = itemsRef.current.find(i => i.productId === productId);
    if (!item) return;
    if (item.quantity + delta <= 0) removeItem(productId);
    else updateItem(productId, i => ({ quantity: i.quantity + delta }));
  };

  // ------------------------------------------------------------------ scanning
  const dialogOpen = !!quickProduct || !!quickSupplier || confirmLeave || labelItems !== null || showPrintModal || !!draftOffer;
  const dialogOpenRef = useRef(dialogOpen);
  dialogOpenRef.current = dialogOpen;

  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      if (dialogOpenRef.current) return;
      const products = (productsData as any)?.data?.list || [];
      let product = products.find((p: any) => p.barcode === barcode || p.sku === barcode);
      if (!product && companyId) {
        try {
          const res = await productService.findByBarcode(barcode, companyId);
          if (res?.data?.success) product = res.data.data;
        } catch {
          // not found
        }
      }
      setBarcodeInput("");
      if (product) {
        const added = addProductToItems(product);
        toast.success(added ? `تم إضافة ${product.name}` : `تم زيادة كمية ${product.name}`);
        setTimeout(() => barcodeInputRef.current?.focus(), 50);
      } else {
        // Not in the system yet: add it from here
        setQuickProduct({ barcode });
      }
    },
    [productsData, addProductToItems, companyId]
  );

  const { isScanning } = useScanner({ onScan: handleBarcodeScan, autoStart: true });

  const handleQuickProductCreated = (product: QuickCreatedProduct, quantity: number, unitCost: number) => {
    addProductToItems(product, quantity, unitCost);
    setQuickProduct(null);
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
  };

  // ------------------------------------------------------------------ file
  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الملف يجب أن يكون أقل من 5 ميجابايت");
      return;
    }
    if (!["image/jpeg", "image/png", "image/jpg", "application/pdf"].includes(file.type)) {
      toast.error("نوع الملف غير مدعوم. يرجى اختيار صورة أو PDF");
      return;
    }
    setInvoiceFile(file);
  };

  // ------------------------------------------------------------------ save
  const problems = useMemo(() => {
    const list: string[] = [];
    if (!supplierId) list.push("اختر المورد");
    if (!invoiceNumber.trim()) list.push("أدخل رقم فاتورة المورد");
    if (items.length === 0) list.push("أضف منتجاً واحداً على الأقل");
    const noQty = items.find(i => !(i.quantity >= 1));
    if (noQty) list.push(`أدخل كمية ${noQty.productName}`);
    const noCost = items.find(i => !(i.unitPrice > 0));
    if (noCost) list.push(`أدخل سعر شراء ${noCost.productName}`);
    const badSelling = items.find(i => i.updateProductPrice && !(sellingFor(i) > 0));
    if (badSelling) list.push(`أدخل سعر البيع الجديد لـ ${badSelling.productName}`);
    if (discountTooBig) list.push("الخصم أكبر من إجمالي الأصناف");
    if (paidTooMuch) list.push("المبلغ المدفوع أكبر من إجمالي الفاتورة");
    return list;
    // sellingFor depends on these
  }, [supplierId, invoiceNumber, items, discountTooBig, paidTooMuch, costFactor, roundingRule]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBack = useCallback(() => navigate("/purchases"), [navigate]);

  const handleSubmit = useCallback(async () => {
    setTriedSave(true);
    if (problems.length) {
      toast.error(problems[0]);
      return;
    }
    if (createMutation.isPending) return;

    const formData = new FormData();
    formData.append("companyId", String(companyId));
    formData.append("supplierId", supplierId);
    formData.append("invoiceNumber", invoiceNumber.trim());
    formData.append("purchaseDate", dayString(purchaseDate));
    if (dueDate) formData.append("dueDate", dayString(dueDate));
    formData.append("totalAmount", String(totalAmount));
    formData.append("paidAmount", String(paidValue));
    formData.append("paymentMethod", paymentMethod);
    if (discountValue > 0) formData.append("discountAmount", String(discountValue));
    if (shippingValue > 0) formData.append("shippingCost", String(shippingValue));
    if (includeTax) {
      formData.append("taxRate", String(Number(taxRate) || 0));
      formData.append("taxAmount", String(taxAmount));
    }
    formData.append("reminderEnabled", String(reminderEnabled && !!reminderDate));
    if (reminderEnabled && reminderDate) formData.append("reminderDate", reminderDate);
    if (notes) formData.append("notes", notes);
    if (invoiceFile) formData.append("invoice", invoiceFile);
    formData.append(
      "items",
      JSON.stringify(
        items.map(item => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          updateProductPrice: item.updateProductPrice,
          newSellingPrice: item.updateProductPrice ? sellingFor(item) : undefined,
        }))
      )
    );

    try {
      const createdPurchase = await createMutation.mutateAsync(formData);
      doneRef.current = true;
      clearDraft();
      const purchaseData = (createdPurchase as any)?.data || createdPurchase;
      const supplier = (suppliersData as any)?.data?.list?.find((s: any) => s.id === parseInt(supplierId));
      const purchaseWithItems = {
        ...purchaseData,
        subtotal,
        discountAmount: discountValue,
        shippingCost: shippingValue,
        tax: taxAmount,
        total: totalAmount,
        paid: paidValue,
        paymentMethod,
        items: items.map(item => ({ ...item, product: { name: item.productName } })),
        supplier,
      };

      const printerConfig = usePrinterConfigStore.getState();
      if (printerConfig.autoPrintOnPayment) {
        try {
          let fullCompany: any = company?.company || { name: "POS System" };
          try {
            fullCompany = await companyService.getProfile(companyId);
          } catch {
            // default company data
          }
          const when = new Date(purchaseWithItems.purchaseDate || purchaseWithItems.createdAt || Date.now());
          await printReceipt({
            receiptNumber: purchaseWithItems.invoiceNumber || `PURCHASE-${Date.now()}`,
            date: when.toLocaleDateString("ar-SA-u-nu-latn"),
            time: new Date().toLocaleTimeString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit" }),
            cashier: user?.name || user?.username || "نظام نقاط البيع",
            companyName: fullCompany?.name || "نظام نقاط البيع",
            companyAddress: fullCompany?.address,
            companyPhone: fullCompany?.phone,
            companyTaxId: fullCompany?.taxId || fullCompany?.taxNumber,
            companyLogo: fullCompany?.logoUrl,
            items: items.map(item => ({
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.totalPrice,
            })),
            subtotal,
            discount: discountValue,
            tax: taxAmount,
            taxRate: Number(taxRate) || 0,
            total: totalAmount,
            paid: paidValue,
            change: 0,
            paymentMethod: paidValue <= 0 ? "آجل" : PAYMENT_LABELS[paymentMethod] || paymentMethod,
            isPurchase: true,
            supplierName: supplier?.name,
            remaining,
            additionalFee: shippingValue || undefined,
            additionalFeeLabel: shippingValue ? "شحن وتحميل" : undefined,
          } as any);
          toast.success("تم الطباعة تلقائياً");
        } catch (printError) {
          console.error("Auto-print error:", printError);
          toast.error("فشلت الطباعة التلقائية");
        }
        setAfterLabels("list");
      } else {
        setPrintablePurchase(purchaseWithItems);
        setAfterLabels("receipt");
      }

      // Barcode labels for everything received, with the stock after the purchase
      let labels: PurchaseLabelItem[] = items.map(item => ({
        productId: item.productId,
        name: item.productName,
        sku: item.sku ?? null,
        purchasedQty: Number(item.quantity),
        stock: Number(item.quantity),
      }));
      try {
        const saved: any = await purchaseService.getById(purchaseData.id, companyId);
        const full = saved?.data || saved;
        if (full?.items?.length) {
          labels = full.items.map((it: any) => ({
            productId: it.productId,
            name: it.product?.name || "",
            sku: it.product?.sku,
            purchasedQty: it.quantity,
            stock: it.product?.stockQuantity ?? it.quantity,
          }));
        }
      } catch {
        // keep the local list
      }
      setLabelItems(labels);
    } catch {
      // The mutation hook already shows the server's message
    }
  }, [problems, createMutation, companyId, supplierId, invoiceNumber, purchaseDate, dueDate, totalAmount, paidValue, paymentMethod, discountValue, shippingValue, includeTax, taxRate, taxAmount, reminderEnabled, reminderDate, notes, invoiceFile, items, clearDraft, suppliersData, subtotal, company, user, remaining]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLabelsClosed = () => {
    setLabelItems(null);
    if (afterLabels === "receipt") setShowPrintModal(true);
    else navigate("/purchases");
  };

  /** Leaving keeps the draft; it can be restored next time */
  const requestLeave = () => {
    if (items.length > 0) setConfirmLeave(true);
    else handleBack();
  };

  // ------------------------------------------------------------------ keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F6") {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      } else if (e.key === "F7" && !dialogOpenRef.current) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape" && !dialogOpenRef.current) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return; // Esc in a box only leaves the box
        e.preventDefault();
        requestLeave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSubmit, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // ------------------------------------------------------------------ product browser
  const filteredProducts = useMemo(() => {
    const products = (productsData as any)?.data?.list || [];
    const q = productSearch.toLowerCase();
    return products.filter((product: any) => {
      const matchesSearch = product.name.toLowerCase().includes(q) || product.sku?.toLowerCase().includes(q);
      const matchesCategory = !selectedCategory || String(product.categoryId || "") === String(selectedCategory);
      return matchesSearch && matchesCategory;
    });
  }, [productsData, productSearch, selectedCategory]);

  const setDueInDays = (days: number) => {
    const d = new Date(purchaseDate);
    d.setDate(d.getDate() + days);
    setDueDate(d);
  };

  const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);

  // ------------------------------------------------------------------ render
  return (
    <Layout>
      <style>
        {`
          .no-spin::-webkit-outer-spin-button, .no-spin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
          .no-spin { -moz-appearance: textfield; }
        `}
      </style>
      <div className="w-full space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={requestLeave} className="flex items-center">
              <ArrowLeft className="w-4 h-4 ml-2" />
              العودة
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">فاتورة شراء جديدة</h1>
              <p className="text-sm text-gray-500">F6 الباركود · F7 حفظ · تُحفظ مسودة تلقائياً</p>
            </div>
          </div>
        </div>

        {/* Draft restore */}
        {draftOffer && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-sm text-amber-900">
              <History className="h-5 w-5" />
              <span>
                توجد مسودة فاتورة شراء لم تُحفظ ({draftOffer.items?.length || 0} صنف) من{" "}
                {new Date(draftOffer.savedAt).toLocaleString("ar-EG-u-nu-latn", { dateStyle: "short", timeStyle: "short" })}
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={restoreDraft}>
                <RotateCcw className="w-4 h-4 ml-1" />
                استرجاع المسودة
              </Button>
              <Button size="sm" variant="outline" onClick={discardDraft}>
                حذف المسودة
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* ---------------- left: invoice + items */}
          <div className="space-y-4 xl:col-span-2">
            <Card padding="lg">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">المورد *</label>
                  <SupplierPicker
                    suppliers={suppliers}
                    value={supplierId}
                    onChange={setSupplierId}
                    onCreate={name => setQuickSupplier({ name })}
                    error={triedSave && !supplierId}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-gray-700">رقم فاتورة المورد *</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="رقم الفاتورة"
                      value={invoiceNumber}
                      onChange={e => setInvoiceNumber(e.target.value)}
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={() => setInvoiceNumber(generateInvoiceNumber())} className="whitespace-nowrap">
                      توليد
                    </Button>
                  </div>
                </div>
                <DatePicker
                  label="تاريخ الشراء"
                  value={purchaseDate}
                  onChange={date => setPurchaseDate(date || new Date())}
                  placeholder="اختر تاريخ الشراء"
                  required
                />
                <div>
                  <DatePicker
                    label="تاريخ الاستحقاق (للآجل)"
                    value={dueDate}
                    onChange={date => setDueDate(date)}
                    placeholder="بدون"
                  />
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[7, 15, 30].map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDueInDays(d)}
                        className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
                      >
                        بعد {d} يوم
                      </button>
                    ))}
                    {dueDate && (
                      <button type="button" onClick={() => setDueDate(null)} className="rounded-md px-2 py-0.5 text-xs text-danger-600 hover:bg-danger-50">
                        إلغاء
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowMore(v => !v)}
                className="mt-4 flex items-center gap-1 text-sm font-medium text-primary-700"
              >
                {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                صورة الفاتورة، ملاحظات، تذكير
                {(invoiceFile || notes || reminderEnabled) && <span className="h-2 w-2 rounded-full bg-primary-500" />}
              </button>

              {showMore && (
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-gray-700">صورة فاتورة المورد</label>
                    {invoiceFile ? (
                      <div className="flex items-center justify-between rounded-lg border border-success-300 bg-success-50 p-3 text-sm">
                        <span className="truncate">{invoiceFile.name}</span>
                        <button type="button" onClick={() => setInvoiceFile(null)} className="text-danger-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-3 text-sm text-gray-600 hover:border-primary-400 hover:bg-primary-50">
                        <Upload className="h-4 w-4" />
                        اختر صورة أو PDF (5 ميجا)
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => handleFileSelect(e.target.files?.[0])} />
                      </label>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <input
                        type="checkbox"
                        checked={reminderEnabled}
                        onChange={e => setReminderEnabled(e.target.checked)}
                        className="rounded border-gray-300 text-primary-600"
                      />
                      <Bell className="h-4 w-4 text-amber-500" />
                      ذكّرني بالدفع يوم
                    </label>
                    <input
                      type="date"
                      value={reminderDate}
                      disabled={!reminderEnabled}
                      onChange={e => setReminderDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-semibold text-gray-700">
                      <FileText className="ml-1 inline h-4 w-4" />
                      ملاحظات
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-transparent focus:ring-2 focus:ring-primary-500"
                      rows={2}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </Card>

            <Card padding="lg">
              {/* Barcode */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (barcodeInput.trim()) handleBarcodeScan(barcodeInput.trim());
                }}
                className="flex flex-wrap gap-2"
              >
                <div className="relative min-w-[200px] flex-1">
                  <ScanLine className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={e => setBarcodeInput(e.target.value)}
                    placeholder="امسح الباركود أو اكتب الكود ثم Enter..."
                    className="w-full rounded-lg border border-gray-300 py-3 pl-4 pr-10 text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                  />
                  {isScanning && (
                    <span className="absolute left-3 top-1/2 flex h-3 w-3 -translate-y-1/2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
                    </span>
                  )}
                </div>
                <Button type="submit" disabled={!barcodeInput.trim()}>
                  إضافة
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowProductBrowser(v => !v)}>
                  <Package className="ml-1 h-4 w-4" />
                  {showProductBrowser ? "إخفاء المنتجات" : "تصفح المنتجات"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setQuickProduct({})}>
                  <PackagePlus className="ml-1 h-4 w-4" />
                  منتج جديد
                </Button>
              </form>

              {/* Product browser */}
              {showProductBrowser && (
                <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
                  <div className="flex gap-2 overflow-x-auto border-b border-gray-200 bg-gray-50 p-2">
                    {[{ id: "", name: "الكل" }, ...categories].map(category => (
                      <button
                        key={category.id || "all"}
                        type="button"
                        onClick={() => setSelectedCategory(category.id)}
                        className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                          selectedCategory === category.id ? "bg-primary-600 text-white" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                  <div className="border-b border-gray-100 p-2">
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="البحث عن منتج..."
                        value={productSearch}
                        onChange={e => setProductSearch(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 py-2 pl-4 pr-10 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-2">
                    {filteredProducts.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {filteredProducts.map((product: any) => {
                          const line = items.find(i => i.productId === product.id);
                          return (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => addProductToItems(product)}
                              className={`relative rounded-lg border p-2 text-right text-sm transition ${
                                line ? "border-primary-400 bg-primary-50" : "border-gray-200 bg-white hover:border-gray-300"
                              }`}
                            >
                              {line && (
                                <span className="absolute -top-2 -right-2 rounded-md bg-primary-600 px-1.5 text-xs font-bold text-white">
                                  ×{line.quantity}
                                </span>
                              )}
                              <div className="truncate font-medium text-gray-800">{product.name}</div>
                              <div className="flex justify-between text-xs text-gray-500">
                                <span>{product.stockQuantity || 0} متاح</span>
                                <span className="font-semibold text-primary-700">{formatCurrency(product.purchasePrice || 0)}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center py-8 text-gray-500">
                        <Package className="mb-2 h-10 w-10 text-gray-300" />
                        <p className="text-sm">لا توجد منتجات</p>
                        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setQuickProduct({ name: productSearch.trim() })}>
                          <PackagePlus className="ml-1 h-4 w-4" />
                          {productSearch.trim() ? `إضافة "${productSearch.trim()}" كمنتج جديد` : "إضافة منتج جديد"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Lines */}
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                    <ShoppingCart className="h-5 w-5 text-primary-600" />
                    الأصناف ({items.length}) · {totalQty} قطعة
                  </h3>
                  {items.length > 0 && <span className="font-bold text-success-700">{formatCurrency(subtotal)}</span>}
                </div>

                {items.length === 0 ? (
                  <div className="rounded-lg border-2 border-dashed border-gray-200 py-10 text-center text-sm text-gray-500">
                    امسح باركود منتج، أو تصفح المنتجات، أو أضف منتجاً جديداً
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {items.map(item => {
                      const last = lastCosts[item.productId];
                      const reference = last?.unitPrice || item.productCost;
                      const jump = reference > 0 && item.unitPrice > 0 ? (item.unitPrice - reference) / reference : 0;
                      const selling = sellingFor(item);
                      const landed = landedCost(item);
                      return (
                        <div key={item.productId} className="grid grid-cols-12 items-start gap-3 p-3">
                          <div className="col-span-12 md:col-span-4">
                            <div className="font-semibold text-gray-900">{item.productName}</div>
                            {item.sku && <div className="text-xs text-gray-400">{item.sku}</div>}
                            <div className="mt-1 text-xs text-gray-500">
                              {last ? (
                                <span>
                                  آخر سعر من هذا المورد: <b>{formatCurrency(last.unitPrice)}</b> (
                                  {new Date(last.purchaseDate).toLocaleDateString("ar-EG-u-nu-latn")})
                                  {Math.abs(last.unitPrice - item.unitPrice) > 0.001 && (
                                    <button
                                      type="button"
                                      className="mr-1 font-medium text-primary-700 hover:underline"
                                      onClick={() => updateItem(item.productId, () => ({ unitPrice: last.unitPrice }))}
                                    >
                                      استخدمه
                                    </button>
                                  )}
                                </span>
                              ) : item.productCost > 0 ? (
                                <span>متوسط التكلفة الحالي: {formatCurrency(item.productCost)}</span>
                              ) : (
                                <span>لا توجد تكلفة سابقة</span>
                              )}
                            </div>
                          </div>

                          <div className="col-span-6 md:col-span-3">
                            <label className="mb-1 block text-xs text-gray-500">الكمية</label>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => stepQuantity(item.productId, -1)}
                                className="flex h-9 w-9 items-center justify-center rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
                                aria-label="إنقاص"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                step="1"
                                value={item.quantity === 0 ? "" : item.quantity}
                                onChange={e => updateItem(item.productId, () => ({ quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                                onFocus={e => e.target.select()}
                                onBlur={() => item.quantity < 1 && updateItem(item.productId, () => ({ quantity: 1 }))}
                                aria-label={`كمية ${item.productName}`}
                                className="no-spin h-9 w-16 rounded border border-gray-300 text-center font-bold focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                              />
                              <button
                                type="button"
                                onClick={() => stepQuantity(item.productId, 1)}
                                className="flex h-9 w-9 items-center justify-center rounded border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
                                aria-label="زيادة"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <div className="col-span-6 md:col-span-3">
                            <label className="mb-1 block text-xs text-gray-500">سعر الشراء للوحدة</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={item.unitPrice === 0 ? "" : item.unitPrice}
                              onChange={e => updateItem(item.productId, () => ({ unitPrice: parseFloat(e.target.value) || 0 }))}
                              onFocus={e => e.target.select()}
                              aria-label={`سعر شراء ${item.productName}`}
                              className={`no-spin h-9 w-full rounded border px-2 text-center font-semibold focus:ring-2 focus:ring-primary-500 ${
                                triedSave && !(item.unitPrice > 0) ? "border-danger-400" : "border-gray-300"
                              }`}
                            />
                            {jump > PRICE_JUMP && (
                              <div className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                                <AlertTriangle className="h-3 w-3" />
                                أعلى بـ {Math.round(jump * 100)}% من {last ? "آخر مرة" : "التكلفة الحالية"}
                              </div>
                            )}
                            {jump < -PRICE_JUMP && (
                              <div className="mt-1 text-xs text-success-700">أقل بـ {Math.round(-jump * 100)}% من {last ? "آخر مرة" : "التكلفة الحالية"}</div>
                            )}
                            {Math.abs(costFactor - 1) > 0.0001 && item.unitPrice > 0 && (
                              <div className="mt-1 text-xs text-gray-500">التكلفة بعد الخصم/الشحن: {formatCurrency(landed)}</div>
                            )}
                          </div>

                          <div className="col-span-10 flex items-end justify-between md:col-span-2 md:block md:text-left">
                            <label className="mb-1 block text-xs text-gray-500">الإجمالي</label>
                            <div className="font-bold text-gray-900">{formatCurrency(item.totalPrice)}</div>
                          </div>

                          <div className="col-span-2 flex justify-end md:hidden">
                            <button type="button" onClick={() => removeItem(item.productId)} className="rounded p-1.5 text-danger-500 hover:bg-danger-50" aria-label="حذف">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="col-span-12 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50/60 px-3 py-2">
                            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700">
                              <input
                                type="checkbox"
                                checked={item.updateProductPrice}
                                onChange={e => updateItem(item.productId, () => ({ updateProductPrice: e.target.checked }))}
                                className="rounded border-gray-300 text-amber-600"
                              />
                              تغيير سعر البيع (الحالي {formatCurrency(item.currentProductPrice)})
                            </label>
                            {item.updateProductPrice && (
                              <div className="flex items-center gap-2 text-xs">
                                <span className="text-gray-600">سعر البيع الجديد</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={selling || ""}
                                  onChange={e =>
                                    updateItem(item.productId, () => ({
                                      newSellingPrice: e.target.value === "" ? 0 : parseFloat(e.target.value) || 0,
                                    }))
                                  }
                                  onFocus={e => e.target.select()}
                                  aria-label={`سعر البيع الجديد لـ ${item.productName}`}
                                  className="no-spin h-8 w-24 rounded border border-amber-300 bg-white text-center font-bold text-amber-800 focus:ring-2 focus:ring-amber-400"
                                />
                                {item.newSellingPrice !== null && (
                                  <button
                                    type="button"
                                    className="text-primary-700 hover:underline"
                                    onClick={() => updateItem(item.productId, () => ({ newSellingPrice: null }))}
                                  >
                                    المقترح
                                  </button>
                                )}
                                {selling > 0 && landed > 0 && (
                                  <span className={selling <= landed ? "font-semibold text-danger-600" : "text-gray-500"}>
                                    ربح {Math.round(((selling - landed) / selling) * 100)}%
                                  </span>
                                )}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => removeItem(item.productId)}
                              className="hidden items-center gap-1 rounded px-2 py-1 text-xs text-danger-600 hover:bg-danger-50 md:flex"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              حذف
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* ---------------- right: money */}
          <div className="xl:col-span-1">
            <div className="space-y-4 xl:sticky xl:top-4">
              <Card padding="lg">
                <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <DollarSign className="h-5 w-5 text-success-600" />
                  الحساب
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">إجمالي الأصناف</span>
                    <span className="font-semibold">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-600">خصم المورد</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={discount}
                      onChange={e => setDiscount(e.target.value)}
                      aria-label="خصم المورد"
                      className={`no-spin w-28 rounded border px-2 py-1 text-center ${discountTooBig ? "border-danger-400" : "border-gray-300"}`}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-gray-600">
                      <input type="checkbox" checked={includeTax} onChange={e => setIncludeTax(e.target.checked)} className="rounded border-gray-300 text-primary-600" />
                      ضريبة %
                    </label>
                    {includeTax ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="14"
                          value={taxRate}
                          onChange={e => setTaxRate(e.target.value)}
                          aria-label="نسبة الضريبة"
                          className="no-spin w-16 rounded border border-gray-300 px-2 py-1 text-center"
                        />
                        <span className="w-20 text-left font-semibold">{formatCurrency(taxAmount)}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-600">شحن وتحميل</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={shipping}
                      onChange={e => setShipping(e.target.value)}
                      aria-label="شحن وتحميل"
                      className="no-spin w-28 rounded border border-gray-300 px-2 py-1 text-center"
                    />
                  </div>
                  {(discountValue > 0 || shippingValue > 0) && (
                    <p className="text-xs text-gray-500">الخصم والشحن يوزعان على تكلفة الأصناف حسب قيمتها.</p>
                  )}
                  <div className="flex items-center justify-between rounded-lg bg-gradient-to-r from-primary-600 to-success-600 p-3 text-white">
                    <span className="font-medium">إجمالي الفاتورة</span>
                    <span className="text-2xl font-bold">{formatCurrency(totalAmount)}</span>
                  </div>
                </div>
              </Card>

              <Card padding="lg">
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="mb-1 block font-semibold text-gray-700">المدفوع الآن</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={paidAmount}
                        onChange={e => setPaidAmount(e.target.value)}
                        aria-label="المبلغ المدفوع"
                        className={`no-spin flex-1 rounded-lg border px-3 py-2 ${paidTooMuch ? "border-danger-400" : "border-gray-300"}`}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => setPaidAmount(String(totalAmount))}>
                        كامل
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setPaidAmount("")}>
                        آجل
                      </Button>
                    </div>
                  </div>
                  {paidValue > 0 && (
                    <Select
                      label="طريقة الدفع"
                      options={[
                        { value: "CASH", label: "نقدي (من درج الوردية)" },
                        { value: "CARD", label: "بطاقة" },
                        { value: "MOBILE_WALLET", label: "محفظة إلكترونية" },
                        { value: "BANK_TRANSFER", label: "تحويل بنكي" },
                      ]}
                      value={paymentMethod}
                      onChange={setPaymentMethod}
                    />
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">الباقي على المحل للمورد</span>
                    <span className={`font-bold ${remaining > 0 ? "text-danger-600" : "text-success-600"}`}>{formatCurrency(remaining)}</span>
                  </div>
                  {remaining > 0 && !dueDate && <p className="text-xs text-amber-700">حدد تاريخ استحقاق ليظهر لك تذكير قبل موعد الدفع.</p>}
                </div>
              </Card>

              {triedSave && problems.length > 0 && (
                <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
                  {problems.map(p => (
                    <div key={p}>• {p}</div>
                  ))}
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || labelItems !== null}
                className="w-full bg-gradient-to-r from-success-600 to-primary-600 py-3 text-lg font-semibold text-white shadow-lg hover:from-success-700 hover:to-primary-700"
              >
                {createMutation.isPending ? (
                  "جاري الحفظ..."
                ) : (
                  <>
                    <CheckCircle className="ml-2 h-5 w-5" />
                    حفظ فاتورة الشراء (F7)
                  </>
                )}
              </Button>
              {supplierName && items.length > 0 && (
                <p className="text-center text-xs text-gray-500">
                  {supplierName} · {items.length} صنف · {formatCurrency(totalAmount)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <QuickProductModal
        isOpen={quickProduct !== null}
        onClose={() => setQuickProduct(null)}
        companyId={companyId}
        categories={categories}
        initialBarcode={quickProduct?.barcode}
        initialName={quickProduct?.name}
        onCreated={handleQuickProductCreated}
      />

      <QuickSupplierModal
        isOpen={quickSupplier !== null}
        onClose={() => setQuickSupplier(null)}
        companyId={companyId}
        initialName={quickSupplier?.name}
        onCreated={s => {
          setSupplierId(String(s.id));
          setQuickSupplier(null);
        }}
      />

      <ConfirmDialog
        isOpen={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={handleBack}
        title="الخروج من الفاتورة"
        message="لم تُحفظ فاتورة الشراء بعد. ستبقى كمسودة يمكنك استرجاعها عند فتح فاتورة شراء جديدة."
        confirmText="خروج"
        cancelText="البقاء"
        type="warning"
      />

      <PurchaseBarcodeModal isOpen={labelItems !== null} onClose={handleLabelsClosed} items={labelItems || []} />

      {printablePurchase && (
        <PrintReceiptPreview
          sale={printablePurchase}
          kind="purchase"
          companyId={companyId || company?.id || 0}
          cashier={null}
          isOpen={showPrintModal}
          onClose={() => {
            setShowPrintModal(false);
            navigate("/purchases");
          }}
        />
      )}
    </Layout>
  );
};

export default PurchasesCreate;
