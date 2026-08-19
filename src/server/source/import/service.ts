import type { PersistencePort } from "@/infrastructure/database/ports";
import type { ImportJob, ImportJobEvent, Principal, RawImportRecord } from "@/server/source/types";
import { SourceError } from "@/server/source/types";
import { hasCapability } from "@/server/source/authorization";
import { applyCommand, hydrateEngineState } from "@/domain/source/engine";
import { resolveIdentity, scoreActor } from "@/domain/source/identity";
import type { Actor, ContactPoint, EngineState, SubjectKind } from "@/domain/source/types";
import { isGtinValid, resolveSubjectIdentity } from "@/domain/source/subject-identity";
import { mappingConfidence, parseDecimal, stripBom } from "@/domain/source/normalize";
import { buildPilotRequirement, PILOT_DATASET_ID, PILOT_DATASET_VERSION, pilotPropertiesForKind } from "@/domain/source/pilot-dataset";
import { productIdsForSubject } from "@/domain/source/subjects";
import { capturePilotSnapshot } from "@/domain/source/analytics";
import type { ObjectStorage } from "@/infrastructure/storage/port";
import { getRuntimeObjectStorage } from "@/infrastructure/runtime";
import { basenameHint, sha256Hex } from "@/infrastructure/storage/files";
import { IMPORT_BUCKET } from "@/infrastructure/storage/port";
import { loadStoredText } from "@/server/source/uploads";
import { logOperational } from "@/infrastructure/observability/metrics";
import { randomUUID } from "node:crypto";

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

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_ROWS = 25000;
const MAX_COLS = 80;
const MAPPING_VERSION = "p1-v1";

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
  const cleaned = stripBom(text).trim();
  if (!cleaned) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(cleaned);
  const lines = cleaned.split(/\r?\n/).filter((line) => line.length > 0);
  const headers = splitCsvLine(lines[0], delimiter).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line, delimiter);
    const row: Row = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/)[0] ?? "";
  const commas = (first.match(/,/g) ?? []).length;
  const semis = (first.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

function splitCsvLine(line: string, delimiter = ","): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === delimiter && !q) {
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
  vendor_no: "supplier.external_id",
  vendorno: "supplier.external_id",
  supplier_id: "supplier.external_id",
  supplierid: "supplier.external_id",
  external_supplier_id: "supplier.external_id",
  lieferant: "supplier.name",
  lieferantenname: "supplier.name",
  leverancier: "supplier.name",
  lieferant_nr: "supplier.external_id",
  lieferanten_nr: "supplier.external_id",
  lieferantennr: "supplier.external_id",
  ean: "product.gtin",
  ean_code: "product.gtin",
  ean13: "product.gtin",
  gtin: "product.gtin",
  article: "product.sku",
  art_nr: "product.sku",
  artikelnummer: "product.external_id",
  artikel_nr: "product.external_id",
  sku: "product.sku",
  name: "product.name",
  benennung: "product.name",
  bezeichnung: "product.name",
  product_id: "product.external_id",
  external_product_id: "product.external_id",
  manufacturer: "product.manufacturer",
  hersteller: "product.manufacturer",
  fabrikant: "product.manufacturer",
  manufacturer_part_number: "product.mpn",
  hersteller_art_nr: "product.mpn",
  herstellernummer: "product.mpn",
  legal_name: "supplier.legal_name",
  rechtsform: "supplier.legal_name",
  vat: "supplier.vat",
  ust_idnr: "supplier.vat",
  ust_id: "supplier.vat",
  btw: "supplier.vat",
  country: "supplier.country",
  land: "supplier.country",
  domain: "supplier.domain",
  email: "supplier.email",
  e_mail: "supplier.email",
  component_id: "bom.component_id",
  component_name: "bom.component_name",
  bauteil_nr: "bom.component_id",
  bauteil: "bom.component_name",
  komponente: "bom.component_name",
  quantity: "bom.quantity",
  menge: "bom.quantity",
  hoeveelheid: "bom.quantity",
  unit: "bom.unit",
  einheit: "bom.unit",
  material_name: "material.name",
  material_code: "material.code",
  material_grade: "material.grade",
  werkstoff: "material.name",
  werkstoff_nr: "material.code",
  anteil: "material.percentage",
  percentage: "material.percentage",
  country_of_origin: "material.origin",
};

export function headerAliasKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function proposeMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const key = headerAliasKey(header);
    mapping[header] = COLUMN_ALIASES[key] ?? COLUMN_ALIASES[header.toLowerCase()] ?? `unknown.${header}`;
  }
  return mapping;
}

export function applyMapping(row: Row, mapping: Record<string, string>): Row {
  const out: Row = {};
  for (const [header, value] of Object.entries(row)) {
    const target = mapping[header] ?? `unknown.${header}`;
    if (!target.startsWith("unknown.")) out[target] = value;
    out[`raw.${header}`] = value;
  }
  return out;
}

function mapped(row: Row, ...keys: string[]) {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return "";
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

function domainFromEmail(email: string): string | undefined {
  const at = email.lastIndexOf("@");
  if (at < 1) return undefined;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) return undefined;
  return domain;
}

function supplierDisplayName(row: Row): string {
  return mapped(row, "supplier.name", "supplier.legal_name", "supplier.external_id");
}

export function hasSupplierIdentity(row: Row): boolean {
  return Boolean(mapped(row, "supplier.name", "supplier.legal_name", "supplier.external_id"));
}

function supplierIdentityKey(row: Row): string | undefined {
  const name = supplierDisplayName(row);
  if (!name) return undefined;
  return mapped(row, "supplier.external_id") || name.toLowerCase().replace(/\s+/g, "-");
}

function uniqueSupplierIdentityKeys(records: RawImportRecord[]): Set<string> {
  const keys = new Set<string>();
  for (const record of records) {
    const key = supplierIdentityKey(record.normalized);
    if (key) keys.add(key);
  }
  return keys;
}

function rememberSupplierKeys(ids: Map<string, string>, row: Row, actorId: string) {
  const key = supplierIdentityKey(row);
  if (key) ids.set(key, actorId);
  const nameKey = mapped(row, "supplier.name", "supplier.legal_name").toLowerCase().replace(/\s+/g, "-");
  if (nameKey && !ids.has(nameKey)) ids.set(nameKey, actorId);
}

function supplierIdFromProductRow(row: Row, supplierIds: Map<string, string>): string | undefined {
  if (!hasSupplierIdentity(row)) return undefined;
  const key = supplierIdentityKey(row);
  if (key && supplierIds.has(key)) return supplierIds.get(key);
  const nameKey = mapped(row, "supplier.name", "supplier.legal_name").toLowerCase().replace(/\s+/g, "-");
  if (nameKey && supplierIds.has(nameKey)) return supplierIds.get(nameKey);
  return undefined;
}

function supplierAttributesConflict(actor: Actor, row: Row, contacts: ContactPoint[]): boolean {
  const name = mapped(row, "supplier.name", "supplier.legal_name");
  if (name) {
    const scored = scoreActor({ name, country: mapped(row, "supplier.country") || undefined }, actor);
    const incoming = name.trim().toLowerCase();
    const existingName = actor.name.trim().toLowerCase();
    const existingLegal = actor.legalName.trim().toLowerCase();
    if (incoming !== existingName && incoming !== existingLegal && (!scored || scored.confidence < 92)) {
      return true;
    }
  }
  const country = mapped(row, "supplier.country");
  if (country && actor.country && actor.country !== "Unknown" && country.toUpperCase() !== actor.country.toUpperCase()) {
    return true;
  }
  const email = mapped(row, "supplier.email");
  const existingEmail = contacts.find((c) => c.actorId === actor.id)?.email;
  if (email && existingEmail && email.toLowerCase() !== existingEmail.toLowerCase()) {
    return true;
  }
  const vat = mapped(row, "supplier.vat");
  if (vat && actor.vat && vat.replace(/\s/g, "") !== actor.vat.replace(/\s/g, "")) {
    return true;
  }
  return false;
}

function enrichSupplierFromRow(actor: Actor, contacts: ContactPoint[], row: Row) {
  const country = mapped(row, "supplier.country");
  if (country && (!actor.country || actor.country === "Unknown")) actor.country = country;
  const vat = mapped(row, "supplier.vat");
  if (vat && !actor.vat) actor.vat = vat;
  const email = mapped(row, "supplier.email");
  const domain = mapped(row, "supplier.domain") || (email ? domainFromEmail(email) : undefined);
  if (domain && !actor.domain) actor.domain = domain;
  if (email && !contacts.some((c) => c.actorId === actor.id)) {
    contacts.push({
      id: `ct-${actor.id}`,
      actorId: actor.id,
      role: "product_data",
      name: actor.name,
      email,
      valid: true,
    });
  }
}

function bindSubjectSupplier(state: EngineState, subjectId: string, supplierId: string) {
  const subject = state.subjects.find((s) => s.id === subjectId);
  if (!subject) return;
  if (!subject.declaredSupplierId) {
    subject.declaredSupplierId = supplierId;
  } else if (subject.declaredSupplierId !== supplierId) {
    return;
  }
  for (const requirement of state.requirements) {
    if (requirement.subjectId !== subjectId && !requirement.productIds.includes(subjectId)) continue;
    const resolution = state.cases.find((c) => c.id === requirement.linkedCaseId || c.requirementId === requirement.id);
    if (!resolution) continue;
    if (!resolution.supplierId) {
      resolution.supplierId = supplierId;
      resolution.currentActorId = resolution.currentActorId ?? supplierId;
      if (!resolution.identityStatus || resolution.identityStatus === "IDENTITY_NOT_FOUND") {
        resolution.identityStatus = "IDENTITY_MATCHED";
      }
    }
  }
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

export async function persistImportSources(
  store: PersistencePort,
  principal: Principal,
  files: CsvBundle,
  now: Date,
  objectStorage: ObjectStorage
): Promise<NonNullable<ImportJob["sourceFiles"]>> {
  const sourceFiles: NonNullable<ImportJob["sourceFiles"]> = {};
  for (const [part, text] of Object.entries(files) as [keyof CsvBundle, string | undefined][]) {
    if (!text) continue;
    const bytes = Buffer.from(text, "utf8");
    const id = store.nextId("so");
    const key = `o/${randomUUID()}`;
    const digest = sha256Hex(bytes);
    await objectStorage.putImmutable({
      bucket: IMPORT_BUCKET,
      key,
      bytes,
      mimeType: "text/csv",
      sha256: digest,
    });
    await store.saveStorageObject({
      id,
      organisationId: principal.organisationId,
      bucket: IMPORT_BUCKET,
      objectKey: key,
      purpose: "IMPORT_SOURCE",
      availability: "AVAILABLE",
      originalFilename: `${part}.csv`,
      mimeType: "text/csv",
      sizeBytes: bytes.byteLength,
      sha256: digest,
      createdByPrincipalId: principal.userId,
      scanStatus: "CLEAN",
      createdAt: now.toISOString(),
      finalizedAt: now.toISOString(),
    });
    sourceFiles[part] = {
      filename: `${part}.csv`,
      sizeBytes: bytes.byteLength,
      storageObjectId: id,
      mimeType: "text/csv",
    };
  }
  return sourceFiles;
}

export async function createImportJob(
  store: PersistencePort,
  principal: Principal,
  files: CsvBundle,
  now = new Date(),
  options?: { objectStorage?: ObjectStorage; sourceFiles?: ImportJob["sourceFiles"] }
): Promise<ImportJob> {
  if (!hasCapability(principal, "import:manage")) {
    throw new SourceError("FORBIDDEN", "You cannot start an import.", 403);
  }
  assertSafeImportPayload(files);
  const objectStorage = options?.objectStorage ?? getRuntimeObjectStorage();
  const sourceFiles = options?.sourceFiles ?? (await persistImportSources(store, principal, files, now, objectStorage));
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
    mappingConfidence: Object.fromEntries(Object.entries(mapping).map(([k, v]) => [k, mappingConfidence(v)])),
    sourceStorageObjectIds: {
      products: sourceFiles.products?.storageObjectId,
      suppliers: sourceFiles.suppliers?.storageObjectId,
      bom: sourceFiles.bom?.storageObjectId,
      materials: sourceFiles.materials?.storageObjectId,
    },
    sourceFiles,
  };
  await store.saveImportJob(job);
  await emit(store, job, "IMPORT_FILE_STORED", { files: Object.keys(sourceFiles).length }, now);
  await emit(store, job, "stage.started", { stage: "UPLOADED" }, now);
  logOperational("import.file_stored", { organisationId: principal.organisationId, jobId: job.id });
  if (store.saveMappingProfile) {
    await store.saveMappingProfile({
      id: store.nextId("map"),
      organisationId: principal.organisationId,
      sourceFormat: "csv-products",
      mapping,
      mappingVersion: MAPPING_VERSION,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }
  try {
    return await runImportJob(store, principal, job.id, files, now, { objectStorage });
  } catch (error) {
    const failed = await store.getImportJob(job.id);
    if (failed && failed.state !== "FAILED" && failed.state !== "PARTIAL" && failed.state !== "COMPLETE") {
      failed.state = "FAILED";
      failed.completedAt = now.toISOString();
      await store.saveImportJob(failed);
    }
    throw error;
  }
}

export async function createImportJobFromStorage(
  store: PersistencePort,
  principal: Principal,
  sourceStorageObjectIds: NonNullable<ImportJob["sourceStorageObjectIds"]>,
  now = new Date(),
  options?: { objectStorage?: ObjectStorage }
): Promise<ImportJob> {
  const objectStorage = options?.objectStorage ?? getRuntimeObjectStorage();
  const files: CsvBundle = {};
  const sourceFiles: NonNullable<ImportJob["sourceFiles"]> = {};
  for (const part of ["products", "suppliers", "bom", "materials"] as const) {
    const id = sourceStorageObjectIds[part];
    if (!id) continue;
    const record = await store.getStorageObject(id);
    if (!record || record.organisationId !== principal.organisationId || record.purpose !== "IMPORT_SOURCE") {
      throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
    }
    const text = await loadStoredText({ store, objectStorage, organisationId: principal.organisationId, storageObjectId: id });
    files[part] = text;
    sourceFiles[part] = {
      filename: basenameHint(record.originalFilename),
      sizeBytes: record.sizeBytes ?? Buffer.byteLength(text, "utf8"),
      storageObjectId: id,
      mimeType: record.mimeType,
    };
  }
  return createImportJob(store, principal, files, now, { objectStorage, sourceFiles });
}

export async function reprocessImportJob(
  store: PersistencePort,
  principal: Principal,
  jobId: string,
  now = new Date(),
  options?: { objectStorage?: ObjectStorage }
): Promise<ImportJob> {
  const job = await store.getImportJob(jobId);
  if (!job || job.organisationId !== principal.organisationId) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  if (!job.sourceStorageObjectIds) {
    throw new SourceError("VALIDATION", "This import has no stored source file to reprocess.", 400);
  }
  const objectStorage = options?.objectStorage ?? getRuntimeObjectStorage();
  const files = await loadImportBundle(store, principal.organisationId, job.sourceStorageObjectIds, objectStorage);
  return runImportJob(store, principal, job.id, files, now, { objectStorage });
}

async function loadImportBundle(
  store: PersistencePort,
  organisationId: string,
  ids: NonNullable<ImportJob["sourceStorageObjectIds"]>,
  objectStorage: ObjectStorage
): Promise<CsvBundle> {
  const files: CsvBundle = {};
  for (const part of ["products", "suppliers", "bom", "materials"] as const) {
    const id = ids[part];
    if (!id) continue;
    files[part] = await loadStoredText({ store, objectStorage, organisationId, storageObjectId: id });
  }
  return files;
}

export async function runImportJob(
  store: PersistencePort,
  principal: Principal,
  jobId: string,
  files?: CsvBundle,
  now = new Date(),
  options?: { objectStorage?: ObjectStorage }
): Promise<ImportJob> {
  const job = await store.getImportJob(jobId);
  if (!job || job.organisationId !== principal.organisationId) {
    throw new SourceError("RESOURCE_UNAVAILABLE", "Resource unavailable.", 404);
  }
  const objectStorage = options?.objectStorage ?? getRuntimeObjectStorage();
  const bundle =
    files ??
    (job.sourceStorageObjectIds
      ? await loadImportBundle(store, principal.organisationId, job.sourceStorageObjectIds, objectStorage)
      : {});
  await emit(store, job, "IMPORT_FILE_PROCESSING_STARTED", { jobId: job.id }, now);
  const productsFile = bundle.products ? parseCsv(bundle.products) : { headers: [], rows: [] };
  const suppliersFile = bundle.suppliers ? parseCsv(bundle.suppliers) : { headers: [], rows: [] };
  const bomFile = bundle.bom ? parseCsv(bundle.bom) : { headers: [], rows: [] };
  const materialsFile = bundle.materials ? parseCsv(bundle.materials) : { headers: [], rows: [] };
  const productMapping = job.mapping?.["external_product_id"] || job.mapping?.["product_id"] ? job.mapping : proposeMapping(productsFile.headers);
  const supplierMapping = proposeMapping(suppliersFile.headers);
  const bomMapping = proposeMapping(bomFile.headers);
  const materialMapping = proposeMapping(materialsFile.headers);

  const rawRecords: RawImportRecord[] = [];
  const pushRaw = (sourceFile: string, rows: Row[], mapping: Record<string, string>, classify: (mappedRow: Row) => RawImportRecord["status"]) => {
    rows.forEach((row, index) => {
      const normalized = applyMapping(row, mapping);
      const status = classify(normalized);
      rawRecords.push({
        id: `${job.id}-${sourceFile}-${index + 1}`,
        importJobId: job.id,
        sourceFile,
        row: index + 2,
        raw: row,
        normalized,
        mappingVersion: MAPPING_VERSION,
        status,
        createdAt: now.toISOString(),
      });
    });
  };

  pushRaw("products", productsFile.rows, productMapping, (row) => {
    const name = mapped(row, "product.name", "product.sku", "product.external_id");
    if (!name) return "error";
    const gtin = mapped(row, "product.gtin");
    if (gtin && !isGtinValid(gtin)) return "warning";
    return "accepted";
  });
  pushRaw("suppliers", suppliersFile.rows, supplierMapping, (row) => {
    if (!mapped(row, "supplier.name", "supplier.legal_name", "supplier.external_id")) return "error";
    if (!mapped(row, "supplier.vat")) return "review";
    return "accepted";
  });
  pushRaw("bom", bomFile.rows, bomMapping, (row) => {
    if (!mapped(row, "product.external_id", "bom.component_id") && !mapped(row, "bom.component_name")) return "error";
    return "accepted";
  });
  pushRaw("materials", materialsFile.rows, materialMapping, (row) => {
    if (!mapped(row, "material.name", "material.code")) return "error";
    return "accepted";
  });

  job.rawRecords = rawRecords;
  job.totalCount = rawRecords.length;
  job.errorCount = rawRecords.filter((r) => r.status === "error").length;
  job.warningCount = rawRecords.filter((r) => r.status === "warning").length;
  job.reviewCount = rawRecords.filter((r) => r.status === "review").length;

  const acceptedProducts = rawRecords.filter((r) => r.sourceFile === "products" && r.status !== "error");
  const acceptedSuppliers = rawRecords.filter((r) => r.sourceFile === "suppliers" && r.status !== "error");
  const acceptedBom = rawRecords.filter((r) => r.sourceFile === "bom" && r.status !== "error");
  const acceptedMaterials = rawRecords.filter((r) => r.sourceFile === "materials" && r.status !== "error");
  const inlineSupplierRecords = acceptedProducts.filter((r) => hasSupplierIdentity(r.normalized));
  const supplierSourceRecords = [...acceptedSuppliers, ...inlineSupplierRecords];
  const detectedSupplierCount = uniqueSupplierIdentityKeys(supplierSourceRecords).size;
  const productSupplierRowCount = inlineSupplierRecords.length;

  for (const stage of STAGES) {
    job.state = stage;
    job.currentStage = stage;
    await emit(store, job, "stage.started", { stage }, now);
    if (stage === "PARSING") {
      await emit(store, job, "progress.updated", { found: acceptedProducts.length, entity: "products" }, now);
      await emit(store, job, "entity.detected", { count: acceptedProducts.length, entity: "products" }, now);
      await emit(store, job, "entity.detected", { count: detectedSupplierCount, entity: "suppliers" }, now);
      await emit(store, job, "entity.detected", { count: acceptedMaterials.length, entity: "materials" }, now);
    }
    if (stage === "RELATIONSHIP_BUILDING") {
      await emit(store, job, "relationship.created", { count: acceptedBom.length, kind: "component" }, now);
      await emit(store, job, "relationship.created", { count: productSupplierRowCount, kind: "product_supplier" }, now);
    }
    job.processedCount = Math.min(job.totalCount, job.processedCount + Math.ceil(job.totalCount / STAGES.length));
    await emit(store, job, "stage.completed", { stage }, now);
    await store.saveImportJob(job);
  }

  const state = hydrateEngineState(await store.loadEngine(principal.organisationId));
  const requestIdsBefore = new Set(state.requests.map((r) => r.id));
  const identityReviews: IdentityReviewDraft[] = [];
  const supplierIds = ingestSuppliers(state, supplierSourceRecords, principal, now, identityReviews);
  const uniqueSupplierCount = new Set(supplierIds.values()).size;
  const productIds = ingestSubjects(state, acceptedProducts, "PRODUCT", principal, now, {
    nameKeys: ["product.name", "product.sku", "product.external_id"],
    externalKeys: ["product.external_id", "product.sku"],
    gtinKey: "product.gtin",
    mpnKey: "product.mpn",
    skuKey: "product.sku",
    manufacturerKey: "product.manufacturer",
    identityReviews,
    supplierIds,
  });
  const componentIds = ingestBom(state, acceptedBom, productIds, supplierIds, principal, now, identityReviews);
  ingestMaterials(state, acceptedMaterials, productIds, componentIds, principal, now);

  const generated = generatePilotRequirements(state, principal, now);
  const uniqueIdentityReviews = takeUniqueIdentityReviews(identityReviews);
  attachIdentityReviews(state, uniqueIdentityReviews, now);
  await emit(store, job, "entity.matched", { count: generated, entity: "requirements" }, now);

  const leakedRequests = state.requests.filter((r) => !requestIdsBefore.has(r.id));
  if (leakedRequests.length > 0) {
    throw new SourceError("CONFLICT", "Import started outreach. Plan-only import must not send supplier requests.", 500);
  }

  const snapshot = capturePilotSnapshot(state, now);
  state.pilotRuns.push({
    id: store.nextId("pilot"),
    organisationId: principal.organisationId,
    datasetId: PILOT_DATASET_ID,
    datasetVersion: PILOT_DATASET_VERSION,
    importJobId: job.id,
    startedAt: now.toISOString(),
    baseline: snapshot,
  });

  await store.saveEngine(principal.organisationId, state);

  const planned = state.cases.filter((c) => c.state === "DETECTED" || c.state === "AUTHORIZATION_REQUIRED" || c.state === "SEARCHING_EXISTING_DATA").length;
  const productSupplierRelationships = [...new Set(productIds.values())].filter((subjectId) => {
    const subject = state.subjects.find((s) => s.id === subjectId);
    return Boolean(subject?.declaredSupplierId);
  }).length;
  job.processedCount = job.totalCount;
  job.summary = {
    products: acceptedProducts.length,
    suppliers: uniqueSupplierCount,
    relationships: acceptedBom.length,
    productSupplierRelationships,
    materials: acceptedMaterials.length,
    requirements: generated,
    autoResolvable: planned,
    needsAttention: job.reviewCount + job.errorCount + uniqueIdentityReviews.length,
    outreachStarted: false,
    identityReviews: uniqueIdentityReviews.length,
    autoMapped: rawRecords.filter((r) => r.status === "accepted").length,
    reviewRows: job.reviewCount,
    warningRows: job.warningCount,
    errorRows: job.errorCount,
  };
  job.state = job.errorCount ? "PARTIAL" : "COMPLETE";
  job.completedAt = now.toISOString();
  job.currentStage = job.state;
  await emit(store, job, job.state === "PARTIAL" ? "import.partial" : "import.completed", {
    products: acceptedProducts.length,
    suppliers: uniqueSupplierCount,
    relationships: acceptedBom.length,
    productSupplierRelationships,
  }, now);
  await store.saveImportJob(job);
  return job;
}

interface IdentityReviewDraft {
  kind: "supplier" | "subject";
  createdId: string;
  candidateIds: string[];
  reason: string;
}

function takeUniqueIdentityReviews(reviews: IdentityReviewDraft[]): IdentityReviewDraft[] {
  const seen = new Set<string>();
  return reviews.filter((review) => {
    const key = `${review.kind}:${review.createdId}:${review.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function apply(state: EngineState, command: Parameters<typeof applyCommand>[1], now: Date) {
  const result = applyCommand(state, command, now);
  Object.assign(state, result.state);
  return result;
}

function ingestSuppliers(
  state: EngineState,
  records: RawImportRecord[],
  principal: Principal,
  now: Date,
  identityReviews: IdentityReviewDraft[]
) {
  const ids = new Map<string, string>();
  for (const record of records) {
    const row = record.normalized;
    const name = supplierDisplayName(row);
    if (!name) continue;
    const external = supplierIdentityKey(row) ?? name.toLowerCase().replace(/\s+/g, "-");
    const email = mapped(row, "supplier.email");
    const domain = mapped(row, "supplier.domain") || (email ? domainFromEmail(email) : undefined);
    const existingByExternal = state.actors.find((a) => a.id === external);
    if (existingByExternal) {
      if (supplierAttributesConflict(existingByExternal, row, state.contacts)) {
        identityReviews.push({
          kind: "supplier",
          createdId: existingByExternal.id,
          candidateIds: [existingByExternal.id],
          reason:
            "Imported supplier attributes conflict with the organisation already stored under this supplier id. Confirm before treating them as the same organisation.",
        });
      } else {
        enrichSupplierFromRow(existingByExternal, state.contacts, row);
      }
      rememberSupplierKeys(ids, row, existingByExternal.id);
      continue;
    }
    const identity = resolveIdentity(
      {
        name,
        vat: mapped(row, "supplier.vat") || undefined,
        domain,
        country: mapped(row, "supplier.country") || undefined,
      },
      state.actors,
      state.tenant.identityAutoLinkThreshold
    );
    if (identity.autoLinkAllowed && identity.selected && identity.status === "IDENTITY_MATCHED") {
      if (supplierAttributesConflict(identity.selected, row, state.contacts)) {
        identityReviews.push({
          kind: "supplier",
          createdId: identity.selected.id,
          candidateIds: [identity.selected.id],
          reason:
            "Imported supplier attributes conflict with a matched organisation. Confirm before treating them as the same organisation.",
        });
      } else {
        enrichSupplierFromRow(identity.selected, state.contacts, row);
      }
      rememberSupplierKeys(ids, row, identity.selected.id);
      continue;
    }
    const actorId = external;
    if (!state.actors.some((a) => a.id === actorId)) {
      state.actors.push({
        id: actorId,
        name,
        legalName: mapped(row, "supplier.legal_name") || name,
        kind: "organisation",
        vat: mapped(row, "supplier.vat") || undefined,
        country: mapped(row, "supplier.country") || "Unknown",
        domain,
      });
      if (email) {
        state.contacts.push({
          id: `ct-${actorId}`,
          actorId,
          role: "product_data",
          name,
          email,
          valid: true,
        });
      }
    }
    if (identity.status === "IDENTITY_AMBIGUOUS" || identity.status === "IDENTITY_PROBABLE") {
      identityReviews.push({
        kind: "supplier",
        createdId: actorId,
        candidateIds: identity.candidates.map((c) => c.actor.id),
        reason:
          identity.status === "IDENTITY_AMBIGUOUS"
            ? "More than one probable supplier match. Do not merge automatically."
            : "Probable supplier match. Confirm before treating them as the same organisation.",
      });
    }
    rememberSupplierKeys(ids, row, actorId);
  }
  void principal;
  void now;
  return ids;
}

function ingestSubjects(
  state: EngineState,
  records: RawImportRecord[],
  kind: SubjectKind,
  principal: Principal,
  now: Date,
  keys: {
    nameKeys: string[];
    externalKeys: string[];
    gtinKey?: string;
    mpnKey?: string;
    skuKey?: string;
    manufacturerKey?: string;
    identityReviews: IdentityReviewDraft[];
    supplierIds?: Map<string, string>;
  }
) {
  const ids = new Map<string, string>();
  for (const record of records) {
    const row = record.normalized;
    const name = mapped(row, ...keys.nameKeys);
    const external = mapped(row, ...keys.externalKeys) || name.toLowerCase().replace(/\s+/g, "-");
    const gtin = keys.gtinKey ? mapped(row, keys.gtinKey) : "";
    const mpn = keys.mpnKey ? mapped(row, keys.mpnKey) : "";
    const sku = keys.skuKey ? mapped(row, keys.skuKey) : "";
    const manufacturer = keys.manufacturerKey ? mapped(row, keys.manufacturerKey) : "";
    const supplierId = keys.supplierIds ? supplierIdFromProductRow(row, keys.supplierIds) : undefined;
    const resolution = resolveSubjectIdentity({
      query: {
        name,
        kind,
        gtin: gtin || undefined,
        mpn: mpn || undefined,
        manufacturer: manufacturer || undefined,
        sku: sku || undefined,
        sourceSystem: "import",
        sourceRecordId: external,
      },
      subjects: state.subjects,
      identifiers: state.subjectIdentifiers,
      mappings: state.tenantSubjectMappings,
      tenantId: state.tenant.id,
    });
    if (resolution.autoLinkAllowed && resolution.selected && resolution.decision === "MATCHED") {
      ids.set(external, resolution.selected.id);
      if (supplierId) bindSubjectSupplier(state, resolution.selected.id, supplierId);
      continue;
    }
    apply(
      state,
      {
        type: "ADD_SUBJECT",
        kind,
        name: name || external,
        source: "IMPORTED",
        createdBy: principal.userId,
        generateRequirements: false,
        externalId: external,
        sourceReference: `${record.sourceFile}:${record.row}`,
        supplierId,
        identifiers: [
          gtin ? { scheme: "GTIN" as const, value: gtin } : undefined,
          sku ? { scheme: "SKU" as const, value: sku } : undefined,
          mpn ? { scheme: "MPN" as const, value: mpn } : undefined,
          manufacturer ? { scheme: "MANUFACTURER" as const, value: manufacturer } : undefined,
        ].filter(Boolean) as { scheme: "GTIN" | "SKU" | "MPN" | "MANUFACTURER"; value: string }[],
      },
      now
    );
    const created = state.tenantSubjectMappings.find((m) => m.sourceRecordId === external);
    const createdId = created?.canonicalSubjectId ?? state.subjects[state.subjects.length - 1]?.id;
    ids.set(external, createdId);
    if (supplierId) bindSubjectSupplier(state, createdId, supplierId);
    if (resolution.decision === "AMBIGUOUS" || resolution.decision === "PROBABLE_MATCH") {
      keys.identityReviews.push({
        kind: "subject",
        createdId,
        candidateIds: resolution.candidates.map((c) => c.subject.id),
        reason:
          resolution.decision === "AMBIGUOUS"
            ? resolution.candidates[0]?.reason ?? "Ambiguous subject identity. Do not merge automatically."
            : "Probable subject match. Confirm before treating them as the same part.",
      });
    }
  }
  return ids;
}

function ingestBom(
  state: EngineState,
  records: RawImportRecord[],
  productIds: Map<string, string>,
  supplierIds: Map<string, string>,
  principal: Principal,
  now: Date,
  identityReviews: IdentityReviewDraft[]
) {
  const componentIds = new Map<string, string>();
  for (const record of records) {
    const row = record.normalized;
    const productExternal =
      mapped(row, "product.external_id", "product.sku") || mapped(row, "raw.product_id", "raw.Artikelnummer", "raw.artikelnummer");
    const parentId = productIds.get(productExternal) ?? state.subjects.find((s) => s.id === productExternal)?.id;
    const componentExternal = mapped(row, "bom.component_id") || mapped(row, "raw.component_id", "raw.Bauteil-Nr.", "raw.Bauteil-Nr");
    const componentName = mapped(row, "bom.component_name") || componentExternal;
    if (!componentName) continue;
    const mpn = mapped(row, "product.mpn") || mapped(row, "raw.manufacturer_part_number", "raw.Hersteller-Art.Nr.");
    const manufacturer = mapped(row, "product.manufacturer");
    const supplierId =
      supplierIds.get(mapped(row, "supplier.external_id")) || mapped(row, "supplier.external_id") || undefined;
    const existing = resolveSubjectIdentity({
      query: {
        name: componentName,
        kind: "COMPONENT",
        mpn: mpn || undefined,
        manufacturer: manufacturer || undefined,
        sourceSystem: "import",
        sourceRecordId: componentExternal || componentName.toLowerCase().replace(/\s+/g, "-"),
      },
      subjects: state.subjects,
      identifiers: state.subjectIdentifiers,
      mappings: state.tenantSubjectMappings,
      tenantId: state.tenant.id,
    });
    apply(
      state,
      {
        type: "ADD_SUBJECT",
        kind: "COMPONENT",
        name: componentName,
        parentSubjectId: parentId,
        supplierId,
        quantity: parseDecimal(mapped(row, "bom.quantity")),
        unit: mapped(row, "bom.unit") || undefined,
        source: "IMPORTED",
        createdBy: principal.userId,
        generateRequirements: false,
        externalId: componentExternal || componentName.toLowerCase().replace(/\s+/g, "-"),
        sourceReference: `${record.sourceFile}:${record.row}`,
        relationshipKind: "contains",
        identifiers: [
          mpn ? { scheme: "MPN" as const, value: mpn } : undefined,
          manufacturer ? { scheme: "MANUFACTURER" as const, value: manufacturer } : undefined,
        ].filter(Boolean) as { scheme: "MPN" | "MANUFACTURER"; value: string }[],
      },
      now
    );
    const id = state.tenantSubjectMappings.find(
      (m) => m.sourceRecordId === (componentExternal || componentName.toLowerCase().replace(/\s+/g, "-"))
    )?.canonicalSubjectId;
    if (id) componentIds.set(componentExternal || componentName, id);
    if (existing.decision === "AMBIGUOUS" || existing.decision === "PROBABLE_MATCH") {
      identityReviews.push({
        kind: "subject",
        createdId: id ?? componentExternal,
        candidateIds: existing.candidates.map((c) => c.subject.id),
        reason: existing.candidates[0]?.reason ?? "Ambiguous component identity. Do not merge automatically.",
      });
    }
  }
  return componentIds;
}

function ingestMaterials(
  state: EngineState,
  records: RawImportRecord[],
  productIds: Map<string, string>,
  componentIds: Map<string, string>,
  principal: Principal,
  now: Date
) {
  for (const record of records) {
    const row = record.normalized;
    const parent =
      componentIds.get(mapped(row, "bom.component_id")) ??
      productIds.get(mapped(row, "product.external_id")) ??
      state.subjects.find((s) => s.id === mapped(row, "raw.component_id") || s.id === mapped(row, "raw.product_id"))?.id;
    const name = mapped(row, "material.name", "material.code");
    if (!name) continue;
    apply(
      state,
      {
        type: "ADD_SUBJECT",
        kind: "MATERIAL",
        name,
        parentSubjectId: parent,
        quantity: parseDecimal(mapped(row, "material.percentage")),
        unit: "%",
        source: "IMPORTED",
        createdBy: principal.userId,
        generateRequirements: false,
        externalId: mapped(row, "material.code") || name.toLowerCase().replace(/\s+/g, "-"),
        relationshipKind: "made_of",
        identifiers: mapped(row, "material.grade") ? [{ scheme: "INTERNAL", value: mapped(row, "material.grade") }] : [],
      },
      now
    );
  }
}

function supplierForSubject(state: EngineState, subjectId: string): string | undefined {
  const declared = state.subjects.find((s) => s.id === subjectId)?.declaredSupplierId;
  if (declared) return declared;
  const asChild = state.subjectRelationships.find((r) => r.childSubjectId === subjectId && r.supplierActorId);
  if (asChild?.supplierActorId) return asChild.supplierActorId;
  const asParent = state.subjectRelationships.find((r) => r.parentSubjectId === subjectId && r.supplierActorId);
  return asParent?.supplierActorId;
}

function generatePilotRequirements(state: EngineState, principal: Principal, now: Date) {
  let generated = 0;
  for (const subject of state.subjects) {
    for (const property of pilotPropertiesForKind(subject.kind)) {
      const exists = state.requirements.some(
        (r) => r.subjectId === subject.id && r.propertyId === property.propertyId && r.datasetVersion === PILOT_DATASET_VERSION
      );
      if (exists) continue;
      const requirement = buildPilotRequirement({
        id: `ireq-${subject.id}-${property.propertyId}`,
        tenantId: state.tenant.id,
        subjectId: subject.id,
        subjectLabel: subject.name,
        productIds: productIdsForSubject(subject.id, state.subjects, state.subjectRelationships),
        property,
        now,
      });
      apply(
        state,
        {
          type: "OPEN_REQUIREMENT",
          requirement,
          declaredSupplierId: supplierForSubject(state, subject.id),
          planOnly: true,
        },
        now
      );
      generated += 1;
    }
  }
  void principal;
  return generated;
}

function attachIdentityReviews(state: EngineState, reviews: IdentityReviewDraft[], now: Date) {
  for (const review of reviews) {
    const relatedCase =
      state.cases.find((c) => c.supplierId === review.createdId || c.currentActorId === review.createdId) ??
      state.cases.find((c) => {
        const requirement = state.requirements.find((r) => r.id === c.requirementId);
        return requirement?.subjectId === review.createdId;
      });
    const caseId = relatedCase?.id ?? `identity-${review.createdId}`;
    if (state.tasks.some((t) => t.kind === "identity" && t.context === review.reason && t.caseId === caseId)) continue;
    state.tasks.push({
      id: `task-identity-${review.kind}-${review.createdId}`,
      caseId,
      title:
        review.kind === "supplier"
          ? "Confirm whether these suppliers are the same organisation."
          : "Confirm whether these parts are the same subject.",
      context: review.reason,
      recommendedAction: "Prefer an extra review item over an automatic merge. Only MATCHED identity may propagate.",
      ownerLabel: "Identity reviewer",
      status: "open",
      createdAt: now.toISOString(),
      kind: "identity",
    });
  }
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
