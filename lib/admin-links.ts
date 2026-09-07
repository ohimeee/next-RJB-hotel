/**
 * Links between admin screens, in one place.
 *
 * The folio is keyed on the confirmation code rather than the reservation's
 * uuid: it is what the guest reads off their phone and what the front desk
 * types, so a folio URL is something a person can arrive at from a printed
 * booking. The uuid stays internal to the write path.
 *
 * Mirrors `checkoutHref` in lib/search.ts — the same reason applies, which is
 * that a URL built by hand in three components eventually differs in one of
 * them.
 */
export const folioHref = (confirmationCode: string): string =>
  `/admin/reservations/folio?code=${encodeURIComponent(confirmationCode)}`;
