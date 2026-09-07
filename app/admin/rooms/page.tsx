import RoomsInventory from "@/components/admin/RoomsInventory";
import { listRooms } from "@/lib/rooms";

/**
 * Read fresh on every request. `Room.status` moves on every check-in and
 * check-out, so a cached inventory table is a table of stale housekeeping.
 */
export const dynamic = "force-dynamic";

const RoomsPage = async () => {
  const rooms = await listRooms();

  return <RoomsInventory rooms={rooms} />;
};

export default RoomsPage;
