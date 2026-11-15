/**
 * Sellx Receipt Component - React-based receipt rendering
 * Based on Sultana's CashierReceipt.tsx architecture
 *
 * This component is rendered server-side to HTML for printing
 */

import type { SellxReceiptData } from '@/services/printService';

interface Props {
  data: SellxReceiptData;
}

export function SellxReceipt({ data }: Props) {
  const formatPrice = (n: number) => n.toFixed(2);

  // Safety check: ensure items array exists
  const items = data.items || [];

  return (
    <div className="receipt">
      {/* Company Logo */}
      {data.companyLogo && (
        <img src={data.companyLogo} alt="Logo" className="receipt__logo" />
      )}

      {/* Company Header */}
      <div className="receipt__header">{data.companyName}</div>

      {data.companyAddress && (
        <div className="receipt__subheader">{data.companyAddress}</div>
      )}

      {data.companyPhone && (
        <div className="receipt__subheader">{data.companyPhone}</div>
      )}

      {data.companyTaxId && (
        <div className="receipt__subheader">س.ت: {data.companyTaxId}</div>
      )}

      <hr className="receipt__divider" />

      {/* Receipt Type Header */}
      <div className="receipt__type-header">
        {data.isQuote ? "عرض سعر" : data.headerText || (data.isPurchase ? "فاتورة مشتريات" : "فاتورة بيع")}
      </div>

      <hr className="receipt__divider" />

      {/* Receipt Info */}
      <div className="receipt__info">
        <div className="receipt__row">
          <span className="receipt__label">{data.isQuote ? "رقم العرض" : "رقم الفاتورة"}</span>
          <span className="receipt__value">{data.receiptNumber}</span>
        </div>
        <div className="receipt__row">
          <span className="receipt__label">التاريخ</span>
          <span className="receipt__value">{data.date}</span>
        </div>
        <div className="receipt__row">
          <span className="receipt__label">الوقت</span>
          <span className="receipt__value" dir="ltr">{data.time}</span>
        </div>
        <div className="receipt__row">
          <span className="receipt__label">{data.isQuote ? "أعدّه" : "الكاشير"}</span>
          <span className="receipt__value">{data.cashier}</span>
        </div>
        {data.clientName && (
          <div className="receipt__row">
            <span className="receipt__label">العميل</span>
            <span className="receipt__value">{data.clientName}</span>
          </div>
        )}
        {data.supplierName && (
          <div className="receipt__row">
            <span className="receipt__label">المورد</span>
            <span className="receipt__value">{data.supplierName}</span>
          </div>
        )}
      </div>

      <hr className="receipt__divider" />

      {/* Items: on 58mm paper each item takes two lines so nothing has to shrink */}
      {data.compact ? (
        <div className="receipt__lines">
          {items.map((item, i) => (
            <div className="receipt__line" key={i}>
              <div className="receipt__line-name">
                {item.productName}
                {item.variantName ? ` - ${item.variantName}` : ""}
              </div>
              <div className="receipt__line-calc">
                <span>
                  {item.quantity} × {formatPrice(item.unitPrice)}
                </span>
                <span className="receipt__line-total">
                  {formatPrice(item.total || item.quantity * item.unitPrice)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
      <table className="receipt__table">
        <thead>
          <tr>
            <th>الصنف</th>
            <th>الكمية</th>
            <th>السعر</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td>
                <span className="receipt__item-name">
                  {item.productName}
                </span>
                {item.variantName && (
                  <div className="receipt__table-sub">
                    <span className="receipt__item-variant">{item.variantName}</span>
                  </div>
                )}
                {item.sku && (
                  <div className="receipt__table-sub">
                    <span className="receipt__item-sku">{item.sku}</span>
                  </div>
                )}
              </td>
              <td className="receipt__table-center">{item.quantity}</td>
              <td>{formatPrice(item.unitPrice)}</td>
              <td>{formatPrice(item.total || item.quantity * item.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}

      <hr className="receipt__divider" />

      {/* Totals */}
      <div className="receipt__totals">
        {((data.discount ?? 0) > 0 || (data.tax ?? 0) > 0 || (data.additionalFee ?? 0) > 0) && (
          <div className="receipt__row">
            <span className="receipt__label">المجموع الفرعي</span>
            <span className="receipt__value">{formatPrice(data.subtotal)}</span>
          </div>
        )}

        {data.discount > 0 && (
          <div className="receipt__row">
            <span className="receipt__label">
              الخصم {data.discountPercentage ? `(${data.discountPercentage}%)` : ''}
            </span>
            <span className="receipt__value">-{formatPrice(data.discount)}</span>
          </div>
        )}

        {data.tax > 0 && (
          <div className="receipt__row">
            <span className="receipt__label">
              الضريبة {data.taxRate ? `(${data.taxRate}%)` : ''}
            </span>
            <span className="receipt__value">{formatPrice(data.tax)}</span>
          </div>
        )}

        {data.additionalFee > 0 && (
          <div className="receipt__row">
            <span className="receipt__label">{data.additionalFeeLabel || 'رسوم إضافية'}</span>
            <span className="receipt__value">{formatPrice(data.additionalFee)}</span>
          </div>
        )}

        <div className="receipt__total">
          <span>الإجمالي</span>
          <span>{formatPrice(data.total)}</span>
        </div>
      </div>

      {/* Payment Details (if provided) */}
      {data.paid !== undefined && (
        <>
          <hr className="receipt__divider" />
          <div className="receipt__info">
            {data.paymentMethod && (
              <div className="receipt__row">
                <span className="receipt__label">طريقة الدفع</span>
                <span className="receipt__value">{data.paymentMethod}</span>
              </div>
            )}
            <div className="receipt__row">
              <span className="receipt__label">المدفوع</span>
              <span className="receipt__value">{formatPrice(data.paid)}</span>
            </div>
            {(data.remaining ?? 0) > 0 && (
              <div className="receipt__row">
                <span className="receipt__label">المتبقي (آجل)</span>
                <span className="receipt__value">{formatPrice(data.remaining!)}</span>
              </div>
            )}
            {data.received !== undefined && data.received > 0 && (
              <div className="receipt__row">
                <span className="receipt__label">المستلم</span>
                <span className="receipt__value">{formatPrice(data.received)}</span>
              </div>
            )}
            {data.change !== undefined && data.change > 0 && (
              <div className="receipt__row">
                <span className="receipt__label">الباقي</span>
                <span className="receipt__value">{formatPrice(data.change)}</span>
              </div>
            )}
          </div>
        </>
      )}

      {data.isQuote && data.validUntil && (
        <>
          <hr className="receipt__divider" />
          <div className="receipt__row">
            <span className="receipt__label">صالح حتى</span>
            <span className="receipt__value">{data.validUntil}</span>
          </div>
        </>
      )}

      {/* QR Code */}
      {data.showQrCode && data.qrCodeData && (
        <>
          <hr className="receipt__divider" />
          <div className="receipt__qr-container">
            <img
              src={data.qrCodeData}
              alt="QR Code"
              className="receipt__qr"
            />
          </div>
        </>
      )}

      {/* Footer Text - Custom or Default */}
      <hr className="receipt__divider" />
      <div className="receipt__footer">
        {data.footerText || 'شكراً لتعاملكم معنا'}
      </div>
      <div className="receipt__powered">Powered by SellX</div>

      {/* Extra spacing to ensure content fully renders before cut */}
      <div style={{ height: '50px', minHeight: '50px' }}></div>
    </div>
  );
}
