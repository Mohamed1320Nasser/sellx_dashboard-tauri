import type { Quote } from "../types";

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("ar-EG-u-nu-latn", {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateString;
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ar-EG-u-nu-latn', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function getStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'DRAFT': return 'مسودة';
    case 'SENT': return 'مرسل';
    case 'ACCEPTED': return 'مقبول';
    case 'REJECTED': return 'مرفوض';
    case 'EXPIRED': return 'منتهي';
    default: return 'مسودة';
  }
}

function generateQuoteHTML(quote: Quote, company?: any): string {
  const subtotal = quote.subtotal || quote.items?.reduce((sum, item) => sum + (item.lineTotal || 0), 0) || 0;
  const discount = quote.totalDiscount || 0;
  const tax = quote.taxAmount || 0;
  const total = quote.totalAmount || (subtotal - discount + tax);
  const companyInfo = company || quote.company;

  return `
    <!DOCTYPE html>
    <html dir="rtl">
    <head>
      <meta charset="UTF-8">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          padding: 0;
          background: white;
          color: #1a1a1a;
          line-height: 1.6;
        }
        .quote {
          max-width: 700px;
          margin: 0 auto;
          padding: 30px 40px;
          background: white;
          box-sizing: border-box;
        }
        .header {
          text-align: center;
          margin-bottom: 15px;
          border-bottom: 2px solid #2980b9;
          padding-bottom: 10px;
        }
        .header .brand {
          font-size: 11px;
          color: #7f8c8d;
          margin-bottom: 3px;
        }
        .header .company-name {
          font-size: 20px;
          font-weight: bold;
          color: #2c3e50;
          margin-bottom: 5px;
        }
        .header .company-details {
          font-size: 10px;
          color: #7f8c8d;
          line-height: 1.4;
        }
        .title {
          text-align: center;
          font-size: 18px;
          font-weight: bold;
          color: #2980b9;
          margin: 15px 0;
        }
        .info-section {
          margin: 10px 0;
          font-size: 11px;
        }
        .info-row {
          display: flex;
          padding: 5px 0;
          border-bottom: 1px solid #ecf0f1;
        }
        .info-label {
          font-weight: bold;
          min-width: 100px;
          color: #34495e;
        }
        .info-value {
          color: #555;
        }
        .status-badge {
          display: inline-block;
          padding: 3px 10px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: bold;
          background: #3498db;
          color: white;
        }
        .notes {
          margin: 10px 0;
          padding: 10px;
          background: #f8f9fa;
          border-right: 3px solid #2980b9;
          border-radius: 3px;
          font-size: 11px;
        }
        .notes-title {
          font-weight: bold;
          margin-bottom: 5px;
          color: #2c3e50;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
          font-size: 11px;
        }
        thead {
          background: #2980b9;
          color: white;
        }
        th {
          padding: 8px;
          text-align: right;
          font-weight: bold;
        }
        td {
          padding: 8px;
          text-align: right;
          border-bottom: 1px solid #ecf0f1;
        }
        tbody tr:nth-child(even) {
          background: #f8f9fa;
        }
        .summary {
          margin-top: 15px;
          padding-top: 12px;
          border-top: 2px solid #2980b9;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 5px 0;
          font-size: 12px;
        }
        .summary-row.total {
          font-size: 15px;
          font-weight: bold;
          color: #2980b9;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 2px solid #ecf0f1;
        }
        .footer {
          text-align: center;
          margin-top: 20px;
          padding-top: 12px;
          border-top: 2px solid #ecf0f1;
          color: #7f8c8d;
          font-size: 9px;
        }
        .footer-line {
          margin: 4px 0;
        }
        .footer-powered {
          font-size: 7px;
          color: #bdc3c7;
          margin-top: 2px;
        }
      </style>
    </head>
    <body>
      <div class="quote">
        <div class="header">
          <div class="company-name">${companyInfo?.name || 'الشركة'}</div>
          <div class="company-details">
            ${companyInfo?.address ? `<div>${companyInfo.address}</div>` : ''}
            ${companyInfo?.phone ? `<div>الهاتف: ${companyInfo.phone}</div>` : ''}
            ${companyInfo?.email ? `<div>البريد الإلكتروني: ${companyInfo.email}</div>` : ''}
          </div>
        </div>

        <div class="title">عرض سعر</div>

        <div class="info-section">
          <div class="info-row">
            <div class="info-label">رقم العرض:</div>
            <div class="info-value">${quote.quoteNumber}</div>
          </div>
          <div class="info-row">
            <div class="info-label">التاريخ:</div>
            <div class="info-value">${formatDate(quote.quoteDate)}</div>
          </div>
          ${quote.validUntil ? `
            <div class="info-row">
              <div class="info-label">صالح حتى:</div>
              <div class="info-value">${formatDate(quote.validUntil)}</div>
            </div>
          ` : ''}
          <div class="info-row">
            <div class="info-label">الحالة:</div>
            <div class="info-value"><span class="status-badge">${getStatusLabel(quote.status)}</span></div>
          </div>
          ${quote.client ? `
            <div class="info-row">
              <div class="info-label">العميل:</div>
              <div class="info-value">${quote.client.name}</div>
            </div>
            ${quote.client.phone ? `
              <div class="info-row">
                <div class="info-label">الهاتف:</div>
                <div class="info-value">${quote.client.phone}</div>
              </div>
            ` : ''}
            ${quote.client.email ? `
              <div class="info-row">
                <div class="info-label">البريد الإلكتروني:</div>
                <div class="info-value">${quote.client.email}</div>
              </div>
            ` : ''}
          ` : ''}
        </div>

        ${quote.notes ? `
          <div class="notes">
            <div class="notes-title">ملاحظات:</div>
            <div>${quote.notes}</div>
          </div>
        ` : ''}

        <table>
          <thead>
            <tr>
              <th>اسم المنتج</th>
              <th>كود المنتج</th>
              <th>الكمية</th>
              <th>سعر الوحدة</th>
              <th>الخصم</th>
              <th>المجموع</th>
            </tr>
          </thead>
          <tbody>
            ${(quote.items || []).map(item => `
              <tr>
                <td>${item.product?.name || 'منتج غير محدد'}</td>
                <td>${item.product?.sku || 'غير محدد'}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.unitPrice)} جنيه</td>
                <td>${item.discountPercent || 0}%</td>
                <td>${formatCurrency(item.lineTotal || 0)} جنيه</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="summary">
          <div class="summary-row">
            <span>المجموع الفرعي:</span>
            <span>${formatCurrency(subtotal)} جنيه</span>
          </div>
          ${discount > 0 ? `
            <div class="summary-row">
              <span>الخصم:</span>
              <span>${formatCurrency(discount)} جنيه</span>
            </div>
          ` : ''}
          ${tax > 0 ? `
            <div class="summary-row">
              <span>الضريبة:</span>
              <span>${formatCurrency(tax)} جنيه</span>
            </div>
          ` : ''}
          <div class="summary-row total">
            <span>المجموع الإجمالي:</span>
            <span>${formatCurrency(total)} جنيه</span>
          </div>
        </div>

        <div class="footer">
          <div class="footer-line">شكراً لاختياركم ${companyInfo?.name || 'خدماتنا'}</div>
          <div class="footer-line">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
          <div class="footer-powered">Powered by SellX</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export const generateQuotePdf = async (quote: Quote, company?: any): Promise<void> => {
  try {
    if (!quote) {
      throw new Error("Quote data is missing");
    }

    if (!quote.quoteNumber) {
      throw new Error("Quote number is missing");
    }

    // Generate HTML content
    const htmlContent = generateQuoteHTML(quote, company);

    // Dynamically import html2canvas and jsPDF
    const [html2canvasModule, jsPDFModule] = await Promise.all([
      import('html2canvas'),
      import('jspdf')
    ]);
    const html2canvas = html2canvasModule.default;
    const { jsPDF } = jsPDFModule;

    // Create a hidden container to render the HTML
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-99999px';
    container.style.top = '0';
    container.style.width = '800px';
    container.style.zIndex = '-99999';
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    // Get the quote element inside the container
    const quoteElement = container.querySelector('.quote') as HTMLElement;
    if (!quoteElement) {
      document.body.removeChild(container);
      throw new Error("Could not find quote element");
    }

    // Wait a bit for fonts and styles to load
    await new Promise(resolve => setTimeout(resolve, 100));

    // Convert to canvas
    const canvas = await html2canvas(quoteElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // Clean up immediately after capturing
    document.body.removeChild(container);

    // Create PDF
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF('p', 'mm', 'a4');
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      0,
      position,
      imgWidth,
      imgHeight
    );
    heightLeft -= pageHeight;

    // Handle multi-page if content is longer than one page
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(
        canvas.toDataURL('image/png'),
        'PNG',
        0,
        position,
        imgWidth,
        imgHeight
      );
      heightLeft -= pageHeight;
    }

    // Download the PDF
    pdf.save(`عرض-سعري-${quote.quoteNumber}.pdf`);
  } catch (error) {
    throw new Error(
      `Failed to generate PDF: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
};
