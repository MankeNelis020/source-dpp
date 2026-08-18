# Auth and organisations

Supabase Auth authenticates the human. SOURCE authorizes the human.

```text
Supabase Auth
→ authenticated user id
→ SOURCE profile (`users`)
→ organisation membership
→ role → capabilities
→ SOURCE server authorization
```

Never authorize from `user_metadata.organisation_id`, `user_metadata.role`, or `user_metadata.is_admin`. Those fields may be user-editable. Membership lives in SOURCE-controlled Postgres.

React may use the Auth SDK for session primitives only. Domain data still goes through SOURCE APIs. The runtime role remains `source_app` with `SET LOCAL source.organisation_id`. `SUPABASE_SERVICE_ROLE_KEY` is isolated in `SupabaseObjectStorage` and is never used to authorize user behavior.

The Missing Information Engine is unchanged:

`InformationRequirement → ResolutionCase → ResolutionAttempt(s) → Readiness → READY | UNRESOLVED`

A supplier request remains one attempt. `/s/*` stays capability-token authenticated and does not require SOURCE login.

---

## CURRENT (what this PR uses)

| Piece | Owner |
|---|---|
| `auth.users` | Supabase Auth |
| `users` (profile) | SOURCE |
| `organisations` | SOURCE |
| `memberships` (`ACTIVE` \| `SUSPENDED`) | SOURCE |
| `organisation_invitations` (hash only) | SOURCE |
| `identity_commands` | SOURCE (create-org idempotency) |
| `IdentityProvider` | `SupabaseIdentityProvider` or `TestIdentityProvider` |
| Active org cookie `source_organisation` | Signed, bound to `userId`, validated against membership |

`Principal.authenticationMethod` is `"SUPABASE"` or `"TEST"`. Unauthenticated requests have no principal. SOURCE does not manufacture an anonymous tenant.

---

## REMOVE / TEST FIXTURE / LOCAL DEMO ONLY

| Path | Classification |
|---|---|
| `POST /api/auth/login` email heuristics (`nordic` → Nordic, any email → Acme) | **REMOVE** |
| HMAC `source_session` as the production principal | **REMOVE** (file remains unused by API principal resolution) |
| Client `localStorage` session (`src/lib/session.ts`) | **REMOVE** from product flows |
| `SOURCE_DEMO_AUTH=1` preview/production fallback | **REMOVE** (ignored; preview/prod fail closed) |
| `MemoryPersistence` Acme / Nordic seed | **TEST FIXTURE ONLY** (and local `db:seed`) |
| `resolveUserPrincipal(store, "user-acme-owner", "acme")` | **TEST FIXTURE ONLY** |
| `TestIdentityProvider` (`x-source-test-identity` / `source_test_identity` cookie) | **LOCAL / CI ONLY** |
| `SOURCE_EXPOSE_INVITE_LINKS=1` | **LOCAL ONLY** — returns the invite path for tests. Never in preview/production |

Preview and production cannot set `SOURCE_IDENTITY_PROVIDER=test`. Missing `NEXT_PUBLIC_SUPABASE_ANON_KEY` fails closed.

---

## Membership and invitations

Roles: `OWNER`, `ADMIN`, `MEMBER`, `COMPLIANCE_MANAGER`, `PROCUREMENT_MANAGER`, `DATA_STEWARD`, `REVIEWER`, `AUDITOR`.

Capabilities come from `ROLE_CAPABILITIES`. OWNER/ADMIN have `organisation:manage` (invite, revoke, change role, suspend). The last active OWNER cannot demote or suspend themselves.

Invitations store `token_hash` only. Expiry defaults to `SOURCE_INVITATION_TTL_DAYS` (7). Acceptance requires the authenticated email to match. Revoke takes effect immediately.

Team invite mail is **not** sent. An `organisation.invitation` outbox row is queued for a later Resend milestone. Locally, `SOURCE_EXPOSE_INVITE_LINKS=1` may return `/invitations/<token>` for testing. Do not call supplier email logic for team invites.

---

## Target flows

```text
signup → verify email → create organisation (OWNER) → empty workspace
→ logout → login → same organisation
```

```text
OWNER/ADMIN invite → colleague signup/login/verify → accept (email match)
→ MEMBER (or invited role) in the same tenant
```

```text
Alice / Org A  ⊬  Bob / Org B
```

Cross-tenant object access returns `404 RESOURCE_UNAVAILABLE`.

---

## Supabase dashboard (Niel)

Do not paste secret keys into chat. Configure **each** project separately.

| | Development / Preview | Production |
|---|---|---|
| Project URL | `https://hhuurdzzsinzwbkkokzz.supabase.co` | `https://vezhdbzizniurehclxpg.supabase.co` |
| Site URL | Preview app URL | Production app URL |
| Redirect URLs | `{preview}/auth/callback`, `{preview}/reset-password`, `{preview}/verify-email` | `{production}/auth/callback`, `{production}/reset-password` |

Also: enable email signup, require email confirmation, set password policy as desired. Confirmation emails for the preview project must link to the preview app. Production emails must link to production. Never mix.

Auth must use the same environment's project as `SOURCE_APP_DATABASE_URL`. SOURCE fails closed if the public URL does not match the known project for that runtime.

---

## Vercel variables

Preview:

```text
SOURCE_ENV=preview
NEXT_PUBLIC_SUPABASE_URL=https://hhuurdzzsinzwbkkokzz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Preview anon key>
NEXT_PUBLIC_SOURCE_APP_URL=<Preview app URL>
SOURCE_APP_DATABASE_URL=<already B1>
SOURCE_SESSION_SECRET=<preview secret>
SOURCE_OPAQUE_REF_SECRET=<preview secret>
```

Production: same names, production URL `https://vezhdbzizniurehclxpg.supabase.co`, production anon key, production app URL, production DSNs.

Optional: `SOURCE_INVITATION_TTL_DAYS=7`.

Do not set `SOURCE_IDENTITY_PROVIDER=test` or `SOURCE_EXPOSE_INVITE_LINKS=1` on Vercel.

`SUPABASE_SERVICE_ROLE_KEY` remains unused. If added later, keep it server-only and out of Client Components.

---

## Local

Default: `IdentityProvider=test`, `Persistence=memory`.

To use DEV/PREVIEW Supabase from a laptop: set `NEXT_PUBLIC_SUPABASE_URL` (dev project), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SOURCE_IDENTITY_PROVIDER=supabase`. Do not point local development at production.

---

## CSRF and cookies

Supabase session cookies are cookie-auth. SOURCE still requires Origin/Referer on cookie mutations (`originAllowed`). Active organisation is an httpOnly `source_organisation` cookie, `Secure` in production, `SameSite=Lax`. Logout signs out of Supabase and clears SOURCE cookies. Subsequent `/api/source/*` requests are 401.

Redirect `next` values must be internal relative paths.

---

## User / organisation deletion

Not implemented.

TODO: a later privacy/offboarding flow must not cascade-delete organisation audit or business data. Suspend membership first. Organisation deletion is out of scope.

---

## Tests

CI uses `TestIdentityProvider`. It does not call live Supabase Auth.

`src/server/source/auth-organisations.test.ts` covers signup-equivalent verified users, org create, invitations, roles, owner safety, Alice/Bob isolation, and fail-closed env.

Postgres restart coverage is in `b1-runtime-persistence.test.ts`.
