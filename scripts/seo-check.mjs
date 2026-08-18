#!/usr/bin/env node
/**
 * Static SEO checks against the catalog (no live crawl required).
 * Run: node scripts/seo-check.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = readFileSync(join(root, "src/lib/seo/catalog.ts"), "utf8");
const queryMap = readFileSync(join(root, "src/lib/seo/query-map.ts"), "utf8");

const paths = [...catalog.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]);
const titles = [...catalog.matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
const descriptions = [...catalog.matchAll(/description:\s*\n?\s*"([^"]+)"/g)].map((m) => m[1]);

const errors = [];

function dups(values, label) {
  const seen = new Map();
  for (const value of values) {
    seen.set(value, (seen.get(value) || 0) + 1);
  }
  for (const [value, n] of seen) {
    if (n > 1) errors.push(`Duplicate ${label}: ${value}`);
  }
}

dups(paths, "path");
dups(titles, "title");
dups(descriptions, "description");

if (titles.some((t) => t.length > 70)) {
  errors.push("A title exceeds 70 characters (review SERP truncation).");
}

const queryPaths = [...queryMap.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]);
for (const path of new Set(queryPaths)) {
  if (!paths.includes(path)) errors.push(`Query map points to missing catalog path: ${path}`);
}

if (!catalog.includes('path: "/"')) errors.push("Homepage missing from catalog.");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`seo-check ok: ${paths.length} catalog paths, ${titles.length} titles, ${queryPaths.length} query mappings`);
