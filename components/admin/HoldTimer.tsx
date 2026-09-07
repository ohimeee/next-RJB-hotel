"use client";

import { useEffect, useState } from "react";

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * Counts a 15-minute hold down to zero.
 *
 * Renders nothing on the server and nothing on the first client paint. The
 * remaining time is a function of *now*, so a value baked into the HTML is
 * already wrong by the time it arrives, and React would flag the mismatch —
 * mounting first and filling in after is what keeps the two in agreement.
 *
 * Nothing here expires the hold. The sweep in lib/reservations.ts does that,
 * and this is only the visible half of it; a timer that hit zero in a tab
 * nobody was watching would otherwise have to be trusted, and it cannot be.
 */
const HoldTimer = ({ expiresAt }: { expiresAt: Date }) => {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const target = new Date(expiresAt).getTime();

    const tick = () =>
      setRemaining(Math.max(0, Math.floor((target - Date.now()) / 1000)));

    tick();

    const id = setInterval(tick, 1000);

    return () => clearInterval(id);
  }, [expiresAt]);

  if (remaining === null) return null;

  return (
    <span className="tracking-wider tabular-nums">
      {remaining === 0
        ? "expired"
        : `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`}
    </span>
  );
};

export default HoldTimer;
