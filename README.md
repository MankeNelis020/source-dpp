# SOURCE

The Missing Information Engine. We find what's missing. Then we resolve it.

Canonical product & engineering direction:

**[docs/SOURCE-PRODUCT-ENGINEERING-DIRECTION-v3.md](docs/SOURCE-PRODUCT-ENGINEERING-DIRECTION-v3.md)**

Read that document before changing architecture, domain names, pricing, or scope. Pricing, if shown, comes from Stripe — do not hardcode a price catalogue as source of truth.

This repository currently contains the discovery clickable flow: public site, onboarding, manufacturer workspace, and supplier magic-link portal. Identity resolution, evidence storage, and permission evaluation are demonstrated with demo data — not yet the production engines.

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
