import type { PersistencePort } from "@/infrastructure/database/ports";
import type { ImportJob, ImportJobEvent, Principal, RawImportRecord } from "@/server/source/types";
import { SourceError } from "@/server/source/types";
import { hasCapability } from "@/server/source/authorization";
import { applyCommand, hydrateEngineState } from "@/domain/source/engine";
import type { EngineState, SubjectKind } from "@/domain/source/types";
import { resolveIdentity } from "@/domain/source/identity";
import { isGtinValid, resolveSubjectIdentity } from "@/domain/source/subject-identity";
import { mappingConfidence, parseDecimal, stripBom } from "@/domain/source/normalize";
import { buildPilotRequirement, PILOT_DATASET_ID, PILOT_DATASET_VERSION, pilotPropertiesForKind } from "@/domain/source/pilot-dataset";
import { productIdsForSubject } from "@/domain/source/subjects";
import { capturePilotSnapshot } from "@/domain/source/analytics";

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
  ean: "product.gtin",
  ean_code: "product.gtin",
  gtin: "product.gtin",
  article: "product.sku",
  art_nr: "product.sku",
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
  email: "supplier.email",
  component_id: "bom.component_id",
  component_name: "bom.component_name",
  quantity: "bom.quantity",
  unit: "bom.unit",
  material_name: "material.name",
  material_code: "material.code",
  material_grade: "material.grade",
  percentage: "material.percentage",
  country_of_origin: "material.origin",
};

export function proposeMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const key = header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
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
    mappingConfidence: Object.fromEntries(Object.entries(mapping).map(([k, v]) => [k, mappingConfidence(v)])),
  };
  await store.saveImportJob(job);
  await emit(store, job, "stage.started", { stage: "UPLOADED" }, now);
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
  const productsFile = files.products ? parseCsv(files.products) : { headers: [], rows: [] };
  const suppliersFile = files.suppliers ? parseCsv(files.suppliers) : { headers: [], rows: [] };
  const bomFile = files.bom ? parseCsv(files.bom) : { headers: [], rows: [] };
  const materialsFile = files.materials ? parseCsv(files.materials) : { headers: [], rows: [] };
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

  for (const stage of STAGES) {
    job.state = stage;
    job.currentStage = stage;
    await emit(store, job, "stage.started", { stage }, now);
    if (stage === "PARSING") {
      await emit(store, job, "progress.updated", { found: acceptedProducts.length, entity: "products" }, now);
      await emit(store, job, "entity.detected", { count: acceptedProducts.length, entity: "products" }, now);
      await emit(store, job, "entity.detected", { count: acceptedSuppliers.length, entity: "suppliers" }, now);
      await emit(store, job, "entity.detected", { count: acceptedMaterials.length, entity: "materials" }, now);
    }
    if (stage === "RELATIONSHIP_BUILDING") {
      await emit(store, job, "relationship.created", { count: acceptedBom.length }, now);
    }
    job.processedCount = Math.min(job.totalCount, job.processedCount + Math.ceil(job.totalCount / STAGES.length));
    await emit(store, job, "stage.completed", { stage }, now);
    await store.saveImportJob(job);
  }

  const state = hydrateEngineState(await store.loadEngine(principal.organisationId));
  const supplierIds = ingestSuppliers(state, acceptedSuppliers, principal, now);
  const productIds = ingestSubjects(state, acceptedProducts, "PRODUCT", principal, now, {
    nameKeys: ["product.name", "product.sku"],
    externalKeys: ["product.external_id", "product.sku"],
    gtinKey: "product.gtin",
    mpnKey: "product.mpn",
    skuKey: "product.sku",
    manufacturerKey: "product.manufacturer",
  });
  const componentIds = ingestBom(state, acceptedBom, productIds, supplierIds, principal, now);
  ingestMaterials(state, acceptedMaterials, productIds, componentIds, principal, now);

  const generated = generatePilotRequirements(state, principal, now);
  await emit(store, job, "entity.matched", { count: generated, entity: "requirements" }, now);

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
  job.processedCount = job.totalCount;
  job.summary = {
    products: acceptedProducts.length,
    suppliers: acceptedSuppliers.length,
    relationships: acceptedBom.length,
    materials: acceptedMaterials.length,
    requirements: generated,
    autoResolvable: planned,
    needsAttention: job.reviewCount + job.errorCount,
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
    suppliers: acceptedSuppliers.length,
    relationships: acceptedBom.length,
  }, now);
  await store.saveImportJob(job);
  return job;
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
  now: Date
) {
  const ids = new Map<string, string>();
  for (const record of records) {
    const row = record.normalized;
    const name = mapped(row, "supplier.name", "supplier.legal_name", "supplier.external_id");
    const external = mapped(row, "supplier.external_id") || name.toLowerCase().replace(/\s+/g, "-");
    const identity = resolveIdentity(
      {
        name,
        vat: mapped(row, "supplier.vat") || undefined,
        domain: mapped(row, "supplier.domain") || undefined,
        country: mapped(row, "supplier.country") || undefined,
      },
      state.actors,
      state.tenant.identityAutoLinkThreshold
    );
    if (identity.autoLinkAllowed && identity.selected) {
      ids.set(external, identity.selected.id);
      continue;
    }
    if (identity.status === "IDENTITY_AMBIGUOUS" || identity.status === "IDENTITY_PROBABLE") {
      ids.set(external, identity.candidates[0]?.actor.id ?? external);
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
        domain: mapped(row, "supplier.domain") || undefined,
      });
      const email = mapped(row, "supplier.email");
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
    ids.set(external, actorId);
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
  keys: { nameKeys: string[]; externalKeys: string[]; gtinKey?: string; mpnKey?: string; skuKey?: string; manufacturerKey?: string }
) {
  const ids = new Map<string, string>();
  for (const record of records) {
    const row = record.normalized;
    const name = mapped(row, ...keys.nameKeys);
    const external = mapped(row, ...keys.externalKeys) || name.toLowerCase().replace(/\s+/g, "-");
    const gtin = keys.gtinKey ? mapped(row, keys.gtinKey) : "";
    const resolution = resolveSubjectIdentity({
      query: {
        name,
        kind,
        gtin: gtin || undefined,
        mpn: keys.mpnKey ? mapped(row, keys.mpnKey) || undefined : undefined,
        manufacturer: keys.manufacturerKey ? mapped(row, keys.manufacturerKey) || undefined : undefined,
        sku: keys.skuKey ? mapped(row, keys.skuKey) || undefined : undefined,
        sourceSystem: "import",
        sourceRecordId: external,
      },
      subjects: state.subjects,
      identifiers: state.subjectIdentifiers,
      mappings: state.tenantSubjectMappings,
      tenantId: state.tenant.id,
    });
    if (resolution.autoLinkAllowed && resolution.selected) {
      ids.set(external, resolution.selected.id);
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
        identifiers: [
          gtin ? { scheme: "GTIN" as const, value: gtin } : undefined,
          keys.skuKey && mapped(row, keys.skuKey) ? { scheme: "SKU" as const, value: mapped(row, keys.skuKey) } : undefined,
          keys.mpnKey && mapped(row, keys.mpnKey) ? { scheme: "MPN" as const, value: mapped(row, keys.mpnKey) } : undefined,
        ].filter(Boolean) as { scheme: "GTIN" | "SKU" | "MPN"; value: string }[],
      },
      now
    );
    const created = state.tenantSubjectMappings.find((m) => m.sourceRecordId === external);
    ids.set(external, created?.canonicalSubjectId ?? state.subjects[state.subjects.length - 1]?.id);
  }
  return ids;
}

function ingestBom(
  state: EngineState,
  records: RawImportRecord[],
  productIds: Map<string, string>,
  supplierIds: Map<string, string>,
  principal: Principal,
  now: Date
) {
  const componentIds = new Map<string, string>();
  for (const record of records) {
    const row = record.normalized;
    const productExternal = mapped(row, "product.external_id") || mapped(row, "raw.product_id");
    const parentId = productIds.get(productExternal) ?? state.subjects.find((s) => s.id === productExternal)?.id;
    const componentExternal = mapped(row, "bom.component_id") || mapped(row, "raw.component_id");
    const componentName = mapped(row, "bom.component_name") || componentExternal;
    if (!componentName) continue;
    apply(
      state,
      {
        type: "ADD_SUBJECT",
        kind: "COMPONENT",
        name: componentName,
        parentSubjectId: parentId,
        supplierId: supplierIds.get(mapped(row, "supplier.external_id")) || mapped(row, "supplier.external_id") || undefined,
        quantity: parseDecimal(mapped(row, "bom.quantity")),
        unit: mapped(row, "bom.unit") || undefined,
        source: "IMPORTED",
        createdBy: principal.userId,
        generateRequirements: false,
        externalId: componentExternal || componentName.toLowerCase().replace(/\s+/g, "-"),
        sourceReference: `${record.sourceFile}:${record.row}`,
        relationshipKind: "contains",
        identifiers: mapped(row, "product.mpn")
          ? [{ scheme: "MPN", value: mapped(row, "product.mpn") }]
          : mapped(row, "raw.manufacturer_part_number")
            ? [{ scheme: "MPN", value: mapped(row, "raw.manufacturer_part_number") }]
            : [],
      },
      now
    );
    const id = state.tenantSubjectMappings.find(
      (m) => m.sourceRecordId === (componentExternal || componentName.toLowerCase().replace(/\s+/g, "-"))
    )?.canonicalSubjectId;
    if (id) componentIds.set(componentExternal || componentName, id);
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
        { type: "OPEN_REQUIREMENT", requirement, planOnly: true },
        now
      );
      generated += 1;
    }
  }
  void principal;
  return generated;
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
