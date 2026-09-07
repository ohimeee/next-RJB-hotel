import { query, queryOne } from "@/lib/db";
import { formatPeso, toMoney } from "@/lib/money";
import type { RoomStatus, RoomType } from "@/lib/types";
import type { RoomQuery } from "@/lib/search";
import { releaseExpiredHolds } from "@/lib/reservations";

/**
 * What a room looks like once it crosses into a component. `nightlyRate` is a
 * string and `nightlyRateLabel` is display-ready — money never becomes a float
 * on the way up. See lib/money.ts.
 */
export type RoomCardData = {
  id: string;
  number: string;
  name: string;
  type: RoomType;
  capacity: number;
  amenities: string[];
  description: string | null;
  imageUrl: string | null;
  status: RoomStatus;
  nightlyRate: string;
  nightlyRateLabel: string;
};

/** A row of the `Room` table, as node-postgres hands it back. */
type RoomRow = Omit<RoomCardData, "nightlyRateLabel">;

const ROOM_COLUMNS = `
  "id",
  "number",
  "name",
  "type",
  "capacity",
  "amenities",
  "description",
  "imageUrl",
  "status",
  "nightlyRate"
`;

const toRoomCardData = (room: RoomRow): RoomCardData => ({
  ...room,
  nightlyRate: toMoney(room.nightlyRate),
  nightlyRateLabel: formatPeso(room.nightlyRate),
});

/**
 * Rooms that sleep at least `guests`, minus anything already booked across the
 * requested range.
 *
 * Overlap is half-open: an existing stay collides when it starts before the
 * requested check-out AND ends after the requested check-in. So a guest
 * departing on the 11th does not block an arrival on the 11th.
 *
 * A stay only blocks a room while it is live — CANCELLED and CHECKED_OUT stays
 * are ignored.
 *
 * PENDING counts as live. It is a room held while a guest is at the payment
 * gateway, and leaving it out of the list below would let two guests hold the
 * same room at once, both pay, and one of them end up in a refund conversation.
 * The hold exists precisely to stop that. Expired holds are released first, so
 * a checkout somebody abandoned does not keep a room off the market.
 *
 * With no date range this is the plain catalog — a first-time visitor should
 * see rooms, not an empty page demanding dates.
 *
 * Note `Room.status` is deliberately not consulted. That field is housekeeping's
 * "is someone physically in there right now", not a statement about future
 * availability; using it here would hide every occupied room from next month's
 * search.
 */
export const findAvailableRooms = async ({
  checkIn,
  checkOut,
  guests,
}: RoomQuery): Promise<RoomCardData[]> => {
  // Cheap on almost every call — the guarded UPDATE matches nothing once the
  // holds are clear — and it means correct behaviour needs no cron job.
  await releaseExpiredHolds();

  const hasRange = Boolean(checkIn && checkOut);

  // The whole date filter hangs off `$2 IS NOT NULL`, so one statement covers
  // both the searched and the browse-everything case.
  const rows = await query<RoomRow>(
    `
    SELECT ${ROOM_COLUMNS}
    FROM "Room" r
    WHERE r."capacity" >= $1
      AND (
        $2::date IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM "Reservation" res
          WHERE res."roomId" = r."id"
            AND res."status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
            AND res."checkIn" < $3::date
            AND res."checkOut" > $2::date
        )
      )
    ORDER BY r."type" ASC, r."number" ASC
    `,
    [guests, hasRange ? checkIn : null, hasRange ? checkOut : null],
  );

  return rows.map(toRoomCardData);
};

export const getRoom = async (id: string): Promise<RoomCardData | null> => {
  const room = await queryOne<RoomRow>(
    `SELECT ${ROOM_COLUMNS} FROM "Room" WHERE "id" = $1`,
    [id],
  );

  return room ? toRoomCardData(room) : null;
};

/**
 * Every room, in the order the admin table prints them.
 *
 * Unlike findAvailableRooms this applies no filter at all: the inventory screen
 * has to show a room that is fully booked, otherwise there is no way to edit it.
 */
export const listRooms = async (): Promise<RoomCardData[]> => {
  const rows = await query<RoomRow>(
    `SELECT ${ROOM_COLUMNS} FROM "Room" ORDER BY "number" ASC`,
  );

  return rows.map(toRoomCardData);
};

/** What the add/edit form submits, once validated. */
export type RoomInput = {
  number: string;
  name: string;
  type: RoomType;
  capacity: number;
  nightlyRate: string;
  status: RoomStatus;
  amenities: string[];
  description: string | null;
  imageUrl: string | null;
};

/** The one way saving a room can fail that is not a bug. */
export type RoomError = "NUMBER_TAKEN" | "ROOM_NOT_FOUND";

export type RoomResult =
  { ok: true; room: RoomCardData } | { ok: false; error: RoomError };

const UNIQUE_VIOLATION = "23505";

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === UNIQUE_VIOLATION;

export const createRoom = async (input: RoomInput): Promise<RoomResult> => {
  try {
    const room = await queryOne<RoomRow>(
      `
      INSERT INTO "Room" (
        "number", "name", "type", "capacity",
        "nightlyRate", "status", "amenities", "description", "imageUrl"
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING ${ROOM_COLUMNS}
      `,
      [
        input.number,
        input.name,
        input.type,
        input.capacity,
        input.nightlyRate,
        input.status,
        input.amenities,
        input.description,
        input.imageUrl,
      ],
    );

    return { ok: true, room: toRoomCardData(room!) };
  } catch (error) {
    // "Room_number_key". The form checks for a clash as you type, but that read
    // is stale the moment it returns — the unique index is the real guard.
    if (isUniqueViolation(error)) return { ok: false, error: "NUMBER_TAKEN" };

    throw error;
  }
};

export const updateRoom = async (
  id: string,
  input: RoomInput,
): Promise<RoomResult> => {
  try {
    const room = await queryOne<RoomRow>(
      `
      UPDATE "Room"
         SET "number"      = $2,
             "name"        = $3,
             "type"        = $4,
             "capacity"    = $5,
             "nightlyRate" = $6,
             "status"      = $7,
             "amenities"   = $8,
             "description" = $9,
             "imageUrl"    = $10
       WHERE "id" = $1
      RETURNING ${ROOM_COLUMNS}
      `,
      [
        id,
        input.number,
        input.name,
        input.type,
        input.capacity,
        input.nightlyRate,
        input.status,
        input.amenities,
        input.description,
        input.imageUrl,
      ],
    );

    return room
      ? { ok: true, room: toRoomCardData(room) }
      : { ok: false, error: "ROOM_NOT_FOUND" };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "NUMBER_TAKEN" };

    throw error;
  }
};
