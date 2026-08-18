import type { PersistencePort } from "@/infrastructure/database/ports";
import type { ImportJob, ImportJobEvent, Principal } from "@/server/source/types";
import { SourceError } from "@/server/source/types";
import { hasCapability } from "@/server/source/authorization";
import { applyCommand } from "@/domain/source/engine";

const STAGES = [
  "PARSING",
  "NORMALIZING",
  "IDENTITY_RESOLUTION",
  "RELATIONSHIP_BUILDING",
  "MATERIAL_DETECTION",
  "EVIDENCE_MATCHING",
  "REQUIREMENT_GENERATION",
  "RESOLUTION_PLANNING",
] as const;

export interface CsvBundle {
  products?: string;
  suppliers?: string;
  bom?: string;
  materials?: string;
}

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_COLS = 80;

export function neutralizeCsvFormula(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

export function assertSafeImportPayload(files: CsvBundle) {
  for (const [name, text] of Object.entries(files)) {
    if (!text) continue;
    if (Buffer.byteLength(text, "utf8") > MAX_IMPORT_BYTES) {
      throw new SourceError("VALIDATION", `Import file ${name} exceeds size limit.`, 400);
    }
    if (text.includes("\0")) {
      throw new SourceError("VALIDATION", `Import file ${name} is malformed.`, 400);
    }
    const parsed = parseCsv(text);
    if (parsed.headers.length > MAX_COLS) {
      throw new SourceError("VALIDATION", `Import file ${name} has too many columns.`, 400);
    }
    if (parsed.rows.length > MAX_ROWS) {
      throw new SourceError("VALIDATION", `Import file ${name} has too many rows.`, 400);
    }
    for (const row of parsed.rows) {
      for (const [key, value] of Object.entries(row)) {
        row[key] = neutralizeCsvFormula(value);
      }
    }
  }
}

interface Row {
  [key: string]: string;
}

export function parseCsv(text: string): { headers: string[]; rows: Row[] } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Row = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === "," && !q) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export const COLUMN_ALIASES: Record<string, string> = {
  vendorname: "supplier.name",
  supplier_id: "supplier.external_id",
  supplierid: "supplier.external_id",
  ean: "product.gtin",
  gtin: "product.gtin",
  article: "product.sku",
  sku: "product.sku",
  name: "product.name",
  product_id: "product.external_id",
  external_product_id: "product.external_id",
  manufacturer: "product.manufacturer",
  manufacturer_part_number: "product.mpn",
  legal_name: "supplier.legal_name",
  vat: "supplier.vat",
  country: "supplier.country",
  domain: "supplier.domain",
  component_id: "bom.component_id",
  component_name: "bom.component_name",
  quantity: "bom.quantity",
  unit: "bom.unit",
  material_name: "material.name",
  material_code: "material.code",
  percentage: "material.percentage",
};

export function proposeMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const key = header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    mapping[header] = COLUMN_ALIASES[key] ?? COLUMN_ALIASES[header.toLowerCase()] ?? `unknown.${header}`;
  }
  return mapping;
}

async function emit(store: PersistencePort, job: ImportJob, type: string, payload: ImportJobEvent["payload"], now: Date) {
  const event: ImportJobEvent = {
    id: store.nextId("ievt"),
    jobId: job.id,
    type,
    payload,
    createdAt: now.toISOString(),
  };
  await store.appendImportEvent(event);
  return event;
}

export async function createImportJob(store: PersistencePort, principal: Principal, files: CsvBundle, now = new Date()): Promise<ImportJob> {
  if (!hasCapability(principal, "import:manage")) {
    throw new SourceError("FORBIDDEN", "You cannot start an import.", 403);
  }
  assertSafeImportPayload(files);
  const products = files.products ? parseCsv(files.products) : { headers: [], rows: [] };
  const mapping = proposeMapping(products.headers);
  const job: ImportJob = {
    id: store.nextId("imp"),
    organisationId: principal.organisationId,
    state: "UPLOADED",
    processedCount: 0,
    totalCount: products.rows.length,
    warningCount: 0,
    errorCount: 0,
    reviewCount: 0,
    startedAt: now.toISOString(),
    mapping,
  };
  await store.saveImportJob(job);
  await emit(store, job, "stage.started", { stage: "UPLOADED" }, now);
  return runImportJob(store, principal, job.id, files, now);
}

export async function runImportJob(
  store: PersistencePort,
  principal: Principal,
  jobId: string,
  files: CsvBundle,
  now = new Date()
): Promise<ImportJob> {
  const job = await store.getImportJob(jobId);
  if (!job || job.organisationId !== principal.organisationId) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  const products = files.products ? parseCsv(files.products) : { headers: [], rows: [] };
  const suppliers = files.suppliers ? parseCsv(files.suppliers) : { headers: [], rows: [] };
  const bom = files.bom ? parseCsv(files.bom) : { headers: [], rows: [] };

  const invalidProducts = products.rows.filter((r) => !r.name && !r.Name && !r.external_product_id && !r.sku);
  const validProducts = products.rows.filter((r) => !invalidProducts.includes(r));
  const reviewSuppliers = suppliers.rows.filter((r) => !r.vat && !r.VAT).length;

  job.totalCount = validProducts.length + invalidProducts.length;
  job.processedCount = 0;

  const counts = {
    products: validProducts.length,
    suppliers: suppliers.rows.length,
    relationships: bom.rows.length,
  };

  for (const stage of STAGES) {
    job.state = stage;
    job.currentStage = stage;
    await emit(store, job, "stage.started", { stage }, now);
    if (stage === "PARSING") {
      await emit(store, job, "progress.updated", { found: counts.products, entity: "products" }, now);
      await emit(store, job, "entity.detected", { count: counts.products, entity: "products" }, now);
      await emit(store, job, "entity.detected", { count: counts.suppliers, entity: "suppliers" }, now);
    }
    if (stage === "RELATIONSHIP_BUILDING") {
      await emit(store, job, "relationship.created", { count: counts.relationships }, now);
    }
    if (stage === "IDENTITY_RESOLUTION") {
      await emit(store, job, "entity.matched", { count: Math.max(0, counts.suppliers - reviewSuppliers), needsReview: reviewSuppliers }, now);
    }
    job.processedCount = job.totalCount;
    await emit(store, job, "stage.completed", { stage }, now);
    await store.saveImportJob(job);
  }

  const state = await store.loadEngine(principal.organisationId);
  let generated = 0;
  for (const row of validProducts) {
    const name = row.name || row.Name || row.sku || "Imported product";
    const id = row.external_product_id || row.sku || row.product_id || name.toLowerCase().replace(/\s+/g, "-");
    if (!state.subjects.some((s) => s.id === id)) {
      const result = applyCommand(
        state,
        {
          type: "ADD_SUBJECT",
          kind: "PRODUCT",
          name,
          source: "IMPORTED",
          createdBy: principal.userId,
          generateRequirements: true,
        },
        now
      );
      Object.assign(state, result.state);
      generated += 1;
    }
  }
  await store.saveEngine(principal.organisationId, state);

  job.warningCount = reviewSuppliers;
  job.errorCount = invalidProducts.length;
  job.reviewCount = reviewSuppliers;
  job.summary = {
    products: counts.products,
    suppliers: counts.suppliers,
    relationships: counts.relationships,
    requirements: generated,
    autoResolvable: Math.max(0, generated - reviewSuppliers),
    needsAttention: reviewSuppliers + invalidProducts.length,
  };
  job.state = invalidProducts.length ? "PARTIAL" : "COMPLETE";
  job.completedAt = now.toISOString();
  job.currentStage = job.state;
  await emit(store, job, job.state === "PARTIAL" ? "import.partial" : "import.completed", job.summary, now);
  await store.saveImportJob(job);
  return job;
}

export async function getImportProgress(store: PersistencePort, principal: Principal, jobId: string) {
  const job = await store.getImportJob(jobId);
  if (!job || job.organisationId !== principal.organisationId) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  return {
    job,
    events: await store.listImportEvents(jobId),
    percent: job.totalCount ? Math.round((job.processedCount / job.totalCount) * 100) : job.state === "COMPLETE" ? 100 : 0,
  };
}
