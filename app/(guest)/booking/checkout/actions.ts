"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createInvoice } from "@/lib/payments";
import {
  createReservation,
  releaseHold,
  type BookingError,
} from "@/lib/reservations";
import { attempt } from "@/lib/result";
import { getRoom } from "@/lib/rooms";
import { typeLabel } from "@/lib/types";
import { bookingSchema } from "@/lib/schemas";
import { firstMessage, validateFormData } from "@/lib/validate";

/** What the form renders back to the guest when something is wrong. */
export type BookingState = { error?: string };

/**
 * The fields this action reads off the form. Named, so a browser posting extra
 * fields cannot reach the schema — see validateFormData.
 */
const BOOKING_FIELDS = [
  "roomId",
  "guestName",
  "guestCount",
  "checkIn",
  "checkOut",
] as const;

const BOOKING_ERRORS: Record<BookingError, string> = {
  ROOM_NOT_FOUND: "That room is no longer listed.",
  OVER_CAPACITY: "That room does not sleep that many guests.",
  ROOM_TAKEN:
    "Someone booked that room while you were deciding. Try different dates, or pick another room.",
  CODE_EXHAUSTED:
    "We could not generate a confirmation code. Please try again.",
};

/**
 * Hold the room, open a hosted checkout, and send the guest to it.
 *
 * The reservation is written before the money moves — see createReservation().
 * Nothing here confirms anything: the booking stays PENDING until Xendit's
 * webhook says it was paid.
 */
export const startBooking = async (
  _previous: BookingState,
  formData: FormData,
): Promise<BookingState> => {
  const parsed = validateFormData(bookingSchema, formData, BOOKING_FIELDS);

  if (!parsed.ok) return { error: firstMessage(parsed.error) };

  const { roomId, guestName, guestCount, checkIn, checkOut } = parsed.value;

  const room = await getRoom(roomId);

  if (!room) return { error: BOOKING_ERRORS.ROOM_NOT_FOUND };

  const result = await createReservation({
    roomId,
    guestName,
    guestCount,
    checkIn,
    checkOut,
  });

  if (!result.ok) return { error: BOOKING_ERRORS[result.error] };

  const { reservation, quote } = result;

  const invoice = await attempt(() =>
    createInvoice({
      reservationId: reservation.id,
      confirmationCode: reservation.confirmationCode,
      amount: reservation.totalAmount,
      description: `${room.name} (Room ${room.number}, ${typeLabel(room.type)}) — ${quote.nights} ${
        quote.nights === 1 ? "night" : "nights"
      }`,
    }),
  );

  if (!invoice.ok) {
    // The hold is already in the database. Leaving it there would block the
    // room for the full window over a failure the guest had no part in, so it
    // is released immediately rather than waiting for the sweep.
    console.error("[booking] invoice creation failed", invoice.error);

    await releaseHold(reservation.id);

    return {
      error: "We could not reach the payment provider. Please try again.",
    };
  }

  // The room is now held, so the catalog has one fewer room for these dates.
  revalidatePath("/");

  // Off to Xendit's hosted page. redirect() throws, so nothing runs after it.
  redirect(invoice.value);
};
