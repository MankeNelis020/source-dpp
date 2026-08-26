# Data inventory (pilot)

This is a category map for SOURCE customer data after PR C. It is not a GDPR Record of Processing.

The engine is unchanged: `InformationRequirement → ResolutionCase → ResolutionAttempt(s) → Readiness`.

---

## Organisation, membership, identity

Where stored: Postgres (`organisations`, `users`, `memberships`, invitations).

Access: SOURCE authorization from membership. Supabase Auth authenticates; it does not authorize.

Retention: operational for the life of the organisation. Organisation/user deletion is not this PR.

---

## Billing

Where stored: Postgres `organisation_billing` (plan, subscription status, Stripe customer/subscription ids, period end) and `stripe_webhook_events` (Stripe event id for idempotency). Checkout Sessions are created in Stripe; SOURCE does not store card numbers.

Access: organisation members can read plan status. `organisation:manage` (Owner/Admin) can start Checkout or Customer Portal. Webhook updates are signature-verified (`STRIPE_WEBHOOK_SECRET`). Price IDs are allowlisted in `src/domain/billing/plans.ts`; the client cannot pass an arbitrary Price ID.

Retention: operational for the life of the organisation. Stripe secret keys are environment-only and must never be logged.

---

## Import source files

Where stored: Supabase Storage private bucket `source-imports`, plus `storage_objects` and `import_jobs` in Postgres.

Access: organisation members with `import:manage` (and related import APIs). Original filename is treated as sensitive metadata and is shown to authorized manufacturer users according to disclosure. Bytes are never public.

Retention (pilot direction): **retain original import files** during the pilot as source evidence for processing / reconstructable provenance. Eligible for deletion later; do not silently delete while requirements still need the source.

---

## Evidence files

Where stored: Supabase Storage private bucket `source-evidence`, `storage_objects`, `evidence_objects`, and engine `EvidenceRecord`.

Access: per disclosure and capability. May be supplier-uploaded via a portal grant or organisation-uploaded. Not all evidence is tenant-private if a claim is later shared under network trust; **bytes still require a SOURCE disclosure decision**. `ATTESTATION_ONLY` never includes a signed URL, storage object id, or filename.

Retention (pilot): no customer-facing hard delete. Replacement supersedes; old objects remain for traceability.

SHA-256 is stored for integrity. Hash equality is not permission to reuse evidence across tenants.

---

## Portal grants

Where stored: Postgres (`supplier_portal_grants`), token hash only.

Access: bearer token to scoped commands and scoped uploads only. Grant expiry/revocation is re-checked at evidence finalization.

Retention: until expiry/revocation plus audit window. Raw tokens are not stored.

---

## Supplier email and delivery

Where stored: Postgres `outbound_messages` (recipient, template id/version, transport status, provider message id, grant id, case/request refs) and `email_provider_events` (provider event id, type, times). Outbox payload may hold rendered body only until send succeeds, then it is redacted. Full HTML is not retained indefinitely.

Access: tenant-private under RLS + SOURCE authorization. Confidential upstream recipients are not projected to downstream manufacturers.

Retention (pilot direction): keep transport metadata and template version for the life of the case. Do not keep rendered bodies by default. Provider payloads are not blindly logged; persist structured fields only.

---

## Future deletion obligations

Keep `storage_objects` as the ownership index (organisation, bucket, key, purpose). A later right-to-delete flow should delete or tombstone Storage bytes **and** the index, without relying on path-guessing. That workflow is not implemented in B2.
