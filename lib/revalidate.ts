import { revalidatePath } from "next/cache";

/**
 * Every admin screen that shows a stay or a room, plus the guest catalog.
 *
 * Check-in and check-out flip `Room.status`, a charge changes a folio balance,
 * and an edited room changes both the inventory table and the public card — so
 * in practice any admin write makes the whole admin side stale. Listing the
 * paths once here beats each action guessing which of them it touched and
 * getting it subtly wrong.
 *
 * This lives outside the `"use server"` files on purpose: every export from one
 * of those has to be an async server action, and a plain helper exported
 * alongside them is a build error.
 */
const ADMIN_PATHS = [
  "/admin/dashboard",
  "/admin/reservations",
  "/admin/reservations/folio",
  "/admin/rooms",
  "/",
] as const;

export const revalidateAdmin = (): void => {
  ADMIN_PATHS.forEach((path) => revalidatePath(path));
};
