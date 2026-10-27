import {
  BUILDING_DOCUMENT_AUTHORED_FIELDS,
  BUILDING_DOCUMENT_RESOLVER_VERSION,
  BuildingDocumentSchema,
  BuildingDocumentResolutionSchema,
  findBuildingDocumentJsonIssue,
  type BuildingDocument,
  type BuildingDocumentResolution
} from "../contracts/buildingDocument";
import { BuildingFamilySpecSchema } from "../contracts/buildingFamilySpec";
import { BuildingIntentSchema } from "../contracts/buildingIntent";
import { HistoricalStylePackSchema } from "../contracts/historicalStylePack";
import { canonicalJson } from "./canonicalJson";
import { hashCanonicalJson } from "./contentHash";
import type { Diagnostic } from "./diagnostics";
import { normalizeBuildingSpec } from "./specNormalizer";

const requestedFields = ["floorCount", "bayCount", "wallMaterial", "roofType", "windowFamily", "trimDensity", "corniceFamily", "weathering", "symmetry"];
function intentOptional(path: Array<string | number>): boolean {
  return (path.length === 1 && path[0] === "stylePackId") ||
    (path.length === 2 && path[0] === "requested" && requestedFields.includes(String(path[1]))) ||
    (path.length === 2 && path[0] === "psg" && path[1] === "sourceDocumentId") ||
    (path.length === 3 && path[0] === "locks" && typeof path[1] === "number" && ["scope", "reason"].includes(String(path[2])));
}
function styleOptional(path: Array<string | number>): boolean {
  return path.length === 2 && path[0] === "defaults" && ["pilasterFamily", "ornamentFamily"].includes(String(path[1]));
}

export interface ResolveBuildingDocumentInput { document: unknown; intent: unknown; stylePack: unknown }

/** Resolves parameter source data only. Receipts are not runtime/cache identities. */
export async function resolveBuildingDocument(input: ResolveBuildingDocumentInput): Promise<BuildingDocumentResolution> {
  const document = BuildingDocumentSchema.parse(input.document);
  const authoredFields = BUILDING_DOCUMENT_AUTHORED_FIELDS.filter((field) => document.authored[field] !== undefined);
  const dependencyDiagnostics: Diagnostic[] = [];
  for (const [name, value, optional] of [
    ["intent", input.intent, intentOptional],
    ["stylePack", input.stylePack, styleOptional]
  ] as const) {
    const issue = findBuildingDocumentJsonIssue(value, optional);
    if (issue) dependencyDiagnostics.push({
      code: "document.nonJsonDependency", severity: "error", path: [name, ...issue.path].join("."), message: issue.message
    });
  }
  // Snapshot both dependencies before the first await, including opaque PSG/lock
  // payloads. Later caller mutations cannot split reference hashes from resolution.
  const supplied = dependencyDiagnostics.length ? undefined : {
    intent: JSON.parse(canonicalJson(input.intent)) as unknown,
    stylePack: JSON.parse(canonicalJson(input.stylePack)) as unknown
  };
  const common = {
    schemaVersion: "0.1.0" as const,
    resolverVersion: BUILDING_DOCUMENT_RESOLVER_VERSION,
    documentId: document.documentId,
    revision: document.revision,
    documentHash: await hashCanonicalJson(document),
    authoredFields
  };
  const rejected = (diagnostics: Diagnostic[]) => BuildingDocumentResolutionSchema.parse({ ...common, status: "rejected", diagnostics });
  if (!supplied) return rejected(dependencyDiagnostics);
  const intent = BuildingIntentSchema.parse(supplied.intent);
  const stylePack = HistoricalStylePackSchema.parse(supplied.stylePack);
  // References bind the supplied snapshots, before document authority is projected.
  const [intentHash, stylePackHash] = await Promise.all([hashCanonicalJson(supplied.intent), hashCanonicalJson(supplied.stylePack)]);
  const diagnostics: Diagnostic[] = [];
  for (const [path, actual, expected] of [
    ["intentRef.contentHash", intentHash, document.intentRef.contentHash],
    ["stylePackRef.stylePackId", stylePack.id, document.stylePackRef.stylePackId],
    ["stylePackRef.contentHash", stylePackHash, document.stylePackRef.contentHash]
  ]) {
    if (actual !== expected) diagnostics.push({ code: "document.referenceMismatch", severity: "error", path, message: `Reference ${path} does not match the supplied dependency.`, received: actual, allowedValues: [expected] });
  }
  if (diagnostics.length) return rejected(diagnostics);

  function constraint(field: keyof BuildingDocument["authored"], allowed: unknown[], valid: boolean): void {
    if (!valid) diagnostics.push({ code: "document.authoredConstraint", severity: "error", path: `authored.${field}`, message: `Authored ${field} is outside the style pack constraints.`, received: document.authored[field], allowedValues: allowed });
  }
  for (const [field, range] of [["floorCount", stylePack.massing.floorCount], ["bayCount", stylePack.facade.frontBayCount]] as const) {
    const value = document.authored[field];
    if (value !== undefined) constraint(field, [range.min, range.max], value >= range.min && value <= range.max);
  }
  for (const [field, allowed] of [
    ["roofType", stylePack.massing.roofTypes],
    ["windowFamily", stylePack.componentFamilies.windows],
    ["corniceFamily", stylePack.componentFamilies.cornices]
  ] as const) {
    const value = document.authored[field];
    if (value !== undefined) constraint(field, [...allowed], (allowed as readonly string[]).includes(value));
  }
  if (diagnostics.length) return rejected(diagnostics);

  const overrides = Object.fromEntries(authoredFields.map((field) => [field, document.authored[field]])) as BuildingDocument["authored"];
  const effectiveIntent = BuildingIntentSchema.parse({
    ...intent, seeds: document.seeds, locks: document.locks,
    requested: { ...intent.requested, ...overrides }
  });
  const normalized = await normalizeBuildingSpec(effectiveIntent, stylePack);
  diagnostics.push(...normalized.diagnostics);
  const actual = {
    floorCount: normalized.spec.massing.floorCount,
    bayCount: normalized.spec.facade.frontBayCount,
    roofType: normalized.spec.massing.roof.type,
    trimDensity: normalized.spec.componentParameters.trimDensity,
    corniceFamily: normalized.spec.selectedFamilies.cornice
  };
  for (const field of ["floorCount", "bayCount", "roofType", "trimDensity", "corniceFamily"] as const) {
    const requested = document.authored[field];
    if (requested !== undefined && actual[field] !== requested) diagnostics.push({
      code: "document.authoredConflict", severity: "error", path: `authored.${field}`,
      message: `Constraints could not retain authored ${field}.`, received: { requested, resolved: actual[field] }
    });
  }
  if (diagnostics.some((entry) => entry.severity === "error")) return rejected(diagnostics);
  // Window family is the only supported authored field overwritten by late variation.
  // It is intentionally excluded from the legacy family-scoped identity.
  const spec = BuildingFamilySpecSchema.parse({
    ...normalized.spec,
    selectedFamilies: {
      ...normalized.spec.selectedFamilies,
      window: document.authored.windowFamily ?? normalized.spec.selectedFamilies.window
    }
  });
  return BuildingDocumentResolutionSchema.parse({
    ...common, status: "resolved", intentHash, stylePackHash,
    resolvedSpecHash: await hashCanonicalJson(spec), spec, diagnostics
  });
}
