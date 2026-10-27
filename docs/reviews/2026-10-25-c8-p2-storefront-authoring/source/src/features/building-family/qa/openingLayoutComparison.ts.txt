import { z } from "zod";
import { ArtKitManifestSchema, validateArtKitManifest } from "../art-kit/artKitContracts";
import { buildFacadeCells, deriveFacadeBodyOpeningPlacement } from "../art-kit/facadeModulePlanner";
import { late19cApartmentKit } from "../art-kit/late19cApartmentKit";
import { validateBoundsFit, validateSameFacadeLayerOverlap } from "../art-kit/moduleSnapGrid";
import { ComponentCatalogSchema } from "../components/componentCatalogBuilder";
import { buildBuildingGraph, validateBuildingGraph } from "../compiler/buildingGraphBuilder";
import { BuildingFamilySpecSchema } from "../contracts/buildingFamilySpec";
import { BuildingGraphSchema, type BuildingGraph } from "../contracts/buildingGraph";
import { SchemaVersion010 } from "../contracts/shared";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { DiagnosticSchema } from "../core/diagnostics";

const finite = z.number().finite();
const count = finite.int().nonnegative();
const sha256 = z.string().regex(/^[a-f\d]{64}$/);
const id = z.string().min(1);
const planNodeId = "node.art-kit-facade-plan";

const PlacementSchema = z.object({
  id, moduleId: id, facade: z.enum(["front", "rear", "left", "right"]),
  floorIndex: count, bayIndex: count,
  zone: z.enum(["ground", "body", "cornice", "roof", "side", "rear"]),
  layer: z.enum(["wall", "opening", "trim", "roof", "corner"]),
  originMeters: z.tuple([finite, finite, finite]),
  sizeMeters: z.tuple([finite.positive(), finite.positive(), finite.positive()]),
  semanticPath: id
}).strict();
type Placement = z.infer<typeof PlacementSchema>;

const FacadePlanParametersSchema = z.object({
  artKitManifestId: id, unitMeters: z.literal(1), plannerId: z.literal("seeded-greedy"),
  fidelityMode: z.literal("kit"), cellCount: count, placementCount: count,
  diagnostics: z.array(DiagnosticSchema), placements: z.array(PlacementSchema)
}).strict();
type PlanParameters = z.infer<typeof FacadePlanParametersSchema>;

const graphIdentity = z.object({
  graphId: z.string().regex(/^graph-[a-f\d]{16}$/), sourceGraphHash: sha256,
  placementCount: count, openingCount: count, eligibleOpeningCount: count
}).strict();

export const OpeningLayoutComparisonSchema = z.object({
  schemaVersion: SchemaVersion010,
  packetKind: z.literal("buildo-opening-layout-comparison"),
  scope: z.literal("front-body-and-side-opening-presence"), accepted: z.literal(true),
  before: graphIdentity, after: graphIdentity,
  immutable: z.object({
    specHash: sha256, catalogHash: sha256, catalogId: id,
    artKitManifestHash: sha256, artKitManifestId: id, graphWithoutEligibleOpeningsHash: sha256
  }).strict(),
  changes: z.object({
    addedPlacementIds: z.array(id), removedPlacementIds: z.array(id),
    retainedEligiblePlacementIds: z.array(id)
  }).strict()
}).strict().superRefine((value, context) => {
  const { addedPlacementIds: added, removedPlacementIds: removed, retainedEligiblePlacementIds: retained } = value.changes;
  const allIds = [...added, ...removed, ...retained];
  if (new Set(allIds).size !== allIds.length) {
    context.addIssue({ code: "custom", message: "Change and retained IDs must be unique and disjoint." });
  }
  if (value.before.eligibleOpeningCount !== removed.length + retained.length ||
      value.after.eligibleOpeningCount !== added.length + retained.length) {
    context.addIssue({ code: "custom", message: "Eligible counts must match retained, added and removed IDs." });
  }
  for (const key of ["placementCount", "openingCount"] as const) {
    if (value.after[key] - value.before[key] !== added.length - removed.length) {
      context.addIssue({ code: "custom", message: `${key} must account for opening additions and removals only.` });
    }
  }
  for (const identity of [value.before, value.after]) {
    if (identity.eligibleOpeningCount > identity.openingCount || identity.openingCount > identity.placementCount) {
      context.addIssue({ code: "custom", message: "Opening counts must be contained by placement counts." });
    }
  }
});
export type OpeningLayoutComparison = z.infer<typeof OpeningLayoutComparisonSchema>;

export interface CompareOpeningLayoutGraphsInput {
  beforeGraph: unknown;
  afterGraph: unknown;
  spec: unknown;
  catalog: unknown;
  kit: unknown;
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Opening layout comparison: ${message}`);
}

function requireEqual(first: unknown, second: unknown, message: string): void {
  requireCondition(canonicalJson(first) === canonicalJson(second), message);
}

function parseExact<S extends z.ZodType>(schema: S, input: unknown, name: string): z.output<S> {
  const parsed = schema.parse(input);
  // Do not let a schema's unknown-key stripping hide a mutation. Canonical JSON
  // also rejects executable values and non-finite numbers in unknown parameters.
  requireEqual(input, parsed, `${name} contains fields outside its versioned contract`);
  // Unknown graph parameter branches may otherwise retain caller references.
  // Snapshot every input before the first async hash or graph-builder boundary.
  return JSON.parse(canonicalJson(parsed)) as z.output<S>;
}

function eligible(placement: Placement): boolean {
  return placement.layer === "opening" && placement.floorIndex > 0 && (
    (placement.facade === "front" && placement.zone === "body") ||
    ((placement.facade === "left" || placement.facade === "right") && placement.zone === "side")
  );
}

function parsePlan(graph: BuildingGraph): PlanParameters {
  requireCondition(new Set(graph.nodes.map((node) => node.id)).size === graph.nodes.length, "duplicate graph node IDs");
  requireCondition(validateBuildingGraph(graph).length === 0, "invalid graph dependencies");
  const node = graph.nodes.find((candidate) => candidate.id === planNodeId);
  requireCondition(node?.type === "Group", "missing facade plan Group");
  const parameters = parseExact(FacadePlanParametersSchema, node.parameters, "facade plan");
  requireCondition(parameters.placementCount === parameters.placements.length, "inaccurate placementCount");
  requireCondition(new Set(parameters.placements.map((placement) => placement.id)).size === parameters.placements.length, "duplicate placement IDs");
  requireCondition(new Set(parameters.placements.map((placement) => placement.semanticPath)).size === parameters.placements.length, "duplicate placement semantic paths");
  requireCondition(parameters.diagnostics.every((diagnostic) => diagnostic.severity !== "error"), "facade plan has error diagnostics");
  return parameters;
}

function graphWithoutEligibleOpenings(graph: BuildingGraph, parameters: PlanParameters): unknown {
  return {
    ...graph, graphId: undefined,
    nodes: graph.nodes.map((node) => node.id !== planNodeId ? node : {
      ...node,
      parameters: {
        ...parameters, placementCount: undefined,
        placements: parameters.placements.filter((placement) => !eligible(placement))
      }
    })
  };
}

async function identityFor(graph: BuildingGraph, parameters: PlanParameters) {
  const graphId = `graph-${(await hashCanonicalJson({ ...graph, graphId: undefined })).slice(0, 16)}`;
  requireCondition(graph.graphId === graphId, "graphId does not match its complete graph payload");
  return {
    graphId, sourceGraphHash: await hashCanonicalJson(graph),
    placementCount: parameters.placements.length,
    openingCount: parameters.placements.filter((placement) => placement.layer === "opening").length,
    eligibleOpeningCount: parameters.placements.filter(eligible).length
  };
}

/**
 * A bounded provenance comparison for opening presence only. This does not
 * establish rendered visibility, occupancy quality or human visual acceptance.
 * Frozen controls, materials and capture poses remain the caller's strict gate.
 */
export async function compareOpeningLayoutGraphs(input: CompareOpeningLayoutGraphsInput): Promise<OpeningLayoutComparison> {
  const beforeGraph = parseExact(BuildingGraphSchema, input.beforeGraph, "before graph");
  const afterGraph = parseExact(BuildingGraphSchema, input.afterGraph, "after graph");
  const spec = parseExact(BuildingFamilySpecSchema, input.spec, "resolved spec");
  const catalog = parseExact(ComponentCatalogSchema, input.catalog, "component catalog");
  const kit = parseExact(ArtKitManifestSchema, input.kit, "art-kit manifest");
  requireCondition(validateArtKitManifest(kit).success, "invalid art-kit semantics");
  requireEqual(kit, late19cApartmentKit, "art-kit manifest differs from the established canonical kit");
  requireCondition(catalog.familyId === spec.familyId, "catalog family does not match the resolved spec");
  requireCondition(catalog.diagnostics.every((diagnostic) => diagnostic.severity !== "error"), "catalog has error diagnostics");
  const expectedCatalogId = `catalog-${(await hashCanonicalJson({ familyId: spec.familyId, atlasId: catalog.atlasId, recipes: catalog.recipes })).slice(0, 16)}`;
  requireCondition(catalog.catalogId === expectedCatalogId, "catalogId does not match its recipes");
  const beforePlan = parsePlan(beforeGraph);
  const afterPlan = parsePlan(afterGraph);
  const beforeImmutable = graphWithoutEligibleOpenings(beforeGraph, beforePlan);
  requireEqual(beforeImmutable, graphWithoutEligibleOpenings(afterGraph, afterPlan), "immutable graph/node/placement fields or order changed");

  // Bind both graphs to the actual frozen spec/catalog, not a pair of equally
  // fabricated wall-cell plans. Current opening presence is the only omitted data.
  const expectedGraph = await buildBuildingGraph(spec, catalog, { fidelityMode: "kit" });
  requireEqual(beforeImmutable, graphWithoutEligibleOpenings(expectedGraph, parsePlan(expectedGraph)), "graph does not derive from the supplied immutable spec/catalog");
  const cells = buildFacadeCells(spec);
  requireCondition(beforePlan.cellCount === cells.length, "inaccurate cellCount");
  requireCondition(beforePlan.artKitManifestId === kit.id, "facade plan uses a different kit");

  for (const parameters of [beforePlan, afterPlan]) {
    const occupiedCells = new Set<string>();
    for (const placement of parameters.placements.filter(eligible)) {
      const cell = cells.find((candidate) => candidate.facade === placement.facade &&
        candidate.floorIndex === placement.floorIndex && candidate.bayIndex === placement.bayIndex);
      requireCondition(cell, `opening ${placement.id} has no authored facade cell`);
      const walls = parameters.placements.filter((candidate) => candidate.layer === "wall" &&
        candidate.facade === cell.facade && candidate.floorIndex === cell.floorIndex && candidate.bayIndex === cell.bayIndex);
      requireCondition(walls.length === 1, `opening ${placement.id} must share one unchanged wall cell`);
      requireEqual(walls[0].originMeters, cell.originMeters, "wall cell origin differs from the resolved spec");
      requireEqual(walls[0].sizeMeters, cell.sizeMeters, "wall cell size differs from the resolved spec");
      requireCondition(!occupiedCells.has(cell.id), `multiple openings in cell ${cell.id}`);
      occupiedCells.add(cell.id);
      const expectedPlacement = deriveFacadeBodyOpeningPlacement({ spec, kit, cell });
      requireCondition(expectedPlacement, `cell ${cell.id} has no compatible authored opening module`);
      requireEqual(placement, expectedPlacement, `opening ${placement.id} differs from its authored module/cell derivation`);
      requireCondition(validateBoundsFit(placement, cell).length === 0, `opening ${placement.id} does not fit its wall cell`);
    }
    requireCondition(validateSameFacadeLayerOverlap(parameters.placements).length === 0, "same-facade placement layers overlap");
  }

  const beforeById = new Map(beforePlan.placements.map((placement) => [placement.id, placement]));
  const afterById = new Map(afterPlan.placements.map((placement) => [placement.id, placement]));
  requireEqual(
    beforePlan.placements.filter((placement) => afterById.has(placement.id)),
    afterPlan.placements.filter((placement) => beforeById.has(placement.id)),
    "shared placement payloads or their relative order changed"
  );
  const added = afterPlan.placements.filter((placement) => !beforeById.has(placement.id));
  const removed = beforePlan.placements.filter((placement) => !afterById.has(placement.id));
  requireCondition([...added, ...removed].every(eligible), "changes include an opening outside the permitted front-body/side scope");
  const retained = beforePlan.placements.filter((placement) => eligible(placement) && afterById.has(placement.id));
  const [before, after, specHash, catalogHash, artKitManifestHash, graphWithoutEligibleOpeningsHash] = await Promise.all([
    identityFor(beforeGraph, beforePlan), identityFor(afterGraph, afterPlan),
    hashCanonicalJson(spec), hashCanonicalJson(catalog), hashCanonicalJson(kit), hashCanonicalJson(beforeImmutable)
  ]);
  return OpeningLayoutComparisonSchema.parse({
    schemaVersion: "0.1.0", packetKind: "buildo-opening-layout-comparison",
    scope: "front-body-and-side-opening-presence", accepted: true, before, after,
    immutable: { specHash, catalogHash, catalogId: catalog.catalogId, artKitManifestHash, artKitManifestId: kit.id, graphWithoutEligibleOpeningsHash },
    changes: {
      addedPlacementIds: added.map((placement) => placement.id),
      removedPlacementIds: removed.map((placement) => placement.id),
      retainedEligiblePlacementIds: retained.map((placement) => placement.id)
    }
  });
}
