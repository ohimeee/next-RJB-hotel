import { query, queryOne, withTransaction } from "@/lib/db";
import { formatPeso, toCentavos, toMoney } from "@/lib/money";
import { quoteStay, type Quote } from "@/lib/pricing";
import { nights } from "@/lib/dates";
import type { ReservationStatus, RoomType } from "@/lib/types";

/**
 * How long a room stays held while the guest is on Xendit's payment page.
 *
 * Long enough to finish a GCash payment, short enough that an abandoned
 * checkout does not block a sellable room all day. Nothing in the spec sets
 * this — see IMPLEMENTATION.md, Section 12.
 */
export const HOLD_MINUTES = 15;

/** Codes are `IKX-` plus four digits — short enough to read off a phone. */
const CODE_PREFIX = "IKX-";

/**
 * 10,000 codes is a small space, so a collision is a matter of when. The unique
 * index is what actually prevents a duplicate; this is just how many times we
 * are willing to reroll before giving up.
 */
const CODE_ATTEMPTS = 10;

/** Postgres SQLSTATEs the booking path expects and handles by name. */
const UNIQUE_VIOLATION = "23505";
const EXCLUSION_VIOLATION = "23P01";

const isPgError = (error: unknown, code: string): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === code;

const generateCode = (): string =>
  CODE_PREFIX + String(Math.floor(Math.random() * 10_000)).padStart(4, "0");

export type ReservationRow = {
  id: string;
  confirmationCode: string;
  roomId: string;
  guestName: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  status: ReservationStatus;
  totalAmount: string;
  taxAmount: string;
  holdExpiresAt: Date | null;
};

/** A reservation joined to its room, for the confirmation page. */
export type ReservationDetail = ReservationRow & {
  roomName: string;
  roomNumber: string;
  roomType: RoomType;
  nightlyRate: string;
  quote: Quote;
  totalLabel: string;
};

export type NewReservation = {
  roomId: string;
  guestName: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
};

/**
 * Why a booking was refused. The action turns these into guest-facing copy;
 * keeping them as codes means the reason survives a redirect in a query string.
 */
export type BookingError =
  "ROOM_NOT_FOUND" | "OVER_CAPACITY" | "ROOM_TAKEN" | "CODE_EXHAUSTED";

export type BookingResult =
  | { ok: true; reservation: ReservationRow; quote: Quote }
  | { ok: false; error: BookingError };

/**
 * Release holds nobody came back for.
 *
 * A guest who closes the tab mid-payment would otherwise block that room until
 * someone noticed. Cancelling rather than deleting keeps the row: a payment
 * that lands after the hold lapsed still has something to attach to, and the
 * front desk can see what happened. A CANCELLED row is outside the
 * no-double-booking predicate, so the room is free the moment this runs.
 *
 * Called at the top of the availability read path — cheap, since the WHERE
 * matches nothing on almost every call, and it means no cron job has to exist
 * for the demo to behave correctly.
 */
export const releaseExpiredHolds = async (): Promise<number> => {
  const rows = await query<{ id: string }>(
    `
    UPDATE "Reservation"
       SET "status" = 'CANCELLED', "holdExpiresAt" = NULL
     WHERE "status" = 'PENDING'
       AND "holdExpiresAt" IS NOT NULL
       AND "holdExpiresAt" < now()
    RETURNING "id"
    `,
  );

  return rows.length;
};

const RESERVATION_COLUMNS = `
  "id",
  "confirmationCode",
  "roomId",
  "guestName",
  "guestCount",
  "checkIn",
  "checkOut",
  "status",
  "totalAmount",
  "taxAmount",
  "holdExpiresAt"
`;

/**
 * Hold a room and price the stay.
 *
 * The reservation exists *before* the money moves. Charging first and inserting
 * after would let another guest take the room mid-payment, leaving someone who
 * has paid for a room that is gone — and a refund path we would then have to
 * build. So the row goes in as PENDING, which blocks availability, and the
 * webhook promotes it once Xendit confirms the payment.
 *
 * The total is computed here from the rate in the database. A price posted by
 * the client is never trusted: the checkout page displays a total, it does not
 * get to decide one.
 *
 * There is no explicit transaction. The insert is a single statement, and the
 * check-then-insert race it would otherwise need to guard is already closed by
 * the `Reservation_no_double_booking` exclusion constraint — the database
 * refuses an overlapping row outright, and 23P01 is that refusal.
 */
export const createReservation = async ({
  roomId,
  guestName,
  guestCount,
  checkIn,
  checkOut,
}: NewReservation): Promise<BookingResult> => {
  // Expired holds first, so a guest is not told a room is taken by a checkout
  // somebody abandoned twenty minutes ago.
  await releaseExpiredHolds();

  const room = await queryOne<{ nightlyRate: string; capacity: number }>(
    `SELECT "nightlyRate", "capacity" FROM "Room" WHERE "id" = $1`,
    [roomId],
  );

  if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
  if (guestCount > room.capacity) return { ok: false, error: "OVER_CAPACITY" };

  const quote = quoteStay(room.nightlyRate, nights(checkIn, checkOut));

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    try {
      const reservation = await queryOne<ReservationRow>(
        `
        INSERT INTO "Reservation" (
          "roomId", "confirmationCode", "guestName", "guestCount",
          "checkIn", "checkOut", "status",
          "totalAmount", "taxAmount", "holdExpiresAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, now() + ($9 || ' minutes')::interval)
        RETURNING ${RESERVATION_COLUMNS}
        `,
        [
          roomId,
          generateCode(),
          guestName,
          guestCount,
          checkIn,
          checkOut,
          quote.total,
          quote.tax,
          String(HOLD_MINUTES),
        ],
      );

      // queryOne only returns null on no rows, and RETURNING on a successful
      // INSERT always produces one.
      return { ok: true, reservation: reservation!, quote };
    } catch (error) {
      // Someone else holds or occupies this room for an overlapping range.
      if (isPgError(error, EXCLUSION_VIOLATION)) {
        return { ok: false, error: "ROOM_TAKEN" };
      }

      // Code collision — reroll. Any other unique violation is a real bug and
      // should not be swallowed by the retry loop.
      if (
        isPgError(error, UNIQUE_VIOLATION) &&
        typeof error === "object" &&
        error !== null &&
        (error as { constraint?: string }).constraint ===
          "Reservation_confirmationCode_key"
      ) {
        continue;
      }

      throw error;
    }
  }

  return { ok: false, error: "CODE_EXHAUSTED" };
};

/**
 * Look a booking up by the code on the guest's confirmation. Guests have no
 * accounts, so this is the only way back to a reservation.
 */
export const getReservationByCode = async (
  code: string,
): Promise<ReservationDetail | null> => {
  const row = await queryOne<
    ReservationRow & {
      roomName: string;
      roomNumber: string;
      roomType: RoomType;
      nightlyRate: string;
    }
  >(
    `
    SELECT
      res."id",
      res."confirmationCode",
      res."roomId",
      res."guestName",
      res."guestCount",
      res."checkIn",
      res."checkOut",
      res."status",
      res."totalAmount",
      res."taxAmount",
      res."holdExpiresAt",
      r."name"        AS "roomName",
      r."number"      AS "roomNumber",
      r."type"        AS "roomType",
      r."nightlyRate" AS "nightlyRate"
    FROM "Reservation" res
    JOIN "Room" r ON r."id" = res."roomId"
    WHERE res."confirmationCode" = $1
    `,
    [code],
  );

  if (!row) return null;

  return {
    ...row,
    quote: quoteStay(row.nightlyRate, nights(row.checkIn, row.checkOut)),
    totalLabel: formatPeso(row.totalAmount),
  };
};

/**
 * Give a held room back before its window is up.
 *
 * For the case where checkout fails after the hold was written — the gateway is
 * unreachable, say. Waiting for the sweep would keep the room off the market
 * for the full window over a failure the guest had no part in.
 *
 * Guarded on PENDING so this can never touch a paid booking, even if a webhook
 * confirmed it in the meantime.
 */
export const releaseHold = async (id: string): Promise<void> => {
  await query(
    `
    UPDATE "Reservation"
       SET "status" = 'CANCELLED', "holdExpiresAt" = NULL
     WHERE "id" = $1
       AND "status" = 'PENDING'
    `,
    [id],
  );
};

/**
 * Promote a paid hold. Returns the reservation if this call is what confirmed
 * it, and null if it was already confirmed or is no longer PENDING — which is
 * what makes a redelivered webhook a no-op rather than a second confirmation.
 */
export const confirmReservation = async (
  id: string,
): Promise<ReservationRow | null> =>
  queryOne<ReservationRow>(
    `
    UPDATE "Reservation"
       SET "status" = 'CONFIRMED', "holdExpiresAt" = NULL
     WHERE "id" = $1
       AND "status" = 'PENDING'
    RETURNING ${RESERVATION_COLUMNS}
    `,
    [id],
  );

export const getReservation = async (
  id: string,
): Promise<ReservationRow | null> =>
  queryOne<ReservationRow>(
    `SELECT ${RESERVATION_COLUMNS} FROM "Reservation" WHERE "id" = $1`,
    [id],
  );

/** A reservation as the admin list and dashboard print it. */
export type ReservationListItem = {
  id: string;
  confirmationCode: string;
  guestName: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  status: ReservationStatus;
  totalAmount: string;
  totalLabel: string;
  holdExpiresAt: Date | null;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  roomNumber: string;
  roomName: string;
  roomType: RoomType;
  /** "201 · Courtyard Deluxe", the one-line room label the tables use. */
  roomLabel: string;
};

type ListRow = Omit<ReservationListItem, "nights" | "totalLabel" | "roomLabel">;

const toListItem = (row: ListRow): ReservationListItem => ({
  ...row,
  nights: nights(row.checkIn, row.checkOut),
  totalLabel: formatPeso(row.totalAmount),
  roomLabel: `${row.roomNumber} · ${row.roomName}`,
});

const LIST_COLUMNS = `
  res."id",
  res."confirmationCode",
  res."guestName",
  res."guestCount",
  res."checkIn",
  res."checkOut",
  res."status",
  res."totalAmount",
  res."holdExpiresAt",
  res."checkedInAt",
  res."checkedOutAt",
  r."number" AS "roomNumber",
  r."name"   AS "roomName",
  r."type"   AS "roomType"
`;

/** The balance still owed on a stay, as a SQL expression over `res`. */
const BALANCE_EXPRESSION = `
  res."totalAmount"
  + COALESCE((SELECT SUM(c."amount") FROM "Charge"  c WHERE c."reservationId" = res."id"), 0)
  - COALESCE((SELECT SUM(p."amount") FROM "Payment" p WHERE p."reservationId" = res."id"), 0)
`;

/**
 * Every reservation, newest first.
 *
 * Expired holds are released first for the same reason the availability query
 * does it: a PENDING row whose timer ran out ten minutes ago is not a hold, and
 * showing it as one sends the front desk chasing a guest who never paid.
 *
 * Status filtering and the guest/code search stay in the page rather than here.
 * At this property's size the whole table is a few hundred rows, and filtering
 * client-side keeps the filter buttons instant instead of round-tripping.
 */
export const listReservations = async (): Promise<ReservationListItem[]> => {
  await releaseExpiredHolds();

  const rows = await query<ListRow>(
    `
    SELECT ${LIST_COLUMNS}
    FROM "Reservation" res
    JOIN "Room" r ON r."id" = res."roomId"
    ORDER BY res."createdAt" DESC
    `,
  );

  return rows.map(toListItem);
};

/**
 * Why a front-desk transition was refused. Same shape as BookingError: the
 * action turns a code into copy, so the reason survives a round trip.
 */
export type TransitionError =
  "NOT_FOUND" | "NOT_CONFIRMED" | "NOT_CHECKED_IN" | "BALANCE_DUE";

export type TransitionResult =
  { ok: true } | { ok: false; error: TransitionError; balance?: string };

/**
 * Mark a guest arrived.
 *
 * Two rows move together — the reservation's status and the room's housekeeping
 * flag — so this runs in one transaction. A crash between them would leave a
 * room reading AVAILABLE with somebody's luggage in it.
 *
 * The UPDATE is guarded on CONFIRMED rather than checked beforehand, which makes
 * a double-click a no-op instead of a second check-in with a later timestamp.
 */
export const checkInReservation = async (
  id: string,
): Promise<TransitionResult> =>
  withTransaction(async (run) => {
    const updated = await run<{ roomId: string }>(
      `
      UPDATE "Reservation"
         SET "status" = 'CHECKED_IN', "checkedInAt" = now()
       WHERE "id" = $1
         AND "status" = 'CONFIRMED'
      RETURNING "roomId"
      `,
      [id],
    );

    if (updated.length === 0) {
      const exists = await run<{ id: string }>(
        `SELECT "id" FROM "Reservation" WHERE "id" = $1`,
        [id],
      );

      return exists.length > 0
        ? { ok: false as const, error: "NOT_CONFIRMED" as const }
        : { ok: false as const, error: "NOT_FOUND" as const };
    }

    await run(`UPDATE "Room" SET "status" = 'OCCUPIED' WHERE "id" = $1`, [
      updated[0]!.roomId,
    ]);

    return { ok: true as const };
  });

/**
 * Mark a guest departed and free the room.
 *
 * Refused while anything is still owed. The balance is read inside the same
 * transaction as the update, so a charge posted a moment ago cannot slip past
 * the check — and the amount comes back with the error, so the front desk sees
 * what to collect rather than a bare refusal.
 */
export const checkOutReservation = async (
  id: string,
): Promise<TransitionResult> =>
  withTransaction(async (run) => {
    const found = await run<{ status: ReservationStatus; balance: string }>(
      `
      SELECT res."status", (${BALANCE_EXPRESSION}) AS "balance"
      FROM "Reservation" res
      WHERE res."id" = $1
      `,
      [id],
    );

    const reservation = found[0];

    if (!reservation)
      return { ok: false as const, error: "NOT_FOUND" as const };

    if (reservation.status !== "CHECKED_IN") {
      return { ok: false as const, error: "NOT_CHECKED_IN" as const };
    }

    // Compared in centavos rather than as a float, for the reason lib/money.ts
    // exists: a balance that lands on 0.004 is not zero, and a guest should not
    // walk out owing a centavo nobody can see.
    if (toCentavos(reservation.balance) > 0) {
      return {
        ok: false as const,
        error: "BALANCE_DUE" as const,
        balance: toMoney(reservation.balance),
      };
    }

    const updated = await run<{ roomId: string }>(
      `
      UPDATE "Reservation"
         SET "status" = 'CHECKED_OUT', "checkedOutAt" = now()
       WHERE "id" = $1
         AND "status" = 'CHECKED_IN'
      RETURNING "roomId"
      `,
      [id],
    );

    if (updated.length === 0) {
      return { ok: false as const, error: "NOT_CHECKED_IN" as const };
    }

    await run(`UPDATE "Room" SET "status" = 'AVAILABLE' WHERE "id" = $1`, [
      updated[0]!.roomId,
    ]);

    return { ok: true as const };
  });

/** A departure carries what is still owed — the number the desk actually needs. */
export type DepartureItem = ReservationListItem & {
  balance: string;
  balanceLabel: string;
  /**
   * Whether anything is actually owed. Decided here, in centavos, rather than
   * by a component comparing the string to "0.00" — an overpaid folio is a
   * negative balance, and that test would call it outstanding.
   */
  owing: boolean;
};

/** Everything the dashboard renders, in one call. */
export type DashboardData = {
  arrivals: ReservationListItem[];
  departures: DepartureItem[];
  inHouseGuests: number;
  occupiedRooms: number;
  totalRooms: number;
  occupancyPercent: number;
  arrivedCount: number;
  balancesToSettle: number;
};

/**
 * "Today" is the database's date, not the browser's. A front desk in Manila and
 * a dev machine left on UTC would otherwise disagree about whose arrivals these
 * are, and the guest standing at the counter is the one who is right.
 *
 * Departures deliberately include anyone still CHECKED_IN past their date. An
 * overstay is the row the desk most needs to see, and dropping it the morning
 * after would hide the one stay nobody has closed.
 */
export const getDashboardData = async (): Promise<DashboardData> => {
  await releaseExpiredHolds();

  const arrivalRows = await query<ListRow>(
    `
    SELECT ${LIST_COLUMNS}
    FROM "Reservation" res
    JOIN "Room" r ON r."id" = res."roomId"
    WHERE res."checkIn" = CURRENT_DATE
      AND res."status" IN ('CONFIRMED', 'CHECKED_IN')
    ORDER BY r."number" ASC
    `,
  );

  const departureRows = await query<ListRow & { balance: string }>(
    `
    SELECT ${LIST_COLUMNS}, (${BALANCE_EXPRESSION}) AS "balance"
    FROM "Reservation" res
    JOIN "Room" r ON r."id" = res."roomId"
    WHERE res."status" = 'CHECKED_IN'
      AND res."checkOut" <= CURRENT_DATE
    ORDER BY res."checkOut" ASC, r."number" ASC
    `,
  );

  const totals = await queryOne<{
    inHouseGuests: number;
    occupiedRooms: number;
    totalRooms: number;
  }>(
    `
    SELECT
      COALESCE((
        SELECT SUM("guestCount") FROM "Reservation" WHERE "status" = 'CHECKED_IN'
      ), 0)::int                                                     AS "inHouseGuests",
      (SELECT count(*) FROM "Room" WHERE "status" = 'OCCUPIED')::int AS "occupiedRooms",
      (SELECT count(*) FROM "Room")::int                             AS "totalRooms"
    `,
  );

  const { inHouseGuests, occupiedRooms, totalRooms } = totals ?? {
    inHouseGuests: 0,
    occupiedRooms: 0,
    totalRooms: 0,
  };

  const departures = departureRows.map((row) => ({
    ...toListItem(row),
    balance: toMoney(row.balance),
    balanceLabel: formatPeso(row.balance),
    owing: toCentavos(row.balance) > 0,
  }));

  return {
    arrivals: arrivalRows.map(toListItem),
    departures,
    inHouseGuests,
    occupiedRooms,
    totalRooms,
    // Guarded: an empty property is a fresh database, not 0% occupancy via a
    // division by zero.
    occupancyPercent:
      totalRooms === 0 ? 0 : Math.round((occupiedRooms / totalRooms) * 100),
    arrivedCount: arrivalRows.filter((row) => row.status === "CHECKED_IN")
      .length,
    balancesToSettle: departures.filter((row) => row.owing).length,
  };
};
