import { SITE_URL } from "./site";

/**
 * IndexNow (Bing and participating engines).
 * Call only when an indexable URL is created, substantially updated, or removed.
 * Do not ping on every deploy.
 *
 * Env:
 *   INDEXNOW_KEY          — shared key (also served at /indexnow-key.txt)
 *   NEXT_PUBLIC_SITE_URL  — canonical host, e.g. https://source-dpp.eu
 */
export async function submitIndexNow(urls: string[]): Promise<{ ok: boolean; status: number; body: string }> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) {
    return { ok: false, status: 0, body: "INDEXNOW_KEY is not set" };
  }
  if (urls.length === 0) {
    return { ok: false, status: 0, body: "No URLs" };
  }

  const host = new URL(SITE_URL).host;
  const payload = {
    host,
    key,
    keyLocation: `${SITE_URL}/indexnow-key.txt`,
    urlList: urls.map((url) => (url.startsWith("http") ? url : `${SITE_URL}${url}`)),
  };

  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}
