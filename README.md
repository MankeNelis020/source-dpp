# SOURCE

SOURCE is Digital Product Passport readiness software for European manufacturers, importers and private-label brands. It connects an existing product catalogue, resolves product and supplier identity, shows what evidence exists and what is missing, and helps collect that evidence from suppliers.

This repository is the discovery clickable flow: public site, knowledge pages, onboarding, manufacturer workspace, and supplier magic-link portal. Identity resolution, evidence storage, and permission evaluation are demonstrated with the Urban Chair 04 dataset — not yet the production engines. SOURCE does not currently determine legal DPP applicability per SKU, generate a published passport, or provide legal advice.

```bash
npm install
npm run dev
npm run seo:check
```

Open [http://localhost:3000](http://localhost:3000).

| Path | Indexed? | What |
|---|---|---|
| `/` | yes | Entity home |
| `/product` `/how-it-works` `/pricing` `/developers` `/suppliers` | yes | Product |
| `/digital-product-passport` and children | yes | DPP knowledge hub |
| `/about` `/methodology` `/authors/source-research` `/resources/glossary` | yes | Company / method |
| `/signup` `/login` `/onboarding` | no | Auth |
| `/app` | no | Manufacturer workspace (demo data) |
| `/s/demo` | no | Supplier request |

Canonical public host: `https://source-dpp.eu` (override with `NEXT_PUBLIC_SITE_URL`). `source.eu` is not available.

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
