"use client";

import { useActionState } from "react";

import Spinner from "@/components/admin/Spinner";
import {
  checkInAction,
  checkOutAction,
  type FrontDeskState,
} from "@/app/admin/actions";

/**
 * The check-in / check-out button, wherever it appears.
 *
 * A form rather than an onClick, so the transition is a real server action: the
 * page it sits on is a server component reading the database, and
 * `revalidateAdmin()` inside the action is what makes the row redraw with the
 * new status. Nothing here holds a copy of the state that could drift from it.
 *
 * No optimistic update. A check-out can be refused for a balance the desk has
 * to collect first, and briefly showing "Checked out" before snapping back is
 * exactly the wrong thing to tell someone standing at the counter.
 */
const FrontDeskButton = ({
  reservationId,
  transition,
  label,
  pendingLabel,
  className,
}: {
  reservationId: string;
  transition: "IN" | "OUT";
  label: string;
  pendingLabel: string;
  className: string;
}) => {
  const [state, formAction, pending] = useActionState<FrontDeskState, FormData>(
    transition === "IN" ? checkInAction : checkOutAction,
    {},
  );

  return (
    <form
      action={formAction}
      className="flex flex-none flex-col items-end gap-1.5"
    >
      <input type="hidden" name="reservationId" value={reservationId} />

      <button
        type="submit"
        disabled={pending}
        className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold ${
          pending ? "cursor-progress opacity-60" : "cursor-pointer"
        } ${className}`}
      >
        {pending && <Spinner />}
        {pending ? pendingLabel : label}
      </button>

      {state.error ? (
        <p
          role="alert"
          className="max-w-[34ch] text-right text-[11px] leading-snug text-[#b8250e]"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
};

export default FrontDeskButton;
