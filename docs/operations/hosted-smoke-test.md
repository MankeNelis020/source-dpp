# Hosted smoke test

Use this instead of ad-hoc curl against dashboards.

```bash
SMOKE_BASE_URL=https://<preview>.vercel.app npm run smoke:preview
```

Optional:

```bash
CRON_SECRET=… \
SMOKE_EMAIL_TO=you@allow-listed.example \
SMOKE_BASE_URL=https://<preview>.vercel.app \
npm run smoke:preview
```

The script never prints secrets, bearer tokens, portal tokens, DSNs, or PEMs. Each stage prints `PASS`, `FAIL`, or `SKIP`.

## What it checks

| Stage | When |
|---|---|
| `GET /api/health` | Always |
| `GET /api/internal/health` | `CRON_SECRET` set |
| `POST /api/internal/email/test` | Preview only, plus `CRON_SECRET` and `SMOKE_EMAIL_TO` |

Production is refused unless `SMOKE_ALLOW_PRODUCTION=1`. Even then the email test is skipped.

The internal email test uses `/s/test-not-a-grant` on purpose. Failure of that portal URL is not a product defect.

## Not covered (needs a browser / Niel)

- Sign up / login
- Catalogue upload
- “Let SOURCE handle the gaps”
- Real supplier portal grant
- Resend webhook delivery events
- Inbound receiving

See `docs/architecture/supplier-loop.md`.
