# SOURCE P1 — Real-data resolution validation

Milestone base: `c18c9e7` on `cursor/p01-security-hardening-f5f6` (PR #5).

P0/P0.1 and the agreed P0.2 hardening items are complete or accepted:

| P0.2 item | Status |
|---|---|
| Opaque evidence refs without HMAC-scan | Implemented (`evr1_` AES-GCM, O(1)) |
| Attestation `VERIFIED` follows claim trust | Implemented (`ON_FILE` / `EVIDENCED` / `VERIFIED` / `EXPIRED`) |
| `saveEngine` shareable-trust rebuild | Documented scale trigger — not rebuilt |
| JSONB tenant aggregate lock | Documented scale trigger — not normalized |

P1 is an **empirical validation milestone**, not a feature milestone. It answers:

> When SOURCE receives realistic manufacturer catalogue, supplier, BOM/material and evidence data, how much missing information can SOURCE resolve or avoid requesting through normalization, identity resolution, existing evidence, reuse, propagation and authorization?

North star: **Supplier Contact Avoidance Rate**.

Do not hard-code 50% = success. P1 establishes baselines from which GO / PIVOT / STOP can be set.

The engine loop is unchanged:

```
InformationRequirement → ResolutionCase → ResolutionAttempt(s) → seven readiness gates → READY | UNRESOLVED
```

A supplier request remains one possible attempt. DPP remains an output. This document is the required pre-implementation output.

---

## A. Current capability audit (P0 / P0.1 / P0.2)

### Domain — already exists

| Capability | Where | Operational? |
|---|---|---|
| Closed command set + unhappy flows | `engine.ts`, `seed.ts` | Yes |
| Seven readiness gates | `readiness.ts` | Yes. READY still requires all seven. |
| `planResolution` v1 | `planner.ts` | **Not on the engine path.** `openRequirement` inlines a shorter tree. |
| Same-tenant propagation | `propagation.ts` | Called from `dispatch.ts` after a ready claim. Exact subject+property. Identity/conflict assumed pass. Scope: `scope.id === subjectId` **or** `kind === "product"` (too wide). |
| Cross-tenant reuse service | `network.ts` `findReusableClaimsForRequirement` | Tested. **Not called from open/plan.** Outcomes: READY / AUTHORIZATION_REQUIRED / VERIFICATION_ONLY_AVAILABLE / NO_MATCH. |
| Canonical subject types | `types.ts` `CanonicalSubject`, kinds including PRODUCT/COMPONENT/MATERIAL/PACKAGING | Types exist. Seed graph is tiny. |
| Subject identifiers | GTIN, MPN, SKU, SUPPLIER_PID | Stored. **Not used by identity.** |
| Actor identity | `identity.ts` heuristic-v0 | VAT/LEI/domain/name. Scores are not calibrated. GTIN/MPN ignored. |
| Subject commands | `ADD_SUBJECT`, correct/remove relationship, mark unknown | Yes. No merge/split/bulk. Generated ids ignore importer external ids. |
| Dataset id on requirements | `datasetId` string | Always `"espr-al-2027"`. No version. |
| AssignmentSource | IMPORTED / USER_ADDED / … | Partial. No raw-row lineage. |

### Application / persistence — already exists

| Capability | Status |
|---|---|
| Command dispatch + outbox + idempotency | Yes (P0.1) |
| Postgres + RLS + `source_app` | Yes |
| JSONB `engine_states` per organisation | Yes. Pilot keeps this. |
| ImportJob + events | Metadata yes. **Stages are simulated. Mapping unused. Suppliers/BOM/materials not written to the graph. CSV only. Sync in the HTTP request. Raw rows discarded.** |
| Workboard / Needs You queries | Live engine cases/tasks. NEEDS_YOU double-counts tasks; RESOLVED includes UNRESOLVED. `minutesEstimate` is hardcoded. |
| Catalogue UI (products, suppliers, requests, evidence, claims, graph) | Still `demo-data.ts` except product blockers and supplier open cases. |
| Evidence extractor | None |

### P0.2 / P1 start condition

P1 may start. Do not reopen P0 architecture unless real data exposes an invariant failure.

---

## B. Gap analysis — what P1 actually requires

| Gap | Why it blocks the hypothesis | P1 response |
|---|---|---|
| Planner not wired | Import “plans” are fiction | `openRequirement` uses `planResolution`; record selected route + reason |
| Import does not build the graph | Cannot canonicalize real catalogues | Map columns → preserve raw → normalize → identity → relationships → requirements |
| No raw provenance | Cannot answer “where did this come from?” | `import_raw_records` outside JSONB |
| No subject identity pipeline | Duplicate components inflate missing counts | Stages A–D; only MATCHED auto-propagates |
| No immutable baseline | Later readiness cannot be compared honestly | `PilotRun.baseline` frozen before execution |
| No outcome attribution | High READY without knowing SOURCE created value | `RequirementOutcome.mechanism` |
| No `SUPPLIER_CONTACT_AVOIDED` | North star unmeasurable | First-class event + row |
| Cross-tenant reuse not in the loop | Network path unused | Planner preflight via `findReusableClaimsForRequirement` only |
| Outreach during ingest | Import would email suppliers | Import is `planOnly`; CTA `executeResolutionRun` sends. Import fails closed if any `SupplierRequest` is created. Execute is idempotent (`processed_commands` key `{org}:pilot:{runId}:EXECUTE:v1`). Double-click / restart does not send a second wave. `PilotRun.completedAt` is not set on the first CTA — only `executionStartedAt`. |
| Request grouping | 82 emails for one answer | Grouped communication; one requirement remains independently resolvable |
| Metrics from UI state | Business decision would be wrong | `evaluatePilotRun` from persisted events/outcomes |
| Demo catalogue pages | User cannot inspect imported graph | Product / material / supplier projections from engine |
| No bounded pilot dataset | `defaultPropertiesForKind` is not a dataset | `PILOT DATASET` `pilot-missing-information-v1` |

Non-gaps (do not rebuild):

- Domain command semantics and acceptance tests 85–93
- Disclosure / opaque refs / attestation trust
- Outbox + portal grants
- JSONB aggregate (instrument, do not normalize)

---

## C. Data ingestion architecture

```
CSV / first-sheet XLSX
        ↓
RawImportRecord (immutable, outside JSONB)
        ↓
column mapping profile (org + source format)
        ↓
NormalizedRecord (decimal comma, units, legal suffix, GTIN digits)
        ↓
identity stages A–D
        ↓
CanonicalSubject + SubjectRelationship + Actor
        ↓
Pilot dataset → InformationRequirement (datasetId + datasetVersion)
        ↓
OPEN_REQUIREMENT planOnly
        ↓
PilotRun.baseline (immutable)
```

### Files

Separate or combined: products, suppliers, BOM/components, materials. Missing columns are allowed. SOURCE does not invent values.

### Mapping

`proposeMapping(headers)` continues. Confidence is qualitative: **High confidence** / **Review suggested** / **Unknown**. The user may correct mappings. Profiles persist per organisation/source format.

Processing **uses** the mapping (P0 stored it and ignored it).

### Limits

P0.1: 2MB / 5k rows (abuse control). P1 raises to **20MB / 25k rows per file** with the same formula-injection and null-byte guards. Larger files fail with an explainable error, not a hang.

### Idempotency

Source identity = `(organisationId, source_format, source_record_id)` in `tenantSubjectMappings`. Re-import of the same record updates mapping provenance; it does not duplicate subjects, relationships, or requirements. A new mapping version is a deliberate new import.

### Async

ImportJob already exists. P1 runs stages on the server and records real counts per stage. HTTP POST may still execute in-process for the memory adapter and tests; the job is durable so a refresh/polling client can leave. SSE `/api/imports/:id/events` is the replay of stored events — not invented percentages.

### XLSX

Accept workbook bytes; parse the first worksheet (sharedStrings + sheet1) to the same row model as CSV. Semicolon CSV and UTF-8 BOM are first-class (EU Excel exports).

---

## D. Identity strategy

### Actors (suppliers)

Existing `resolveIdentity` (heuristic-v0), plus staged labels:

| Stage | Examples | Auto-link? |
|---|---|---|
| A Deterministic | Exact VAT, LEI, known tenant mapping / external supplier id | Yes |
| B Normalized | Case fold, legal suffix, domain, whitespace | **No** — PROBABLE. Extra review items beat a wrong merge. |
| C Heuristic | Similar legal name + country | No — PROBABLE / AMBIGUOUS |
| D Human | Needs You | Only MATCHED after confirm |

States used: `MATCHED` (`IDENTITY_MATCHED`), `PROBABLE_MATCH`, `AMBIGUOUS`, `NO_MATCH`, `REJECTED_MATCH`. `IDENTITY_SPLIT_REQUIRED` / `MERGE_REQUIRED` become real after merge/split commands.

Import never binds a probable/ambiguous supplier to `candidates[0]`. It creates a distinct actor and an identity review task.

Scores stay **uncalibrated**. UI shows qualitative bands, not fake probabilities.

### Canonical subjects

New `resolveSubjectIdentity`:

| Stage | Examples | Auto-link? |
|---|---|---|
| A | Exact GTIN; exact validated MPN **+ manufacturer**; existing tenant mapping; supplier product code | Yes — only these set `autoLinkAllowed` |
| B | Normalized name + kind; SKU case-fold; MPN without manufacturer | No — PROBABLE |
| C | Similar name; **same MPN + different manufacturer** | No — **AMBIGUOUS** |
| D | “We think these are the same component.” Same / Different / Need more information | Human only |

Only MATCHED (deterministic) enables automatic propagation. Ambiguous identity must not improve metrics by merging. Prefer 200 extra review items over 20 wrong merges that inflate Contact Avoidance Rate.

Unlock copy (“Confirming this could unlock 82 requirements across 37 products”) is computed from `productIds` on still-missing requirements for the candidate subjects.

### Provenance on mappings

`matchMethod`: deterministic | normalized | probabilistic | human. `decision`: auto | confirmed | rejected | created. `modelVersion`: `heuristic-v0`.

Identity learning (alias of a legal entity) is not business-data sharing (who supplies whose frame). Cross-tenant publication still requires P0.1 permission.

---

## E. Requirement generation strategy

Label: **PILOT DATASET** — `pilot-missing-information-v1`.

Not: “EU DPP COMPLETE”.

Bounded types, enough to exercise the engine:

| Subject kind | Property | Trust | Evidence | Permission |
|---|---|---|---|---|
| PRODUCT / PRODUCT_FAMILY | `country_of_manufacture` | EVIDENCED | origin declaration or certificate | granted |
| COMPONENT | `recycled_content` | EVIDENCED | certificate / supplier statement | granted |
| MATERIAL / RAW_MATERIAL | `recycled_content`, `material_origin` | EVIDENCED | material spec / EPD / declaration | granted |
| PACKAGING | `recycled_content` | EVIDENCED | packaging declaration | granted |
| COMPONENT | `iso14021_certificate` | EVIDENCED | named certificate | granted |

Every generated requirement stores `datasetId` + `datasetVersion`. Changing the dataset later does not rewrite historical PilotRun results.

Requirements are created because the **pilot dataset says this subject kind needs this property**, not because a spreadsheet column exists.

`ADD_SUBJECT` with `generateRequirements: true` uses the pilot dataset (not ad-hoc `defaultPropertiesForKind` alone). Existing seed cases keep `espr-al-2027` as their historical dataset id.

---

## F. Resolution execution architecture

```
baseline snapshot (immutable)
        ↓
CTA “Let SOURCE handle the gaps” → executeResolutionRun
        (idempotent: processed_commands `{org}:pilot:{runId}:EXECUTE:v1`)
        ↓
for each unresolved requirement:
  gatherPlannerInput (state + network port)
  planResolution
  record selected route + reason
        ↓
  if supplier_request and no active request: preflight then SEND_REQUEST
        ↓
grouped outreach OR reuse/authorization/human_review/explained_unresolved
        ↓
claim.ready → propagateReadyClaim (same tenant)
        ↓
findReusableClaimsForRequirement (cross-tenant, never copy claims)
```

Import never starts this loop. `OPEN_REQUIREMENT planOnly` stops at DETECTED. `PilotRun.executionStartedAt` is the measurement clock for time-to-resolution; `completedAt` is not written on the first CTA.

### Planner order (v1, not universal)

1. existing valid claim on exact canonical subject  
2. reusable compatible claim  
3. authorization-only  
4. compatible propagated / related-subject claim  
5. existing evidence candidate  
6. internal imported document/data candidate  
7. existing active ResolutionCase  
8. supplier request  
9. alternate supplier contact  
10. upstream forwarding  
11. human review  
12. explained UNRESOLVED  

`openRequirement` uses this planner. Existing acceptance tests still pass: unknown missing property + known supplier + valid contact → supplier request.

### Preflight (before any new external send)

Does a valid compatible claim now exist? Concurrent case resolved? Authorization enough? Active request already? Can a parent/component/material claim propagate here?

If yes: **do not send**. Persist `SupplierContactAvoided` and emit `SUPPLIER_CONTACT_AVOIDED`.

### Grouping

A `RequestGroup` is a communication envelope (supplier + property + compatible scope). Each `InformationRequirement` stays independently resolvable. One supplier answer propagates; it does not become 82 domain “requests”.

### Scope

Same material name ≠ applicable. Propagation requires subject identity MATCHED, property match, scope match (`evidence.scope.id` equals the requirement subject, or an explicit compatible scope kind that is **not** “any product”), validity, trust, permission, no open conflict. `kind === "product"` no longer wildcards every subject.

### Evidence extraction

```ts
interface EvidenceExtractor {
  extract(evidence, requestedProperties): Promise<CandidateClaim[]>
}
```

Candidate ≠ READY. Domain does not import an AI SDK. P1 ships a deterministic stub (filename/extractedValue already on the record). Timeout → Needs You, not a claim.

### Readiness invariant

No P1 path marks READY because an LLM is confident, names match, another tenant has a claim, a file exists, or a supplier answered something else. All seven gates still apply.

---

## G. Analytics event model

Metrics are reconstructed from durable rows, not from React.

### PilotRun / ResolutionCohort (in the tenant engine snapshot)

```
id, organisationId, datasetId, datasetVersion, importJobId,
startedAt, completedAt,
baseline: PilotSnapshot,   // immutable
final?: PilotSnapshot,
cost?: CostTelemetry
```

`PilotSnapshot` stores counts **and** the frozen `missingRequirementIds` cohort (the denominator). Time-to-resolution is measured from `executionStartedAt` once the CTA has run.

### RequirementOutcome

```
requirementId, mechanism, claimId?, evidenceId?, recordedAt
```

Mechanisms: `ALREADY_PRESENT | NORMALIZED_EXISTING_DATA | EXISTING_CLAIM | EVIDENCE_EXTRACTION | SAME_TENANT_REUSE | CROSS_TENANT_REUSE | AUTHORIZATION | SUPPLIER_RESPONSE | UPSTREAM_RESPONSE | HUMAN_ENTRY`.

### SupplierContactAvoided

```
requirementId, caseId?, supplierActorId?, avoidedBy, claimId?, evidenceId?, timestamp
```

`avoidedBy`: `EXISTING_CLAIM | PROPAGATION | EVIDENCE_FOUND | DUPLICATE_CASE | AUTHORIZATION_ONLY | CONCURRENT_RESOLUTION`.

### Derived metrics (pure function `evaluatePilotRun`)

| Metric | Definition |
|---|---|
| Supplier Contact Avoidance Rate | missing resolved without new outreach / **initial missing cohort** |
| Autonomous Resolution Rate | resolved without human action / resolved |
| Resolution Leverage | resolved / resolution actions |
| Human Review Load | human review actions / 1,000 requirements |
| Supplier Outreach Load | unique external contacts initiated / 1,000 requirements |
| Time to Resolution | per requirement in the cohort |
| Products Unblocked | products that moved from blocked → READY |
| Evidence Reuse Rate | resolved using evidence not newly obtained |
| Propagation Multiplier | requirements resolved by propagated claim / new authoritative claims |

No fake success threshold. Compare to naïve baseline: one missing requirement → one manual request; and to grouped-by-supplier/property baseline.

Cost telemetry (approximate): extraction calls, documents, emails queued, background jobs, storage bytes, human reviews, JSONB aggregate bytes, command duration.

JSONB scale trigger remains: split only if p95 command latency or lock contention exceeds an agreed operational threshold under representative load. P1 **instruments** aggregate size and command duration; it does **not** normalize.

---

## H. UX changes

Keep SOURCE language. No generic upload spinner. No invented counts.

1. **Import** — “We're getting to know your catalogue.” Stage copy + counts from ImportJob events. Mapping correction when confidence is not High. Broken rows do not block accepted rows.
2. **Handoff** — “We've found the gaps.” Baseline numbers. Categories only after the planner has evaluated them. CTA: **Let SOURCE handle the gaps** → `executeResolutionRun`.
3. **Workboard** — DETECTED / RESOLVING / WAITING / NEEDS YOU / RESOLVED / UNRESOLVED (UNRESOLVED is its own column). Activity feed = projected domain events.
4. **Needs You** — sort by requirements unlocked × products unlocked. Minutes copy only if derived. Identity: Same / Different / Need more information + computed unlock.
5. **Product / material / supplier** — operational projections from the graph. Not CRM. Disclosure policy applies.
6. **Pilot results** — restrained analysis from `evaluatePilotRun`. Human-language sentences derived from the same numbers.
7. **Supplier portal** — still “N items need information”, grouped where the envelope is a group. Domain objects remain requirements.

Import status in the shell when a job is running: `Catalogue import running · 73%`.

---

## I. Test plan

| Suite | Assert |
|---|---|
| Import | messy headers, duplicate rows, unknown fields, partial import, idempotent re-import, provenance, tenant isolation, decimal comma, missing GTIN, invalid GTIN (warning, not invented), BOM to missing product (warning) |
| Identity | exact GTIN; MPN+manufacturer; same MPN different manufacturer; alias supplier; ambiguous; human confirm/reject; split after match; no auto-merge of uncertain |
| Propagation | one claim → many compatible reqs; different grade no; expired no; scope mismatch no; permission denied no; authorization-required ≠ READY; conflict blocks; ambiguous identity blocks |
| Contact avoidance | planned request + compatible claim READY before send → not sent + `SUPPLIER_CONTACT_AVOIDED` + requirement resolves |
| Cross-tenant | existing P0.1 isolation + reuse path in planner; revoke; expiry; no source tenant in projections |
| Metrics | fixture 100 / 40 existing / 20 reused / 10 supplier / 5 human / 25 unresolved → exact rates |
| Readiness | no P1 shortcut to READY |
| Planner | selected route recorded; engine uses planner (not only unit-tested in isolation) |
| Load (optional) | `SOURCE_P1_LOAD=1`: ~10k products / 1k suppliers / 50k BOM / 100k requirements — record durations. CI default is a smaller synthetic (hundreds of products) so the suite stays fast. |

Permanent regression fixture: **messy manufacturer** (duplicate suppliers, aliases, missing GTIN, same component different IDs, repeated materials, conflicting / expired / private evidence, confidential upstream, permission-required, non-response, wrong contact, upstream forward, one high-leverage reusable claim).

---

## J. Explicit non-goals

- Redesign the Missing Information Engine loop
- SAP/ERP APIs
- Dozens of regulations or “EU DPP COMPLETE”
- Generalized document AI platform
- Billing / price pages driven by P1 signals
- Graph database
- Normalize JSONB because 100k requirements *might* hurt
- Auto-merge uncertain identities to improve the north star
- Share pilot customer data as network knowledge because they “agreed to test”
- Fake activity, fake counts, fake hours/money saved
- CRM for suppliers
- Client-side disclosure

---

## K. Stop conditions (report, do not paper over)

Stop and surface as an architecture finding if:

- A common real-world relationship cannot be represented
- Readiness cannot decide applicability without a missing core concept
- Canonical identity needs a fundamentally different architecture
- Cross-tenant reuse would require weakening P0.1
- JSONB becomes demonstrably unusable at pilot scale (measured)
- Import would require destructive assumptions about customer data

---

## L. Implementation order (this PR)

1. This document  
2. PilotRun + outcomes + avoidance types + `evaluatePilotRun`  
3. Subject identity + mapping that is actually applied + raw records  
4. Pilot dataset + versioned generation + immutable baseline  
5. Wire planner + preflight + same-tenant propagation scope/identity/conflict  
6. Cross-tenant reuse in the execution path only via `findReusableClaimsForRequirement`  
7. Request grouping at communication layer  
8. Workboard / Needs You / product-material-supplier / pilot results from events  
9. Messy fixture + metric + import + identity + propagation + avoidance tests  
10. Instrument JSONB size / command duration; optional load fixture  

### Measurement gate (not secondary work)

The first real manufacturer file is the gate. Fixture: `fixtures/p1-manufacturer/` (German/Dutch-style CSV: artikelstamm, lieferanten, stückliste, materialien). Path: **empty tenant** → `createImportJob` → graph + requirements + frozen baseline → **zero** `SupplierRequest`s → CTA `executeResolutionRun` (idempotent) → `evaluatePilotRun` has a denominator from events.

Binary XLSX, demo-list cleanup and a synthetic 10k-run remain useful later. They are not the gate. Once one real manufacturer CSV/BOM/supplier set runs this flow without manual database edits, stop abstracting and measure.

P1 is not complete until the north-star question is answerable from persisted events.
