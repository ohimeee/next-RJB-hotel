# InnKeep Express — Implementation Plan

How we get from the current scaffold to the three features in the spec (`hotel.pdf`, 2026-07-22).

> Revised against `5f7fd35` (design pass: `41b02cf`, `5ff6af0`, `5f7fd35`).

---

## 1. Where we are

**Data layer done:** `db/schema.sql` (Room / Reservation / Charge) applied to local Postgres, `db/seed.sql` loading the seven sample rooms. **No ORM** — `pg` (node-postgres) only, pool + parameterised `query()` / `queryOne()` helpers in `lib/db.ts`, enums mirrored as TypeScript unions in `lib/types.ts`.

**Design layer done:** the guest UI now has a real boutique look — orange accent, `lucide-react` icons, Prettier with `prettier-plugin-tailwindcss` for class sorting. Components: `RoomCard`, `InfoBar`, `NavLink` (active-route highlighting), `BookingCard`, `StayDetails`, `GuestDetails`.

**Guest booking done (2026-08-27):** the whole write path exists and is verified end to end — hold, hosted checkout, webhook confirmation, confirmation page, code lookup. `Payment` and the booking columns are in the schema, double-booking is refused by a Postgres exclusion constraint, and expired holds release themselves. Guest-side files: `lib/reservations.ts`, `lib/payments.ts`, `lib/billing.ts`, `app/(guest)/booking/checkout/actions.ts`, `app/api/webhooks/xendit/route.ts`, `app/(guest)/booking/[confirmationCode]/page.tsx`, `app/(guest)/find-booking/page.tsx`.

**Still missing:** **staff auth (Phase 1) and the entire admin side.** `/admin/*` is unguarded and hardcoded, and there are no front-desk actions — check-in, check-out, incidental charges, folio. `InfoBar` is still static, so the availability query works but nothing sends it dates. The design pass also deleted `app/login/page.tsx`, `components/admin/Topbar.tsx`, and `components/guest/SearchBar.tsx`, and moved the dashboard from `app/admin/dashboard/page.tsx` to `app/admin/page.tsx`.

### Live breakages (fix first — Section 5)

1. **`/admin/dashboard` 404s.** The dashboard moved to `/admin`, but `components/admin/Sidebar.tsx` still links to the old path.
2. **Staff login is unreachable.** `app/login/page.tsx` is deleted and the Navbar's Login link is gone. No entry point to `/admin` exists.
3. **`/my-bookings` is misnamed.** It is no longer a bookings list — it is the **checkout page** ("RESERVATION CHECKOUT / Review & confirm"). URL and Navbar label both still say "My Bookings."
4. **Currency is inconsistent.** `RoomCard` shows `P8,900`; `BookingCard` shows `$245.00` and `Incl. taxes & fees | USD`. Pick one before wiring data.

---

## 2. Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| Mutations | **Server actions**, no REST layer | Every write is form-driven and same-origin. Route handlers only if an external client ever needs one. |
| Reads | Server components call a query function in `lib/` | No fetch hop, no serialization layer to maintain. SQL never lives in a component. |
| Database access | **`pg` with hand-written SQL, no ORM** | Course constraint. Every value goes in as a `$1` parameter — nothing is interpolated into a query string. |
| Payments | **Xendit hosted checkout** | Course requires a third-party gateway, and GCash rules out Stripe. Their page takes the card; ours never sees one. See Section 8a. |
| Auth | Staff table + signed cookie (`node:crypto`) | One role. See Section 6. |
| Guest identity | **None** | Spec never asks for guest accounts, and `Reservation.guestName` is a bare string. The design pass confirms this — the checkout page collects a name, not credentials. |
| Validation | `zod` | Hand-rolled validation across ~8 forms costs more than it saves. |
| Money | `DECIMAL(10,2)` in Postgres, string everywhere above it | `pg` returns NUMERIC as a string; keep it that way. See Section 9. |

### Route map (target)

| Route | Access | Status | Purpose |
|---|---|---|---|
| `/` | public | styled, hardcoded | Catalog + availability search |
| `/rooms/[id]` | public | **missing** | Room detail |
| `/amenities` | public | **missing** | Static page — the nav links to it |
| `/booking/checkout` | public | exists as `/my-bookings` | Checkout — review & confirm |
| `/booking/[confirmationCode]` | public | **missing** | Confirmation + lookup by code |
| `/login` | public | **deleted, must rebuild** | Staff login |
| `/admin` | staff | styled, hardcoded | Dashboard |
| `/admin/rooms` | staff | placeholder | Room CRUD |
| `/admin/reservations` | staff | placeholder | List + lifecycle actions |
| `/admin/reservations/[id]` | staff | **missing** | Folio |

`app/(guest)/` keeps its parentheses — a route group contributes nothing to the URL, which is why `app/(guest)/page.tsx` serves `/`. `app/admin/` has no parens, so it appears in the path.

---

## 3. Schema changes

The design pass renders fields the schema does not have. Five additions plus two new models.

### 3a. `Room` — fields the UI already displays

`RoomCard` shows a room *name* ("The Garret Suite"), a photo, and a descriptive line ("King bed | Top floor | Sleeps 2"). `Room` has none of these — only `number`, `type`, `capacity`, `amenities`.

**Applied** — these three columns are already in `db/schema.sql`:

```sql
ALTER TABLE "Room"
  ADD COLUMN "name"        TEXT NOT NULL,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "imageUrl"    TEXT;
```

Without `name`, every card reads "Room 402" — which is not the design that was just built. The page mockups confirm the shape: their sample data is `{ id, name, type, capacity, rate, amenities[] }`, with a photo per card and a descriptive line ("King bed | Top floor | Sleeps 2").

### 3b. `Staff` — auth (Section 6)

```sql
CREATE TABLE "Staff" (
  "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "email"        TEXT NOT NULL UNIQUE,
  "name"         TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TRIGGER "Staff_set_updated_at" BEFORE UPDATE ON "Staff"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

No role enum. Add one when front desk vs manager actually diverge.

### 3c. `Payment` — closes a spec gap

The spec requires "process payment upon checkout." Nothing currently records that a folio was *paid* — `Charge` is only a ledger line. Payments now also arrive from Xendit (Section 8a), so the table carries the gateway's identifiers alongside the amount.

```sql
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'GCASH', 'MAYA', 'GRABPAY', 'TRANSFER');

CREATE TABLE "Payment" (
  "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "reservationId" TEXT NOT NULL REFERENCES "Reservation"("id") ON DELETE RESTRICT,
  "amount"        DECIMAL(10,2) NOT NULL,
  "method"        "PaymentMethod" NOT NULL,
  "paidAt"        TIMESTAMP(3) NOT NULL DEFAULT now(),

  -- Gateway bookkeeping. Null for cash taken at the front desk.
  "providerInvoiceId" TEXT,
  "providerEventId"   TEXT UNIQUE
);

CREATE INDEX "Payment_reservationId_idx" ON "Payment" ("reservationId");
```

Many-per-reservation rather than one — allows a deposit plus a balance without a later schema change.

`providerEventId` is `UNIQUE` on purpose. Xendit retries failed webhooks with exponential backoff (the setting is on by default in the dashboard), so the same event *will* arrive twice eventually. The constraint turns a duplicate delivery into a no-op instead of a second `Payment` row.

### 3d. `Reservation` — code, guest count, tax

```sql
ALTER TABLE "Reservation"
  ADD COLUMN "confirmationCode" TEXT NOT NULL UNIQUE,
  ADD COLUMN "guestCount"       INTEGER NOT NULL,
  ADD COLUMN "taxAmount"        DECIMAL(10,2) NOT NULL,
  -- Payment holds expire; see Section 8a.
  ADD COLUMN "holdExpiresAt"    TIMESTAMP(3);

ALTER TYPE "ReservationStatus" ADD VALUE 'PENDING' BEFORE 'CONFIRMED';
```

- **`confirmationCode`** — a short readable code. The mockup uses `IKX-4820`, so: `IKX-` + 4 digits. Guests have no accounts, so it is their only retrieval path. A `cuid` in a URL is not something anyone reads off a phone.
- **`guestCount`** — `InfoBar` has a Guests selector and `RoomCard` shows "Sleeps 2", so search must filter on `capacity`. Nothing stores the requested count today.
- **`taxAmount`** — `BookingCard` renders a "Taxes & fees (12%)" line with no field behind it. 12% is Philippine VAT and the nav places the hotel in Iloilo City, so the rate is real, not filler. Store the *computed amount*, not the rate: if VAT changes, historical folios must not silently change. Rate lives in one constant in `lib/pricing.ts`.

---

## 4. Wiring the design to data

Every component below is built and styled — the work is props and queries, not markup.

| Component | Hardcoded now | Needs |
|---|---|---|
| `RoomCard` | Suite, "The Garret Suite", P8,900, picsum image, 4× "King Bed" | `room` prop; map `amenities`; link to `/rooms/[id]` |
| `InfoBar` | 08/08/2026, 08/11/2026, 1 guest | Client component; real inputs; push to URL query |
| `BookingCard` | $245, 3 nights, 12% tax, $823.20 | `room` + quote props from `calculateQuote()` |
| `StayDetails` | Sat Aug 8 → Tue Aug 11 | Date props; check-in 3:00 PM / check-out 11:00 AM as `lib/policy.ts` constants |
| `GuestDetails` | Uncontrolled input | `name` attribute inside the checkout form |
| `app/(guest)/page.tsx` | 6× `<RoomCard/>` | `map` over query results |

Two markup fixes while wiring: `RoomCard`'s "Book Now" is a `<div>`, so it is not clickable or focusable — it must be a `Link`. `BookingCard`'s "Confirm reservation" is likewise a `<div>` and needs to be a submit `<button>`.

---

## 5. Phase 0 — Repairs

Small, and everything else builds on it.

- [x] Point `Sidebar`'s Dashboard link at `/admin`
- [x] Rename `app/(guest)/my-bookings/` → `app/(guest)/booking/checkout/`
- [x] Drop the "My Bookings" nav link — checkout is a step in a flow, not a destination (now "Find booking" → `/find-booking`)
- [x] Standardise on **₱** in one `formatMoney()` helper — `BookingCard`'s `$…USD` is the outlier (Section 12)

---

## 6. Phase 1 — Staff auth

### Session mechanism

`node:crypto` covers both halves, so nothing is added to `package.json`:

- **Passwords** — `scryptSync` with a per-user random salt, stored as `salt:hash`, compared with `timingSafeEqual`.
- **Session** — cookie `staff_session` holding `base64(JSON{staffId, exp})` + an HMAC-SHA256 signature over that payload. `httpOnly`, `sameSite: lax`, `secure` in production.

Stateless — no Session table, no DB write per login. Trade-off: a cookie cannot be force-revoked before it expires. Acceptable for a single front desk.

Needs `SESSION_SECRET` in `.env` and a placeholder in `.env.example`.

### Two layers of gating

**`proxy.ts`** at repo root — Next 16's name for middleware (`middleware.ts` still resolves; both are in `next@16.2.11`'s constants). Cookie-presence check only:

```ts
import { NextResponse, type NextRequest } from "next/server";

export default function proxy(request: NextRequest) {
  if (!request.cookies.get("staff_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
```

**`app/admin/layout.tsx`** — `await requireStaff()`, which verifies the signature and loads the row. Every `/admin/*` page renders through this layout, so one check covers the section.

> The proxy is UX (fast redirect), not security — it only sees that *a* cookie exists. The layout is the load-bearing check.

Note the earlier plan's "add `app/admin/page.tsx` to redirect bare `/admin`" is obsolete — that path is now the dashboard itself.

### Seeding the first account

No staff row means nobody can log in, and there is no UI to create one. Rooms are already handled by `db/seed.sql` (`npm run db:seed`), but a staff row cannot be: `passwordHash` has to be computed in Node, not in SQL. So the staff seed is a small **`scripts/seed-staff.mjs`** that hashes a password with `node:crypto` and `INSERT ... ON CONFLICT ("email") DO NOTHING`.

### Files

| File | Status | Purpose |
|---|---|---|
| `lib/auth.ts` | new | hash/verify password, sign/read session, `requireStaff()` |
| `proxy.ts` | new | cookie gate on `/admin/:path*` |
| `app/login/page.tsx` | **rebuild** | deleted in the design pass; match the new visual language |
| `app/login/actions.ts` | new | `"use server"` login + logout |
| `app/admin/layout.tsx` | edit | real gate |
| `components/admin/Topbar.tsx` | **rebuild** | deleted; staff name + logout |
| `scripts/seed-staff.mjs` | new | first staff account (rooms come from `db/seed.sql`) |

---

## 7. Phase 2 — Catalog & availability

### The availability query

A room is unavailable if it has any **active** reservation overlapping the requested range. Half-open intervals — a checkout on the 5th does not collide with a check-in on the 5th:

> overlap ⟺ `existing.checkIn < requested.checkOut` **AND** `existing.checkOut > requested.checkIn`

`CANCELLED` and `CHECKED_OUT` never block. `NOT EXISTS` expresses the whole thing — **implemented** in `lib/rooms.ts`:

```sql
SELECT ...
FROM "Room" r
WHERE r."capacity" >= $1
  AND (
    $2::date IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM "Reservation" res
      WHERE res."roomId" = r."id"
        AND res."status" IN ('CONFIRMED', 'CHECKED_IN')
        AND res."checkIn" < $3::date
        AND res."checkOut" > $2::date
    )
  )
ORDER BY r."type" ASC, r."number" ASC
```

The `$2::date IS NULL` guard lets one statement serve both the searched case and the browse-the-whole-catalog case, so there are not two queries to keep in sync. `ORDER BY "type"` sorts by the enum's declaration order (STANDARD → DELUXE → SUITE), not alphabetically.

The existing `Reservation_roomId_checkIn_checkOut_idx` already covers this.

### Search as URL state

Dates and guest count live in the query string (`/?checkIn=2026-08-10&checkOut=2026-08-12&guests=2`), not React state. Results become shareable and bookmarkable, the page stays a server component, and `InfoBar` only needs to push a URL.

`Room.status` (`AVAILABLE`/`OCCUPIED`) is **physical occupancy right now** — a housekeeping signal, not the availability filter. Future-dated searches must use the overlap query above, never `status`. Conflating the two is the easiest bug in this project to write.

### Files

- `lib/rooms.ts` — new; `findAvailableRooms()`, `getRoom()`
- `components/guest/InfoBar.tsx` — edit; `"use client"`, real inputs, router push
- `components/guest/RoomCard.tsx` — edit; accept `room`
- `app/(guest)/page.tsx` — edit; map over results, empty state
- `app/(guest)/rooms/[id]/page.tsx` — new
- `app/admin/rooms/page.tsx` — edit; room CRUD

---

## 8. Phase 3 — Reservations

### Price calculation

Computed **server-side from the DB rate**. Never accept a price from the client — `BookingCard` displays a total, it does not get to decide one.

```
nights   = (checkOut - checkIn) / 86_400_000
roomTotal = room.nightlyRate * nights
tax       = roomTotal * TAX_RATE
total     = roomTotal + tax
```

One `calculateQuote()` in `lib/pricing.ts` returns all four so the checkout page and the stored reservation cannot disagree.

### 8a. Payment — Xendit hosted checkout

The instructor requires a third-party gateway. **Xendit**, verified end to end on 2026-08-27 against a test account: a `xnd_development_` key was issued with no business documents, `POST /v2/invoices` returned 200, and the hosted page rendered GCash, Maya, GrabPay, ShopeePay, cards, retail outlets, QRPh and direct debit. Stripe was the first choice and was dropped — it does not offer GCash or Maya anywhere, and its GrabPay is MY/SG only. PayMongo is the fallback if Xendit ever blocks us; the integration shape is identical and only the webhook check differs.

**Hosted checkout, not our own card form.** Xendit hosts the payment page and we redirect to it, so card numbers never touch our server and PCI scope stays out of a school project.

#### Three things that break silently

Every one of these leaves the app *looking* like it works. None throws an error, none shows up in a happy-path demo. Check them explicitly.

**1. `PENDING` must block availability.**
Add it to the status list in the `NOT EXISTS` subquery in `lib/rooms.ts`, alongside `CONFIRMED` and `CHECKED_IN`:

```sql
AND res."status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')
```

*Symptom if missed:* two guests reach the payment page for the same room at the same time. Both pay. One gets a room, the other gets a refund conversation. The hold exists precisely to stop this, and forgetting one string in one list disables it.

**2. The redirect is not proof of payment.**
`success_redirect_url` is a URL the guest's *browser* visits. Anyone can type it, bookmark it, or share it. It proves nothing about money.

*Symptom if missed:* a guest — or anyone at all — navigates straight to `/booking/success?...` and gets a confirmed reservation for free. The booking is real, the room is blocked, no payment exists. Confirm in the webhook handler and nowhere else.

**3. The webhook endpoint is public and must authenticate every request.**
`/api/webhooks/xendit` is reachable by the whole internet. Compare the `x-callback-token` header against `XENDIT_CALLBACK_TOKEN` with `crypto.timingSafeEqual`, and return 401 on mismatch — **before parsing or reading any field of the body**.

*Symptom if missed:* anyone who guesses the URL POSTs a fake "paid" payload and books free rooms. There is no error, no log anomaly, nothing to notice; it looks exactly like a real payment.

```ts
// Constant-time, and length-checked first — timingSafeEqual throws on
// mismatched lengths, and a plain === leaks the token a character at a time.
const expected = Buffer.from(process.env.XENDIT_CALLBACK_TOKEN ?? "");
const actual = Buffer.from(req.headers.get("x-callback-token") ?? "");

if (
  expected.length !== actual.length ||
  !crypto.timingSafeEqual(expected, actual)
) {
  return new Response("unauthorized", { status: 401 });
}
```

#### The flow

```
server action          insert PENDING reservation
                       POST /v2/invoices  ->  invoice_url
                       redirect the guest there
guest                  pays with GCash on Xendit's page
Xendit  -> webhook     POST /api/webhooks/xendit
                       verify x-callback-token
                       PENDING -> CONFIRMED, insert Payment
```

**The reservation exists before the money moves.** The alternative — charge first, create the row after — lets another guest take the room mid-payment, leaving someone who has paid for a room that is gone and a refund path we would have to build. So we hold the room as `PENDING` and let the webhook promote it.

Two consequences that are easy to miss:

- **`PENDING` must block availability.** Add it to the status list in the `NOT EXISTS` subquery in `lib/rooms.ts` alongside `CONFIRMED` and `CHECKED_IN`. Leave it out and two guests can hold the same room simultaneously — the exact bug the hold was meant to prevent.
- **Holds must expire.** A guest who closes the tab mid-payment would otherwise block that room forever. `holdExpiresAt` is set ~15 minutes out; a sweep releases anything past it. Simplest version is a `DELETE` guarded on `status = 'PENDING' AND "holdExpiresAt" < now()` run at the top of the availability query's request path.

#### Channels: everything except Retail Outlet

**Settled 2026-08-27.** Cards, e-wallets, QRPh, direct debit and online banking are all offered. **Retail Outlet — 7-Eleven, Cebuana, ML Huillier, LBC, Palawan, ECPay — is excluded.**

The reason is inventory, not payment preference. A room-night is dated stock that can be sold exactly once, so at checkout we must decide whether to hold it. Every other channel settles inside the same browser session, so that decision resolves in seconds. Retail Outlet does not: the guest leaves with a reference number and pays cash at a store hours or days later, and the invoice stays `PENDING` throughout.

That leaves no workable hold duration:

- **Hold the room while waiting** — a code generated and never used blocks a sellable room for days. One bored person could lock up the whole property for free.
- **Don't hold it** — the guest pays ₱21,504 on Thursday, returns, and the room was sold Tuesday. We have taken money for a room that no longer exists, and now need a refund path.

Short enough to protect the hotel is too short to reach a store; long enough to reach a store loses real bookings. A hotel that genuinely wanted over-the-counter payment would model it as an *unconfirmed* booking with no room held, which the front desk confirms manually when payment lands — a different feature, not a channel toggle.

Practical bonus: it is also the one channel that cannot be demonstrated, since there is no simulator for walking into a 7-Eleven.

Direct debit and online banking were briefly grouped with retail in an earlier draft of this section. That was wrong — bank redirects settle immediately, and they stay.

```ts
// Everything Xendit offers except Retail Outlet — see above. The API takes an
// allowlist, not a blocklist, so the excluded channels are simply absent.
// Whatever is not named here is dropped: a run that omitted SHOPEEPAY lost it.
const PAYMENT_METHODS = [
  "CREDIT_CARD",
  "GCASH", "PAYMAYA", "GRABPAY", "SHOPEEPAY",
  "QRPH",
  "DD_BPI", "DD_RCBC", "DD_UBP", "DD_CHINABANK", "DD_BDO_EPAY",
  "DD_BDO_ONLINE_BANKING", "DD_BPI_ONLINE_BANKING", "DD_BOC_ONLINE_BANKING",
  "DD_CHINABANK_ONLINE_BANKING", "DD_INSTAPAY_ONLINE_BANKING",
  "DD_LANDBANK_ONLINE_BANKING", "DD_MAYBANK_ONLINE_BANKING",
  "DD_METROBANK_ONLINE_BANKING", "DD_PESONET_ONLINE_BANKING",
  "DD_PNB_ONLINE_BANKING", "DD_PSBANK_ONLINE_BANKING",
  "DD_ROBINSONS_BANK_ONLINE_BANKING", "DD_RCBC_ONLINE_BANKING",
  "DD_SECURITY_BANK_ONLINE_BANKING", "DD_UNIONBANK_ONLINE_BANKING",
];
```

Verified against a live test invoice: retail outlets absent, all four wallets, QRPh, and 20 bank channels present. 25 ways to pay, every one of them instant.

This list lives in **code**, not in the Xendit dashboard. That is deliberate — each teammate has their own Xendit account, so a dashboard-level toggle would have to be repeated by every one of them and would silently differ if anyone forgot. In `lib/payments.ts` it travels with the repo and needs no setup from anyone.

One maintenance note: because the API takes an allowlist, any channel Xendit adds later is excluded by default until someone adds it here. That is the safe direction to fail.

#### What a paid invoice actually looks like

Confirmed on 2026-08-27 by paying a test invoice with GCash:

```
status:          "PAID"          <- not COMPLETED, not SUCCEEDED
payment_method:  "EWALLET"       <- the category
payment_channel: "GCASH"         <- the specific wallet
amount:          100             <- pesos
external_id:     "smoke-…"       <- ours; carry the reservation id here
```

`payment_channel` is what maps onto `Payment.method`, not `payment_method` — the latter is only the category (`EWALLET`, `CARD`, `RETAIL_OUTLET`). Map `GCASH`/`PAYMAYA`/`GRABPAY` straight through, and fall back to `CARD` for the card category.

Set `external_id` to the reservation id when creating the invoice. It comes back on the webhook and is how the handler finds the row to promote.

The payload also carries `paid_at`. Use it for `Payment.paidAt` rather than `now()` — webhooks retry, and an event redelivered an hour later would otherwise record the wrong time on the folio.

#### The webhook is the only proof of payment

The guest's browser arriving at `success_redirect_url` proves only that a browser hit a URL — anyone can type it. **Never confirm a reservation from the redirect.** The route handler is the sole place a booking becomes `CONFIRMED`.

That endpoint is a public URL, so every request must be authenticated before a single field of the body is read. Xendit sends a shared secret in the `x-callback-token` header; compare it against `XENDIT_CALLBACK_TOKEN` using a constant-time comparison (`crypto.timingSafeEqual`), and return 401 on any mismatch. Without that check, anyone who finds the URL can POST a fake "paid" event and book free rooms.

Worth naming the weakness plainly: a static shared token is weaker than Stripe's or PayMongo's HMAC signature. It proves the sender knows a secret, but it does not prove the body was not modified in transit and carries no replay protection. Acceptable here — HTTPS covers transit, and the `providerEventId` unique constraint absorbs replays — but do not mistake it for a signature.

#### Amounts

**Xendit's invoice `amount` is in pesos, not centavos.** Verified 2026-08-27: an invoice created with `amount: 100` renders as `PHP 100.00` on the hosted page. This is the opposite of Stripe and PayMongo, which both take integer minor units — do not carry that assumption over from their docs.

That matters because `quoteStay()` in `lib/pricing.ts` works in integer centavos on purpose, to keep float error out of currency. So the boundary needs a deliberate conversion, and it lives in **one** function in `lib/payments.ts`:

```ts
/** Centavos -> the peso amount Xendit's invoice API expects. */
const toGatewayAmount = (centavos: number): number => centavos / 100;
```

Nowhere else. A `/100` scattered across call sites is how one of them ends up missing, and a 100× overcharge is not a bug you want to explain to a guest. Everything upstream of this line stays in centavos.

Also: **recompute the total server-side** from `roomId` + dates before creating the invoice. Never send an amount the client posted.

#### Local development

Xendit's servers cannot reach `localhost`. Their webhook POST has nowhere to go, so in development nothing ever confirms — and no amount of debugging the handler fixes it, because the request cannot arrive. **Set the tunnel up before writing the handler**, or you will spend an afternoon debugging a flow that structurally cannot fire.

**Installing ngrok on Windows.** Chocolatey, from an elevated prompt:

```powershell
choco install ngrok
```

Or download the zip from `ngrok.com/download/windows` and put `ngrok.exe` somewhere on PATH. Avoid `winget install ngrok.ngrok` — ngrok's own docs note the winget package lags behind.

Then, once per machine:

```powershell
ngrok config add-authtoken <token from dashboard.ngrok.com>
```

**Running it.** Alongside `npm run dev`, in its own terminal:

```powershell
ngrok http 3000
```

A free account includes one permanent domain, so pin it and the URL never changes:

```powershell
ngrok http 3000 --url https://<your-domain>.ngrok-free.dev
```

Register `https://<your-domain>.ngrok-free.dev/api/webhooks/xendit` in Dashboard → Settings → Webhooks. With a pinned domain that registration is a one-time step; without one you re-paste a fresh URL on every restart.

Two notes. Switch off the **legacy** webhook page when registering — the newer product events are only listed on the current one. And while the tunnel is up your dev server is genuinely on the public internet, database behind it included: stop it when you are not testing, and keep the URL out of anything public.

#### Files

- `lib/payments.ts` — new; `createInvoice()`, amount conversion, `verifyCallbackToken()`
- `app/api/webhooks/xendit/route.ts` — new; token check, `PENDING` → `CONFIRMED`, insert `Payment`
- `.env` — `XENDIT_SECRET_KEY`, `XENDIT_CALLBACK_TOKEN`. Neither behind `NEXT_PUBLIC_`.

The Xendit public key is deliberately unused — it exists for client-side card tokenization, which hosted checkout makes unnecessary.

#### Where the build differs from this plan

Five decisions were taken while implementing Phase 3. All of them tightened something.

**The exclusion constraint covers `PENDING`, not just `CONFIRMED` and `CHECKED_IN`.** As originally written the constraint could never actually fire on the booking path: reservations are *created* as PENDING and only promoted later, so two overlapping holds would both be allowed, both guests would pay, and the second promotion — an UPDATE into a covered status — would fail *after* the money moved. Holding a room is exactly when the guarantee is needed.

**No `SERIALIZABLE` transaction.** With the constraint in place, the check-then-insert race it was meant to guard is closed by the database. The insert is a single statement, `23P01` is the refusal, and the action turns that into "someone booked that room while you were deciding." Less machinery for the same guarantee.

**The hold sweep cancels rather than deletes.** A `DELETE` throws away the row a late payment would need to attach to, and leaves the front desk nothing to look at. `CANCELLED` is outside the constraint predicate, so the room frees up just the same.

**`db/schema.sql` is chunked.** `ALTER TYPE ... ADD VALUE` cannot be used in the transaction that added it, and `scripts/db.mjs` sends a whole file as one. A `-- @separate` line splits the file into per-transaction chunks. Also note the constraint guard is a `pg_constraint` lookup, not `EXCEPTION WHEN duplicate_object` — an EXCLUDE constraint creates an index too, so a re-run raises `duplicate_table`, which that handler does not catch.

**`Payment.providerEventId` holds the invoice id.** The v2 invoice callback carries no separate event id. One invoice is paid once, so the invoice id is the right idempotency key, and the partial unique index on it absorbs Xendit's retries.

A sixth item is new rather than changed: `APP_URL` in `.env`. It is the origin used for `success_redirect_url`, and in development it has to be the ngrok URL.

#### Verified end to end, 2026-08-27

Against a live test account and a real invoice: 3-night stay priced ₱10,800 + ₱1,296 VAT = ₱12,096; the invoice echoed **4,032 pesos** for a one-night probe (₱3,600 + 12%), confirming again that Xendit takes pesos, not centavos. The hosted page offered GCash, PayMaya, GrabPay, ShopeePay, QRPh and 20 bank channels, with **no retail outlets** — the allowlist behaves as documented. A held room left the catalog; a second booking for the same dates was refused with `ROOM_TAKEN`; the webhook rejected a missing and a wrong `x-callback-token` with 401 and changed nothing; a valid `PAID` event promoted the booking and wrote one `Payment` with `paidAt` from the payload; a replay of that event was a no-op; and an expired hold released the room as `CANCELLED`.

### The race condition

Check-availability-then-insert is not atomic. Two guests booking the last room in the same second both pass the check and both get the room.

**v1 —** take a client off the pool, `BEGIN ISOLATION LEVEL SERIALIZABLE`, re-run the overlap check *inside* the transaction, `INSERT`, `COMMIT` — with a `ROLLBACK` in `finally` and `client.release()` after. Postgres aborts one of the two with a serialization failure (`40001`); surface that as "room was just taken."

**Hardening —** a Postgres exclusion constraint makes it structurally impossible, straight in `db/schema.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reservation" ADD CONSTRAINT no_double_booking
  EXCLUDE USING gist (
    "roomId" WITH =,
    daterange("checkIn", "checkOut", '[)') WITH &&
  ) WHERE (status IN ('CONFIRMED', 'CHECKED_IN'));
```

The database then refuses an overlapping row regardless of what the app does. Recommended — ~5 lines, retires the whole bug class.

### Lifecycle

`CONFIRMED → CHECKED_IN → CHECKED_OUT`, plus `CANCELLED` from `CONFIRMED`. Every transition goes through one `transitionReservation()` that rejects illegal moves (no un-cancelling, no checkout before check-in). Not scattered across page handlers.

### Files

- `lib/pricing.ts` — new; `calculateQuote()`, `TAX_RATE`
- `lib/reservations.ts` — new; `createReservation()`, `transitionReservation()`, `generateConfirmationCode()`
- `app/(guest)/booking/checkout/actions.ts` — new; confirm-reservation action
- `app/(guest)/booking/[confirmationCode]/page.tsx` — new; confirmation + lookup
- `app/admin/reservations/page.tsx` — edit; list + status filter

---

## 9. Phase 4 — Check-in, check-out, billing

### Front desk transitions

Check-in and check-out each mutate **two** rows — reservation status and `Room.status` (`OCCUPIED` ↔ `AVAILABLE`). Both in one `$transaction`, so a crash cannot leave a room occupied by a checked-out guest.

### Charges ledger

Add incidentals against a `CHECKED_IN` reservation. Quick-add buttons for the spec's examples (Room Service, Minibar, Laundry, Late Check-out Fee) over a free-text form.

### Final folio

```
folio = reservation.totalAmount + sum(charges) - sum(payments)
```

All `Decimal`. Checkout is blocked while the balance is non-zero, or takes payment in the same action.

### Files

- `lib/billing.ts` — new; `getFolio()`, `addCharge()`, `recordPayment()`
- `app/admin/reservations/[id]/page.tsx` — new; folio screen
- `app/admin/reservations/[id]/actions.ts` — new; check-in, check-out, charge, payment
- `app/admin/page.tsx` — edit; today's arrivals, departures, in-house, occupancy

---

## 10. Cross-cutting concerns

### Money never becomes a number

`pg` hands `DECIMAL` columns back as **strings** (`"8900.00"`), and that is the behaviour to preserve, not fix. `Number("8900.00")` reintroduces float error into currency, and it is also the only reason a price could reach a client component as something unserializable.

So: strings from the driver to the screen, and arithmetic in integer centavos inside `lib/pricing.ts`. `lib/money.ts` owns the two conversions — `toMoney()` normalises, `formatPeso()` renders — and neither ever calls `Number()` on a peso amount.

### Dates and timezones

`checkIn`/`checkOut` are `DATE` — calendar days, no time, no zone. The trap is `new Date("2026-08-10")` parsing as UTC midnight and displaying as the *9th* for anyone west of Greenwich. `StayDetails` renders "Sat, Aug 8", so this will bite on the first real booking.

`pg` makes this worse by default: it converts a `DATE` into a JS `Date` in the *server's* zone, so `2026-09-10` comes back as `2026-09-09T16:00:00Z` in Manila. `lib/db.ts` registers a type parser for OID 1082 that returns the raw `YYYY-MM-DD` string instead. Do not remove it.

Rule: handle as `YYYY-MM-DD` strings, construct with an explicit `T00:00:00Z`, format with `timeZone: "UTC"`. One `lib/dates.ts` owns this; nothing else builds a Date from a booking string.

### Validation

One zod schema per form, in the module owning the action. Server actions are public endpoints — validate at the action, not in the component.

Booking rules: `checkOut > checkIn`, `checkIn` not in the past, stay length capped (30 nights), `guestName` non-empty, `guestCount <= room.capacity`.

### Cache invalidation

Mutating actions call `revalidatePath()` for affected routes. Booking touches `/`, the room page, and `/admin/reservations`.

---

## 11. Build order

- [ ] **0** Repairs (Section 5) — Sidebar link, route rename, currency
- [ ] **1.1** Schema: `Staff`, `Payment`, Reservation fields → add to `db/schema.sql` → `npm run db:setup`
- [ ] **1.2** `lib/auth.ts`
- [ ] **1.3** `scripts/seed-staff.mjs` — first staff account
- [ ] **1.4** Rebuild `/login` + actions
- [ ] **1.5** `app/admin/layout.tsx` gate + `proxy.ts`
- [ ] **1.6** Rebuild `Topbar` with logout
- [x] **2.1** `lib/dates.ts`, `lib/money.ts`, `lib/pricing.ts`
- [x] **2.2** `lib/rooms.ts` + availability query
- [ ] **2.3** `InfoBar` → client + URL params
- [ ] **2.4** `RoomCard` props; catalog maps real rooms
- [ ] **2.5** Room detail page
- [ ] **2.6** Admin room CRUD
- [x] **3.1** `lib/reservations.ts` + exclusion constraint in `db/schema.sql`
- [x] **3.2** `PENDING` status + `holdExpiresAt`; add `PENDING` to the blocking list in `lib/rooms.ts`
- [x] **3.3** `lib/payments.ts` — `createInvoice()`, centavo→peso conversion
- [ ] **3.4** ngrok running + webhook URL registered in the Xendit dashboard
- [x] **3.5** `app/api/webhooks/xendit/route.ts` — token check, `PENDING` → `CONFIRMED`
- [x] **3.6** Checkout page wired; confirm action redirects to `invoice_url`
- [x] **3.7** Hold-expiry sweep
- [x] **3.8** Confirmation + code lookup
- [ ] **3.9** Admin reservation list
- [ ] **4.1** `lib/billing.ts`
- [ ] **4.2** Folio page + check-in/out
- [ ] **4.3** Charges + payment
- [ ] **4.4** Dashboard metrics

Auth before data work: retrofitting a gate onto finished admin pages means touching them all twice.

---

## 12. Open questions

1. ~~**Is Postgres actually running locally?**~~ — **settled: yes.** `db/schema.sql` and `db/seed.sql` are applied against `rjb_hotel` and the availability query is verified against real rows.
2. ~~**Currency**~~ — **settled: ₱.** The nav places the hotel in Iloilo City and the catalog prices in pesos (₱3,600–₱10,500). `BookingCard`'s `$245.00 … Incl. taxes & fees | USD` is a leftover from the template and needs converting.
3. ~~**Tax rate**~~ — **settled: 12% is real** (Philippine VAT), consistent with the Manila location.
4. **Room photos** — `imageUrl` string plus manual entry, or file upload? Upload means storage, which is a much larger change. Assumption: **URL string**.
5. **Cancellation** — guest-cancel via code, or staff-only? Assumption: **staff-only**.
6. **Deposit at booking** — `Payment` supports it; the spec mentions payment only at checkout. Assumption: **checkout only**.
7. **Hold window** — 15 minutes is a guess. Long enough to finish a GCash payment, short enough that an abandoned checkout does not block a room all day. Nothing in the spec sets it.
8. **Does sir want a live deployment?** Xendit test mode covers the demo, but going live needs DTI/SEC registration the group does not have. Assumption: **test mode only**, and the demo is the deliverable.
7. **Overbooking override** — the exclusion constraint would block a forced booking. Assumption: **no override**.
8. **"My trips" nav link** — the catalog nav still advertises it. With no guest accounts this can only be confirmation-code lookup. Assumption: **retitle it "Find booking"**.

---

## 13. Design review notes — deferred

From the admin mockups (login, dashboard, rooms, reservations, folio). **Not tasks yet** — recorded here to act on during the build. We own the backend; the UI arrives from elsewhere and gets tweaked after.

### Settled by the design

- **Auth is the Staff table**, not a shared password. Login takes a work email, the topbar shows "Rina Bautista · Duty Manager", and the folio attributes actions to `RB` / `MS`. A shared password can't produce those initials. Section 6 stands as written.
- **Sidebar went light** (`#f3f2f2`, red left-border active state), not `bg-gray-900`. Reconciled with the guest side.
- Rate is stored **ex-VAT** — the room form says `NIGHTLY RATE (₱, BEFORE VAT)`. Confirms the `taxAmount` approach in Section 3d.
- Folio balance = room + VAT + incidentals − payments. Verified against the mockup: 26,700 + 3,204 + 2,270 − 15,000 = ₱17,174.

### Open — needs a call before the folio is built

**VAT applies to the room only in the mockup.** ₱26,700 × 12% = ₱3,204; the ₱2,270 of minibar, laundry and airport transfer carries none. In PH those are VATable services.

- *Recommended:* treat posted incidentals as **VAT-inclusive** and relabel the field `AMOUNT (₱, VAT INCL.)`. Matches how PH hotels post minibar/laundry, and keeps `taxAmount` frozen at booking.
- *Alternative:* VAT on room + charges. More defensible accounting, but tax then changes on every posted charge, so it can no longer be a stored field — it has to compute on read.

### Schema additions the design requires

| Field | Where it appears |
|---|---|
| `Charge.department` | F&B / Housekeeping / Transport column + post-a-charge form |
| `Charge.postedById` → `Staff` | Ledger "POSTED BY: RB / MS"; form reads "Posting as Rina Bautista (RB)" |
| `checkedInAt` + `checkedInById` (same for checkout) | "Checked in 8 Aug, 3:12 PM · RB" |
| `Payment.reference` | "Card deposit · ****4417" |

Session lifetime also becomes variable — login has a **"Keep me signed in on this terminal"** checkbox, so the cookie `exp` in Section 6 branches on it.

### Frontend gaps to raise with whoever builds the UI

- **Add-a-room collects no amenities, photo, or description.** The public `RoomCard` renders all three, so a staff-created room appears blank on the catalog.
- Dashboard placeholder data is inconsistent with the reservations list: confirmation codes are shifted by one guest (Priya Nair carries Tomas's code, Grace Lim's code doesn't exist), and both "expected check-outs" have departure dates a week before the dashboard's own date. Cosmetic — disappears once the screens read from the database.
