import { z } from "zod";

import { DATE_PATTERN, nights, today } from "@/lib/dates";
import { toMoney } from "@/lib/money";
import { MAX_GUESTS, MIN_GUESTS } from "@/lib/search";
import {
  CHARGE_DEPARTMENTS,
  PAYMENT_METHODS,
  ROOM_STATUSES,
  ROOM_TYPES,
} from "@/lib/types";

/**
 * Every schema that guards a write, in one file.
 *
 * They used to sit next to the code that used them, which meant the rules for a
 * booking were only visible from inside the booking action. Collected here, the
 * whole set of things this API will accept can be read in one pass — and a
 * route and a server action validating the same thing can share one schema
 * instead of drifting apart.
 *
 * Read-side query parsing is deliberately *not* here. `parseSearch` in
 * lib/search.ts normalises a malformed URL into the full catalog rather than
 * rejecting it, which is the opposite job: a bad `?guests=abc` should show
 * rooms, not an error page.
 */

/** Nobody books a year in a single reservation, and an open-ended stay is a bug. */
export const MAX_NIGHTS = 30;

/**
 * A server action is a public endpoint — the form it is attached to is not a
 * gate. Everything below arrives as untrusted input, including the room id and
 * the dates.
 *
 * The price is deliberately absent: it is recomputed from the room's stored
 * rate in createReservation(). A total posted by the client is never trusted.
 */
export const bookingSchema = z
  .object({
    roomId: z.string().min(1, "Pick a room first."),
    guestName: z
      .string()
      .trim()
      .min(1, "Enter the name the reservation is held under.")
      .max(120, "That name is too long."),
    guestCount: z.coerce
      .number()
      .int()
      .min(MIN_GUESTS, "At least one guest.")
      .max(MAX_GUESTS, `We can seat at most ${MAX_GUESTS} guests in a room.`),
    checkIn: z.string().regex(DATE_PATTERN, "Check-in date is missing."),
    checkOut: z.string().regex(DATE_PATTERN, "Check-out date is missing."),
  })
  .refine((value) => value.checkOut > value.checkIn, {
    message: "Check-out has to be after check-in.",
    path: ["checkOut"],
  })
  // `YYYY-MM-DD` compares correctly as a string, so this needs no Date object
  // and therefore has no timezone behaviour. See lib/dates.ts.
  .refine((value) => value.checkIn >= today(), {
    message: "That check-in date has already passed.",
    path: ["checkIn"],
  })
  .refine((value) => nights(value.checkIn, value.checkOut) <= MAX_NIGHTS, {
    message: `Stays are capped at ${MAX_NIGHTS} nights — call the front desk for longer.`,
    path: ["checkOut"],
  });

/**
 * A peso amount as typed at a desk: "450", "450.5", "1,200.50".
 *
 * Normalised to the two-decimal string the DECIMAL(10,2) columns take, never to
 * a number — see lib/money.ts. The upper bound is what the column holds:
 * DECIMAL(10,2) tops out at 99,999,999.99, and a value above it would reach
 * Postgres only to come back as a numeric overflow nobody can read.
 */
const pesoAmount = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .transform((value) => value.replace(/,/g, ""))
    .refine((value) => /^\d{1,8}(\.\d{1,2})?$/.test(value), {
      message: `${label} has to be an amount like 1200 or 1200.50.`,
    })
    .transform(toMoney);

/** "" from an untouched optional input means "not set", not an empty string. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === "" ? null : value));

/**
 * Amenities arrive as one newline-joined hidden field rather than repeated
 * inputs: `validateFormData` reads named fields with `formData.get()`, which
 * takes only the first of a repeated name. Newlines rather than commas because
 * an amenity is free text and "Bed, sofa" is a plausible thing to type.
 */
const amenityList = z
  .string()
  .transform((value) =>
    value
      .split("\n")
      .map((amenity) => amenity.trim())
      .filter(Boolean),
  )
  .refine((list) => list.length <= 20, {
    message: "That is more amenities than a card can show — keep it under 20.",
  });

/**
 * A room, as the admin inventory form submits it.
 *
 * `nightlyRate` is stored ex-VAT, which is what the form's own label says. VAT
 * is added per stay in lib/pricing.ts, so changing a rate here never rewrites
 * the tax on a booking already taken.
 */
export const roomSchema = z.object({
  number: z
    .string()
    .trim()
    .min(1, "Give the room a number.")
    .max(10, "That room number is too long."),
  name: z
    .string()
    .trim()
    .min(1, "Give the room a name — it is the heading on the guest card.")
    .max(120, "That name is too long."),
  type: z.enum(ROOM_TYPES),
  capacity: z.coerce
    .number()
    .int()
    .min(1, "A room sleeps at least one guest.")
    .max(10, "Split anything larger than 10 into separate rooms."),
  nightlyRate: pesoAmount("Nightly rate"),
  status: z.enum(ROOM_STATUSES),
  amenities: amenityList,
  description: optionalText(400, "Keep the description under 400 characters."),
  imageUrl: optionalText(500, "That URL is too long."),
});

/** An incidental posted at the front desk. Amounts here are VAT-inclusive. */
export const chargeSchema = z.object({
  reservationId: z.string().min(1),
  description: z
    .string()
    .trim()
    .min(1, "Say what the charge is for — it prints on the guest's bill.")
    .max(200, "That description is too long."),
  department: z.enum(CHARGE_DEPARTMENTS),
  amount: pesoAmount("Amount"),
  // Initials until Staff exists, so a disputed charge can be traced to a person
  // rather than to nobody. See the "postedBy" comment in db/schema.sql.
  //
  // Upper-cased on the way in, because the input renders uppercase and storing
  // what was literally typed would put "rb" on a bill that showed "RB".
  postedBy: optionalText(8, "Use initials, not a full name.").transform(
    (value) => value?.toUpperCase() ?? null,
  ),
});

/** Money taken at the desk. Gateway payments arrive via the webhook instead. */
export const paymentSchema = z.object({
  reservationId: z.string().min(1),
  amount: pesoAmount("Amount"),
  method: z.enum(PAYMENT_METHODS),
  cardLast4: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine((value) => value === null || /^\d{4}$/.test(value), {
      message: "Last four digits only — four numbers, nothing else.",
    }),
});
