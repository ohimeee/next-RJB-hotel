"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import HoldTimer from "@/components/admin/HoldTimer";
import { folioHref } from "@/lib/admin-links";
import { formatStayDate } from "@/lib/dates";
import type { ReservationListItem } from "@/lib/reservations";
import { RESERVATION_STATUSES, type ReservationStatus } from "@/lib/types";

type Filter = "ALL" | ReservationStatus;

const FILTERS: Filter[] = ["ALL", ...RESERVATION_STATUSES];

const TAG_CLASSES: Record<ReservationStatus, string> = {
  PENDING: "border border-[#ec3013] bg-[#ec3013]/10 text-[#b8250e]",
  CONFIRMED: "bg-[#ec3013] text-[#f3f2f2]",
  CHECKED_IN: "bg-[#e15b47] text-[#f3f2f2]",
  CHECKED_OUT: "bg-[#eae9e9] text-[#201e1d]/70",
  CANCELLED: "border border-[#201e1d]/40 text-[#201e1d]/45 line-through",
};

const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: "HOLD",
  CONFIRMED: "CONFIRMED",
  CHECKED_IN: "CHECKED IN",
  CHECKED_OUT: "CHECKED OUT",
  CANCELLED: "CANCELLED",
};

/** "28 Aug → 31 Aug", the range the table prints in one cell. */
const dateRange = (stay: ReservationListItem): string =>
  `${formatStayDate(stay.checkIn).replace(/^\w{3}, /, "")} → ${formatStayDate(
    stay.checkOut,
  ).replace(/^\w{3}, /, "")}`;

const ClockIcon = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

const StatusTag = ({ stay }: { stay: ReservationListItem }) => (
  <span
    className={`inline-flex items-center gap-1.5 px-2 py-1 text-[9px] font-extrabold tracking-widest ${
      TAG_CLASSES[stay.status]
    }`}
  >
    {stay.status === "PENDING" && <ClockIcon />}
    {STATUS_LABEL[stay.status]}
    {stay.status === "PENDING" && stay.holdExpiresAt && (
      <HoldTimer expiresAt={stay.holdExpiresAt} />
    )}
  </span>
);

/**
 * The reservations table, with its status filter and search.
 *
 * A client component over rows the page already fetched, rather than a filter
 * that goes back to the database. At this property's size the whole table is a
 * few hundred rows, and a filter button that round-trips feels broken next to
 * one that does not. The rows themselves are read on the server — nothing here
 * knows how to reach the database, and nothing here can drift from it.
 */
const ReservationsTable = ({ rows }: { rows: ReservationListItem[] }) => {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");

  const pendingCount = useMemo(
    () => rows.filter((stay) => stay.status === "PENDING").length,
    [rows],
  );

  const visible = useMemo(() => {
    const byStatus =
      filter === "ALL" ? rows : rows.filter((stay) => stay.status === filter);

    const term = search.trim().toLowerCase();

    if (!term) return byStatus;

    return byStatus.filter(
      (stay) =>
        stay.guestName.toLowerCase().includes(term) ||
        stay.confirmationCode.toLowerCase().includes(term) ||
        stay.roomLabel.toLowerCase().includes(term),
    );
  }, [rows, filter, search]);

  const filteredToNothing = rows.length > 0 && visible.length === 0;

  return (
    <>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-heading m-0 text-[42px] leading-none font-extrabold tracking-tight">
          Reservations
        </h1>
        <div className="text-[13px] text-[#201e1d]/55 tabular-nums">
          {rows.length
            ? `${visible.length} of ${rows.length} shown`
            : "No reservations"}
        </div>
      </div>
      <hr className="mt-6 h-0.5 border-0 bg-[#201e1d]/40" />

      {/* Toolbar: status filters + search */}
      <div className="mt-6 flex flex-wrap items-center gap-4 md:gap-6">
        <div className="flex self-start border border-[#201e1d]/40">
          {FILTERS.map((option, i) => {
            const active = option === filter;
            const showCount = option === "PENDING" && pendingCount > 0;

            return (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={[
                  "inline-flex items-center justify-center px-3 py-2.5 text-xs tracking-wide whitespace-nowrap",
                  i > 0 ? "border-l-2 border-[#201e1d]/40" : "",
                  active
                    ? "bg-[#ec3013] font-extrabold text-[#f3f2f2]"
                    : "font-semibold text-[#201e1d]/70",
                ].join(" ")}
              >
                {option.replace("_", " ")}
                {showCount && (
                  <span
                    className={[
                      "ml-1.5 inline-flex h-4 min-w-4 items-center justify-center px-1 text-[9.5px] font-extrabold tabular-nums",
                      active
                        ? "bg-[#f3f2f2] text-[#ec3013]"
                        : "bg-[#ec3013] text-[#f3f2f2]",
                    ].join(" ")}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search guest, room or IKX code"
          className="min-w-[220px] flex-1 border border-[#201e1d]/40 bg-[#f3f2f2] px-3 py-2.5 text-[13px] text-[#201e1d]"
        />
      </div>

      {/* Hold notice */}
      {pendingCount > 0 && (
        <div className="mt-4 flex items-start gap-2.5 border-l-2 border-[#ec3013] bg-[#ec3013]/[.07] p-3.5">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#b8250e"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-px flex-none"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <div className="text-[12.5px] leading-relaxed text-[#201e1d]/75">
            {pendingCount === 1
              ? "One reservation is on a 15-minute hold while the guest pays. The room stays blocked until the timer runs out, then the hold is released automatically."
              : `${pendingCount} reservations are on 15-minute holds while guests pay. Those rooms stay blocked until the timers run out.`}
          </div>
        </div>
      )}

      {/* Table (desktop) */}
      {visible.length > 0 && (
        <div className="mt-6 hidden overflow-x-auto border border-[#201e1d]/40 md:block">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-[#201e1d]/40 bg-[#eae9e9]">
                {[
                  "Confirmation",
                  "Guest",
                  "Room",
                  "Dates",
                  "Guests",
                  "Total",
                  "Status",
                  "",
                ].map((heading, i) => (
                  <th
                    key={heading + i}
                    className={`px-4 py-3 text-left text-[10px] font-semibold tracking-widest text-[#201e1d]/60 uppercase ${
                      heading === "Guests" || heading === "Total"
                        ? "text-right"
                        : ""
                    }`}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((stay) => (
                <tr
                  key={stay.id}
                  className="border-b border-[#201e1d]/20 last:border-0"
                >
                  <td className="px-4 py-3 text-[13px] font-extrabold tabular-nums">
                    {stay.confirmationCode}
                  </td>
                  <td className="px-4 py-3 text-sm font-extrabold">
                    {stay.guestName}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#201e1d]/70">
                    {stay.roomLabel}
                  </td>
                  <td className="px-4 py-3 text-[13px] tabular-nums">
                    {dateRange(stay)}
                    <span className="ml-1.5 text-[11px] text-[#201e1d]/50">
                      {stay.nights}n
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[13px] tabular-nums">
                    {stay.guestCount}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-extrabold tabular-nums">
                    {stay.totalLabel}
                  </td>
                  <td className="px-4 py-3">
                    <StatusTag stay={stay} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={folioHref(stay.confirmationCode)}
                      className="text-xs font-semibold text-[#ec3013] hover:text-[#b8250e]"
                    >
                      {stay.status === "PENDING" ? "View hold" : "Folio"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cards (mobile) */}
      {visible.length > 0 && (
        <div className="mt-6 flex flex-col gap-4 md:hidden">
          {visible.map((stay) => (
            <div key={stay.id} className="border border-[#201e1d]/40">
              <div className="flex items-start justify-between gap-3 border-b-2 border-[#201e1d]/40 p-4">
                <div>
                  <div className="text-[15px] font-extrabold">
                    {stay.guestName}
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[#201e1d]/55 tabular-nums">
                    {stay.confirmationCode}
                  </div>
                </div>
                <StatusTag stay={stay} />
              </div>
              <div className="grid grid-cols-3 border-b-2 border-[#201e1d]/40">
                <div className="border-r-2 border-[#201e1d]/40 p-4">
                  <div className="text-[10px] font-semibold tracking-wide text-[#201e1d]/55 uppercase">
                    Dates
                  </div>
                  <div className="mt-1 text-[13px] font-extrabold tabular-nums">
                    {dateRange(stay)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#201e1d]/55">
                    {stay.nights} {stay.nights === 1 ? "night" : "nights"}
                  </div>
                </div>
                <div className="border-r-2 border-[#201e1d]/40 p-4">
                  <div className="text-[10px] font-semibold tracking-wide text-[#201e1d]/55 uppercase">
                    Guests
                  </div>
                  <div className="mt-1 text-base font-extrabold tabular-nums">
                    {stay.guestCount}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-[10px] font-semibold tracking-wide text-[#201e1d]/55 uppercase">
                    Total
                  </div>
                  <div className="mt-1 text-base font-extrabold tabular-nums">
                    {stay.totalLabel}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <div className="text-xs text-[#201e1d]/60">
                  {stay.roomLabel}
                </div>
                <Link
                  href={folioHref(stay.confirmationCode)}
                  className="border border-[#201e1d]/40 px-3 py-2 text-xs font-semibold text-[#201e1d]"
                >
                  {stay.status === "PENDING" ? "View hold" : "Folio"}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state: nothing booked at all */}
      {rows.length === 0 && (
        <div className="mt-6 border border-[#201e1d]/40 p-10 text-center">
          <div className="text-xl font-extrabold tracking-tight">
            No reservations yet
          </div>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#201e1d]/60">
            Bookings taken on the guest site land here the moment a hold is
            placed. Check your rooms are listed and available so guests can find
            them.
          </p>
          <Link
            href="/admin/rooms"
            className="font-heading mt-5 inline-flex items-center gap-2 bg-[#ec3013] px-4 py-3 text-[13px] font-extrabold text-[#f3f2f2] hover:bg-[#d32a10]"
          >
            Review rooms
          </Link>
        </div>
      )}

      {/* Empty state: filter matched nothing */}
      {filteredToNothing && (
        <div className="mt-6 border border-[#201e1d]/40 p-8">
          <div className="text-[17px] font-extrabold tracking-tight">
            Nothing matches
          </div>
          <div className="mt-1.5 max-w-md text-[12.5px] leading-relaxed text-[#201e1d]/60">
            {filter === "PENDING"
              ? "No guest is mid-payment right now. Holds appear here for 15 minutes while a booking is being paid for, then clear themselves."
              : "No reservation matches this status and search. Others may still exist under a different one."}
          </div>
          <button
            type="button"
            onClick={() => {
              setFilter("ALL");
              setSearch("");
            }}
            className="mt-4 inline-flex items-center gap-2 border border-[#201e1d]/40 px-3.5 py-2.5 text-[13px] font-semibold text-[#201e1d] hover:bg-[#ec3013]/10 hover:text-[#b8250e]"
          >
            Show all reservations
          </button>
        </div>
      )}
    </>
  );
};

export default ReservationsTable;
