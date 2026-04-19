# Sellx-Specific Receipt Fields Documentation

**Created**: 2026-04-01
**Purpose**: Document Sellx-specific receipt fields before Sultana migration

---

## Receipt Data Structure

### Sellx Receipt Fields (Must Preserve)

```typescript
interface SellxReceiptData {
  // === SELLX-SPECIFIC FIELDS ===
  isPurchase?: boolean;           // Differentiates purchase from sale receipts
  additionalFee?: number;         // Custom fees (e.g., delivery charges)
  additionalFeeLabel?: string;    // Custom label for fee (e.g., "رسوم توصيل")
  printCopies?: number;           // Number of copies to print (1-5)

  // === COMMON FIELDS (same as Sultana) ===
  receiptNumber: string;          // Sultana uses "orderId"
  date: string;
  time: string;
  cashier: string;

  // Company info
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxId?: string;
  companyLogo?: string;           // Base64 or URL

  // Items
  items: ReceiptItem[];

  // Totals
  subtotal: number;
  discount?: number;
  discountPercentage?: number;
  tax?: number;
  taxRate?: number;
  total: number;

  // Payment
  paid?: number;
  change?: number;
  paymentMethod?: string;

  // Display options
  showOrderId?: boolean;
  showTaxBreakdown?: boolean;
  showQrCode?: boolean;
  qrCodeData?: string;

  // Custom text
  headerText?: string;
  footerText?: string;
}

interface ReceiptItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  total?: number;
  variantName?: string;
  sku?: string;
}
```

---

## Printer Configuration

### Sellx Printer Config (Must Preserve)

```typescript
interface PrinterConfig {
  // Connection
  printerName: string;
  connectionType: 'USB' | 'LAN';     // Note: uppercase (Sultana uses lowercase)
  ipAddress: string;
  port: number;

  // Paper
  paperWidth: '58mm' | '80mm';
  marginTop: number;
  marginBottom: number;

  // Barcode Label Settings
  labelWidth: number;                // 35, 40, 50 mm
  labelHeight: number;               // 25, 30 mm
  labelFontSize: number;             // 8-20 px
  barcodeFormat: 'CODE128' | 'EAN13' | 'EAN8' | 'CODE39';
  barcodeHeight: number;             // 40-100 px
  barcodeWidth: number;              // 1-3 (bar thickness)
  showBarcodeText: boolean;          // Show HRI

  // Content
  showLogo: boolean;                 // Sultana: showCompanyLogo
  showOrderId: boolean;
  showTaxBreakdown: boolean;
  showQRCode: boolean;               // Sultana: showQrCode (lowercase)

  // Text
  headerText: string;
  footerText: string;

  // Automation
  autoPrintOnPayment: boolean;
  cutPaper: boolean;                 // Sultana: autoCut
  printCopies: number;               // SELLX-SPECIFIC: 1-5 copies
}
```

---

## Receipt Types

### 1. Sales Receipt
- Standard customer receipt
- `isPurchase: false` or undefined

### 2. Purchase Receipt (SELLX-SPECIFIC)
- Supplier purchase record
- `isPurchase: true`
- Different header text: "فاتورة مشتريات"

### 3. Quote Receipt (SELLX-SPECIFIC)
- Quotation document
- No payment section
- Valid until date
- Generated from `QuotePrint.tsx` page

### 4. Payment Receipt
- Payment confirmation
- From `PaymentDetails.tsx` page

---

## Barcode Features (SELLX-SPECIFIC)

### Advanced Barcode Validation
Sellx has **superior barcode validation** compared to Sultana:

```typescript
// barcodeService.ts features:
- validateBarcodeFormat(barcode, format)
- calculateEAN13Checksum(barcode)
- calculateEAN8Checksum(barcode)
- calculateUPCAChecksum(barcode)
- generateEAN13()
- generateEAN8()
- generateUPCA()
```

**Decision**: KEEP Sellx's `barcodeService.ts` during migration.

---

## Database Mapping

### API Endpoint
- Load config: `GET /printer-config?companyId={id}`
- Save config: `POST /printer-config`

### Paper Width Mapping
```typescript
// Database <-> Store mapping
'MM_58' <-> '58mm'
'MM_80' <-> '80mm'
```

---

## Key Differences from Sultana

| Feature | Sellx | Sultana | Action |
|---------|-------|---------|--------|
| Purchase receipts | ✅ Has `isPurchase` flag | ❌ No | **Keep Sellx** |
| Quote printing | ✅ Has `QuotePrint.tsx` | ❌ No | **Keep Sellx** |
| Additional fees | ✅ `additionalFee` + label | ❌ No | **Keep Sellx** |
| Print copies | ✅ `printCopies` (1-5) | ❌ No (but Sultana can print multiple) | **Keep Sellx** |
| Barcode validation | ✅ Advanced checksums | ❌ Basic | **Keep Sellx** |
| Connection type | `'USB' \| 'LAN'` (uppercase) | `'usb' \| 'lan'` (lowercase) | **Use Sultana format** |
| Config field names | `showLogo`, `showQRCode` | `showCompanyLogo`, `showQrCode` | **Standardize to Sultana** |

---

## Migration Strategy

### Fields to Keep (Sellx-specific)
1. `isPurchase` flag
2. `additionalFee` + `additionalFeeLabel`
3. `printCopies` setting
4. `QuotePrint.tsx` page
5. `barcodeService.ts` advanced validation

### Fields to Standardize (align with Sultana)
1. `connectionType`: Use lowercase (`'usb' | 'lan'`)
2. `showLogo` → `showCompanyLogo`
3. `showQRCode` → `showQrCode`
4. `cutPaper` → `autoCut`

### Files to Keep During Migration
- ✅ `src/services/barcodeService.ts` (superior validation)
- ✅ `src/pages/QuotePrint.tsx` (Sellx-specific)
- ✅ `src/components/modals/PrintBarcodeDialog.tsx` (UI component)
- ✅ All printer settings tabs (good UI)

### Files to Replace with Sultana
- ❌ `src/services/printService.ts` (replace with Sultana's)
- ❌ `src/services/electronPrinterService.ts` (remove legacy)
- ❌ `src/services/printReceiptHtml.ts` (replace)
- ❌ `src/services/receiptHtmlTemplate.ts` (replace)
- ❌ `src/services/exportReceiptAsImage.ts` (replace)
- ❌ `src/services/htmlToImageService.ts` (replace)
- ❌ `src-tauri/src/printer/` entire module (replace with Sultana's lib.rs)

---

## Testing Requirements

### Must Test After Migration
- [ ] Sales receipt printing
- [ ] Purchase receipt printing (`isPurchase: true`)
- [ ] Quote printing (QuotePrint.tsx)
- [ ] Payment receipt printing
- [ ] Barcode labels (all formats: CODE128, EAN13, EAN8, CODE39)
- [ ] Additional fee display on receipts
- [ ] Print copies (1, 3, 5 copies)
- [ ] Barcode checksum validation
- [ ] USB printing
- [ ] LAN printing
- [ ] Auto-print on payment
- [ ] Arabic text rendering
- [ ] Logo display
- [ ] QR code display

---

## Notes
- Sellx uses **API-based config storage** (not local database like Sultana)
- Sellx has **more receipt types** than Sultana (sales, purchases, quotes, payments)
- Sellx has **better barcode validation** (keep this!)
- Both use same printing approach: HTML → Image → ESC/POS
