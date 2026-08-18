# SOURCE P0 — Missing Information Engine, production architecture

Milestone base: `9b06d66` on `cursor/unhappy-flow-missing-information-a93d`.

SOURCE is the Missing Information Engine: we find what is missing, then we resolve it. A supplier request is one `ResolutionAttempt`, not the product.

This document is the required pre-implementation output (audit, target architecture, schema, threat model, migration, tests). Implementation follows a strangler path: the existing domain engine remains the behaviour reference.

---

## A. Current-state audit

### What exists (preserve)

The domain already encodes the intended loop:

`InformationRequirement → ResolutionCase → ResolutionAttempt(s) → readiness gates → READY | UNRESOLVED`

| Area | Location | Status |
|---|---|---|
| Closed command set | `src/domain/source/types.ts`, `engine.ts` | Working prototype |
| Seven readiness gates | `readiness.ts` | Derived, but `RESTRICTED` currently auto-passes |
| Unhappy flows (15) | `seed.ts` `MVP_FLOWS`, `engine.test.ts` | Acceptance meaning must stay |
| Identity heuristic | `identity.ts` | Prototype; numbers look like probabilities |
| Routing / contacts | `routing.ts` | Preserve priority |
| Escalation 0/3/7/10/14/21 | `escalation.ts` | Rule source for workflows |
| Cycle guard | `cycles.ts` | Preserve; UI hide is not enough |
| Reuse outcomes | `reuse.ts` | Same-tenant only; `RESTRICTED` treated as READY |
| Copy / exception language | `copy.ts` | Product language — keep |
| Clickable workspace + `/s/[token]` | `src/app/app/*`, `src/app/s/[token]` | Demo UX; client owns mutations |

### What is demo-only (cannot survive production)

1. **Browser owns business truth.** `store.ts` is a module-level `EngineState` behind `useEngineState()`. Every actor, relationship, claim, evidence filename, portal token and confidential upstream id is in the client bundle/runtime.
2. **Supplier portal is client masking.** `/s/[token]` loads full engine state, then filters in React. `/s/demo` enumerates every open case for the inferred supplier. Tokens are predictable (`demo`, `textile`, case id).
3. **Session is `localStorage`.** `src/lib/session.ts` stores email/org in the browser. Not a principal. Not tenant-safe. No httpOnly cookie, CSRF, MFA, or revoke.
4. **Hardcoded tenant.** `engine.ts` grants permission to `MANUFACTURER_ID = "acme"`. `tenantId` on requirements is not enforced.
5. **Import wizard is a stepper with invented counts** (`8,421` products). Progress is click-to-advance, not a job.
6. **Overview percentages** mix live demo cases with `CATALOGUE_HEALTH` catalogue-scale fiction.
7. **Dual data planes.** Workspace pages still read `demo-data.ts` (products, claims, evidence) in parallel with the engine. They can disagree.
8. **Confidential upstream is a UI string.** `visibleActorName` / `manufacturerMaySeeActor` hide names in some views; `currentActorId`, graph payload, audit `payload`, and portal state still carry `mill-north`.
9. **No persistence, authz, idempotency, or concurrency control.** `ResolutionCase.version` exists but is never compared. Reminders can be dispatched twice from the UI. Evidence is a filename string, not an object-store object.
10. **Identity scores are presented as precision** (`99.8%`, `91%`) without a model version.

### What can be preserved unchanged

- Command *semantics* in `applyCommand` (acceptance 85–93, cycle guard, seed unhappy flows).
- Escalation policy as the workflow rule source.
- Readiness gate *names* and READY = all seven pass.
- Exception codes as domain states, not generic errors.
- Human copy in `copy.ts`.
- Marketing pages.

### What requires migration

| From | To |
|---|---|
| `useEngineState()` full snapshot | Authorized query projections |
| Client `dispatchCommand` | Server command envelope (authn → authz → idempotency → concurrency → domain → persist → audit → side effects) |
| Plain portal tokens on cases | `SupplierPortalGrant` with token hash, expiry, revoke, allowed cases/commands |
| `PermissionState` including `RESTRICTED` as pass | Evaluated `PermissionDecision` |
| Actor-only identity | Canonical subject hierarchy + mappings, `heuristic-v0` provenance |
| Fake import stepper | Durable `ImportJob` + real events |
| `localStorage` session | Server session cookie + membership; IdP later |

Do not rewrite `engine.ts` into a new architecture for aesthetics. Wrap it.

---

## B. Target architecture

### Folder structure

```
src/domain/source/          # framework-free behaviour reference
  types.ts, engine.ts, readiness.ts, reuse.ts, identity.ts, …
  permissions.ts            # evaluated PermissionDecision
  subjects.ts               # canonical subject helpers
  planner.ts                # deterministic ResolutionPlan v1
  propagation.ts            # same-tenant compatible-claim linking

src/server/source/          # application layer (still no React)
  principal.ts
  authorization.ts
  confidentiality.ts
  commands/dispatch.ts
  queries/*.ts
  portal.ts
  import/service.ts

src/infrastructure/
  database/schema.sql       # PostgreSQL
  database/ports.ts
  database/memory.ts        # strangler adapter + tests
  auth/session.ts
  crypto/tokens.ts
  storage/ports.ts
  jobs/scheduler.ts
  email/ports.ts

src/app/api/source/         # HTTP adapters only
src/client/source/          # React consumers of projections
```

Domain must not import React, Next, `pg`, Stripe, or email SDKs.

### Database

PostgreSQL. No graph database. Logical schema in `src/infrastructure/database/schema.sql`.

P0 runtime uses an in-memory adapter that implements the same ports so tests and the demo do not require a live cluster. The SQL is the contract for the first real database.

### Auth approach

- **Users / memberships / organisations / roles / capabilities** in persistence.
- Tenant id is taken from the authenticated principal, never from a client-supplied `tenantId`.
- Session: httpOnly, `SameSite=Lax`, signed cookie. Demo login maps a known email to a seeded user. Production replaces this with an established IdP (SSO/OIDC); we do not invent password hashing or JWT crypto.
- Supplier portal is a **separate principal type** bound to a grant, not a user membership.
- RBAC is a default grant of capabilities; every command/query still checks a capability or portal allow-list.

### Server / app boundary

```
UI  →  POST /api/source/commands  →  dispatch(envelope)
UI  →  GET  /api/source/…         →  authorized projection
/s/[token] → GET/POST /api/portal/… → hashed grant, scoped projection
```

`applyCommand` stays the domain executor. The application layer loads **tenant-scoped** engine state, never a network-wide snapshot.

### Workflow abstraction

```ts
interface WorkflowScheduler {
  schedule(input: { name: string; runAt: Date; payload: Record<string, string> }): string
  cancel(id: string): void
  reschedule(id: string, at: Date): void
}
```

Escalation *rules* remain in `escalation.ts`. The scheduler is a port. In-memory adapter is tickable in tests (same idea as `TICK_NO_RESPONSE`). Email is a side-effect port; domain commands must not call a provider.

Transitional honesty: existing acceptance tests expect `SEND_REQUEST` to leave the request `SENT`. We do not change that semantics in this milestone. The application layer records a `request.queued` side-effect for the worker path without changing domain acceptance.

### Object storage

Port: `putImmutable({ key, bytes, sha256, mime })`, `signGet(key, ttl)`, never a public bucket. Memory adapter keeps bytes in process. Production: private bucket + short-lived signed URLs after authorization. Original evidence is immutable; replacement creates a new `evidence` row.

### Event handling

Domain events remain on the case. Application writes append-only `audit_events` (no update/delete). Import progress uses stored `import_job_events` and SSE (`GET /api/imports/:id/events`) as a replay of those rows — not percentages invented in React.

---

## C. Database schema (logical)

Tenant-private tables always include `organisation_id` (except canonical network tables, which have **no** implicit tenant read path).

**Identity & access:** `users`, `organisations`, `memberships`, `role_bindings`, `capability_grants`

**Canonical network (existence ≠ access):** `canonical_actors`, `actor_aliases`, `actor_identifiers`, `actor_relationships`, `contact_points`, `canonical_subjects`, `subject_aliases`, `subject_identifiers`, `subject_relationships`, `tenant_subject_mappings`, `identity_decisions`

**Tenant catalogue & resolution:** `datasets`, `dataset_versions`, `requirement_definitions`, `information_requirements`, `resolution_cases`, `resolution_attempts`, `resolution_exceptions`, `claims`, `claim_versions`, `evidence`, `evidence_scopes`, `claim_evidence_links`, `human_tasks`, `claim_conflicts`, `downstream_dependencies`

**Trust objects:** `permission_policies`, `permission_grants`, `permission_events`

**Supplier channel:** `supplier_requests`, `supplier_portal_grants`

**Control plane:** `processed_commands` `UNIQUE(organisation_id, idempotency_key)`, `domain_events`, `audit_events` (append-only), `import_jobs`, `import_job_events`, `import_mappings`, `workflow_instances`

Row-level security policies are defined in SQL as defense in depth. Application authorization remains mandatory. Queries always pass organisation/portal context explicitly.

Externally observable ids are UUID/ULID-style (or existing `SRC-…` case ids), not sequential integers.

---

## D. Security threat model

Invariant: Organisation A must never obtain, infer, or enumerate Organisation B's private information unless a specific shareable object and permission policy authorizes it.

| Asset | Threat | Attack path | Control | Test | Residual risk |
|---|---|---|---|---|---|
| Tenant products, BOMs, requirements | Cross-tenant leakage | Guess id / search / autocomplete / counts | Tenant from principal; projections; 404 not 403; scoped search | Isolation suite | Operator with DB credentials |
| Hidden upstream actor | Relationship inference | Graph API, audit, filenames, actor ids, portal state | Server projection `PROTECTED_UPSTREAM_SOURCE` without actor id; strip audit payload | Confidential upstream tests | Timing of case volume |
| Evidence bytes / metadata | IDOR + URL leak | Predictable URL; client bundle; `EVIDENCE_VIEWED` over-sharing | Private storage; authz; signed short TTL; hidden metadata omitted | Evidence 404; projection leak test | Signed URL forwarded before expiry |
| Supplier portal token | Token theft / replay | Referrer logs; guessing `demo`; reused URL | Hash at rest; entropy; expiry; revoke; rate limit; scoped commands | Expired/revoked/unscoped tests | Bearer token in supplier email |
| Commands | Privilege escalation | Client sends `organisationId` / admin command | Ignore client tenant; capability check | Cross-org command 404 | Mis-seeded OWNER in demo |
| Commands | Replay / duplicate email | Double-click SEND_REMINDER | Idempotency key unique per org | Second call ALREADY_PROCESSED | Caller varies keys |
| Cases | Lost update | Two reviewers resolve conflict | `expectedVersion` → 409 CASE_CHANGED | Concurrency test | Client omits version |
| Audit | Tampering | UPDATE audit row | Append-only table; no update API | Audit immutability test | DB superuser |
| Search | Existence oracle | Error text “belongs to another org” | Uniform 404 RESOURCE_UNAVAILABLE | Search isolation | Coarse rate-limit timing |
| Propagation | Cross-tenant attribution | “Customer A supplied this certificate” | Server-side eval; tenant-facing reason without source customer | Propagation privacy test | Shared public claim still reveals overlap if policy is PUBLIC |

Prefer deny and human review over displaying incomplete confidential context.

---

## E. Migration plan (small reversible steps)

1. **Freeze** current acceptance tests (done — do not change meaning).
2. **Introduce** application dispatch + memory persistence beside `applyCommand`.
3. **Authorize** every command/query; add portal grants; stop returning `EngineState`.
4. **Switch UI** to projections/API; keep domain engine as executor.
5. **Correctness:** idempotency, optimistic concurrency, permission evaluation, readiness cache invariant.
6. **Data model:** canonical subjects, provenance, manual add component/material.
7. **ImportJob + workboard + Needs You** on real events.
8. **Later:** Postgres adapter behind the same port; IdP; object storage; delete any remaining client mutation path.

`useEngineState()` is retired once UI consumes projections. Domain `applyCommand` stays as the reference.

---

## F. Test plan

- **Preserve** `engine.test.ts` (85–93) and `seed.test.ts` (fifteen flows).
- **Unit:** permission decisions, reuse of RESTRICTED, heuristic-v0 flag, planner order, subject hierarchy, escalation (existing).
- **Invariant:** after every mutating command, `claim.ready === evaluateReadiness(...).ready` for affected claims.
- **Isolation:** tenant A cannot fetch/search/infer tenant B product, evidence, graph, portal token, or existence (404).
- **Portal:** expired, revoked, unscoped case, forbidden command, allowed command.
- **Concurrency:** stale version → 409.
- **Idempotency:** same key → one domain effect.
- **Propagation:** compatible claim resolves; wrong subject/scope/expiry/deny do not; authorization-required next step; no customer attribution.
- **Projection leak:** no hidden actor id, certificate path, or foreign tenant id in client payloads.

---

## Implementation notes for this milestone

- Boring ports over microservices, blockchain, or a graph DB.
- Do not claim VERIFIED unless trust status supports it.
- Identity scores are `heuristic-v0`, not calibrated probabilities.
- Automation suggests; users confirm/correct/remove. Provenance is stored.
- DPP remains an output, not the engine.
