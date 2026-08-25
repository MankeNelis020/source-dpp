# SOURCE

SOURCE is a product evidence resolution layer for European manufacturers. It finds evidence gaps, retrieves existing evidence, and prepares targeted supplier requests without replacing ERP, PIM, PLM or DPP platforms.

This repository is the discovery clickable flow: public site, knowledge pages, onboarding, manufacturer workspace, and supplier magic-link portal. Identity resolution, evidence storage, and permission evaluation are demonstrated with sample data — not yet the production engines. SOURCE does not currently determine legal DPP applicability per SKU, generate a published passport, or provide legal advice.

```bash
npm install
npm run dev
npm run seo:check
```

Open [http://localhost:3000](http://localhost:3000).

| Path | Indexed? | What |
|---|---|---|
| `/` | yes | Entity home — product evidence resolution |
| `/product` `/how-it-works` `/manufacturers` `/suppliers` `/dpp-readiness` `/pricing` `/developers` | yes | Product |
| `/faq` `/resources` `/about` | yes | Boundaries and company |
| `/digital-product-passport` and children | yes | DPP knowledge hub |
| `/methodology` `/authors/source-research` `/resources/glossary` | yes | Method / glossary |
| `/signup` `/login` `/onboarding` | no | Auth / discovery |
| `/app` | no | Manufacturer workspace (demo data) |
| `/s/demo` | no | Supplier request |

Canonical public host: `https://source-dpp.eu` (override with `NEXT_PUBLIC_SITE_URL`). `source.eu` is not available.

Primary public CTA: Request an evidence assessment → `/signup`. Supplier demonstration: `/s/demo`.

We never say a claim is true. We show you how it's known. Knowledge pages are not legal advice.

## Search / AI discovery (owner actions)

These cannot be completed from the repo alone:

1. **DNS** — apex `source-dpp.eu`, HTTPS, one host (301 `www.source-dpp.eu` → apex if you use www). `source.eu` is taken; do not configure it.
2. **Google Search Console** — verify **source-dpp.eu**. Optional env: `GOOGLE_SITE_VERIFICATION`. Submit `https://source-dpp.eu/sitemap.xml`.
3. **Bing Webmaster Tools** — verify **source-dpp.eu**. Optional env: `BING_SITE_VERIFICATION`. Submit the sitemap. Enable IndexNow with `INDEXNOW_KEY` so `/indexnow-key.txt` serves the key.
4. **IndexNow** — only after a public URL is created, substantially updated, or removed:
   `INDEXNOW_KEY=… NEXT_PUBLIC_SITE_URL=https://source-dpp.eu node scripts/indexnow.mjs / /about`
   Do not ping on every deploy.
5. **Crawler policy** — public knowledge is allowed for Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, PerplexityBot, and GPTBot. `/app`, `/s/`, and auth are disallowed. GPTBot (training) is a deliberate allow of public pages so SOURCE can be cited; flip to disallow in `src/app/robots.ts` if that becomes undesirable.
6. **Analytics** — set `NEXT_PUBLIC_ANALYTICS=1` to store first-party page views in `localStorage` (`source.events`). No third-party tags ship by default. Add a consent path before any cookie tracker.
7. **`llms.txt`** — experimental pointer file at `/llms.txt`. HTML, sitemap, and robots remain authoritative.

`npm run seo:check` validates unique catalog titles and query-map paths.
