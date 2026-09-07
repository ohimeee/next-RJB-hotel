-- The Iloilo City property, straight from the design mockups. Rates are in pesos,
-- before VAT — the guest side adds it at checkout.
--
-- Keyed on "number" so re-running refreshes rooms instead of duplicating them
-- or tripping the unique constraint.
--
-- Apply with:  npm run db:seed

INSERT INTO "Room" ("number", "name", "type", "capacity", "amenities", "description", "nightlyRate", "status")
VALUES
  ('402', 'The Garret Suite',  'SUITE',    2, ARRAY['King bed', 'Skylight', 'Free breakfast'],  'King bed | Top floor | Sleeps 2',            8900, 'AVAILABLE'),
  ('501', 'Atelier Suite',     'SUITE',    4, ARRAY['2 bedrooms', 'Kitchenette', 'Balcony'],    'Two bedrooms | Kitchenette | Sleeps 4',      10500, 'AVAILABLE'),
  ('201', 'Courtyard Deluxe',  'DELUXE',   2, ARRAY['Queen bed', 'Courtyard view', 'Minibar'],  'Queen bed | Courtyard view | Sleeps 2',      6400, 'AVAILABLE'),
  ('202', 'Courtyard Deluxe',  'DELUXE',   2, ARRAY['Queen bed', 'Courtyard view', 'Minibar'],  'Queen bed | Courtyard view | Sleeps 2',      6400, 'AVAILABLE'),
  ('305', 'Loft Deluxe',       'DELUXE',   3, ARRAY['King bed', 'Workspace', 'Free breakfast'], 'King bed | Loft workspace | Sleeps 3',       7100, 'AVAILABLE'),
  ('104', 'Harbor Standard',   'STANDARD', 2, ARRAY['Twin beds', 'City view'],                  'Twin beds | City view | Sleeps 2',           4200, 'AVAILABLE'),
  ('103', 'Archive Standard',  'STANDARD', 1, ARRAY['Single bed', 'Reading nook'],              'Single bed | Reading nook | Sleeps 1',       3600, 'AVAILABLE')

-- Every room seeds AVAILABLE, and "status" is deliberately absent from the
-- update list below.
--
-- `Room.status` is housekeeping's answer to "is somebody physically in there
-- right now". Only check-in and check-out may write it — see
-- checkInReservation() in lib/reservations.ts, which moves it in the same
-- transaction as the reservation.
--
-- Seeding it OCCUPIED was mockup flavour from before that write path existed.
-- It invented guests: the dashboard counted four occupied rooms nobody had
-- ever checked into, so occupancy read 86% against a property with two real
-- stays in it.
--
-- Leaving it in the DO UPDATE was the worse half. This file is meant to be
-- re-runnable against the shared database, and doing so would have flipped a
-- checked-in guest's room back to AVAILABLE — losing live state to fix a typo
-- in an amenity list.
ON CONFLICT ("number") DO UPDATE SET
  "name"        = EXCLUDED."name",
  "type"        = EXCLUDED."type",
  "capacity"    = EXCLUDED."capacity",
  "amenities"   = EXCLUDED."amenities",
  "description" = EXCLUDED."description",
  "nightlyRate" = EXCLUDED."nightlyRate";
