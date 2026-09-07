"use server";

import { formatPeso } from "@/lib/money";
import {
  checkInReservation,
  checkOutReservation,
  type TransitionError,
} from "@/lib/reservations";
import { revalidateAdmin } from "@/lib/revalidate";

/** What a front-desk button renders back when a transition is refused. */
export type FrontDeskState = { error?: string; done?: boolean };

const TRANSITION_ERRORS: Record<TransitionError, string> = {
  NOT_FOUND: "That reservation no longer exists.",
  NOT_CONFIRMED:
    "Only a confirmed booking can be checked in. This one is on hold, cancelled, or already arrived.",
  NOT_CHECKED_IN: "That guest is not currently checked in.",
  BALANCE_DUE: "There is still a balance on this folio.",
};

/**
 * Read the reservation id off the form.
 *
 * A server action is a public endpoint, so this is untrusted even though it
 * only ever comes from a hidden input. An id that is not ours finds no row and
 * comes back as NOT_FOUND, which is the right answer either way.
 */
const reservationId = (formData: FormData): string =>
  String(formData.get("reservationId") ?? "");

export const checkInAction = async (
  _previous: FrontDeskState,
  formData: FormData,
): Promise<FrontDeskState> => {
  const id = reservationId(formData);

  if (!id) return { error: TRANSITION_ERRORS.NOT_FOUND };

  const result = await checkInReservation(id);

  if (!result.ok) return { error: TRANSITION_ERRORS[result.error] };

  revalidateAdmin();

  return { done: true };
};

export const checkOutAction = async (
  _previous: FrontDeskState,
  formData: FormData,
): Promise<FrontDeskState> => {
  const id = reservationId(formData);

  if (!id) return { error: TRANSITION_ERRORS.NOT_FOUND };

  const result = await checkOutReservation(id);

  if (!result.ok) {
    // The balance is the whole point of the refusal, so name the amount rather
    // than sending the desk to another screen to find it.
    return {
      error:
        result.error === "BALANCE_DUE" && result.balance
          ? `${formatPeso(result.balance)} is still owed. Take payment on the folio before checking this guest out.`
          : TRANSITION_ERRORS[result.error],
    };
  }

  revalidateAdmin();

  return { done: true };
};
