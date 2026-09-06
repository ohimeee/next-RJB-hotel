"use client";

import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Mock data — swap for a real fetch (e.g. useSWR / server component prop)
// ─────────────────────────────────────────────────────────────────────────

interface Arrival {
  key: string;
  guest: string;
  sub: string;
  done: boolean;
  stamp?: string;
}

interface Departure {
  key: string;
  guest: string;
  sub: string;
  balance: string;
  note: string;
}

const ARRIVALS: Arrival[] = [
  { key: "a1", guest: "Marisol Reyes", sub: "104 · Harbor Standard · 1 night · 1 guest · IKX-4823", done: false },
  { key: "a2", guest: "Danilo Cruz", sub: "201 · Courtyard Deluxe · 2 nights · 2 guests · IKX-4826", done: false },
  { key: "a3", guest: "Jordan Ellison", sub: "402 · The Garret Suite · 3 nights · 2 guests · IKX-4820", done: true, stamp: "Checked in 3:12 PM · RB" },
];

const DEPARTURES: Departure[] = [
  { key: "d1", guest: "Aiko Tanaka", sub: "305 · Loft Deluxe · IKX-4812", balance: "₱2,150", note: "Balance due" },
  { key: "d2", guest: "Grace Lim", sub: "202 · Courtyard Deluxe · IKX-4795", balance: "₱0", note: "Settled" },
];

const ROOM_COUNT = 7;
const OCCUPIED_ROOMS = 3;

const STATS = [
  { label: "Arrivals today", value: String(ARRIVALS.length), note: "1 already checked in" },
  { label: "Departures today", value: String(DEPARTURES.length), note: "1 balance to settle" },
  { label: "In house", value: "5", note: "across 3 rooms" },
  { label: "Occupancy", value: `${Math.round((OCCUPIED_ROOMS / ROOM_COUNT) * 100)}%`, note: `${OCCUPIED_ROOMS} of ${ROOM_COUNT} rooms` },
];

// ─────────────────────────────────────────────────────────────────────────
// Small pieces
// ─────────────────────────────────────────────────────────────────────────

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

export default function DashboardPage() {
  const [checkedIn, setCheckedIn] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [checkedOut, setCheckedOut] = useState<Record<string, boolean>>({});

  const runCheckIn = (key: string) => {
    if (busy[key]) return;
    setBusy((b) => ({ ...b, [key]: true }));
    setTimeout(() => {
      setBusy((b) => ({ ...b, [key]: false }));
      setCheckedIn((c) => ({ ...c, [key]: true }));
    }, 1200);
  };

  const runCheckOut = (key: string) => {
    if (busy[key]) return;
    setBusy((b) => ({ ...b, [key]: true }));
    setTimeout(() => {
      setBusy((b) => ({ ...b, [key]: false }));
      setCheckedOut((c) => ({ ...c, [key]: true }));
    }, 1200);
  };

  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#ec3013]">
        Today at a glance
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="m-0 font-heading text-[42px] font-extrabold leading-none tracking-tight">
          Dashboard
        </h1>
        <div className="text-[13px] text-[#201e1d]/55">Friday, 28 August 2026 · Makati</div>
      </div>
      <hr className="mt-6 h-0.5 border-0 bg-[#201e1d]/40" />

      {/* Stats */}
      <div className="mt-8 grid grid-cols-2 border border-[#201e1d]/40 md:grid-cols-4">
        {STATS.map((s, i) => (
          <div
            key={s.label}
            className={[
              "p-4",
              i % 2 !== 0 ? "border-l-2 border-[#201e1d]/40 md:border-l-2" : "",
              i >= 2 ? "border-t-2 border-[#201e1d]/40 md:border-t-0" : "",
              i % 4 !== 0 ? "md:border-l-2 md:border-[#201e1d]/40" : "md:border-l-0",
            ].join(" ")}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#ec3013]">
              {s.label}
            </div>
            <div className="mt-2 font-heading text-[38px] font-extrabold leading-none tracking-tight tabular-nums">
              {s.value}
            </div>
            <div className="mt-1.5 text-[11px] text-[#201e1d]/55">{s.note}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Check-ins */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-xl font-extrabold tracking-tight">Expected check-ins</h2>
            <span className="text-xs text-[#201e1d]/55">Standard check-in from 3:00 PM</span>
          </div>

          {ARRIVALS.length > 0 ? (
            <div className="mt-4 flex flex-col border border-[#201e1d]/40">
              {ARRIVALS.map((r, i) => {
                const done = r.done || !!checkedIn[r.key];
                const isBusy = !!busy[r.key];
                const stamp = r.stamp || (checkedIn[r.key] ? "Checked in just now · RB" : "");
                return (
                  <div
                    key={r.key}
                    className={`flex flex-wrap items-center gap-3 p-4 ${i > 0 ? "border-t-2 border-[#201e1d]/40" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-extrabold">{r.guest}</span>
                        <span
                          className={
                            done
                              ? "inline-flex items-center px-2 py-1 text-[9px] font-extrabold tracking-widest bg-[#e15b47] text-[#f3f2f2]"
                              : "inline-flex items-center px-2 py-1 text-[9px] font-extrabold tracking-widest bg-[#ec3013] text-[#f3f2f2]"
                          }
                        >
                          {done ? "CHECKED IN" : "CONFIRMED"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[#201e1d]/60">{r.sub}</div>
                      {stamp && (
                        <div className="mt-1 text-[11px] tabular-nums text-[#201e1d]/50">{stamp}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => (done ? undefined : runCheckIn(r.key))}
                      className={[
                        "inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold",
                        isBusy
                          ? "bg-[#ec3013]/45 text-[#f3f2f2] cursor-progress"
                          : done
                          ? "border border-[#201e1d]/40 text-[#201e1d] cursor-pointer"
                          : "bg-[#ec3013] text-[#f3f2f2] cursor-pointer hover:bg-[#d32a10]",
                      ].join(" ")}
                    >
                      {isBusy && <Spinner />}
                      {isBusy ? "Checking in…" : done ? "View folio" : "Check in"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 border border-[#201e1d]/40 p-8">
              <div className="text-[17px] font-extrabold tracking-tight">No arrivals today</div>
              <p className="mt-1.5 max-w-[44ch] text-[12.5px] leading-relaxed text-[#201e1d]/60">
                Nobody is due to check in. Confirmed reservations for later dates appear here on
                the morning of arrival.
              </p>
            </div>
          )}
        </section>

        {/* Check-outs */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-xl font-extrabold tracking-tight">Expected check-outs</h2>
            <span className="text-xs text-[#201e1d]/55">Standard check-out by 11:00 AM</span>
          </div>

          {DEPARTURES.length > 0 ? (
            <div className="mt-4 flex flex-col border border-[#201e1d]/40">
              {DEPARTURES.map((d, i) => {
                const isBusy = !!busy[d.key];
                const done = !!checkedOut[d.key];
                return (
                  <div
                    key={d.key}
                    className={`flex flex-wrap items-center gap-3 p-4 ${i > 0 ? "border-t-2 border-[#201e1d]/40" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-extrabold">{d.guest}</div>
                      <div className="mt-1 text-xs text-[#201e1d]/60">{d.sub}</div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-[15px] font-extrabold tabular-nums ${
                          d.balance === "₱0" ? "text-[#201e1d]/45" : "text-[#ec3013]"
                        }`}
                      >
                        {d.balance}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#201e1d]/55">
                        {done ? "Checked out · RB" : d.note}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isBusy || done}
                      onClick={() => runCheckOut(d.key)}
                      className={[
                        "inline-flex items-center gap-2 border px-3.5 py-2.5 text-xs font-semibold",
                        isBusy
                          ? "border-transparent bg-[#ec3013]/45 text-[#f3f2f2] cursor-progress"
                          : "border-[#201e1d]/40 text-[#201e1d] cursor-pointer",
                      ].join(" ")}
                    >
                      {isBusy && <Spinner />}
                      {isBusy ? "Checking out…" : done ? "Done" : "Check out"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 border border-[#201e1d]/40 p-8">
              <div className="text-[17px] font-extrabold tracking-tight">No departures today</div>
              <p className="mt-1.5 max-w-[44ch] text-[12.5px] leading-relaxed text-[#201e1d]/60">
                No in-house guest is due to leave. Balances to settle will appear here on the
                morning of departure.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}