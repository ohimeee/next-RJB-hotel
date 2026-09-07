// Money is `DECIMAL(10,2)` in Postgres and a string everywhere above it.
//
// node-postgres hands NUMERIC columns back as strings for exactly one reason:
// `Number("8900.00")` reintroduces float error into currency, and a bill that
// is off by a centavo is a bill the front desk has to explain. So pesos stay
// strings from the driver to the screen, and arithmetic happens in integer
// centavos — see lib/pricing.ts.

/** "8900.00" -> "8900.00". Normalises whatever the column gave us. */
export const toMoney = (value: string): string => {
  const [whole = "0", cents = ""] = value.split(".");
  return `${whole}.${cents.slice(0, 2).padEnd(2, "0")}`;
};

/**
 * "8900.00" -> 890000. Arithmetic on pesos happens in integer centavos, so the
 * float error that `0.1 + 0.2` is famous for never reaches a bill.
 *
 * `Number()` is safe here and only here: the value is already scaled to a whole
 * number of centavos, and DECIMAL(10,2) tops out far below Number.MAX_SAFE_INTEGER.
 */
export const toCentavos = (value: string): number => {
  const raw = toMoney(value);
  const negative = raw.startsWith("-");
  const [whole = "0", cents = "00"] = raw.replace("-", "").split(".");

  const total = Number(whole) * 100 + Number(cents);

  return negative ? -total : total;
};

/** 890000 -> "8900.00". The inverse of toCentavos. */
export const fromCentavos = (centavos: number): string => {
  const negative = centavos < 0;
  const absolute = Math.abs(centavos);
  const whole = Math.trunc(absolute / 100);
  const cents = String(absolute % 100).padStart(2, "0");

  return `${negative ? "-" : ""}${whole}.${cents}`;
};

const groupDigits = (digits: string): string =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * "8900.00" -> "₱8,900" (or "₱8,900.50" when there are real centavos).
 * Operates on the string, so no float ever touches a peso amount.
 */
export const formatPeso = (value: string): string => {
  const raw = toMoney(value);
  const negative = raw.startsWith("-");
  const [whole = "0", cents = "00"] = raw.replace("-", "").split(".");

  const body =
    cents === "00" ? groupDigits(whole) : `${groupDigits(whole)}.${cents}`;

  return `${negative ? "-" : ""}₱${body}`;
};

/**
 * "8900" -> "₱8,900.00". Always two decimals.
 *
 * `formatPeso` drops a trailing ".00" because a catalog rate reads better
 * without it. A folio does not: a column of amounts has to line up, and a bill
 * that prints "₱450" next to "₱1,200.50" looks like a typo rather than a total.
 */
export const formatPesoExact = (value: string): string => {
  const raw = toMoney(value);
  const negative = raw.startsWith("-");
  const [whole = "0", cents = "00"] = raw.replace("-", "").split(".");

  return `${negative ? "-" : ""}₱${groupDigits(whole)}.${cents}`;
};
