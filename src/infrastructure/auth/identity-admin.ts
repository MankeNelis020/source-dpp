/**
 * Reserved Auth-admin port.
 *
 * PR A does not call the Supabase Admin API and does not use
 * SUPABASE_SERVICE_ROLE_KEY. Domain reads/writes stay on source_app + RLS.
 *
 * If a future milestone needs Auth administration (for example confirming a
 * user for a support tool), implement it here — never from domain code, and
 * never from Client Components.
 *
 * TODO / architecture note — user offboarding:
 * Full account deletion is not implemented. Do not cascade-delete organisation
 * audit, engine state, evidence metadata, or membership history when a person
 * leaves. Suspend membership first. A later privacy workflow can unlink the
 * profile without destroying tenant provenance.
 *
 * Organisation deletion is also out of scope.
 */
export interface IdentityAdmin {
  /** Intentionally empty in PR A. */
  readonly _brand?: "IdentityAdmin";
}
