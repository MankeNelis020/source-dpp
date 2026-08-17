# SOURCE

The Missing Information Engine. Connect your product system. SOURCE detects what is missing, finds who probably knows, reuses what it can, asks only for the rest, and does not stop at `REQUEST SENT`.

This repository is the discovery clickable flow: public site, onboarding, manufacturer workspace, and supplier magic-link portal. Resolution cases now cover the MVP unhappy flows — no response, wrong contact, I don't know, ask my supplier, confidential upstream, declined, missing/expired/conflicting evidence, identity uncertainty, authorization, permission denied, unreachable supplier, manual escalation, and an explicit UNRESOLVED end state.

```bash
npm install
npm run dev
npm test
```

Open [http://localhost:3000](http://localhost:3000).

| Path | What |
|---|---|
| `/` | Public homepage |
| `/product` `/how-it-works` `/suppliers` `/pricing` `/developers` | Marketing pages |
| `/signup` `/login` `/onboarding` | Organisation flow |
| `/app` | Manufacturer workspace (demo data) |
| `/app/missing` | Resolution cases — missing information |
| `/s/demo` | Supplier request (no account wall; first-class unhappy actions) |

We never say a claim is true. We show you how it's known.
