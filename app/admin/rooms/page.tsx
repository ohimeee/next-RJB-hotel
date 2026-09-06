"use client";

import { useMemo, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

type RoomStatus = "AVAILABLE" | "OCCUPIED";
type RoomType = "Standard" | "Deluxe" | "Suite";

interface Room {
  id: number;
  number: string;
  name: string;
  type: RoomType;
  capacity: number;
  rate: number;
  status: RoomStatus;
  amenities: string[];
}

// ─────────────────────────────────────────────────────────────────────────
// Mock data — swap for a real fetch (e.g. useSWR / server component prop)
// ─────────────────────────────────────────────────────────────────────────

const INITIAL_ROOMS: Room[] = [
  { id: 1, number: "402", name: "The Garret Suite", type: "Suite", capacity: 2, rate: 8900, status: "OCCUPIED", amenities: ["King bed", "Skylight", "Free breakfast"] },
  { id: 2, number: "501", name: "Atelier Suite", type: "Suite", capacity: 4, rate: 10500, status: "OCCUPIED", amenities: ["2 bedrooms", "Kitchenette", "Balcony"] },
  { id: 3, number: "201", name: "Courtyard Deluxe", type: "Deluxe", capacity: 2, rate: 6400, status: "AVAILABLE", amenities: ["Queen bed", "Courtyard view"] },
  { id: 4, number: "202", name: "Courtyard Deluxe", type: "Deluxe", capacity: 2, rate: 6400, status: "OCCUPIED", amenities: ["Queen bed", "Minibar"] },
  { id: 5, number: "305", name: "Loft Deluxe", type: "Deluxe", capacity: 3, rate: 7100, status: "AVAILABLE", amenities: ["King bed", "Workspace"] },
  { id: 6, number: "104", name: "Harbor Standard", type: "Standard", capacity: 2, rate: 4200, status: "AVAILABLE", amenities: ["Twin beds", "City view"] },
  { id: 7, number: "103", name: "Archive Standard", type: "Standard", capacity: 1, rate: 3600, status: "AVAILABLE", amenities: ["Single bed", "Reading nook"] },
];

const peso = (n: number) => "₱" + n.toLocaleString("en-PH");

const STATUS_CLASSES: Record<RoomStatus, string> = {
  AVAILABLE: "bg-[#ec3013] text-[#f3f2f2]",
  OCCUPIED: "bg-[#eae9e9] text-[#201e1d]/70",
};

function Spinner() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.22-8.56" />
    </svg>
  );
}

const emptyForm = () => ({
  name: "",
  number: "",
  capacity: "2",
  type: "Deluxe" as RoomType,
  rate: "",
  amenities: [] as string[],
  amenDraft: "",
  status: "AVAILABLE" as RoomStatus,
});

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>(INITIAL_ROOMS);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState("");

  const available = rooms.filter((r) => r.status === "AVAILABLE").length;

  const clash = useMemo(
    () => rooms.find((r) => r.number === form.number.trim() && r.id !== editingId),
    [rooms, form.number, editingId]
  );
  const dupError = !!(form.number.trim() && clash);
  const editing = editingId != null;

  function startEdit(r: Room) {
    setEditingId(r.id);
    setForm({
      name: r.name,
      number: r.number,
      capacity: String(r.capacity),
      type: r.type,
      rate: String(r.rate),
      amenities: [...r.amenities],
      amenDraft: "",
      status: r.status,
    });
    setSavedNote("");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setSavedNote("");
  }

  function addAmenity() {
    const val = form.amenDraft.trim();
    if (!val) return;
    setForm((f) => ({ ...f, amenities: [...f.amenities, val], amenDraft: "" }));
  }

  function removeAmenity(i: number) {
    setForm((f) => ({ ...f, amenities: f.amenities.filter((_, j) => j !== i) }));
  }

  function saveRoom() {
    if (dupError || saving) return;
    setSaving(true);
    setSavedNote("");
    setTimeout(() => {
      setRooms((prev) => {
        const rate = Number(form.rate) || 0;
        const capacity = Number(form.capacity) || 1;
        if (editing) {
          return prev.map((r) =>
            r.id === editingId
              ? { ...r, name: form.name, number: form.number, capacity, type: form.type, rate, status: form.status, amenities: form.amenities }
              : r
          );
        }
        const nextId = Math.max(0, ...prev.map((r) => r.id)) + 1;
        return [
          ...prev,
          { id: nextId, name: form.name, number: form.number, capacity, type: form.type, rate, status: form.status, amenities: form.amenities },
        ];
      });
      setSaving(false);
      setSavedNote(editing ? "Changes saved · RB" : "Room added · RB");
    }, 1200);
  }

  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#ec3013]">
        Inventory
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="m-0 font-heading text-[42px] font-extrabold leading-none tracking-tight">
          Rooms
        </h1>
        <div className="text-[13px] tabular-nums text-[#201e1d]/55">
          {rooms.length ? `${rooms.length} rooms · ${available} available tonight` : "No rooms configured"}
        </div>
      </div>
      <hr className="mt-6 h-0.5 border-0 bg-[#201e1d]/40" />

      <div className="mt-8 grid items-start gap-8 md:grid-cols-[minmax(0,1fr)_360px]">
        {/* Room list */}
        <div>
          {rooms.length > 0 ? (
            <>
              {/* Table (desktop) */}
              <div className="hidden overflow-x-auto border border-[#201e1d]/40 md:block">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-[#201e1d]/40 bg-[#eae9e9]">
                      {["Room", "Type", "Sleeps", "Nightly rate", "Status", ""].map((h) => (
                        <th
                          key={h}
                          className={`px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-[#201e1d]/60 ${
                            h === "Nightly rate" ? "text-right" : ""
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.map((r) => (
                      <tr
                        key={r.id}
                        className={`border-b border-[#201e1d]/20 last:border-0 ${
                          editingId === r.id ? "bg-[#ec3013]/[.07]" : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-extrabold">{r.name}</div>
                          <div className="mt-0.5 text-[11px] tabular-nums text-[#201e1d]/55">
                            No. {r.number}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[13px]">{r.type}</td>
                        <td className="px-4 py-3 text-[13px] tabular-nums">{r.capacity}</td>
                        <td className="px-4 py-3 text-right text-sm font-extrabold tabular-nums">
                          {peso(r.rate)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-1 text-[9px] font-extrabold tracking-widest ${STATUS_CLASSES[r.status]}`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            className={`text-xs text-[#ec3013] ${editingId === r.id ? "font-extrabold" : "font-semibold"}`}
                          >
                            {editingId === r.id ? "Editing" : "Edit"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cards (mobile) */}
              <div className="flex flex-col gap-4 md:hidden">
                {rooms.map((r) => (
                  <div
                    key={r.id}
                    className={`border border-[#201e1d]/40 ${editingId === r.id ? "outline outline-2 -outline-offset-2 outline-[#ec3013]" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3 border-b-2 border-[#201e1d]/40 p-4">
                      <div>
                        <div className="text-[15px] font-extrabold">{r.name}</div>
                        <div className="mt-0.5 text-[11px] tabular-nums text-[#201e1d]/55">
                          No. {r.number} · {r.type}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center px-2 py-1 text-[9px] font-extrabold tracking-widest ${STATUS_CLASSES[r.status]}`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <div className="flex items-end justify-between gap-3 p-4">
                      <div className="text-xs text-[#201e1d]/60">Sleeps {r.capacity}</div>
                      <div className="flex items-end gap-4">
                        <div className="text-base font-extrabold tabular-nums">{peso(r.rate)}</div>
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="border border-[#201e1d]/40 px-3 py-2 text-xs font-semibold text-[#201e1d]"
                        >
                          {editingId === r.id ? "Editing" : "Edit"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="border border-[#201e1d]/40 p-10">
              <div className="text-2xl font-extrabold tracking-tight">No rooms yet</div>
              <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-[#201e1d]/60">
                Add your first room using the form to the right. Rooms must exist before the guest
                site can take reservations against them.
              </p>
            </div>
          )}
        </div>

        {/* Add / edit form */}
        <aside className="border border-[#201e1d]/40 bg-[#eae9e9] md:sticky md:top-6">
          <div className="flex items-start justify-between gap-3 border-b-2 border-[#201e1d]/40 p-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#ec3013]">
                {editing ? `Editing room ${form.number}` : "Inventory"}
              </div>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight">
                {editing ? form.name || "Edit room" : "Add a room"}
              </h2>
            </div>
            {editing && (
              <button
                type="button"
                onClick={cancelEdit}
                className="flex-none border border-[#201e1d]/40 px-2.5 py-1.5 text-[11px] font-semibold text-[#201e1d]"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[#201e1d]/60">
                Room name
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Courtyard Deluxe"
                className="w-full border border-[#201e1d]/40 bg-[#f3f2f2] px-3 py-2.5 text-sm text-[#201e1d]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-[#201e1d]/60">
                  Number
                </label>
                <input
                  value={form.number}
                  onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                  placeholder="203"
                  className={`w-full border px-3 py-2.5 text-sm tabular-nums text-[#201e1d] ${
                    dupError ? "border-[#ec3013] bg-[#ec3013]/[.06]" : "border-[#201e1d]/40 bg-[#f3f2f2]"
                  }`}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-[#201e1d]/60">
                  Sleeps
                </label>
                <input
                  type="number"
                  value={form.capacity}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                  className="w-full border border-[#201e1d]/40 bg-[#f3f2f2] px-3 py-2.5 text-sm tabular-nums text-[#201e1d]"
                />
              </div>
            </div>

            {dupError && (
              <div className="-mt-2 flex items-start gap-2 border-l-2 border-[#ec3013] bg-[#ec3013]/[.08] p-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b8250e" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-px flex-none">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4" />
                  <path d="M12 16h.01" />
                </svg>
                <div>
                  <div className="text-[12.5px] font-extrabold text-[#b8250e]">
                    Room number {form.number} is already taken
                  </div>
                  <div className="mt-0.5 text-[11.5px] leading-snug text-[#201e1d]/65">
                    {clash?.name} already uses this number. Room numbers must be unique across the
                    property.
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[#201e1d]/60">
                Type
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as RoomType }))}
                className="w-full appearance-none border border-[#201e1d]/40 bg-[#f3f2f2] px-3 py-2.5 text-sm text-[#201e1d]"
              >
                <option>Standard</option>
                <option>Deluxe</option>
                <option>Suite</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[#201e1d]/60">
                Nightly rate (₱, before VAT)
              </label>
              <input
                value={form.rate}
                onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                placeholder="6400"
                className="w-full border border-[#201e1d]/40 bg-[#f3f2f2] px-3 py-2.5 text-sm tabular-nums text-[#201e1d]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[#201e1d]/60">
                Amenities
              </label>
              {form.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.amenities.map((a, i) => (
                    <span
                      key={a + i}
                      className="inline-flex items-center gap-1.5 border border-[#201e1d]/40 bg-[#f3f2f2] px-2 py-1 text-[11.5px] font-semibold"
                    >
                      {a}
                      <button
                        type="button"
                        aria-label="Remove amenity"
                        onClick={() => removeAmenity(i)}
                        className="flex text-[#201e1d]/55"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={form.amenDraft}
                  onChange={(e) => setForm((f) => ({ ...f, amenDraft: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && addAmenity()}
                  placeholder="e.g. King bed"
                  className="min-w-0 flex-1 border border-[#201e1d]/40 bg-[#f3f2f2] px-3 py-2.5 text-sm text-[#201e1d]"
                />
                <button
                  type="button"
                  onClick={addAmenity}
                  className="flex flex-none items-center gap-1.5 border border-[#201e1d]/40 px-3 text-xs font-semibold text-[#201e1d] hover:bg-[#ec3013]/10 hover:text-[#b8250e]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M5 12h14" />
                    <path d="M12 5v14" />
                  </svg>
                  Add
                </button>
              </div>
              <div className="text-[11px] text-[#201e1d]/50">
                Short phrases. These become the chips on the guest-facing room card.
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[#201e1d]/60">
                Description
              </label>
              <textarea
                rows={3}
                placeholder="One or two sentences shown on the room's catalog card."
                className="w-full resize-y border border-[#201e1d]/40 bg-[#f3f2f2] px-3 py-2.5 text-sm leading-relaxed text-[#201e1d]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-[#201e1d]/60">
                Image URL
              </label>
              <input
                placeholder="https://…/room-402.jpg"
                className="w-full border border-[#201e1d]/40 bg-[#f3f2f2] px-3 py-2.5 text-sm text-[#201e1d]"
              />
              <div className="text-[11px] text-[#201e1d]/50">
                Printed in black and white on the guest catalog.
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#201e1d]/60">
                Physical status
              </span>
              <div className="grid grid-cols-2 border border-[#201e1d]/40">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, status: "AVAILABLE" }))}
                  className={`border-r-2 border-[#201e1d]/40 py-2.5 text-xs ${
                    form.status === "AVAILABLE" ? "bg-[#ec3013] font-extrabold text-[#f3f2f2]" : "font-semibold text-[#201e1d]/70"
                  }`}
                >
                  AVAILABLE
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, status: "OCCUPIED" }))}
                  className={`py-2.5 text-xs ${
                    form.status === "OCCUPIED" ? "bg-[#ec3013] font-extrabold text-[#f3f2f2]" : "font-semibold text-[#201e1d]/70"
                  }`}
                >
                  OCCUPIED
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={saving || dupError}
              onClick={saveRoom}
              className={[
                "mt-2 flex w-full items-center justify-between px-4 py-3 font-heading text-sm font-extrabold",
                dupError && !saving
                  ? "bg-[#201e1d]/20 text-[#201e1d]/45 cursor-not-allowed"
                  : saving
                  ? "bg-[#ec3013]/45 text-[#f3f2f2] cursor-progress"
                  : "bg-[#ec3013] text-[#f3f2f2] cursor-pointer",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                {saving && <Spinner />}
                {saving ? (editing ? "Saving changes…" : "Saving room…") : editing ? "Save changes" : "Save room"}
              </span>
              {!saving && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              )}
            </button>
            {savedNote && (
              <div className="-mt-2 flex items-center gap-2 text-xs font-semibold text-[#b8250e]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {savedNote}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}