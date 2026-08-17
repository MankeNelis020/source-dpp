# SOURCE

Trusted product claims infrastructure. Connect your product system. SOURCE resolves what you have, what is missing, what can be trusted and what may be reused.

This repository is the discovery clickable flow: public site, onboarding, manufacturer workspace, and supplier magic-link portal. Identity resolution, evidence storage, and permission evaluation are demonstrated with the Urban Chair 04 dataset from the product spec — not yet the production engines.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

| Path | What |
|---|---|
| `/` | Public homepage |
| `/product` `/how-it-works` `/suppliers` `/pricing` `/developers` | Marketing pages |
| `/signup` `/login` `/onboarding` | Organisation flow |
| `/app` | Manufacturer workspace (demo data) |
| `/s/demo` | Supplier request (no account wall) |

We never say a claim is true. We show you how it's known.
