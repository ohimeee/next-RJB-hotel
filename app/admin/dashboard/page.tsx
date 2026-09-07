import Link from "next/link";

import FrontDeskButton from "@/components/admin/FrontDeskButton";
import { formatStamp, formatToday } from "@/lib/dates";
import { getDashboardData, type ReservationListItem } from "@/lib/reservations";
import { folioHref } from "@/lib/admin-links";

/** Read fresh on every request — an arrivals board that caches is a wrong one. */
export const dynamic = "force-dynamic";

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** "104 · Harbor Standard · 1 night · 2 guests · IKX-4823" */
const stayLine = (stay: ReservationListItem): string =>
  [
    stay.roomLabel,
    plural(stay.nights, "night"),
    plural(stay.guestCount, "guest"),
    stay.confirmationCode,
  ].join(" · ");

const DashboardPage = async () => {
  const {
    arrivals,
    departures,
    inHouseGuests,
    occupiedRooms,
    totalRooms,
    occupancyPercent,
    arrivedCount,
    balancesToSettle,
  } = await getDashboardData();

  const stats = [
    {
      label: "Arrivals today",
      value: String(arrivals.length),
      note:
        arrivedCount > 0
          ? `${arrivedCount} already checked in`
          : "none checked in yet",
    },
    {
      label: "Departures due",
      value: String(departures.length),
      note:
        balancesToSettle > 0
          ? `${plural(balancesToSettle, "balance")} to settle`
          : "nothing outstanding",
    },
    {
      label: "In house",
      value: String(inHouseGuests),
      note: `across ${plural(occupiedRooms, "room")}`,
    },
    {
      label: "Occupancy",
      value: `${occupancyPercent}%`,
      note: `${occupiedRooms} of ${totalRooms} rooms`,
    },
  ];

  return (
    <div>
      <div className="text-[11px] font-semibold tracking-[.14em] text-[#ec3013] uppercase">
        Today at a glance
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-heading m-0 text-[42px] leading-none font-extrabold tracking-tight">
          Dashboard
        </h1>
        <div className="text-[13px] text-[#201e1d]/55">
          {formatToday()} · Iloilo City
        </div>
      </div>
      <hr className="mt-6 h-0.5 border-0 bg-[#201e1d]/40" />

      {/* Stats */}
      <div className="mt-8 grid grid-cols-2 border border-[#201e1d]/40 md:grid-cols-4">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={[
              "p-4",
              i % 2 !== 0 ? "border-l-2 border-[#201e1d]/40 md:border-l-2" : "",
              i >= 2 ? "border-t-2 border-[#201e1d]/40 md:border-t-0" : "",
              i % 4 !== 0
                ? "md:border-l-2 md:border-[#201e1d]/40"
                : "md:border-l-0",
            ].join(" ")}
          >
            <div className="text-[10px] font-semibold tracking-wide text-[#ec3013] uppercase">
              {stat.label}
            </div>
            <div className="font-heading mt-2 text-[38px] leading-none font-extrabold tracking-tight tabular-nums">
              {stat.value}
            </div>
            <div className="mt-1.5 text-[11px] text-[#201e1d]/55">
              {stat.note}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Check-ins */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-xl font-extrabold tracking-tight">
              Expected check-ins
            </h2>
            <span className="text-xs text-[#201e1d]/55">
              Standard check-in from 3:00 PM
            </span>
          </div>

          {arrivals.length > 0 ? (
            <div className="mt-4 flex flex-col border border-[#201e1d]/40">
              {arrivals.map((stay, i) => {
                const arrived = stay.status === "CHECKED_IN";

                return (
                  <div
                    key={stay.id}
                    className={`flex flex-wrap items-center gap-3 p-4 ${
                      i > 0 ? "border-t-2 border-[#201e1d]/40" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-extrabold">
                          {stay.guestName}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-1 text-[9px] font-extrabold tracking-widest ${
                            arrived
                              ? "bg-[#e15b47] text-[#f3f2f2]"
                              : "bg-[#ec3013] text-[#f3f2f2]"
                          }`}
                        >
                          {arrived ? "CHECKED IN" : "CONFIRMED"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[#201e1d]/60">
                        {stayLine(stay)}
                      </div>
                      {arrived && stay.checkedInAt ? (
                        <div className="mt-1 text-[11px] text-[#201e1d]/50 tabular-nums">
                          Checked in {formatStamp(stay.checkedInAt)}
                        </div>
                      ) : null}
                    </div>

                    {arrived ? (
                      <Link
                        href={folioHref(stay.confirmationCode)}
                        className="inline-flex items-center gap-2 border border-[#201e1d]/40 px-3.5 py-2.5 text-xs font-semibold text-[#201e1d]"
                      >
                        View folio
                      </Link>
                    ) : (
                      <FrontDeskButton
                        reservationId={stay.id}
                        transition="IN"
                        label="Check in"
                        pendingLabel="Checking in…"
                        className="bg-[#ec3013] text-[#f3f2f2] hover:bg-[#d32a10]"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 border border-[#201e1d]/40 p-8">
              <div className="text-[17px] font-extrabold tracking-tight">
                No arrivals today
              </div>
              <p className="mt-1.5 max-w-[44ch] text-[12.5px] leading-relaxed text-[#201e1d]/60">
                Nobody is due to check in. Confirmed reservations for later
                dates appear here on the morning of arrival.
              </p>
            </div>
          )}
        </section>

        {/* Check-outs */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="m-0 text-xl font-extrabold tracking-tight">
              Expected check-outs
            </h2>
            <span className="text-xs text-[#201e1d]/55">
              Standard check-out by 11:00 AM
            </span>
          </div>

          {departures.length > 0 ? (
            <div className="mt-4 flex flex-col border border-[#201e1d]/40">
              {departures.map((stay, i) => {
                return (
                  <div
                    key={stay.id}
                    className={`flex flex-wrap items-center gap-3 p-4 ${
                      i > 0 ? "border-t-2 border-[#201e1d]/40" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-extrabold">
                        {stay.guestName}
                      </div>
                      <div className="mt-1 text-xs text-[#201e1d]/60">
                        {stay.roomLabel} · {stay.confirmationCode}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-[15px] font-extrabold tabular-nums ${
                          stay.owing ? "text-[#ec3013]" : "text-[#201e1d]/45"
                        }`}
                      >
                        {stay.balanceLabel}
                      </div>
                      <Link
                        href={folioHref(stay.confirmationCode)}
                        className="mt-0.5 block text-[11px] text-[#201e1d]/55 hover:text-[#b8250e]"
                      >
                        {stay.owing
                          ? "Balance due · open folio"
                          : "Settled · folio"}
                      </Link>
                    </div>

                    <FrontDeskButton
                      reservationId={stay.id}
                      transition="OUT"
                      label="Check out"
                      pendingLabel="Checking out…"
                      className="border border-[#201e1d]/40 text-[#201e1d]"
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 border border-[#201e1d]/40 p-8">
              <div className="text-[17px] font-extrabold tracking-tight">
                No departures due
              </div>
              <p className="mt-1.5 max-w-[44ch] text-[12.5px] leading-relaxed text-[#201e1d]/60">
                No in-house guest is due to leave. Balances to settle will
                appear here on the morning of departure.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default DashboardPage;
