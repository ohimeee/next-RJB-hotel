"use server";

import { createRoom, updateRoom, type RoomError } from "@/lib/rooms";
import { revalidateAdmin } from "@/lib/revalidate";
import { roomSchema } from "@/lib/schemas";
import { firstMessage, validateFormData } from "@/lib/validate";

/** What the inventory form renders back after a save. */
export type RoomFormState = { error?: string; saved?: string };

/**
 * The fields this action reads off the form. `id` is separate: it decides
 * insert vs update and is not part of the room's own data.
 */
const ROOM_FIELDS = [
  "number",
  "name",
  "type",
  "capacity",
  "nightlyRate",
  "status",
  "amenities",
  "description",
  "imageUrl",
] as const;

const ROOM_ERRORS: Record<RoomError, string> = {
  NUMBER_TAKEN:
    "That room number is already in use. Room numbers are unique across the property.",
  ROOM_NOT_FOUND: "That room no longer exists — it may have been removed.",
};

/**
 * Create a room, or update the one whose id the form carries.
 *
 * One action for both because the form is one form: the inventory panel starts
 * empty and fills itself in when a row is picked for editing. Splitting them
 * would mean two near-identical validations of the same nine fields.
 */
export const saveRoomAction = async (
  _previous: RoomFormState,
  formData: FormData,
): Promise<RoomFormState> => {
  const parsed = validateFormData(roomSchema, formData, ROOM_FIELDS);

  if (!parsed.ok) return { error: firstMessage(parsed.error) };

  const id = String(formData.get("id") ?? "");

  const result = id
    ? await updateRoom(id, parsed.value)
    : await createRoom(parsed.value);

  if (!result.ok) return { error: ROOM_ERRORS[result.error] };

  revalidateAdmin();

  return { saved: id ? "Changes saved" : "Room added" };
};
