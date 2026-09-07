import ConfirmButton from "@/components/guest/ConfirmButton";
import type { Quote } from "@/lib/pricing";
import type { RoomCardData } from "@/lib/rooms";
import { typeLabel } from "@/lib/types";

const BookingCard = ({ room, quote }: { room: RoomCardData; quote: Quote }) => {
  return (
    <div className="mt-5 flex w-full flex-col">
      <div className="aspect-2/1 overflow-hidden">
        <img
          className="h-full w-full object-cover"
          src={room.imageUrl ?? "https://picsum.photos/200"}
          alt={room.name}
        />
      </div>

      <div className="flex-col divide-y-2 divide-black bg-gray-200 p-3">
        <div className="flex flex-col">
          <p className="text-xs font-semibold text-orange-500">
            {typeLabel(room.type).toUpperCase()} | ROOM {room.number}
          </p>
          <div className="flex items-center justify-between pb-5">
            <div>
              <p className="text-2xl font-bold">{room.name}</p>
              <p className="text-xs text-gray-500">{room.description}</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{room.nightlyRateLabel}</p>
              <p className="text-xs text-gray-500">per night</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col py-5">
          <p className="mb-5 text-xs font-semibold tracking-widest text-gray-500">
            PRICE BREAKDOWN
          </p>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p>Room rate</p>
              <p className="text-xs text-gray-500">
                {room.nightlyRateLabel} x {quote.nights}{" "}
                {quote.nights === 1 ? "night" : "nights"}
              </p>
            </div>
            <div>
              <p className="text-lg font-bold">{quote.roomTotalLabel}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span>Taxes &amp; fees {"(12%)"}</span>
            <span className="text-lg font-bold">{quote.taxLabel}</span>
          </div>
        </div>
        <div className="flex flex-col py-5">
          <p className="text-xl font-bold">Total</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Incl. taxes &amp; fees | PHP
            </span>
            <span className="text-3xl font-bold text-orange-500">
              {quote.totalLabel}
            </span>
          </div>
        </div>
        <ConfirmButton />
      </div>
    </div>
  );
};

export default BookingCard;
