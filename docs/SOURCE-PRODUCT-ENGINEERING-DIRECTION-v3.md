# SOURCE — Product & Engineering Direction v3.0

**Status:** canonical Cursor-update document  
**Audience:** Cursor agents and humans working in this repository  
**Date:** 2026-08-17  
**Scope:** product category, domain invariants, security/P0 architecture, what to build now, and how real manufacturer data decides GO / PIVOT / KILL

This document is the single source of truth for SOURCE. It is not a feature wishlist. It is a decision record.

---

## How to read this document

Every claim below is tagged. Do not collapse these categories.

| Tag | Meaning |
| --- | --- |
| **ZEKER** | We treat this as known. Do not reopen without new evidence. |
| **GEEN DIFFERENTIATOR** | Exists at established competitors. Functionally necessary later, but not our moat, marketing, or first-build centre. |
| **HYPOTHESE** | Must be validated with real manufacturer data. Architecture may support it; do not ship as proven fact. |
| **BEVRIEZEN** | Product/technical principle. Cursor may not weaken, rename-away, or invert this without an explicit human decision. |
| **BEHOUDEN** | Domain thinking / semantics from the Missing Information Engine prototype. Keep the meaning. Migrate the execution. |
| **P0** | Production-blocking gap. Current demo must not become production until this is closed. |
| **NU BOUWEN** | In scope for this development phase. |
| **NIET BOUWEN** | Out of scope until an explicit decision. |
| **VALIDATIE** | How we decide GO / PIVOT / KILL. Not a build ticket. |

**Frozen (do not treat as optional):**

1. `InformationRequirement → ResolutionCase → ResolutionAttempt(s) → Readiness Gates`
2. Seven readiness gates as the definition of READY
3. Failure-first resolution (COLLECT comes late)
4. Server-side confidentiality (never UI-only)
5. Canonical identity before any propagation
6. Reuse-before-outreach: never create new supplier work when a permitted path with equal or greater trust already exists

**Not frozen (hypotheses, not contracts):**

- Absolute euro prices (`€99` / `€249` / `€599` / `€999`)
- The first commercial vertical (industrial / construction / furniture)
- Exact GO/PIVOT/KILL percentages
- Cookiebot-style packaging details

**Pricing rule:** list prices, intervals, and entitlements come from the Stripe connection. The UI may show a pricing *hypothesis* for demos. Do not hardcode a price catalogue as business truth.

---

## 0. Current repository fact

**ZEKER.** This repository (`MankeNelis020/source-dpp`) is currently a greenfield checkout: `README.md` only. There is no in-tree engine, no acceptance-test suite, and no persistence layer here yet.

That does **not** licence a rewrite from scratch of the domain. The Missing Information Engine prototype (closed `Command` union, readiness gates, resolution cases, attempt chain, escalation policies, cycle detection, unhappy flows, in-memory demo store, React as mutation owner) is the semantic baseline. If that prototype lives on another branch or repo, **import it first**, then migrate. Do not invent a parallel model.

Until the prototype is in this tree, P0 items in sections 12–20 and 33 are all open gaps. The preservation rules in sections 3, 4, 11, 16, 35 and 36 still apply.

---

## 1. Executive decision

**ZEKER + BEVRIEZEN.**

SOURCE wordt niet gebouwd als generiek DPP-platform, supplier-portal of supply-chain mapping tool.

**Product category**

> **SOURCE — The Missing Information Engine**

**Core promise**

> **We find what's missing. Then we resolve it.**

**Initial commercial wedge — HYPOTHESE**

> Betaalbare DPP/data-readiness voor Europese industriële MKB-fabrikanten, zonder enterprise-complexiteit.

**ZEKER.** DPP is de **eerste urgente use-case**, niet de uiteindelijke technische begrenzing van SOURCE.

Intern:

> Requirement-resolution engine for product information.

Extern, DPP landing:

> Digital Product Passports without enterprise complexity.

Sub:

> Upload your products. SOURCE finds what's missing, reuses what already exists and only contacts suppliers when it has to.

---

## 2. Wat onderzoek heeft veranderd

### 2.1 Niet langer als moat behandelen — GEEN DIFFERENTIATOR

Deze capabilities bestaan al bij gevestigde concurrenten. Ze blijven later functioneel noodzakelijk, maar **mogen niet centraal staan in differentiatie, marketing, of de eerste architectuur-investering**:

- supplier outreach
- automatic reminders
- supplier portals
- Ask My Supplier
- cascading / n-tier collection
- raw-material mapping
- evidence collection
- cross-customer supplier-data reuse *as a marketing claim* (the *engine* for permitted reuse is our hypothesis; the *feature category* is not unique)
- DPP publishing
- supply-chain graphs

**NIET BOUWEN as centrepiece.** Build the minimum later, behind the resolution engine, not instead of it.

### 2.2 Nieuwe differentiatiehypothese — HYPOTHESE + BEVRIEZEN (productregel)

SOURCE probeert niet supplierdata beter te verzamelen.

SOURCE probeert te voorkomen dat supplierdata **onnodig opnieuw verzameld moet worden**.

**Productregel (BEVRIEZEN):**

> **Never ask a supplier for information SOURCE can already resolve.**

Engineering-invariant (section 39) is the testable form of this rule.

### 2.3 Concurrentiepositie — ZEKER (wat we niet claimen) + HYPOTHESE (waar we op winnen)

Niet claimen:

- Nobody does supplier data collection.
- First supply-chain network.
- First DPP for SMEs.

Wel testen:

> Can SOURCE achieve materially higher autonomous resolution and supplier-contact avoidance than campaign-centric compliance tools?

Reference competitors (context, not a build list):

| Competitor | They already own |
| --- | --- |
| Circularise | supplier collection / privacy |
| Sourcemap | n-tier discovery |
| Assent | compliance / supplier engagement |
| IntegrityNext | supplier network / reuse |

SOURCE must try to win on **simplicity + autonomous resolution + transparent SME pricing**. Pricing transparency is a commercial hypothesis; the resolution engine is the product bet.

---

## 3. Het centrale domeinmodel — BEVRIEZEN + BEHOUDEN

```text
InformationRequirement
        ↓
ResolutionCase
        ↓
ResolutionAttempt(s)
        ↓
Readiness Gates
        ↓
READY / UNRESOLVED
```

`Request` blijft nadrukkelijk **één mogelijke ResolutionAttempt**.

Niet het centrale businessobject.

Een requirement definieert:

```text
subject
property
purpose
dataset
required trust level
required permission level
deadline
```

Een ResolutionCase probeert vervolgens de goedkoopste, snelste en veiligste route naar resolution te vinden.

---

## 4. Readiness — BEVRIEZEN

Een waarde is niet READY omdat een veld gevuld is.

SOURCE beoordeelt minimaal:

```text
IDENTITY      ✓/✕
VALUE         ✓/✕
EVIDENCE      ✓/✕
SCOPE         ✓/✕
VALIDITY      ✓/✕
PERMISSION    ✓/✕
CONFLICT      ✓/✕
```

Alle zeven gates moeten slagen.

UI moet altijd kunnen beantwoorden:

> **Why isn't this ready?**

`ready` mag als cache/projection bestaan, maar niet als zelfstandige business truth.

### Verplichte invariant-test — P0 + NU BOUWEN

Na iedere state-mutating command:

```text
claim.ready === caseReadiness(currentState, claim.caseId).ready
```

voor alle affected claims.

CI moet falen zodra dit niet klopt.

---

## 5. De Missing Information Engine — BEVRIEZEN

Primaire loop:

```text
DETECT
   ↓
SEARCH
   ↓
MATCH
   ↓
REUSE
   ↓
AUTHORIZE
   ↓
COLLECT
   ↓
ESCALATE
   ↓
VERIFY
   ↓
RETURN
   ↓
MAINTAIN
```

**COLLECT komt bewust laat.**

Een nieuwe missing requirement mag niet onmiddellijk een supplier request genereren.

---

## 6. Resolution strategy order — BEVRIEZEN (volgorde) + HYPOTHESE (latere strategies)

Voor ieder InformationRequirement probeert SOURCE, in deze volgorde:

| # | Strategy | Now |
| --- | --- | --- |
| 1 | Existing exact claim | **NU BOUWEN** |
| 2 | Existing evidence | **NU BOUWEN** |
| 3 | Cross-product propagation | **NU BOUWEN** (canonical identity required) |
| 4 | Cross-customer propagation | **NU BOUWEN** (permission layer required; no blind copy) |
| 5 | Authorization-only | **NU BOUWEN** |
| 6 | Internal document resolution | **P1** |
| 7 | Public/connected source candidate | **P2** — later, when trustworthy enough |
| 8 | Supplier request | **P1** — only after 1–5 fail |
| 9 | Alternative contact | **P1** (unhappy flow) |
| 10 | Upstream forwarding | **P1** (unhappy flow) |
| 11 | Human resolution | **P1** |
| 12 | Explained UNRESOLVED | **NU BOUWEN** (must exist; never silent failure) |

---

## 7. Resolution Propagation Engine — NU BOUWEN (P0)

Wanneer een claim READY wordt:

```text
claim.ready
     ↓
Find compatible OPEN InformationRequirements
     ↓
Identity match
Property match
Scope match
Validity match
Evidence level match
Permission evaluation
Conflict evaluation
     ↓
Propagate where safe
```

Voorbeeld:

```text
Supplier Z
Frame F881
Recycled content = 67%
Evidence valid
```

Open requirements:

```text
Customer A / F881 → current case
Customer B / F881 → pending
Customer C / F881 → pending
Customer D / F882 → unrelated
Customer E / F881 → permission restricted
```

Resultaat:

```text
A → READY
B → READY
C → AUTHORIZATION_REQUIRED
D → unchanged
E → restricted
```

**BEVRIEZEN:** geen blind tenant-to-tenant kopiëren.

---

## 8. Canonical identity — BEVRIEZEN + P0

Propagation mag nooit plaatsvinden op basis van alleen:

```text
product_name === "Frame X"
```

SOURCE heeft canonical entities nodig:

```text
SRC:CMP:829172
```

met mappings:

```text
Customer A SKU → FR-1288
Customer B SKU → FRAME-A2
Supplier MPN   → ALF881
GTIN           → ...
```

Alle externe identifiers verwijzen naar hetzelfde canonical subject.

Matching kent minimaal:

`EXACT` · `HIGH_CONFIDENCE` · `REVIEW_REQUIRED` · `REJECTED`

Onzekere identity: **no propagation.** Precision boven recall.

---

## 9. Resolution Planner — P1 (deterministic v1)

Dit is de belangrijkste toekomstige intelligence-laag. **V1 is geen ML.**

Per unresolved requirement moet SOURCE mogelijke resolution paths kunnen beoordelen. Bijvoorbeeld:

```text
OPTION A
Existing evidence + authorization
Expected time: 1 day
Human effort: low
Confidence: 97%

OPTION B
Supplier request
Expected time: 8 days
Human effort: medium
Historical response probability: 72%

OPTION C
Existing PDF candidate
Expected time: immediate
Scope confidence: 81%
Human review required
```

SOURCE kiest/adviseert:

> **Recommended: request authorization for existing evidence.**

Begin with deterministic rules. Numbers in the example are illustrative, not calibrated.

---

## 10. Network Unlock Value — P1 + HYPOTHESE (metric)

Prioriteitsmetric:

> Hoeveel open requirements kunnen mogelijk worden opgelost door één actie?

Voorbeeld (illustratief):

```text
Request A → potentially unlocks 3 requirements
Request B → potentially unlocks 417 requirements across 23 manufacturers
```

B krijgt hogere priority.

### Resolution Leverage

```text
potential_requirements_unlocked
÷
required_resolution_actions
```

Do not fake this metric on demo data and present it as traction.

---

## 11. Unhappy flows — BEHOUDEN

De vijftien MVP flows blijven first-class. Dit is **product robustness, niet onze moat.**

1. No response
2. Wrong contact
3. I don't know
4. Ask my supplier
5. Confidential upstream
6. Declined
7. Evidence missing
8. Evidence expired
9. Value/evidence conflict
10. Identity uncertain
11. Authorization required
12. Permission denied
13. Supplier unreachable
14. Manual escalation
15. Explained unresolved

---

## 12. P0 SECURITY — huidige demo mag niet production worden

**P0.** Confidentiality die alleen in de UI bestaat, is niet acceptabel voor production.

### P0-A — Server authorization boundary

De volledige `EngineState` mag nooit naar de browser.

Model:

```text
User
 ↓
Organisation
 ↓
Membership
 ↓
Role
 ↓
Policy
 ↓
Scoped Query / Command
```

Elke query server-side scoped.

---

## 13. Supplier magic links — P0

Huidige `/s/[token]` filtering in React vervangen.

Token wordt een echte server-side capability.

```text
SupplierPortalGrant

token_hash
actor_id
case_ids[]
allowed_requirement_ids[]
allowed_commands[]
expires_at
revoked_at
```

Browser ontvangt uitsluitend toegestane data.

Een supplier mag via DevTools **nooit** andere tenants, cases, actors of confidential relationships kunnen verkrijgen.

---

## 14. Confidential upstream — P0

Visibility moet datalaag-policy worden.

```text
relationship_visibility:

FULL
IDENTITY_HIDDEN
EVIDENCE_HIDDEN
VERIFICATION_ONLY
RESTRICTED_TO_CUSTOMER
RESTRICTED_TO_PURPOSE
```

Server bepaalt per principal welke representation terugkomt. Niet React.

---

## 15. P0 — Idempotency

Iedere command krijgt:

```text
command_id
tenant_id
actor_id
issued_at
idempotency_key
```

Processed commands worden persistent geregistreerd.

Bij dubbele `SEND_REMINDER` met dezelfde `idempotency_key`:

```text
first  → SENT
second → ALREADY_PROCESSED
```

Geen dubbele side effects.

---

## 16. P0 — Command authorization — BEHOUDEN (union) + NU BOUWEN (server check)

De bestaande gesloten `Command` union behouden.

De server moet naast “is dit een geldig command?” ook controleren:

> **Mag deze principal dit command op dit object uitvoeren?**

Voorbeeld supplier:

```text
SUBMIT_RESPONSE        ✓
FORWARD_UPSTREAM       ✓
DECLINE                ✓
GRANT_PERMISSION       ? afhankelijk van policy
RESOLVE_CONFLICT       ✕
MARK_READY             ✕
```

---

## 17. Event-driven side effects — P0/P1

Business-state en side-effects scheiden.

Command `SEND_REQUEST` produceert `request.queued`.

Background worker:

```text
request.queued
→ email provider
→ request.sent
```

Retries moeten veilig zijn.

Niet direct mail versturen vanuit UI/reducer.

**P2:** production email provider. **NU:** abstraction + durable queue contract. In-process/dev transport is acceptable if retries are idempotent.

---

## 18. Durable workflows — P1 (abstraction) / P2 (production)

Processen duren dagen/weken.

```text
Send request
↓
wait 3 days
↓
no response?
↓
reminder
↓
wait 4 days
↓
secondary contact
↓
wait
↓
procurement escalation
```

Workflow moet deployments/restarts overleven.

De huidige escalation policy is de domeinbasis. **BEHOUDEN** de policy-semantiek; vervang de in-memory timer.

---

## 19. Persistence — P0

De huidige in-memory store is development/demo-only.

Production minimaal:

```text
organisations
users
memberships

canonical_actors
actor_aliases
canonical_subjects
subject_aliases
relationships

datasets
information_requirements
resolution_cases
resolution_attempts

claims
claim_versions
evidence
evidence_scopes

permissions
permission_events

commands
domain_events
tasks
workflow_instances

audit_events
```

Multi-tenancy vanaf dag één.

---

## 20. Tenant ownership versus network knowledge — BEVRIEZEN

Niet alle SOURCE-data is tenant-owned.

### Tenant-private layer

ERP identifiers · private supplier relations · private evidence · private notes

### Network canonical layer

canonical company identity · canonical product/component identity · public identifiers · shareable claims/evidence metadata

### Permission layer

bepaalt welke tenant welke netwerkdata mag consumeren.

**Geen cross-tenant queries zonder policy evaluation.**

---

## 21. Data provenance — BEVRIEZEN

Iedere resolved value moet herleidbaar zijn:

```text
InformationRequirement
↓
ResolutionCase
↓
ResolutionAttempt
↓
Claim
↓
Evidence
↓
Actor
↓
Permission
↓
Downstream output
```

Nooit provenance verliezen door propagation.

Customer B krijgt niet: “claim copied from Customer A.”

Customer B krijgt: “requirement resolved using Claim X, whose provenance/permission permits Customer B.”

---

## 22. Pricing architecture — HYPOTHESE (ICP) + ZEKER (waar we geld aan verdienen)

SOURCE richt zich voorlopig niet op Fortune 500 enterprise.

**ICP — HYPOTHESE, te valideren, niet bevriezen:**

> Europese industriële MKB-fabrikanten met ongeveer 20–250 medewerkers, 10–100 suppliers en materiaal/component-heavy fysieke producten.

**Research priority (not a locked first vertical):**

1. industrial / metal-heavy manufacturing
2. construction products
3. furniture as a second wave

Textile bewust niet eerste wedge vanwege hoge DPP-softwareconcurrentie. That is a research choice, not a market proof.

**ZEKER.** DPP generation zelf wordt commodity. SOURCE verdient geld aan **data readiness + resolution**.

---

## 23. Commercial model — HYPOTHESE

Doelbeeld (niet implementeren als definitieve pricing):

- transparante pricing
- self-service
- geen verplichte salescall
- geen implementation fee
- monthly/annual
- suppliers gratis
- ruime/unlimited interne users
- pricing vooral naar product/supplier footprint

**Illustratieve packaging (demo only):**

```text
FREE       Readiness Scan     €0
STARTER                       Stripe
GROWTH                        Stripe
SCALE                         Stripe
BUSINESS                      Stripe
ENTERPRISE                    Custom
```

The euro amounts previously discussed (`~€99 / ~€249 / ~€599 / ~€999`) are **internal hypotheses**. They are not product contracts.

**Implementation rule:** prices, billing intervals, trial flags, and plan entitlements are read from **Stripe**. Do not duplicate a hardcoded catalogue in app config as source of truth. If Stripe is not connected in this environment, show “pricing hypothesis / demo” copy and keep amounts out of domain logic.

UI mag dit voorlopig als pricing hypothesis/demo gebruiken.

---

## 24. Free Readiness Scan — P1 (na P0 engine)

Belangrijkste acquisition-loop.

Prospect uploadt CSV / Excel, eventueel documenten.

SOURCE rapporteert bijvoorbeeld (illustratief):

```text
2,841 products analysed
18,421 requirements checked

61% READY

7,182 unresolved
2,941 potentially reusable
841 authorization-only
3,400 supplier action required
```

CTA:

> **Resolve with SOURCE**

Do not build this before the engine can compute readiness without lying.

---

## 25. Supplier pricing — HYPOTHESE + NIET BOUWEN (Pro)

Supplier participation: **FREE**.

Geen betaling om een customer request te beantwoorden.

Voor een eenvoudige response: **geen account verplicht.** Magic link.

Supplier account optioneel/gratis.

Langetermijnmogelijkheid: supplier workspace waarin één antwoord aan meerdere authorized customers kan worden hergebruikt.

**NIET BOUWEN:** Supplier Pro monetization.

---

## 26. DPP publishing — commodity output, geen design platform — P1 (basic) / NIET BOUWEN (designer)

We bouwen SOURCE **niet als DPP design platform**.

Voor SME's moet de flow wel eindigen:

```text
READY
↓
Generate structured DPP dataset
↓
API / JSON / export
↓
basic hosted passport
↓
QR identifier
```

Geen uitgebreide page builder. Geen design suite. Geen marketing-DPP.

---

## 27. Regulatory architecture — BEVRIEZEN

Geen ESPR-regels hardcoderen in businesslogic.

Dataset-driven:

```text
Dataset
DatasetVersion
RequirementDefinition
ApplicabilityRule
TrustRequirement
EvidenceRequirement
EffectiveFrom
EffectiveUntil
```

Daardoor kan SOURCE later ook CPR, customer-specific datasets, retailer requirements, en REACH/RoHS-adjacent use-cases ondersteunen. **Later = P2.** V1 needs one dataset that can version. Not dozens of regulations.

---

## 28. Initial regulatory wedge — HYPOTHESE

Niet claimen: “Every company needs a DPP now.”

Wel: DPP-eisen worden per productgroep via delegated acts concreet.

Validation richten op sectoren waar timing + materiaalcomplexiteit aantrekkelijk *lijken*. Current research priority: industrial / metal-heavy, construction products, daarna furniture. Not frozen.

---

## 29. Metrics — BEVRIEZEN (wat we meten) + HYPOTHESE (targets)

Niet optimaliseren op: requests sent.

Primaire productmetrics:

| Metric | Definition |
| --- | --- |
| Autonomous Resolution Rate | requirements resolved without human intervention / total resolved |
| Supplier Contact Avoidance Rate | resolved without new supplier outreach / initially considered missing |
| Time to Resolution | — |
| Cost per Resolution | — |
| Products Unblocked | — |
| Resolution Leverage | section 10 |
| Reuse Rate | — |
| Authorization-only Resolution Rate | — |
| Human Minutes / 1,000 Requirements | — |

---

## 30. North-star — BEVRIEZEN

# **Resolved Missing Information**

Met context (illustratief, geen KPI-contract):

```text
18,421 missing requirements detected
14,817 resolved
11,204 resolved without supplier contact
3,613 supplier-assisted
482 human review
713 products unlocked
```

---

## 31. Validation before scale — VALIDATIE

**Niet eerst een volledig production SaaS bouwen.**

Pilot (indicatief, niet een quota om naartoe te coderen):

- 10 industrial / metaalbedrijven
- 10 construction-product manufacturers
- 10 furniture manufacturers

Per bedrijf echte BOM/catalogus, suppliers, existing documents, certificates importeren.

Meten:

```text
requirements
already available
document-resolvable
cross-product reusable
cross-customer reusable
authorization-only
supplier-required
upstream-required
unresolved
```

---

## 32. GO / PIVOT / KILL — VALIDATIE + HYPOTHESE

Hypothese:

> SOURCE moet een materieel deel van apparent missing information kunnen oplossen zonder nieuwe supplier outreach.

Indicatieve interne beslisregel — **geen bewezen marktbenchmark**:

| Signal | Supplier Contact Avoidance |
| --- | --- |
| Strong GO | ≥ 40–50% **and** improvement as network knowledge grows |
| Investigate / Pivot | 20–40%, afhankelijk van willingness-to-pay en resolution cost |
| Serious KILL / PIVOT | < 20% **and** klanten moeten alsnog vrijwel iedere supplier benaderen |

Do not encode these percentages as product logic. They are a review rubric for humans after pilots.

---

## 33. Wat Cursor NU moet bouwen

### P0 — NU BOUWEN

1. Server-side persistence architecture
2. Multi-tenant auth boundary
3. Supplier capability-token authorization
4. Server-side confidentiality policies
5. Command idempotency
6. Readiness invariant tests
7. Resolution Propagation Engine
8. Canonical identity foundation
9. Event/audit persistence
10. Seed/test isolation

### P1 — na P0, nog deze fase

11. Resolution Planner v1 — deterministic rules
12. Resolution leverage calculation
13. Readiness Scan import
14. CSV/BOM importer
15. document ingestion pipeline
16. supplier contact model
17. background workflow abstraction
18. basic structured DPP export

### P2 — alleen na validation — NIET BOUWEN now

ERP connectors · PIM connectors · billing (beyond Stripe-backed hypothesis UI) · production email provider · advanced AI extraction · public evidence discovery · SSO · enterprise features

---

## 34. Wat Cursor NIET moet bouwen

Tot expliciete beslissing:

- blockchain
- complex graph visualization
- generic PIM
- PLM
- fancy DPP designer
- marketplace
- ESG dashboard
- supplier scoring marketplace
- dozens of regulations
- 10 ERP connectors
- mobile app
- AI chatbot
- complex analytics
- enterprise procurement features
- Supplier Pro
- hardcoded price catalogue
- marketing site / Cookiebot clone as a substitute for the engine

**Depth before breadth.**

---

## 35. Repository principle — BEHOUDEN / migreren

De huidige state machine is **niet wegwerpcode qua domeindenken**. De in-memory uitvoering is wel demo-infrastructuur.

**Behouden:**

```text
types
commands
readiness gates
resolution cases
attempt chain
escalation policies
cycle detection
acceptance-test semantics
unhappy flows (section 11)
closed Command union
```

**Migreren:**

```text
in-memory state
→
persistent server domain/application layer
```

React wordt consumer. Niet eigenaar van business truth.

If the prototype is not yet in this repository: import it, lock acceptance tests, then migrate. Do not start with a greenfield domain that rhymes with this document but diverges in names or gates.

---

## 36. Migration rule — BEVRIEZEN

Niet big-bang herschrijven.

Per command:

1. bestaande behavior vastleggen in acceptance test
2. server implementation maken
3. authorization toevoegen
4. persistence toevoegen
5. idempotency toevoegen
6. oude client mutation verwijderen
7. bestaande acceptance semantics behouden

Zo beschermen we wat al goed gebouwd is.

---

## 37. Definition of Done voor production command — BEVRIEZEN

Een command is pas production-ready wanneer:

```text
✓ authenticated
✓ authorized
✓ tenant-scoped
✓ validated
✓ idempotent
✓ transactional
✓ audited
✓ side-effects retry-safe
✓ tests aanwezig
```

---

## 38. Security invariant — P0 + BEVRIEZEN

> **No principal can infer the existence, identity or confidential metadata of an actor, relationship, evidence item, claim or case for which it lacks access.**

Niet alleen: “API geeft geen volledige record.”

Ook geen, waar praktisch relevant:

- different error messages
- counts
- IDs
- autocomplete leaks
- search results
- timing-dependent obvious leaks

---

## 39. Product invariant — BEVRIEZEN

> **SOURCE must never create new supplier work when an existing permitted resolution path is available with equal or greater trust.**

Treat this as a unit-testable design principle.

---

## 40. Network invariant — BEVRIEZEN

> **New information triggers resolution search, not blind propagation.**

```text
new READY claim
→ find candidates
→ evaluate identity / scope / trust / permission
→ resolve compatible requirements
```

Niet: copy claim to tenants.

---

## 41. UX invariant — BEVRIEZEN

De gebruiker ziet geen complexe state-machine als dat niet nodig is.

| Technical | UI |
| --- | --- |
| `EVIDENCE_SCOPE_MISMATCH` | This certificate doesn't cover the factory that made this product. |
| `AUTHORIZATION_REQUIRED` | We already found the information. The supplier only needs to allow its use for your company. |

Technisch rijk. Menselijk simpel.

---

## 42. Positionering

Covered in section 1. Do not add a second positioning. Intern = requirement-resolution engine. Extern = Missing Information Engine. DPP = first urgent use-case, not the product name of the architecture.

---

## 43. Concurrentiepositie

Covered in section 2.3. Repeat for Cursor: do not implement competitor feature checklists.

---

## 44. De kernvraag voor iedere engineeringbeslissing — BEVRIEZEN

Voor iedere feature:

> **Does this help SOURCE resolve missing information with less human or supplier effort?**

Ja → overwegen.  
Nee → waarschijnlijk niet bouwen.

---

## 45. Einddoel van deze ontwikkelfase — BEVRIEZEN

Niet: production-ready DPP SaaS.

Maar:

# **A production-safe Resolution Engine capable of proving or falsifying the SOURCE business hypothesis using real manufacturer data.**

Dat onderscheid is cruciaal.

---

## 46. Audit of this repository against sections 12–20 and 33–40

**As of this document’s date, in `source-dpp`:**

| Area | Section | Status |
| --- | --- | --- |
| Server authorization boundary | 12 | **Missing** — no server, no `EngineState` split |
| Supplier capability tokens | 13 | **Missing** — no `/s/[token]` to replace yet in this tree |
| Confidentiality policies | 14 | **Missing** |
| Idempotency | 15 | **Missing** |
| Command authorization | 16 | **Missing** — closed `Command` union not in this tree |
| Event-driven side effects | 17 | **Missing** |
| Durable workflows | 18 | **Missing** |
| Persistence | 19 | **Missing** |
| Tenant vs network layers | 20 | **Missing** |
| Readiness invariant tests | 4, 33.6 | **Missing** |
| Propagation engine | 7, 33.7 | **Missing** |
| Canonical identity | 8, 33.8 | **Missing** |
| Event/audit persistence | 33.9 | **Missing** |
| Seed/test isolation | 33.10 | **Missing** |
| Security / product / network / UX invariants | 38–41 | **Not encoded** |

**Implication:** the first implementation plan is (1) locate or import the prototype and its acceptance tests, (2) freeze semantics, (3) migrate command-by-command per section 36, in the priority order below. Do not add a marketing site, Stripe-hardcoded pricing, or DPP designer while this table is red.

**Migration risks to name before coding:**

- Prototype React currently owns mutations → dual-write / semantic drift if client is not stripped per command
- In-memory global store → leaked state across tests and tenants
- Magic links as security theatre → any persistence without capability tokens recreates the audit failure
- Cross-tenant reuse without canonical identity → silent wrong READY
- Copying claims across tenants → provenance and confidentiality violation

**Schema work before architecture changes:** write the persistence sketch (section 19) as a migration document with tenant_id on every tenant-private row, and a separate canonical/permission layer. No production writes until that sketch is reviewed against sections 20, 21, 38 and 40.

---

## Cursor execution instruction

**Do not interpret this document as permission to implement every section immediately. Start by auditing the current branch against sections 12–20 and 33–40. Produce an implementation plan that preserves existing passing acceptance-test semantics. Identify schema changes, security boundaries, migration risks and tests before modifying production architecture. Do not add unrelated features.**

**Priority order:**

`Security boundary → persistence → idempotency → invariants → canonical identity → resolution propagation → readiness scan → resolution planner.`

**The goal is not feature count. The goal is to turn the current Missing Information Engine prototype into a secure architecture capable of testing whether autonomous information resolution is commercially real.**

If the prototype is not in this repository, the first step is import + lock tests, not a new engine with new names.
