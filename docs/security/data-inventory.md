# Data inventory (pilot)

This is a category map for SOURCE customer data after PR B2. It is not a GDPR Record of Processing. Full deletion workflow is not in this PR. Ownership index rows (`storage_objects`) are kept so later deletion is possible.

The engine is unchanged: `InformationRequirement → ResolutionCase → ResolutionAttempt(s) → Readiness`.

---

## Organisation, membership, identity

Where stored: Postgres (`organisations`, `users`, `memberships`, invitations).

Access: SOURCE authorization from membership. Supabase Auth authenticates; it does not authorize.

Retention: operational for the life of the organisation. Organisation/user deletion is not this PR.

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

---

## Future deletion obligations

Keep `storage_objects` as the ownership index (organisation, bucket, key, purpose). A later right-to-delete flow should delete or tombstone Storage bytes **and** the index, without relying on path-guessing. That workflow is not implemented in B2.
