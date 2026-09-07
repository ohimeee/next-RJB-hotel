// The database enums, mirrored in TypeScript. `db/schema.sql` is the source of
// truth; these exist so components can name a room type without a generated
// client.

export const ROOM_TYPES = ["STANDARD", "DELUXE", "SUITE"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const ROOM_STATUSES = ["AVAILABLE", "OCCUPIED"] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

/**
 * SUITE -> Suite.
 *
 * Here rather than in lib/rooms.ts so a client component can call it. That
 * module opens the connection pool at import time, and anything importing it
 * from the browser bundle drags `pg` in with it.
 */
export const typeLabel = (type: RoomType): string =>
  type.charAt(0) + type.slice(1).toLowerCase();

export const PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "GCASH",
  "MAYA",
  "GRABPAY",
  "TRANSFER",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RESERVATION_STATUSES = [
  // A room held while the guest is at the payment gateway. Blocks availability
  // exactly like a confirmed stay until the webhook promotes it or it expires.
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "CANCELLED",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

// Which department an incidental charge came from. FRONT_DESK is the fallback
// on the schema side; the folio form defaults to it for the same reason.
export const CHARGE_DEPARTMENTS = [
  "FNB",
  "HOUSEKEEPING",
  "TRANSPORT",
  "FRONT_DESK",
  "OTHER",
] as const;
export type ChargeDepartment = (typeof CHARGE_DEPARTMENTS)[number];

/** What the folio prints for each department. "FNB" is not a word. */
export const DEPARTMENT_LABELS: Record<ChargeDepartment, string> = {
  FNB: "F&B",
  HOUSEKEEPING: "Housekeeping",
  TRANSPORT: "Transport",
  FRONT_DESK: "Front desk",
  OTHER: "Other",
};

/** What the folio prints for each payment method. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  GCASH: "GCash",
  MAYA: "Maya",
  GRABPAY: "GrabPay",
  TRANSFER: "Bank transfer",
};
