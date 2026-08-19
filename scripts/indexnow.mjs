#!/usr/bin/env node
/**
 * Submit IndexNow for listed URLs. Do not run on every deploy.
 *
 *   INDEXNOW_KEY=... NEXT_PUBLIC_SITE_URL=https://source-dpp.eu node scripts/indexnow.mjs / /about
 */
const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://source-dpp.eu").replace(/\/$/, "");
const key = process.env.INDEXNOW_KEY;
const urls = process.argv.slice(2);

if (!key) {
  console.error("INDEXNOW_KEY is not set");
  process.exit(1);
}
if (!urls.length) {
  console.error("Pass one or more paths, e.g. / /about");
  process.exit(1);
}

const host = new URL(site).host;
const payload = {
  host,
  key,
  keyLocation: `${site}/indexnow-key.txt`,
  urlList: urls.map((url) => (url.startsWith("http") ? url : `${site}${url === "/" ? "/" : url}`)),
};

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});
const body = await response.text();
console.log({ ok: response.ok, status: response.status, body });
if (!response.ok && response.status !== 202 && response.status !== 200) process.exit(1);
