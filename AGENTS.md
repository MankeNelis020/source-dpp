# SOURCE — agent instructions

Before any architecture, domain, security, pricing, or scope change, read:

`docs/SOURCE-PRODUCT-ENGINEERING-DIRECTION-v3.md`

That file is the single source of truth (v3.0).

## Frozen

- `InformationRequirement → ResolutionCase → ResolutionAttempt(s) → Readiness Gates`
- Seven readiness gates define READY; `ready` is a projection
- COLLECT comes late; reuse-before-outreach
- Server-side confidentiality; never UI-only
- Canonical identity before propagation; no blind tenant copy
- Closed `Command` union; React is a consumer, not owner of business truth

## Not frozen

- Euro list prices (read from Stripe; demo copy may say “hypothesis”)
- First commercial vertical
- GO / PIVOT / KILL percentages

## Do not build

Blockchain, graph viz, PIM/PLM, DPP designer, marketplace, ESG dashboard, 10 ERP connectors, mobile app, AI chatbot, Supplier Pro, hardcoded price catalogue, marketing site as a substitute for the engine.

## Priority

`Security boundary → persistence → idempotency → invariants → canonical identity → resolution propagation → readiness scan → resolution planner.`

If the Missing Information Engine prototype is not in this tree, import it and lock acceptance tests before inventing a parallel domain.
