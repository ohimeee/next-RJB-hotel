"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import Spinner from "@/components/admin/Spinner";
import {
  recordPaymentAction,
  type FolioFormState,
} from "@/app/admin/reservations/folio/actions";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/types";

const FIELD_CLASSES =
  "w-full border border-[#201e1d]/40 bg-[#f3f2f2] px-3 py-2.5 text-sm text-[#201e1d]";

const LABEL_CLASSES =
  "text-[11px] font-semibold tracking-wide text-[#201e1d]/60 uppercase";

/**
 * Record money taken at the desk.
 *
 * Collapsed behind a button, because most stays are paid at booking and the
 * panel it sits in is already the busiest part of the screen. It opens
 * pre-filled with the outstanding balance, which is what is being collected
 * almost every time — the field stays editable for a part payment.
 *
 * Card details are four digits and nothing else. The full number is entered on
 * Xendit's page and never reaches this server; a form here that accepted one
 * would change that, which is the whole reason checkout is hosted.
 */
const PaymentForm = ({
  reservationId,
  balance,
}: {
  reservationId: string;
  balance: string;
}) => {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, saving] = useActionState<FolioFormState, FormData>(
    recordPaymentAction,
    {},
  );

  // Collapsing the panel is state that follows the save, so it is adjusted
  // during render; clearing the inputs is a DOM call and stays in the effect.
  // Splitting them is what `react-hooks/set-state-in-effect` is asking for.
  const [collapsedAfter, setCollapsedAfter] = useState(state.saved);

  if (state.saved !== collapsedAfter) {
    setCollapsedAfter(state.saved);
    if (state.saved) setOpen(false);
  }

  useEffect(() => {
    if (state.saved) formRef.current?.reset();
  }, [state.saved]);

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between border border-[#201e1d]/40 px-4 py-3 text-[13px] font-semibold text-[#201e1d] hover:bg-[#ec3013]/10 hover:text-[#b8250e]"
        >
          Record payment
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="20" height="14" x="2" y="5" />
            <path d="M2 10h20" />
          </svg>
        </button>

        {state.saved ? (
          <p className="text-[11px] font-semibold text-[#b8250e]">
            {state.saved}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 border border-[#201e1d]/40 bg-[#f3f2f2] p-3"
    >
      <input type="hidden" name="reservationId" value={reservationId} />

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] font-semibold tracking-[.14em] text-[#ec3013] uppercase">
          Record payment
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] font-semibold text-[#201e1d]/55"
        >
          Cancel
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="payment-amount" className={LABEL_CLASSES}>
          Amount (₱)
        </label>
        <input
          id="payment-amount"
          name="amount"
          inputMode="decimal"
          defaultValue={balance}
          className={`${FIELD_CLASSES} tabular-nums`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="payment-method" className={LABEL_CLASSES}>
          Method
        </label>
        <select
          id="payment-method"
          name="method"
          defaultValue="CASH"
          className={`${FIELD_CLASSES} appearance-none`}
        >
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {PAYMENT_METHOD_LABELS[method]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="payment-last4" className={LABEL_CLASSES}>
          Card last 4 (optional)
        </label>
        <input
          id="payment-last4"
          name="cardLast4"
          inputMode="numeric"
          maxLength={4}
          placeholder="4417"
          className={`${FIELD_CLASSES} tabular-nums`}
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className={[
          "font-heading flex w-full items-center justify-between px-4 py-3 text-sm font-extrabold text-[#f3f2f2]",
          saving
            ? "cursor-progress bg-[#ec3013]/45"
            : "cursor-pointer bg-[#ec3013]",
        ].join(" ")}
      >
        <span className="flex items-center gap-2">
          {saving && <Spinner />}
          {saving ? "Recording…" : "Record payment"}
        </span>
      </button>

      {state.error ? (
        <p
          role="alert"
          className="border-l-2 border-[#ec3013] bg-[#ec3013]/[.08] p-2.5 text-[12.5px] leading-snug text-[#b8250e]"
        >
          {state.error}
        </p>
      ) : null}
    </form>
  );
};

export default PaymentForm;
