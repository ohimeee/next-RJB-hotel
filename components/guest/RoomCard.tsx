import Link from "next/link";
import { UserRound } from "lucide-react";
import { MoveRight } from "lucide-react";

import type { RoomCardData } from "@/lib/rooms";
import { typeLabel } from "@/lib/types";

const RoomCard = ({ room, href }: { room: RoomCardData; href: string }) => {
  return (
    <div className="relative flex aspect-6/5 w-full flex-col">
      <div className="absolute top-0 left-0 bg-orange-500 p-2 text-xs font-semibold tracking-widest text-white">
        {typeLabel(room.type)}
      </div>

      <div className="h-1/2 overflow-hidden">
        <img
          className="h-full w-full object-cover"
          src={room.imageUrl ?? "https://picsum.photos/200"}
          alt={room.name}
        />
      </div>

      <div className="flex-col space-y-2 bg-gray-200 p-3">
        <span className="text-lg font-bold">{room.name}</span>

        <div className="flex items-center gap-2">
          <UserRound className="size-3" />
          <span className="text-xs text-gray-500">Sleeps {room.capacity}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {room.amenities.map((amenity) => (
            <span key={amenity} className="bg-white px-2 py-1 text-xs">
              {amenity}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between border-t-2">
          <div>
            <p className="text-xl font-bold">{room.nightlyRateLabel}</p>
            <p className="text-xs text-gray-500">per night</p>
          </div>
          <Link
            href={href}
            className="flex items-center gap-1 bg-orange-500 p-2 text-xs font-semibold tracking-widest text-white"
          >
            <span>Book Now</span>
            <MoveRight className="size-3" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RoomCard;
