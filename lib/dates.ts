// Stay dates are calendar days, not instants. `checkIn` / `checkOut` are
// `@db.Date` columns and travel as `YYYY-MM-DD` strings everywhere above the
// database, so nothing in the app ever builds a Date from a local timezone.

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isDateString = (value: unknown): value is string =>
  typeof value === "string" && DATE_PATTERN.test(value);

const MS_PER_DAY = 86_400_000;

/**
 * `new Date("2026-08-08")` parses as UTC midnight but *renders* as the 7th for
 * anyone west of Greenwich. Every conversion goes through here so that trap
 * exists in exactly one place.
 */
export const toUtcDate = (date: string): Date => new Date(`${date}T00:00:00Z`);

export const toDateString = (date: Date): string =>
  date.toISOString().slice(0, 10);

/** Half-open: checking out on the 11th after arriving on the 8th is 3 nights. */
export const nights = (checkIn: string, checkOut: string): number =>
  Math.round(
    (toUtcDate(checkOut).getTime() - toUtcDate(checkIn).getTime()) / MS_PER_DAY,
  );

/** "Sat, Aug 8" — forced to UTC so the label matches the stored day. */
export const formatStayDate = (date: string): string =>
  toUtcDate(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export const today = (): string => toDateString(new Date());

export const addDays = (date: string, days: number): string =>
  toDateString(new Date(toUtcDate(date).getTime() + days * MS_PER_DAY));

/**
 * The property's timezone.
 *
 * Timestamps are rendered here rather than in the server's zone, so a folio
 * reads the same on a laptop in Manila, a host in Virginia, and a phone abroad.
 * The front desk's clock is the one a guest is standing in front of.
 */
export const HOTEL_TIME_ZONE = "Asia/Manila";

/** "Fri, 28 Aug 2026" — the long form the folio and dashboard headers use. */
export const formatLongDate = (date: string): string =>
  toUtcDate(date).toLocaleDateString("en-PH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** "28 Aug, 3:12 PM" — for a stamp on something that actually happened. */
export const formatStamp = (at: Date): string =>
  at.toLocaleString("en-PH", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: HOTEL_TIME_ZONE,
  });

/** "Friday, 7 September 2026" — the dashboard's own date line. */
export const formatToday = (): string =>
  new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: HOTEL_TIME_ZONE,
  });
