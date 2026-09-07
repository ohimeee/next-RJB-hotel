# InnKeep Express — Express + React Plan

Migration from Next.js to the stack taught in class: **Express + TypeScript** for the API, **Vite + React + TypeScript** for the UI.

Baselines to copy patterns from (read them, don't edit them):

- `C:\Users\User\OneDrive\Desktop\Coding\pie-api` — backend
- `C:\Users\User\pie-frontend` — frontend

Supersedes `IMPLEMENTATION.md`, which planned the Next.js build. That document stays in git as the record of what was built; this one is the plan going forward.

---

## 1. Why

One reason, and it is the only good one: **this is the stack the course teaches.** Graders read Express routes; they may not read Next server actions.

Not a reason: file count. Express + React ends up with *more* files than Next — a route file plus a service file plus a context per resource, where Next needed one page. Go in expecting that.

---

## 2. Two repos, not one

| Repo | Stack | Port |
|---|---|---|
| `innkeep-api` | Express 5, TypeScript, `pg`, zod | 4000 |
| `innkeep-frontend` | Vite, React 19, TypeScript, Tailwind | 5173 |

Scaffold each from the matching baseline, then rename.

`pie-api` runs on 3000, but the frontend dev server wants a port too, so the API moves to **4000**. Set `API_BASE` in the frontend to match.

The database does not change. Same Supabase project, same `db/schema.sql`, same rows. Copy `db/` across as-is.

---

## 3. Backend — `innkeep-api/src/`

Flat files, named after sir's `pieRoutes.ts` / `authMiddleware.ts` convention. No folders except `types/`.

| File | From pie-api | Purpose |
|---|---|---|
| `index.ts` | `index.ts` | express app, cors, json, mount routers |
| `db.ts` | `db.ts` | the `pg` Pool |
| `validate.ts` | `validate.ts` | `validateResource(schema)` middleware — copy as-is |
| `schemas.ts` | `schemas.ts` | every zod schema |
| `authMiddleware.ts` | `authMiddleware.ts` | `authenticateToken` — copy as-is |
| `authRoutes.ts` | `authRoutes.ts` | staff register + login |
| `roomRoutes.ts` | `pieRoutes.ts` | catalog, availability search, room CRUD |
| `reservationRoutes.ts` | `pieRoutes.ts` | booking, lookup by code, check-in, check-out |
| `folioRoutes.ts` | `pieRoutes.ts` | folio read, post charge, record payment |
| `webhookRoutes.ts` | — | Xendit `invoice.paid` |
| `dashboardRoutes.ts` | — | today's arrivals, departures, occupancy |
| `money.ts` | — | peso strings, integer centavos |
| `dates.ts` | — | `YYYY-MM-DD` handling, nights |
| `pricing.ts` | — | rate × nights + VAT |
| `types/express/index.d.ts` | same | adds `req.user` |

`money.ts`, `dates.ts` and `pricing.ts` have no equivalent in pie-api because pies have no money or date arithmetic. They keep flat filenames to match the style.

### Ports over from the Next app almost unchanged

`lib/money.ts`, `lib/dates.ts`, `lib/pricing.ts`, `lib/schemas.ts`, `lib/validate.ts` and all the SQL inside `lib/rooms.ts`, `lib/reservations.ts`, `lib/billing.ts`. They are plain functions over `pg` — no Next imports. **Roughly 2,400 lines that move for free.**

Two shapes to reconcile:

- Sir puts SQL inline in the route handler. The Next app puts it in a query function the handler calls. Inline is closer to the baseline; extracted is easier to test. **Pick one and be consistent.** Inline is the safer answer for a defense.
- Sir's `db.ts` reads `PGUSER` / `PGHOST` / `PGPASSWORD`. Keep `DATABASE_URL` instead — Supabase needs the connection string plus SSL, which the split vars do not express.

### Three things not to lose in the move

1. **`pg` type parsers** (`lib/db.ts`). OID 1082 keeps `DATE` as a `YYYY-MM-DD` string; OID 1114 reads `TIMESTAMP` as UTC. Without them a booking shifts by a day and a check-in stamp is hours off. Copy both.
2. **Money stays a string.** `pg` returns `NUMERIC` as a string; keep it. `Number()` on pesos reintroduces float error.
3. **The webhook is the only thing that confirms a booking.** Check `x-callback-token` before reading the body. The success redirect proves nothing.

---

## 4. API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/rooms` | — | catalog, `?checkIn&checkOut&guests` filters availability |
| GET | `/api/rooms/:id` | — | one room |
| POST | `/api/rooms` | staff | create |
| PUT | `/api/rooms/:id` | staff | update |
| POST | `/api/reservations` | — | hold a room, returns Xendit `invoice_url` |
| GET | `/api/reservations/code/:code` | — | guest lookup |
| GET | `/api/reservations` | staff | admin list |
| POST | `/api/reservations/:id/check-in` | staff | |
| POST | `/api/reservations/:id/check-out` | staff | refused if balance owed |
| GET | `/api/folio/:code` | staff | bill + charges + payments |
| POST | `/api/folio/:id/charges` | staff | post an incidental |
| POST | `/api/folio/:id/payments` | staff | cash at the desk |
| GET | `/api/dashboard` | staff | arrivals, departures, occupancy |
| POST | `/api/webhooks/xendit` | token | the only path to `CONFIRMED` |
| POST | `/api/auth/login` | — | staff login, returns JWT |

Guest routes are open — guests have no accounts, and a confirmation code is the only key.

---

## 5. Frontend — `innkeep-frontend/src/`

| File | From pie-frontend | Purpose |
|---|---|---|
| `main.tsx`, `App.tsx` | same | providers + router |
| `types.ts` | `types.ts` | Room, Reservation, Charge, Payment |
| `api/roomService.ts` | `api/pieService.ts` | |
| `api/reservationService.ts` | `api/pieService.ts` | |
| `api/folioService.ts` | `api/pieService.ts` | |
| `api/authService.ts` | `api/authService.ts` | |
| `context/AuthContext.tsx` | same | JWT in state, token in `localStorage` |
| `components/` | `components/` | the existing UI, moved |
| `pages/` | — | one file per route |

### Two additions the baseline does not have

**Tailwind.** pie-frontend uses styled-components; your UI is entirely Tailwind. Install Tailwind v4 in Vite rather than rewriting ~3,000 lines of `className`. Three lines of config.

**react-router.** pie-frontend is a single page with no router. The hotel has eight routes, one with a parameter. Add `react-router-dom`.

### What moves how

| | Lines | Work |
|---|---|---|
| Pure UI — `RoomCard`, `BookingCard`, `StayDetails`, `Sidebar`, `Spinner`, `InfoBar` | ~310 | copy-paste; `next/link` → react-router `Link` |
| Already `"use client"` — `ReservationsTable`, `RoomsInventory`, `ChargeForm`, `PaymentForm`, `FrontDeskButton`, `HoldTimer`, `BookingForm` | ~1,560 | JSX untouched; `useActionState` → `useState` + `fetch` |
| Server pages — dashboard, folio, guest pages | ~1,050 | real rewrite; `await` → `useEffect` + loading/error state |

**About 63% moves mechanically.** `ReservationsTable` and `RoomsInventory` already take their data as props, so they only need a different source for those props.

### Routes

| Path | Access |
|---|---|
| `/` | catalog + availability search |
| `/booking/checkout` | review & confirm |
| `/booking/:code` | confirmation |
| `/find-booking` | code lookup |
| `/login` | staff |
| `/admin` | dashboard |
| `/admin/rooms` | inventory |
| `/admin/reservations` | list |
| `/admin/reservations/:code` | folio |

---

## 6. Auth

Copy sir's approach exactly — it is already written and it solves the problem we deferred.

- `bcrypt` for the password, `jsonwebtoken` for the session, `authenticateToken` middleware on every staff route.
- Frontend keeps the token in `AuthContext` and `localStorage`, sends `Authorization: Bearer <token>`.
- `<RequireAuth>` wrapper around the `/admin` routes redirects to `/login`.

**Every staff route needs `authenticateToken` individually.** A guard on the frontend route is UX, not security — anyone can call the API directly.

`Staff` table: `id`, `email` unique, `name`, `password_hash`, `created_at`. Seed the first account with a small script; the hash has to be computed in Node, not SQL.

---

## 7. Build order

- [ ] **1** Scaffold `innkeep-api` from pie-api. Rename, set port 4000, `DATABASE_URL` + SSL in `db.ts`
- [ ] **2** Copy `db/schema.sql` and `db/seed.sql` across; confirm it connects
- [ ] **3** Copy `money.ts`, `dates.ts`, `pricing.ts`, `validate.ts`, `schemas.ts`
- [ ] **4** `roomRoutes.ts` — catalog + availability. First endpoint end to end
- [ ] **5** Scaffold `innkeep-frontend` from pie-frontend. Add Tailwind + react-router
- [ ] **6** `api/roomService.ts` + the catalog page. **First full slice working**
- [ ] **7** `InfoBar` becomes real inputs pushing to the URL — this is spec Feature 1 and it does not exist yet
- [ ] **8** `reservationRoutes.ts` + checkout + Xendit invoice
- [ ] **9** `webhookRoutes.ts` — token check, `PENDING` → `CONFIRMED`
- [ ] **10** `/booking/:code` + `/find-booking`
- [ ] **11** `authRoutes.ts` + `authMiddleware.ts` + `/login` + `<RequireAuth>`
- [ ] **12** `/admin/rooms` — room CRUD
- [ ] **13** `/admin/reservations` — list
- [ ] **14** `folioRoutes.ts` + folio page + check-in / check-out / charges / payments
- [ ] **15** `dashboardRoutes.ts` + dashboard

Step 6 is the checkpoint. If the catalog renders real rooms from Express, the pattern is proven and everything after is repetition.

Auth at step 11, not step 1 — a working booking demo is worth more marks than a login screen.

---

## 8. Decide before starting

1. **SQL inline in routes, or extracted into query functions?** Inline matches sir. Pick one.
2. **Does the whole group agree?** This throws away a working Next app. Bryan wrote the admin UI; he should know his `className`s survive but his pages get rewritten.
3. **Two repos or one with `api/` and `web/` folders?** Two is simpler to run and closer to the baseline.
4. **Deadline.** Roughly a weekend for the group if step 6 goes smoothly. The current Next app already works end to end, payment webhook included. If the deadline is close, shipping that beats a rewrite.

---

## 9. Carried over from the Next build

Things already solved that should not be re-litigated:

- **Double-booking** — a Postgres `EXCLUDE` constraint refuses overlapping rows outright. Already in `db/schema.sql`. Keep it; the app-level check alone is not atomic.
- **VAT** — 12% on the room only. Incidentals are posted VAT-inclusive.
- **Holds** — a booking is `PENDING` with a 15-minute `holdExpiresAt` while the guest pays. Expired holds are released on the next availability read, so no cron job.
- **Check-in / check-out move two rows** — reservation status and `Room.status` — inside one transaction.
- **Check-out is refused while a balance is owed**, read inside that same transaction.
- **`db/seed.sql` must not write `Room.status`.** It is runtime state owned by check-in/check-out; seeding it invents guests.
