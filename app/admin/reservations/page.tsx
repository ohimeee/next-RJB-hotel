import ReservationsTable from "@/components/admin/ReservationsTable";
import { listReservations } from "@/lib/reservations";

/**
 * Read fresh on every request. A hold has fifteen minutes to live, so a cached
 * copy of this list is a list of rooms the desk thinks are blocked and are not.
 */
export const dynamic = "force-dynamic";

const ReservationsPage = async () => {
  const rows = await listReservations();

  return (
    <div>
      <div className="text-[11px] font-semibold tracking-[.14em] text-[#ec3013] uppercase">
        Bookings
      </div>

      <ReservationsTable rows={rows} />
    </div>
  );
};

export default ReservationsPage;
