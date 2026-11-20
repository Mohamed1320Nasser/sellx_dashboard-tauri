/** Shop days are Cairo days, whatever the device clock's zone */
const SHOP_TZ = 'Africa/Cairo';

export const shopToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TZ }).format(new Date());

export const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** "السبت، 21 نوفمبر 2026" */
export const dayLabel = (day: string) =>
  new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`)
  );

/** "14:05" in shop time */
export const shopTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: SHOP_TZ }).format(new Date(iso));

/** the shop day of a moment */
export const shopDayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: SHOP_TZ }).format(new Date(iso));

/** "09:00 – 17:30", with the date when it started or ended on another day; "منذ 09:00" while open */
export function shiftSpan(start: string, end: string | null, day: string) {
  const at = (iso: string) => (shopDayOf(iso) === day ? shopTime(iso) : `${shopDayOf(iso).slice(5).replace('-', '/')} ${shopTime(iso)}`);
  return end ? `${at(start)} – ${at(end)}` : `مفتوحة منذ ${at(start)}`;
}
