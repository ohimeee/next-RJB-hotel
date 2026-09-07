// End-to-end check of the front-desk path, against the real database.
//
//   npm run test:frontdesk
//
// Companion to scripts/test-booking.mjs, which covers the guest side. This one
// picks up where that leaves off: a confirmed booking is checked in, run up a
// bill, refused check-out while it is owed, paid, and checked out. The modules
// under lib/ are imported and called directly, so what runs here is the same
// code the admin screens run.
//
// Every row it creates is cleaned up at the end, including the room status it
// moved, and it touches no reservation it did not create itself.
import "dotenv/config";

import { pool, query } from "@/lib/db";
import { addCharge, getFolio, recordPayment } from "@/lib/billing";
import {
  checkInReservation,
  checkOutReservation,
  confirmReservation,
  createReservation,
  getDashboardData,
  listReservations,
} from "@/lib/reservations";
import { listRooms } from "@/lib/rooms";

/** Every row this script writes carries it, so cleanup can find them all. */
const MARKER = "Front Desk Self-Test";

// Far enough out that a real booking will never collide with the test.
const CHECK_IN = "2033-04-10";
const CHECK_OUT = "2033-04-13";

let failures = 0;
let created = null;

const check = (label, actual, expected) => {
  const ok = actual === expected;

  if (!ok) failures += 1;

  console.log(
    `${ok ? "  ok  " : "  FAIL"}  ${label}${
      ok
        ? ` = ${actual}`
        : `\n         expected ${expected}\n         actual   ${actual}`
    }`,
  );
};

const step = (name) => console.log(`\n${name}`);

const cleanUp = async () => {
  if (!created) return;

  step("Cleanup");

  await query(`DELETE FROM "Payment" WHERE "reservationId" = $1`, [created.id]);
  await query(`DELETE FROM "Charge"  WHERE "reservationId" = $1`, [created.id]);
  await query(`DELETE FROM "Reservation" WHERE "id" = $1`, [created.id]);

  // Check-in flipped the room to OCCUPIED and check-out flipped it back, but a
  // failure part-way through could leave it either way. Restore what it was.
  await query(`UPDATE "Room" SET "status" = $2 WHERE "id" = $1`, [
    created.roomId,
    created.roomStatusBefore,
  ]);

  console.log("  removed the test reservation, its charges and its payments");
};

try {
  step("Rooms");

  const rooms = await listRooms();

  check("listRooms returns the seeded inventory", rooms.length > 0, true);

  const room = rooms.find((candidate) => candidate.capacity >= 2);

  if (!room) throw new Error("No room sleeps two — seed the database first.");

  console.log(
    `  using ${room.number} · ${room.name} at ${room.nightlyRateLabel}`,
  );

  step("Booking (guest side, to have something to work on)");

  const booking = await createReservation({
    roomId: room.id,
    guestName: MARKER,
    guestCount: 2,
    checkIn: CHECK_IN,
    checkOut: CHECK_OUT,
  });

  if (!booking.ok)
    throw new Error(`Could not create a test booking: ${booking.error}`);

  created = {
    id: booking.reservation.id,
    roomId: room.id,
    roomStatusBefore: room.status,
    code: booking.reservation.confirmationCode,
  };

  console.log(
    `  ${created.code} held for 3 nights, total ${booking.quote.totalLabel}`,
  );

  await confirmReservation(created.id);

  step("Reservation list");

  const list = await listReservations();
  const listed = list.find((row) => row.id === created.id);

  check("the new booking appears", Boolean(listed), true);
  check("status", listed?.status, "CONFIRMED");
  check("nights", listed?.nights, 3);
  check("room label", listed?.roomLabel, `${room.number} · ${room.name}`);

  step("Check-in");

  const arrival = await checkInReservation(created.id);

  check("check-in accepted", arrival.ok, true);

  const afterCheckIn = await getFolio(created.code);

  check("status", afterCheckIn.status, "CHECKED_IN");
  check("checkedInAt stamped", afterCheckIn.checkedInAt instanceof Date, true);

  const roomAfterCheckIn = await query(
    `SELECT "status" FROM "Room" WHERE "id" = $1`,
    [room.id],
  );

  check("room flipped to OCCUPIED", roomAfterCheckIn[0].status, "OCCUPIED");

  const repeat = await checkInReservation(created.id);

  check("a second check-in is refused", repeat.ok, false);
  check("  with", repeat.error, "NOT_CONFIRMED");

  step("Folio arithmetic");

  const roomTotal = afterCheckIn.totals.roomTotal;
  const tax = afterCheckIn.totals.tax;

  console.log(`  room ${roomTotal} + VAT ${tax}`);

  check(
    "room total is rate x nights",
    roomTotal,
    (Number(room.nightlyRate) * 3).toFixed(2),
  );
  check("VAT is 12% of the room", tax, (Number(roomTotal) * 0.12).toFixed(2));
  check("nothing paid yet", afterCheckIn.totals.paid, "0.00");
  check(
    "balance is the whole stay",
    afterCheckIn.totals.balance,
    (Number(roomTotal) + Number(tax)).toFixed(2),
  );
  check(
    "and matches what was quoted at booking",
    afterCheckIn.totals.balance,
    booking.quote.total,
  );
  check("not settled", afterCheckIn.totals.settled, false);

  step("Incidental charges");

  await addCharge({
    reservationId: created.id,
    description: `${MARKER} — minibar`,
    department: "FNB",
    amount: "450.00",
    postedBy: "TS",
  });

  await addCharge({
    reservationId: created.id,
    description: `${MARKER} — laundry`,
    department: "HOUSEKEEPING",
    amount: "620.50",
    postedBy: "TS",
  });

  const charged = await getFolio(created.code);

  check("two charges on the ledger", charged.charges.length, 2);
  check("incidentals total", charged.totals.incidentals, "1070.50");
  check("department label", charged.charges[0].departmentLabel, "F&B");
  check("posted by", charged.charges[0].postedBy, "TS");

  const expectedBalance = (
    Number(charged.totals.roomTotal) +
    Number(charged.totals.tax) +
    1070.5
  ).toFixed(2);

  check("balance includes them", charged.totals.balance, expectedBalance);

  step("Check-out is refused while money is owed");

  const early = await checkOutReservation(created.id);

  check("refused", early.ok, false);
  check("  reason", early.error, "BALANCE_DUE");
  check("  balance reported", early.balance, expectedBalance);

  step("Payment");

  const recorded = await recordPayment({
    reservationId: created.id,
    amount: expectedBalance,
    method: "CASH",
    paidAt: new Date(),
    cardLast4: null,
  });

  check("payment recorded", recorded, true);

  const settled = await getFolio(created.code);

  check("balance cleared", settled.totals.balance, "0.00");
  check("settled", settled.totals.settled, true);
  check("payment method label", settled.payments[0].methodLabel, "Cash");

  step("Dashboard");

  const dashboard = await getDashboardData();

  check("the in-house guest is counted", dashboard.inHouseGuests >= 2, true);
  check("occupancy is a percentage", dashboard.occupancyPercent >= 0, true);

  step("Check-out");

  const departure = await checkOutReservation(created.id);

  check("check-out accepted", departure.ok, true);

  const departed = await getFolio(created.code);

  check("status", departed.status, "CHECKED_OUT");
  check("checkedOutAt stamped", departed.checkedOutAt instanceof Date, true);

  const roomAfterCheckOut = await query(
    `SELECT "status" FROM "Room" WHERE "id" = $1`,
    [room.id],
  );

  check("room freed", roomAfterCheckOut[0].status, "AVAILABLE");

  const late = await checkOutReservation(created.id);

  check("a second check-out is refused", late.ok, false);
  check("  with", late.error, "NOT_CHECKED_IN");
} catch (error) {
  failures += 1;
  console.error("\nThrew:", error);
} finally {
  await cleanUp();
  await pool.end();
}

console.log(
  failures === 0
    ? "\nAll front-desk checks passed."
    : `\n${failures} check${failures === 1 ? "" : "s"} failed.`,
);

process.exit(failures === 0 ? 0 : 1);
