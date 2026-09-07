"use client";

import { useActionState, useEffect, useRef } from "react";

import Spinner from "@/components/admin/Spinner";
import {
  postChargeAction,
  type FolioFormState,
} from "@/app/admin/reservations/folio/actions";
import { CHARGE_DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/types";

const FIELD_CLASSES =
  "w-full border border-[#201e1d]/40 bg-[#f3f2f2] px-3 py-2.5 text-sm text-[#201e1d]";

const LABEL_CLASSES =
  "text-[11px] font-semibold tracking-wide text-[#201e1d]/60 uppercase";

/**
 * Post an incidental against the folio.
 *
 * Uncontrolled inputs, cleared with `form.reset()` once the action reports a
 * save. Nothing here needs to read what was typed — the action re-validates and
 * writes it, and the ledger above redraws from the database — so holding four
 * fields in React state would only create a second copy to keep in step.
 *
 * "Posted by" is initials typed at the desk. It becomes a reference to the
 * Staff table once staff accounts exist; until then a disputed charge should
 * still point at a person rather than at nobody.
 */
const ChargeForm = ({ reservationId }: { reservationId: string }) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, posting] = useActionState<FolioFormState, FormData>(
    postChargeAction,
    {},
  );

  useEffect(() => {
    if (state.saved) formRef.current?.reset();
  }, [state.saved]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-4 border border-[#201e1d]/40 bg-[#eae9e9] p-4"
    >
      <input type="hidden" name="reservationId" value={reservationId} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[10px] font-semibold tracking-[.14em] text-[#ec3013] uppercase">
          Post a charge
        </div>
        <div className="text-[11px] text-[#201e1d]/55">
          Amounts are VAT-inclusive
        </div>
      </div>

      <div className="mt-3 grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_150px_120px_90px_auto]">
        <div className="flex flex-col gap-2">
          <label htmlFor="charge-description" className={LABEL_CLASSES}>
            Description
          </label>
          <input
            id="charge-description"
            name="description"
            placeholder="e.g. Room service — breakfast"
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="charge-department" className={LABEL_CLASSES}>
            Department
          </label>
          <select
            id="charge-department"
            name="department"
            defaultValue="FRONT_DESK"
            className={`${FIELD_CLASSES} appearance-none`}
          >
            {CHARGE_DEPARTMENTS.map((department) => (
              <option key={department} value={department}>
                {DEPARTMENT_LABELS[department]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="charge-amount" className={LABEL_CLASSES}>
            Amount (₱)
          </label>
          <input
            id="charge-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            className={`${FIELD_CLASSES} tabular-nums`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="charge-by" className={LABEL_CLASSES}>
            Posted by
          </label>
          <input
            id="charge-by"
            name="postedBy"
            maxLength={8}
            placeholder="RB"
            className={`${FIELD_CLASSES} uppercase`}
          />
        </div>

        <button
          type="submit"
          disabled={posting}
          className={[
            "font-heading flex items-center justify-between gap-2 px-4 py-2.5 text-[13px] font-extrabold text-[#f3f2f2]",
            posting
              ? "cursor-progress bg-[#ec3013]/45"
              : "cursor-pointer bg-[#ec3013]",
          ].join(" ")}
        >
          <span className="flex items-center gap-2">
            {posting && <Spinner />}
            {posting ? "Posting…" : "Add"}
          </span>
          {!posting && (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
          )}
        </button>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="mt-3 border-l-2 border-[#ec3013] bg-[#ec3013]/[.08] p-2.5 text-[12.5px] leading-snug text-[#b8250e]"
        >
          {state.error}
        </p>
      ) : null}

      {state.saved ? (
        <p className="mt-3 text-xs font-semibold text-[#b8250e]">
          {state.saved}
        </p>
      ) : null}
    </form>
  );
};

export default ChargeForm;
