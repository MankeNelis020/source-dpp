# Storage operations

Canonical SOURCE v0.1 production operations: `docs/operations/source-v01-production.md`.

Private buckets only. No public bucket is required.

| Class | Bucket default | Who writes |
|---|---|---|
| Manufacturer imports | `source-imports` | Authenticated organisation member |
| Supplier evidence | `source-evidence` | Portal grant or organisation member |

Server-authorized signed reads. Organisation-scoped object keys. Original bytes retained. MIME/size limits enforced in `uploads.ts`.

Hosted Preview/Production use Supabase Storage. Local/CI may use memory storage.

See `docs/architecture/storage.md` for the full model, orphan cleanup, and tenant isolation tests.

If Storage is down: uploads fail closed; existing engine state is unchanged. Retry. Do not mark evidence verified because an upload intent existed.
