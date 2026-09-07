import { query, queryOne } from "@/lib/db";
import { nights } from "@/lib/dates";
import {
  formatPesoExact,
  fromCentavos,
  toCentavos,
  toMoney,
} from "@/lib/money";
import {
  DEPARTMENT_LABELS,
  PAYMENT_METHOD_LABELS,
  type ChargeDepartment,
  type PaymentMethod,
  type ReservationStatus,
  type RoomType,
} from "@/lib/types";

export type NewPayment = {
  reservationId: string;
  amount: string;
  method: PaymentMethod;
  paidAt: Date;
  providerInvoiceId?: string | null;
  /** Xendit's event id. Null for cash taken at the front desk. */
  providerEventId?: string | null;
  /** Last four digits, for the line the folio prints. Never the full number. */
  cardLast4?: string | null;
};

/**
 * Record money received against a reservation.
 *
 * Returns false when this exact gateway event has already been recorded, which
 * is the normal case rather than an error: Xendit retries a failed webhook with
 * exponential backoff, so the same event will arrive twice sooner or later. The
 * `Payment_providerEventId_key` unique index is what makes the duplicate a
 * no-op, and `ON CONFLICT DO NOTHING` is how that shows up here.
 */
export const recordPayment = async ({
  reservationId,
  amount,
  method,
  paidAt,
  providerInvoiceId = null,
  providerEventId = null,
  cardLast4 = null,
}: NewPayment): Promise<boolean> => {
  const rows = await query<{ id: string }>(
    `
    INSERT INTO "Payment" (
      "reservationId", "amount", "method", "paidAt",
      "providerInvoiceId", "providerEventId", "cardLast4"
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT ("providerEventId") WHERE "providerEventId" IS NOT NULL
      DO NOTHING
    RETURNING "id"
    `,
    [
      reservationId,
      amount,
      method,
      paidAt,
      providerInvoiceId,
      providerEventId,
      cardLast4,
    ],
  );

  return rows.length > 0;
};

/** One line of the incidentals ledger. */
export type FolioCharge = {
  id: string;
  createdAt: Date;
  description: string;
  department: ChargeDepartment;
  departmentLabel: string;
  postedBy: string | null;
  amount: string;
  amountLabel: string;
};

/** One line of the payments panel. */
export type FolioPayment = {
  id: string;
  paidAt: Date;
  amount: string;
  amountLabel: string;
  method: PaymentMethod;
  methodLabel: string;
  cardLast4: string | null;
};

/**
 * The bill, as the front desk reads it.
 *
 * `roomTotal` is derived rather than stored: `totalAmount` was written with VAT
 * already in it at booking time, so the ex-VAT figure the folio prints on its
 * own line is `totalAmount - taxAmount`. Recomputing it from the room's current
 * `nightlyRate` would be wrong — a rate changed after the booking would
 * retroactively alter a bill somebody has already paid.
 *
 * Incidentals carry no VAT of their own: they are posted VAT-inclusive, which
 * is how PH hotels bill minibar and laundry, and it keeps `taxAmount` frozen at
 * the moment of booking. See IMPLEMENTATION.md, Section 13.
 */
export type FolioTotals = {
  roomTotal: string;
  tax: string;
  incidentals: string;
  paid: string;
  balance: string;
  roomTotalLabel: string;
  taxLabel: string;
  incidentalsLabel: string;
  paidLabel: string;
  balanceLabel: string;
  /** True when nothing is owed, which is what unlocks check-out. */
  settled: boolean;
};

export type Folio = {
  id: string;
  confirmationCode: string;
  guestName: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  status: ReservationStatus;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  nightlyRate: string;
  nightlyRateLabel: string;
  roomNumber: string;
  roomName: string;
  roomType: RoomType;
  charges: FolioCharge[];
  payments: FolioPayment[];
  totals: FolioTotals;
};

type FolioRow = {
  id: string;
  confirmationCode: string;
  guestName: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  status: ReservationStatus;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  totalAmount: string;
  taxAmount: string;
  nightlyRate: string;
  roomNumber: string;
  roomName: string;
  roomType: RoomType;
};

const sumCentavos = (amounts: string[]): number =>
  amounts.reduce((total, amount) => total + toCentavos(amount), 0);

/**
 * The whole bill for one confirmation code, in three reads.
 *
 * Three round trips rather than one join, deliberately: joining a reservation
 * to both its charges and its payments multiplies the rows together, and the
 * two sums would then each count the other table's rows. Fixing that in SQL
 * costs more than the extra queries do at this size.
 */
export const getFolio = async (code: string): Promise<Folio | null> => {
  const row = await queryOne<FolioRow>(
    `
    SELECT
      res."id",
      res."confirmationCode",
      res."guestName",
      res."guestCount",
      res."checkIn",
      res."checkOut",
      res."status",
      res."checkedInAt",
      res."checkedOutAt",
      res."totalAmount",
      res."taxAmount",
      r."nightlyRate",
      r."number" AS "roomNumber",
      r."name"   AS "roomName",
      r."type"   AS "roomType"
    FROM "Reservation" res
    JOIN "Room" r ON r."id" = res."roomId"
    WHERE res."confirmationCode" = $1
    `,
    [code],
  );

  if (!row) return null;

  const chargeRows = await query<{
    id: string;
    createdAt: Date;
    description: string;
    department: ChargeDepartment;
    postedBy: string | null;
    amount: string;
  }>(
    `
    SELECT "id", "createdAt", "description", "department", "postedBy", "amount"
    FROM "Charge"
    WHERE "reservationId" = $1
    ORDER BY "createdAt" ASC
    `,
    [row.id],
  );

  const paymentRows = await query<{
    id: string;
    paidAt: Date;
    amount: string;
    method: PaymentMethod;
    cardLast4: string | null;
  }>(
    `
    SELECT "id", "paidAt", "amount", "method", "cardLast4"
    FROM "Payment"
    WHERE "reservationId" = $1
    ORDER BY "paidAt" ASC
    `,
    [row.id],
  );

  const charges = chargeRows.map((charge) => ({
    ...charge,
    amount: toMoney(charge.amount),
    amountLabel: formatPesoExact(charge.amount),
    departmentLabel: DEPARTMENT_LABELS[charge.department],
  }));

  const payments = paymentRows.map((payment) => ({
    ...payment,
    amount: toMoney(payment.amount),
    amountLabel: formatPesoExact(payment.amount),
    methodLabel: PAYMENT_METHOD_LABELS[payment.method],
  }));

  const taxCentavos = toCentavos(row.taxAmount);
  const roomCentavos = toCentavos(row.totalAmount) - taxCentavos;
  const incidentalCentavos = sumCentavos(charges.map((c) => c.amount));
  const paidCentavos = sumCentavos(payments.map((p) => p.amount));
  const balanceCentavos =
    roomCentavos + taxCentavos + incidentalCentavos - paidCentavos;

  const roomTotal = fromCentavos(roomCentavos);
  const tax = fromCentavos(taxCentavos);
  const incidentals = fromCentavos(incidentalCentavos);
  const paid = fromCentavos(paidCentavos);
  const balance = fromCentavos(balanceCentavos);

  return {
    id: row.id,
    confirmationCode: row.confirmationCode,
    guestName: row.guestName,
    guestCount: row.guestCount,
    checkIn: row.checkIn,
    checkOut: row.checkOut,
    nights: nights(row.checkIn, row.checkOut),
    status: row.status,
    checkedInAt: row.checkedInAt,
    checkedOutAt: row.checkedOutAt,
    nightlyRate: toMoney(row.nightlyRate),
    nightlyRateLabel: formatPesoExact(row.nightlyRate),
    roomNumber: row.roomNumber,
    roomName: row.roomName,
    roomType: row.roomType,
    charges,
    payments,
    totals: {
      roomTotal,
      tax,
      incidentals,
      paid,
      balance,
      roomTotalLabel: formatPesoExact(roomTotal),
      taxLabel: formatPesoExact(tax),
      incidentalsLabel: formatPesoExact(incidentals),
      paidLabel: formatPesoExact(paid),
      balanceLabel: formatPesoExact(balance),
      settled: balanceCentavos <= 0,
    },
  };
};

export type NewCharge = {
  reservationId: string;
  description: string;
  department: ChargeDepartment;
  amount: string;
  /** Initials of whoever posted it. Free text until staff accounts exist. */
  postedBy: string | null;
};

/**
 * Post an incidental against a stay.
 *
 * No status guard here — the action decides which stays are open to charges.
 * Keeping the rule there rather than in the ledger means a correction posted
 * against an already-departed guest stays possible when the desk needs it.
 */
export const addCharge = async ({
  reservationId,
  description,
  department,
  amount,
  postedBy,
}: NewCharge): Promise<void> => {
  await query(
    `
    INSERT INTO "Charge" ("reservationId", "description", "department", "amount", "postedBy")
    VALUES ($1, $2, $3, $4, $5)
    `,
    [reservationId, description, department, amount, postedBy],
  );
};
