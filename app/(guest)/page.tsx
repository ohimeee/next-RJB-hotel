import InfoBar from "@/components/guest/InfoBar";
import RoomCard from "@/components/guest/RoomCard";
import { findAvailableRooms } from "@/lib/rooms";
import { checkoutHref, parseSearch, type RawSearchParams } from "@/lib/search";

const HomePage = async ({
  searchParams,
}: {
  // Next 16 hands searchParams over as a Promise.
  searchParams: Promise<RawSearchParams>;
}) => {
  const query = parseSearch(await searchParams);
  const rooms = await findAvailableRooms(query);

  const searched = Boolean(query.checkIn && query.checkOut);

  return (
    <div className="flex-col">
      <div className="border-b-2 py-5">
        <p className="text-xs font-medium text-orange-500">BOUTIQUE STAYS</p>
        <h1 className="text-4xl font-bold">Rooms & suites</h1>
      </div>

      <InfoBar />

      {rooms.length === 0 ? (
        <p className="py-10 text-gray-500">
          {searched
            ? "No rooms free for those dates. Try shortening your stay or lowering the guest count."
            : "No rooms have been added yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              href={checkoutHref(room.id, query)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default HomePage;
