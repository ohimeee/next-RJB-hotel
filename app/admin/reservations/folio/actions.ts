"use server";

import { addCharge, recordPayment } from "@/lib/billing";
import { getReservation } from "@/lib/reservations";
import { revalidateAdmin } from "@/lib/revalidate";
import { chargeSchema, paymentSchema } from "@/lib/schemas";
import { firstMessage, validateFormData } from "@/lib/validate";

/** What the two folio forms render back. */
export type FolioFormState = { error?: string; saved?: string };

const CHARGE_FIELDS = [
  "reservationId",
  "description",
  "department",
  "amount",
  "postedBy",
] as const;

const PAYMENT_FIELDS = [
  "reservationId",
  "amount",
  "method",
  "cardLast4",
] as const;

/**
 * Post an incidental against a stay.
 *
 * Only an in-house guest can run up a minibar tab, so a cancelled or
 * still-pending booking is refused here rather than in lib/billing.ts — a
 * departed guest is deliberately still chargeable, because a late-posted
 * transfer or a correction is a real thing the desk has to do.
 */
export const postChargeAction = async (
  _previous: FolioFormState,
  formData: FormData,
): Promise<FolioFormState> => {
  const parsed = validateFormData(chargeSchema, formData, CHARGE_FIELDS);

  if (!parsed.ok) return { error: firstMessage(parsed.error) };

  const reservation = await getReservation(parsed.value.reservationId);

  if (!reservation) return { error: "That reservation no longer exists." };

  if (
    reservation.status !== "CHECKED_IN" &&
    reservation.status !== "CHECKED_OUT"
  ) {
    return {
      error:
        "Charges can only be posted once a guest has checked in. This booking has not started.",
    };
  }

  await addCharge({
    reservationId: parsed.value.reservationId,
    description: parsed.value.description,
    department: parsed.value.department,
    amount: parsed.value.amount,
    postedBy: parsed.value.postedBy,
  });

  revalidateAdmin();

  return { saved: `${parsed.value.description} posted` };
};

/**
 * Record money taken at the desk.
 *
 * `providerEventId` stays null: that column exists to make a redelivered Xendit
 * webhook a no-op, and cash handed over a counter has no event to deduplicate
 * against. The partial unique index is partial precisely so these rows do not
 * all collide on NULL.
 */
export const recordPaymentAction = async (
  _previous: FolioFormState,
  formData: FormData,
): Promise<FolioFormState> => {
  const parsed = validateFormData(paymentSchema, formData, PAYMENT_FIELDS);

  if (!parsed.ok) return { error: firstMessage(parsed.error) };

  const reservation = await getReservation(parsed.value.reservationId);

  if (!reservation) return { error: "That reservation no longer exists." };

  await recordPayment({
    reservationId: parsed.value.reservationId,
    amount: parsed.value.amount,
    method: parsed.value.method,
    paidAt: new Date(),
    cardLast4: parsed.value.cardLast4,
  });

  revalidateAdmin();

  return { saved: "Payment recorded" };
};
