# Object storage

SOURCE stores customer files so they survive process restart and stay private.

This is infrastructure. It is not the Missing Information Engine.

```text
InformationRequirement → ResolutionCase → ResolutionAttempt(s) → Readiness → READY | UNRESOLVED
```

A supplier request remains one attempt. Storage does not change that loop.

```text
Browser
↓
SOURCE API
↓
Authentication / capability grant
↓
SOURCE authorization + disclosure
↓
ObjectStorage port
↓
Supabase Storage (preview/production) or MemoryObjectStorage (local/CI)
```

React must not upload to a Storage bucket on its own. Possession of a storage object key, filename, evidence id, or a previous signed URL identifier is never sufficient authorization for a new signed read.

---

## CURRENT (B2)

| Piece | Owner |
|---|---|
| `ObjectStorage` port | Infrastructure |
| `MemoryObjectStorage` | Local / CI |
| `SupabaseObjectStorage` | Preview / production |
| `storage_objects` | SOURCE Postgres (ownership index) |
| Bytes | Private buckets `source-imports`, `source-evidence` |
| Authorization | SOURCE, before any read or write |
| Disclosure | Existing P0.1 policy, before any signed read |

---

## Upload strategy

**Pattern A: browser → SOURCE API → server writes to Storage.**

Chosen because:

- authorization happens before bytes are durable;
- object keys are server-generated;
- magic-byte, size, and SHA-256 inspection run on trusted bytes;
- portal grants can be re-checked at finalization;
- the service-role key never leaves the server;
- CSRF Origin/Referer still applies to cookie sessions.

Direct `React → Supabase Storage bucket` is prohibited.

Flow:

```text
authorize
→ createUploadIntent (server key, TEMPORARY_UPLOAD / UPLOADING)
→ POST bytes to SOURCE
→ ObjectStorage.putImmutable
→ finalize (re-check grant/auth, scan, hash)
→ ImportJob or EvidenceRecord links the storage object
```

If a portal grant is revoked between intent and finalize, finalization is rejected, the temporary object is deleted/quarantined, and no EvidenceRecord is attached.

---

## Buckets

| Bucket | Purpose | Public |
|---|---|---|
| `source-imports` | Manufacturer catalogue source files | Never |
| `source-evidence` | Evidence bytes | Never |

Optional later: `source-exports`.

Create buckets with `npm run storage:bootstrap` (service role, that project's URL). Dashboard creation is a fallback only. Buckets must be **private**. Public bucket policies are prohibited for customer data.

Object keys are opaque (`t/{uuid}` while temporary). Original filenames, supplier names, and project names are not placed in paths or in permanent URLs.

---

## Service role

`SUPABASE_SERVICE_ROLE_KEY` is an infrastructure credential used only inside `SupabaseObjectStorage`.

Service role bypasses Storage RLS. That is **not** an authorization decision. SOURCE policy must already have allowed the action. The key is server-only. It must never appear in client bundles or `NEXT_PUBLIC_*` variables.

Preview service role must come from the preview project (`hhuurdzzsinzwbkkokzz`). Production service role must come from the production project (`vezhdbzizniurehclxpg`). URL/project mismatch fails closed. Keys are never logged.

---

## Signed reads

Signed URLs are created only after a `DisclosureDecision` that permits bytes.

- Default TTL: 300 seconds (`SOURCE_SIGNED_READ_TTL_SECONDS`)
- Not persisted as business data
- Not logged
- `ATTESTATION_ONLY` returns a safe projection and never a URL

A previously issued signed URL remains valid only until that short TTL. Every new access request re-evaluates authorization and disclosure.

Sensitive downloads audit as `EVIDENCE_DOWNLOAD_GRANTED` with principal, organisation, evidence (opaque), timestamp, and disclosure level. No URL.

---

## Evidence immutability

Accepted evidence objects are immutable. `putImmutable` refuses overwrite (`upsert: false` on Supabase).

A replacement file creates a new evidence record and may set `supersedes_evidence_id`. Historical bytes stay. There is no customer-facing hard delete in this pilot. Use supersede / invalidate / revoke according to the engine.

Readiness uses evidence with `availability === AVAILABLE` (missing availability on older seed rows is treated as available). Upload success is not READY.

---

## Temporary objects

Failed or abandoned uploads expire (`SOURCE_TEMP_UPLOAD_TTL_HOURS`, default 24). `cleanupExpiredUploads` deletes temporary bytes and marks the index. This is a mechanism, not a full retention worker.

---

## File policy (pilot)

| | Import | Evidence |
|---|---|---|
| Max size | 20 MB | 20 MB |
| Types | CSV (XLSX stored, not parsed) | PDF, CSV, PNG, JPEG, XLSX |
| Denied | `.exe` `.js` `.html` `.svg` and executables | same |

Client `mime_type` / `size` / `filename` are hints. Finalization inspects stored bytes, magic, and SHA-256.

PDF is untrusted byte storage. SOURCE does not execute embedded actions.

`AllowlistFileScanner` is **not antivirus**. Production residual risk: no malware vendor. Dangerous types fail closed.

---

## Import source

`ImportJob.sourceStorageObjectIds` points at durable objects. Parsing reads through `ObjectStorage`, not browser state. If parsing fails, the job and source object remain so the manufacturer can review errors and retry without re-uploading.

Pilot retention: **keep original import files** so row/sheet/job provenance can be reconstructed. Do not silently delete.

---

## Recovery

Postgres backup restores `storage_objects` and `ImportJob` metadata. It does **not** restore Storage bytes. Current assumption: database + bucket must both be recoverable. Full disaster recovery is not promised until that pairing is operated.

---

## Outage copy

Upload failure: `We couldn't store this file. Nothing has been added yet.`

Evidence download failure: `Evidence is temporarily unavailable.`

A storage outage does not mark evidence invalid.
