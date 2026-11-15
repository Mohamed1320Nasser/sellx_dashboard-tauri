/**
 * Amount in Arabic words for invoices: 1250.5 -> "فقط ألف ومئتان وخمسون جنيهاً و50 قرشاً لا غير".
 */
const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS = [
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

/** 0..999 */
function below1000(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (r) {
    if (r < 10) parts.push(ONES[r]);
    else if (r < 20) parts.push(TEENS[r - 10]);
    else parts.push(r % 10 ? `${ONES[r % 10]} و${TENS[Math.floor(r / 10)]}` : TENS[Math.floor(r / 10)]);
  }
  return parts.join(" و");
}

/** A count of thousands / millions / billions with the right form of the word */
function scaled(n: number, one: string, two: string, few: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  const r = n % 100;
  return `${below1000(n)} ${r >= 3 && r <= 10 ? few : one}`;
}

export function numberToArabicWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "صفر";
  const parts: string[] = [];
  const billions = Math.floor(n / 1e9);
  n %= 1e9;
  const millions = Math.floor(n / 1e6);
  n %= 1e6;
  const thousands = Math.floor(n / 1e3);
  n %= 1e3;
  if (billions) parts.push(scaled(billions, "مليار", "ملياران", "مليارات"));
  if (millions) parts.push(scaled(millions, "مليون", "مليونان", "ملايين"));
  if (thousands) parts.push(scaled(thousands, "ألف", "ألفان", "آلاف"));
  if (n) parts.push(below1000(n));
  return parts.join(" و");
}

/** "فقط ... جنيهاً و.. قرشاً لا غير" (Egyptian pounds and piasters) */
export function amountInWords(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const pounds = Math.floor(cents / 100);
  const piasters = cents % 100;
  const poundsText = `${numberToArabicWords(pounds)} جنيهاً`;
  const piastersText = piasters ? ` و${numberToArabicWords(piasters)} قرشاً` : "";
  return `فقط ${poundsText}${piastersText} لا غير`;
}
