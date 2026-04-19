# 📘 Phase 6: Update Pages - Quick Reference Guide

## 🎯 Goal
Update 9+ pages to use the new `printReceipt()` and `printBarcode()` functions.

---

## 📦 Import Changes

### OLD Imports (Remove):
```typescript
import { printReceipt } from '../services/printService';
import * as electronPrinter from './electronPrinterService';
import { printReceiptAsImage } from './printReceiptHtml';
```

### NEW Imports (Add):
```typescript
import { printReceipt, printBarcode } from '@/services/printService';
import type { SellxReceiptData, BarcodeLabel } from '@/services/printService';
```

---

## 🧾 Receipt Printing Pattern

### For SALES Receipts:
```typescript
await printReceipt({
  receiptNumber: sale.receiptNumber,
  date: new Date(sale.date).toLocaleDateString('ar-SA'),
  time: new Date(sale.date).toLocaleTimeString('ar-SA'),
  cashier: currentUser.name,

  // Company info
  companyName: company.name,
  companyAddress: company.address,
  companyPhone: company.phone,
  companyTaxId: company.taxId,
  companyLogo: company.logoUrl,

  // Items
  items: sale.items.map(item => ({
    productName: item.productName,
    variantName: item.variantName,
    quantity: item.quantity,
    unitPrice: item.price,
    total: item.quantity * item.price,
  })),

  // Totals
  subtotal: sale.subtotal,
  discount: sale.discount,
  discountPercentage: sale.discountPercentage,
  tax: sale.tax,
  taxRate: company.taxRate,
  total: sale.total,

  // Payment
  paid: sale.paid,
  change: sale.change,
  paymentMethod: getPaymentMethodLabel(sale.paymentMethod),

  // SELLX-SPECIFIC
  isPurchase: false,  // ⚠️ IMPORTANT for sales
  additionalFee: sale.deliveryFee,
  additionalFeeLabel: "رسوم التوصيل",
});
```

### For PURCHASE Receipts:
```typescript
await printReceipt({
  // ... same as sales ...

  // SELLX-SPECIFIC
  isPurchase: true,  // ⚠️ IMPORTANT - changes header to "فاتورة مشتريات"
  additionalFee: purchase.shippingCost,
  additionalFeeLabel: "رسوم الشحن",
});
```

### For QUOTE Receipts:
```typescript
await printReceipt({
  receiptNumber: `QUOTE-${quote.id}`,
  // ... company and items ...

  headerText: "عرض سعر",
  footerText: `صالح حتى: ${quote.validUntil}`,

  // NO PAYMENT SECTION for quotes
  paid: undefined,
  change: undefined,
  paymentMethod: undefined,
});
```

---

## 🏷️ Barcode Printing Pattern

```typescript
import { printBarcode } from '@/services/printService';

// Single barcode
await printBarcode({
  productName: product.name,
  barcode: product.barcode,
  price: product.price,
  format: 'CODE128', // or 'EAN13', 'EAN8', 'CODE39', 'UPCA'
}, 1);

// Multiple copies
await printBarcode({
  productName: product.name,
  barcode: product.barcode,
  price: product.price,
}, quantity); // e.g., 10, 50, 100
```

---

## 📂 Pages to Update

### 1. **SalesCreate.tsx**
**Location**: Auto-print after payment
```typescript
if (config.autoPrintOnPayment) {
  await printReceipt({
    // ... map sale data ...
    isPurchase: false,
  });
}
```

### 2. **SalesDetails.tsx**
**Location**: "Print Receipt" button
```typescript
async function handlePrintReceipt() {
  await printReceipt({
    // ... map sale data ...
    isPurchase: false,
  });
}
```

### 3. **PurchasesCreate.tsx** ⚠️
**Location**: After saving purchase
```typescript
await printReceipt({
  // ... map purchase data ...
  isPurchase: true,  // ⚠️ IMPORTANT
});
```

### 4. **PurchasesDetails.tsx** ⚠️
**Location**: "Print Receipt" button
```typescript
await printReceipt({
  // ... map purchase data ...
  isPurchase: true,  // ⚠️ IMPORTANT
});
```

### 5. **PaymentDetails.tsx**
**Location**: "Print Receipt" button
```typescript
await printReceipt({
  receiptNumber: `PAY-${payment.id}`,
  // ... map payment data ...
});
```

### 6. **ProductDetails.tsx**
**Location**: "Print Barcode" button
```typescript
await printBarcode({
  productName: product.name,
  barcode: product.barcode,
  price: product.price,
}, 1);
```

### 7. **Products.tsx**
**Location**: Bulk barcode printing
```typescript
for (const product of selectedProducts) {
  await printBarcode({
    productName: product.name,
    barcode: product.barcode,
    price: product.price,
  }, product.quantity || 1);
}
```

### 8. **QuotePrint.tsx** (Sellx-specific)
**Location**: Print quote button
```typescript
await printReceipt({
  receiptNumber: `QUOTE-${quote.id}`,
  headerText: "عرض سعر",
  footerText: `صالح حتى: ${quote.validUntil}`,
  paid: undefined,  // No payment for quotes
});
```

### 9. **Quotes.tsx**
**Location**: Update imports only

---

## 🔍 How to Find Print Calls

```bash
# Find all print-related code
grep -rn "printReceipt\|printBarcode\|electronPrinter" src/pages/

# Find specific pages
grep -l "printReceipt" src/pages/*.tsx
grep -l "printBarcode" src/pages/*.tsx
```

---

## ⚠️ Common Gotchas

1. **Don't forget `isPurchase: true`** for purchase receipts
2. **Map items correctly** - include `variantName` if exists
3. **Format dates** using Arabic locale: `toLocaleDateString('ar-SA')`
4. **Handle optional fields** - use `||` or `??` operators
5. **Payment method labels** - translate to Arabic
6. **Error handling** - wrap in try/catch, show toast errors

---

## 🧪 Testing Each Page

After updating each page:

```typescript
// Test in dev mode
npm run tauri dev

// Test the specific page:
// 1. Navigate to the page
// 2. Perform the action (create sale, print barcode, etc.)
// 3. Check:
//    - No console errors
//    - Receipt prints correctly
//    - Arabic text renders
//    - All fields show
//    - isPurchase flag works correctly
```

---

## 💡 Tips

- **Copy-paste the pattern** - all pages are very similar
- **Update ONE page at a time** - test before moving to next
- **Check the old code** - see what data it was using
- **Use TypeScript** - it will catch missing fields
- **Commit after each page** - easier to rollback if issues

---

## 📝 Example: Complete SalesCreate.tsx Update

```typescript
// File: src/pages/SalesCreate.tsx

// ── IMPORTS ──
import { printReceipt } from '@/services/printService';
import { usePrinterConfigStore } from '@/stores/printerConfigStore';

// ── IN COMPONENT ──
const config = usePrinterConfigStore();

// ── AFTER SUCCESSFUL PAYMENT ──
async function handlePayment(saleData: Sale) {
  // ... save sale to database ...

  // Auto-print if enabled
  if (config.autoPrintOnPayment) {
    try {
      await printReceipt({
        receiptNumber: saleData.receiptNumber,
        date: new Date(saleData.createdAt).toLocaleDateString('ar-SA'),
        time: new Date(saleData.createdAt).toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        cashier: currentUser.name,

        companyName: company.name,
        companyAddress: company.address,
        companyPhone: company.phone,
        companyTaxId: company.taxId,
        companyLogo: company.logoUrl,

        items: saleData.items.map(item => ({
          productName: item.productName,
          variantName: item.variantName || undefined,
          quantity: item.quantity,
          unitPrice: item.price,
          total: item.quantity * item.price,
        })),

        subtotal: saleData.subtotal,
        discount: saleData.discount,
        discountPercentage: saleData.discountPercentage,
        tax: saleData.tax,
        taxRate: company.taxRate || 15,
        total: saleData.total,

        paid: saleData.paid,
        change: saleData.change,
        paymentMethod: getPaymentMethodLabel(saleData.paymentMethod),

        // SELLX-SPECIFIC
        isPurchase: false,
        additionalFee: saleData.deliveryFee,
        additionalFeeLabel: saleData.deliveryFee ? "رسوم التوصيل" : undefined,
      });

      toast.success('تم طباعة الفاتورة');
    } catch (error: any) {
      console.error('Print error:', error);
      toast.error('فشلت الطباعة: ' + error.message);
    }
  }
}
```

---

**You can now update all 9 pages following these patterns!**
