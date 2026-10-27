import { z } from "zod";
import { DiagnosticSchema } from "../core/diagnostics";
import { BuildingFamilySpecSchema } from "./buildingFamilySpec";
import { TrimDensitySchema } from "./buildingIntent";
import { SchemaVersion010, SeedsSchema, SemanticLockSchema } from "./shared";

export const BUILDING_DOCUMENT_RESOLVER_VERSION = "building-document-parameters-v1" as const;
export const BUILDING_DOCUMENT_AUTHORED_FIELDS = [
  "floorCount", "bayCount", "roofType", "trimDensity", "windowFamily", "corniceFamily"
] as const;

type JsonPath = Array<string | number>;
export interface BuildingDocumentJsonIssue { path: JsonPath; message: string }

/** Local serialized-artifact boundary; canonicalJson alone does not validate objects. */
export function findBuildingDocumentJsonIssue(
  input: unknown,
  allowUndefined: (path: JsonPath) => boolean = () => false
): BuildingDocumentJsonIssue | undefined {
  const ancestors = new Set<object>();
  let visited = 0;
  function visit(value: unknown, path: JsonPath): BuildingDocumentJsonIssue | undefined {
    if (++visited > 100_000 || path.length > 128) return { path, message: "JSON snapshot exceeds the supported size or depth." };
    if (value === undefined && allowUndefined(path)) return;
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") return Number.isFinite(value) ? undefined : { path, message: "JSON numbers must be finite." };
    if (typeof value !== "object") return { path, message: `Unsupported JSON value: ${typeof value}.` };
    if (ancestors.has(value)) return { path, message: "JSON snapshots cannot contain cycles." };
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array && prototype !== Array.prototype) return { path, message: "JSON arrays must use the plain Array prototype." };
    if (!array && prototype !== Object.prototype && prototype !== null) return { path, message: "JSON objects must be plain records." };
    if (Object.getOwnPropertySymbols(value).length) return { path, message: "JSON snapshots cannot contain symbol properties." };
    const descriptors = Object.getOwnPropertyDescriptors(value);
    ancestors.add(value);
    try {
      if (array) {
        for (const key of Object.keys(descriptors)) {
          if (key !== "length" && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) {
            return { path: [...path, key], message: "JSON arrays cannot carry extra properties." };
          }
        }
        for (let index = 0; index < value.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return { path: [...path, index], message: "JSON arrays require data values without holes or accessors." };
          const issue = visit(descriptor.value, [...path, index]);
          if (issue) return issue;
        }
      } else {
        for (const [key, descriptor] of Object.entries(descriptors)) {
          if (!descriptor.enumerable || !("value" in descriptor)) return { path: [...path, key], message: "JSON objects require enumerable data properties." };
          const issue = visit(descriptor.value, [...path, key]);
          if (issue) return issue;
        }
      }
    } finally {
      ancestors.delete(value);
    }
  }
  return visit(input, []);
}

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const nonempty = z.string().min(1);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const authoredField = z.enum(BUILDING_DOCUMENT_AUTHORED_FIELDS);
const authored = z.object({
  floorCount: z.number().int().positive().optional(),
  bayCount: z.number().int().positive().optional(),
  roofType: z.enum(["flat", "gable"]).optional(),
  trimDensity: TrimDensitySchema.optional(),
  windowFamily: nonempty.optional(),
  corniceFamily: nonempty.optional()
}).strict();
const componentLock = SemanticLockSchema.extend({
  scope: z.literal("building"),
  lockedValue: z.object({ componentKey: nonempty }).strict()
}).strict().superRefine((lock, context) => {
  if (lock.semanticPath !== `component/${lock.lockedValue.componentKey}`) {
    context.addIssue({ code: "custom", path: ["semanticPath"], message: "Component lock path must match its componentKey." });
  }
});
const documentShape = z.object({
  schemaVersion: SchemaVersion010,
  documentId: nonempty,
  revision,
  intentRef: z.object({ contentHash: hash }).strict(),
  stylePackRef: z.object({ stylePackId: nonempty, contentHash: hash }).strict(),
  seeds: SeedsSchema.strict(),
  authored,
  locks: z.array(componentLock)
}).strict().superRefine((document, context) => {
  const paths = new Set<string>();
  document.locks.forEach((lock, index) => {
    if (paths.has(lock.semanticPath)) context.addIssue({ code: "custom", path: ["locks", index], message: "Component locks must be unique." });
    paths.add(lock.semanticPath);
  });
});

function documentOptional(path: JsonPath): boolean {
  return (path.length === 2 && path[0] === "authored" && BUILDING_DOCUMENT_AUTHORED_FIELDS.some((field) => field === path[1])) ||
    (path.length === 3 && path[0] === "locks" && typeof path[1] === "number" && path[2] === "reason");
}

function jsonBoundary(allowUndefined: (path: JsonPath) => boolean) {
  return z.unknown().superRefine((value, context) => {
    const issue = findBuildingDocumentJsonIssue(value, allowUndefined);
    if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
  });
}

export const BuildingDocumentSchema = jsonBoundary(documentOptional).pipe(documentShape);
export type BuildingDocument = z.infer<typeof BuildingDocumentSchema>;

const common = {
  schemaVersion: SchemaVersion010,
  resolverVersion: z.literal(BUILDING_DOCUMENT_RESOLVER_VERSION),
  documentId: nonempty,
  revision,
  documentHash: hash,
  authoredFields: z.array(authoredField).refine((fields) => new Set(fields).size === fields.length, "Authored fields must be unique."),
  diagnostics: z.array(DiagnosticSchema.strict())
};
const resolutionShape = z.discriminatedUnion("status", [
  z.object({ ...common, status: z.literal("resolved"), intentHash: hash, stylePackHash: hash, resolvedSpecHash: hash, spec: BuildingFamilySpecSchema }).strict(),
  z.object({ ...common, status: z.literal("rejected") }).strict()
]).superRefine((result, context) => {
  const error = result.diagnostics.some((entry) => entry.severity === "error");
  if ((result.status === "rejected") !== error) context.addIssue({ code: "custom", path: ["diagnostics"], message: "Rejected resolutions require an error; resolved resolutions cannot contain errors." });
});

function resolutionOptional(path: JsonPath): boolean {
  const diagnostic = (parts: JsonPath) => parts.length === 3 && parts[0] === "diagnostics" && typeof parts[1] === "number" &&
    ["path", "received", "allowedValues"].includes(String(parts[2]));
  if (diagnostic(path)) return true;
  if (path[0] !== "spec") return false;
  const spec = path.slice(1);
  return diagnostic(spec) ||
    (spec.length === 3 && spec[0] === "massing" && spec[1] === "roof" && spec[2] === "pitchDegrees") ||
    (spec.length === 2 && spec[0] === "selectedFamilies" && ["pilaster", "ornament"].includes(String(spec[1]))) ||
    (spec.length === 3 && spec[0] === "locks" && typeof spec[1] === "number" && spec[2] === "reason");
}

export const BuildingDocumentResolutionSchema = jsonBoundary(resolutionOptional).pipe(resolutionShape);
export type BuildingDocumentResolution = z.infer<typeof BuildingDocumentResolutionSchema>;

/** A window slot in its owning document; compiled family, recipe and instance IDs are excluded. */
const windowSlotIndex = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const BuildingWindowSlotAddressSchema = jsonBoundary(() => false).pipe(z.object({
  schemaVersion: SchemaVersion010,
  facade: z.enum(["front", "rear", "left", "right"]),
  floorIndex: windowSlotIndex,
  bayIndex: windowSlotIndex
}).strict());
export type BuildingWindowSlotAddress = z.infer<typeof BuildingWindowSlotAddressSchema>;

/** A standalone split-plan directive; serialized document/source formats remain unchanged. */
export const BuildingWindowWidthOverrideSchema = jsonBoundary(() => false).pipe(z.object({
  schemaVersion: SchemaVersion010,
  address: BuildingWindowSlotAddressSchema,
  widthM: z.number().finite().positive()
}).strict());
export type BuildingWindowWidthOverride = z.infer<typeof BuildingWindowWidthOverrideSchema>;

/** A standalone facade-floor operation; existing saved source formats remain unchanged. */
export const BuildingWindowFloorWidthOverrideSchema = jsonBoundary(() => false).pipe(z.object({
  schemaVersion: SchemaVersion010,
  facade: z.enum(["front", "rear", "left", "right"]),
  floorIndex: windowSlotIndex,
  widthM: z.number().finite().positive()
}).strict());
export type BuildingWindowFloorWidthOverride = z.infer<typeof BuildingWindowFloorWidthOverrideSchema>;

/** One facade's vertical bay stack; portable source admission remains separate. */
export const BuildingWindowBayWidthOverrideSchema = jsonBoundary(() => false).pipe(z.object({
  schemaVersion: SchemaVersion010,
  facade: z.enum(["front", "rear", "left", "right"]),
  bayIndex: windowSlotIndex,
  widthM: z.number().finite().positive()
}).strict());
export type BuildingWindowBayWidthOverride = z.infer<typeof BuildingWindowBayWidthOverrideSchema>;
