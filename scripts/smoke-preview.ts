#!/usr/bin/env npx tsx
/**
 * Safe hosted Preview smoke checks. Never prints secrets or portal tokens.
 *
 * Required:
 *   SMOKE_BASE_URL           Preview origin, e.g. https://source-….vercel.app
 *
 * Optional:
 *   CRON_SECRET              Enables /api/internal/health and Preview email test
 *   SMOKE_EMAIL_TO           Allow-listed recipient for Preview email test
 *   SMOKE_ALLOW_PRODUCTION=1 Allows production origin for health-only checks
 *
 * Refuses production unless SMOKE_ALLOW_PRODUCTION=1, and then skips email test.
 */
const SECRETISH = /(secret|token|password|dsn|pem|authorization|bearer|api[_-]?key|whsec_)/i;

function mask(value: string) {
  if (!value) return "";
  if (SECRETISH.test(value)) return "[redacted]";
  if (value.includes("/s/") && value.length > 24) return value.replace(/\/s\/[A-Za-z0-9_-]+/g, "/s/[redacted]");
  return value.length > 180 ? `${value.slice(0, 180)}…` : value;
}

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function failClosed(message: string): never {
  console.log(`FAIL  ${message}`);
  process.exit(1);
}

async function stage(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failClosed(`${name}: ${mask(message)}`);
  }
}

function isProductionUrl(url: string) {
  return /source-dpp\.eu$/.test(new URL(url).hostname) && !url.includes("preview") && !url.includes("vercel.app");
}

async function main() {
  const base = env("SMOKE_BASE_URL").replace(/\/$/, "");
  if (!base) failClosed("SMOKE_BASE_URL is required.");
  const production = env("SOURCE_ENV") === "production" || isProductionUrl(base);
  if (production && env("SMOKE_ALLOW_PRODUCTION") !== "1") {
    failClosed("Refusing production. Set SMOKE_ALLOW_PRODUCTION=1 for health-only checks.");
  }

  await stage("GET /api/health", async () => {
    const response = await fetch(`${base}/api/health`);
    const body = await response.json().catch(() => ({}));
    if (response.status !== 200) throw new Error(`HTTP ${response.status} ${mask(JSON.stringify(body))}`);
    if (body.database !== "ok") throw new Error(`database=${mask(String(body.database))}`);
  });

  const cron = env("CRON_SECRET");
  if (cron) {
    await stage("GET /api/internal/health", async () => {
      const response = await fetch(`${base}/api/internal/health`, {
        headers: { authorization: `Bearer ${cron}` },
      });
      const body = await response.json().catch(() => ({}));
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      if (body.database !== "ok" && body.database !== undefined) throw new Error(`database=${mask(String(body.database))}`);
    });
  } else {
    console.log("SKIP  GET /api/internal/health (CRON_SECRET unset)");
  }

  const to = env("SMOKE_EMAIL_TO");
  if (production) {
    console.log("SKIP  POST /api/internal/email/test (production)");
  } else if (!cron || !to) {
    console.log("SKIP  POST /api/internal/email/test (CRON_SECRET or SMOKE_EMAIL_TO unset)");
  } else {
    await stage("POST /api/internal/email/test", async () => {
      const response = await fetch(`${base}/api/internal/email/test`, {
        method: "POST",
        headers: { authorization: `Bearer ${cron}`, "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      if (!body.provider) throw new Error("provider missing");
      console.log(`      provider=${mask(String(body.provider))}`);
    });
  }

  console.log("DONE  smoke:preview");
}

void main();
