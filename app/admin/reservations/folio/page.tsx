"use client";

import { useMemo, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

interface Charge {
  date: string;
  desc: string;
  dept: string;
  amount: number;
  by: string;
  byName: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Mock data — swap for a real fetch keyed by folio/confirmation id
// ─────────────────────────────────────────────────────────────────────────

const RATE = 8900;
const NIGHTS = 3;
const PAYMENTS_TOTAL = 15000;

const INITIAL_CHARGES: Charge[] = [
  { date: "28 Aug", desc: "Minibar — soft drinks", dept: "F&B", amount: 450, by: "RB", byName: "R. Bautista" },
  { date: "29 Aug", desc: "Laundry — 4 pieces", dept: "Housekeeping", amount: 620, by: "MS", byName: "M. Santos" },
  { date: "29 Aug", desc: "Airport transfer (NAIA T3)", dept: "Transport", amount: 1200, by: "RB", byName: "R. Bautista" },
];

const peso2 = (n: number) =>
  "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STAY = [
  { label: "Check-in", value: "Fri, 28 Aug 2026", note: "From 3:00 PM" },
  { label: "Check-out", value: "Mon, 31 Aug 2026", note: "Until 11:00 AM" },
  { label: "Room", value: "The Garret Suite", note: "No. 402 · Suite" },
  { label: "Guests", value: "2 guests", note: `${peso2(RATE)}/night` },
];

const DEPARTMENTS = ["F&B", "Housekeeping", "Transport", "Spa"];

function Spinner() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function FolioPage() {
  const [charges, setCharges] = useState<Charge[]>(INITIAL_CHARGES);
  const [desc, setDesc] = useState("");
  const [dept, setDept] = useState(DEPARTMENTS[0]);
  const [amount, setAmount] = useState("");
  const [posting, setPosting] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkedOut, setCheckedOut] = useState(false);

  const roomSubtotal = RATE * NIGHTS;
  const vat = roomSubtotal * 0.12;
  const chargesTotal = useMemo(() => charges.reduce((s, c) => s + c.amount, 0), [charges]);
  const balance = roomSubtotal + vat + chargesTotal - PAYMENTS_TOTAL;

  function postCharge() {
    if (posting || !desc.trim() || !amount) return;
    setPosting(true);
    setTimeout(() => {
      setCharges((prev) => [
        ...prev,
        {
          date: "Today",
          desc: desc.trim(),
          dept,
          amount: Number(amount) || 0,
          by: "RB",
          byName: "R. Bautista",
        },
      ]);
      setDesc("");
      setAmount("");
      setPosting(false);
    }, 1200);
  }

  function doCheckout() {
    if (checkingOut) return;
    setCheckingOut(true);
    setTimeout(() => {
      setCheckingOut(false);
      setCheckedOut(true);
    }, 1400);
  }

  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#ec3013] hover:text-[#b8250e]"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        All reservations
      </button>

      <div className="mt-4 text-[11px] font-semibold uppercase tracking-[.14em] text-[#ec3013]">
        Folio · IKX-4820
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="m-0 font-heading text-[42px] font-extrabold leading-none tracking-tight">
          Jordan Ellison
        </h1>
        <span className="inline-flex bg-[#e15b47] px-3 py-1.5 text-[10px] font-extrabold tracking-widest text-[#f3f2f2]">
          {checkedOut ? "CHECKED OUT" : "CHECKED IN"}
        </span>
      </div>
      <hr className="mt-6 h-0.5 border-0 bg-[#201e1d]/40" />

      <div className="mt-8 grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-8">
          {/* Stay summary */}
          <section>
            <h2 className="m-0 text-xl font-extrabold tracking-tight">Stay summary</h2>
            <div className="mt-4 grid grid-cols-2 border border-[#201e1d]/40 md:grid-cols-4">
              {STAY.map((c, i) => (
                <div
                  key={c.label}
                  className={[
                    "p-4",
                    i % 2 !== 0 ? "border-l-2 border-[#201e1d]/40" : "",
                    i >= 2 ? "border-t-2 border-[#201e1d]/40 md:border-t-0" : "",
                    i % 4 !== 0 ? "md:border-l-2 md:border-[#201e1d]/40" : "md:border-l-0",
                  ].join(" ")}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[#ec3013]">
                    {c.label}
                  </div>
                  <div className="mt-2 text-[15px] font-extrabold">{c.value}</div>
                  <div className="mt-1 text-[11px] text-[#201e1d]/55">{c.note}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Incidental charges */}
          <section>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="m-0 text-xl font-extrabold tracking-tight">Incidental charges</h2>
              <span className="text-[13px] text-[#201e1d]/55">
                {charges.length ? `${charges.length} posted` : "None posted"}
              </span>
            </div>

            {charges.length > 0 ? (
              <>
                {/* Table (desktop) */}
                <div className="mt-4 hidden overflow-x-auto border border-[#201e1d]/40 md:block">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-[#201e1d]/40 bg-[#eae9e9]">
                        {["Date", "Description", "Department", "Posted by", "Amount"].map((h) => (
                          <th
                            key={h}
                            className={`px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-[#201e1d]/60 ${
                              h === "Amount" ? "text-right" : ""
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {charges.map((c, i) => (
                        <tr key={i} className="border-b border-[#201e1d]/20 last:border-0">
                          <td className="px-4 py-3 text-[13px] tabular-nums text-[#201e1d]/70">{c.date}</td>
                          <td className="px-4 py-3 text-sm font-semibold">{c.desc}</td>
                          <td className="px-4 py-3 text-[13px] text-[#201e1d]/70">{c.dept}</td>
                          <td className="px-4 py-3 text-[13px] font-semibold text-[#201e1d]/70">{c.by}</td>
                          <td className="px-4 py-3 text-right text-sm font-extrabold tabular-nums">
                            {peso2(c.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Cards (mobile) */}
                <div className="mt-4 flex flex-col gap-4 md:hidden">
                  {charges.map((c, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 border border-[#201e1d]/40 p-4">
                      <div>
                        <div className="text-sm font-extrabold">{c.desc}</div>
                        <div className="mt-1 text-[11px] tabular-nums text-[#201e1d]/55">
                          {c.date} · {c.dept} · {c.byName}
                        </div>
                      </div>
                      <div className="text-[15px] font-extrabold tabular-nums">{peso2(c.amount)}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-4 border border-[#201e1d]/40 p-8">
                <div className="text-[17px] font-extrabold tracking-tight">Nothing posted yet</div>
                <p className="mt-1.5 max-w-[48ch] text-[12.5px] leading-relaxed text-[#201e1d]/60">
                  This stay has no incidental charges. The balance to the right is room and VAT
                  only — post minibar, laundry or transport below as they happen.
                </p>
              </div>
            )}

            {/* Post a charge */}
            <div className="mt-4 border border-[#201e1d]/40 bg-[#eae9e9] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#ec3013]">
                  Post a charge
                </div>
                <div className="text-[11px] text-[#201e1d]/55">Posting as Rina Bautista (RB)</div>
              </div>
              <div className="mt-3 grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_160px_140px_auto]">
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-[#201e1d]/60">
                    Description
                  </label>
                  <input
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="e.g. Room service — breakfast"
                    className="w-full border border-[#201e1d]/40 bg-[#f3f2f2] px-3 py-2.5 text-sm text-[#201e1d]"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-[#201e1d]/60">
                    Department
                  </label>
                  <select
                    value={dept}
                    onChange={(e) => setDept(e.target.value)}
                    className="w-full appearance-none border border-[#201e1d]/40 bg-[#f3f2f2] px-3 py-2.5 text-sm text-[#201e1d]"
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-[#201e1d]/60">
                    Amount (₱)
                  </label>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-[#201e1d]/40 bg-[#f3f2f2] px-3 py-2.5 text-sm tabular-nums text-[#201e1d]"
                  />
                </div>
                <button
                  type="button"
                  disabled={posting}
                  onClick={postCharge}
                  className={[
                    "flex items-center justify-between gap-2 px-4 py-2.5 font-heading text-[13px] font-extrabold text-[#f3f2f2]",
                    posting ? "bg-[#ec3013]/45 cursor-progress" : "bg-[#ec3013] cursor-pointer",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-2">
                    {posting && <Spinner />}
                    {posting ? "Posting…" : "Add"}
                  </span>
                  {!posting && (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M5 12h14" />
                      <path d="M12 5v14" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Balance panel */}
        <aside className="border border-[#201e1d]/40 bg-[#eae9e9] md:sticky md:top-6">
          <div className="border-b-2 border-[#201e1d]/40 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#ec3013]">
              Running balance
            </div>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight">Folio total</h2>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-sm">Room</div>
                <div className="mt-0.5 text-[11px] tabular-nums text-[#201e1d]/55">
                  {peso2(RATE)} × {NIGHTS} nights
                </div>
              </div>
              <span className="text-sm font-extrabold tabular-nums">{peso2(roomSubtotal)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm">VAT (12%)</span>
              <span className="text-sm font-extrabold tabular-nums">{peso2(vat)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm">Incidentals</span>
              <span className="text-sm font-extrabold tabular-nums">{peso2(chargesTotal)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-sm">Payments</div>
                <div className="mt-0.5 text-[11px] text-[#201e1d]/55">Card deposit · ****4417</div>
              </div>
              <span className="text-sm font-extrabold tabular-nums text-[#201e1d]/55">
                −{peso2(PAYMENTS_TOTAL)}
              </span>
            </div>
          </div>
          <div className="bg-[#ec3013] p-4 text-[#f3f2f2]">
            <div className="text-[10px] font-semibold uppercase tracking-[.14em] opacity-85">
              Balance due
            </div>
            <div className="mt-2 font-heading text-[38px] font-extrabold leading-[.92] tracking-tight tabular-nums">
              {peso2(balance)}
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t-2 border-[#201e1d]/40 p-4">
            <button
              type="button"
              disabled
              className="flex w-full items-center justify-between border border-[#201e1d]/40 px-4 py-3 text-[13px] font-semibold text-[#201e1d]/45"
            >
              Check in <span className="text-[10px] tracking-wide">DONE</span>
            </button>
            <div className="-mt-2 text-[11px] tabular-nums text-[#201e1d]/55">
              Checked in 28 Aug, 3:12 PM · RB
            </div>
            <button
              type="button"
              disabled={checkingOut || checkedOut}
              onClick={doCheckout}
              className={[
                "flex w-full items-center justify-between gap-2 px-4 py-3 font-heading text-sm font-extrabold text-[#f3f2f2]",
                checkingOut ? "bg-[#ec3013]/45 cursor-progress" : checkedOut ? "bg-[#201e1d]/30" : "bg-[#ec3013] cursor-pointer",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                {checkingOut && <Spinner />}
                {checkingOut ? "Checking out…" : checkedOut ? "Checked out" : "Check out"}
              </span>
              {!checkingOut && !checkedOut && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="flex w-full items-center justify-between border border-[#201e1d]/40 px-4 py-3 text-[13px] font-semibold text-[#201e1d] hover:bg-[#ec3013]/10 hover:text-[#b8250e]"
            >
              Record payment
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="14" x="2" y="5" />
                <path d="M2 10h20" />
              </svg>
            </button>
            <div className="-mt-2 text-[11px] tabular-nums text-[#201e1d]/55">
              Deposit taken 28 Aug, 3:15 PM · RB
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}