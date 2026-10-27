import { readFileSync } from "node:fs";
import path from "node:path";
import { buildFacadeCells, deriveFacadeBodyOpeningPlacement, type FacadeModulePlacement } from "../art-kit/facadeModulePlanner";
import { late19cApartmentKit } from "../art-kit/late19cApartmentKit";
import { buildComponentCatalog, type ComponentCatalog } from "../components/componentCatalogBuilder";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import type { BuildingGraph } from "../contracts/buildingGraph";
import { hashCanonicalJson } from "../core/contentHash";
import { createSeedTree } from "../core/seedTree";
import { compareOpeningLayoutGraphs, OpeningLayoutComparisonSchema } from "../qa/openingLayoutComparison";
import { R1AcceptanceCardSchema } from "../qa/r1BaselineContracts";

const card = R1AcceptanceCardSchema.parse(JSON.parse(readFileSync(
  path.resolve("docs/reviews/2026-10-14-r1-s3/acceptance-card.json"), "utf8"
)));
const spec = structuredClone(card.resolvedSpec);
let catalog: ComponentCatalog;
let graph: BuildingGraph;

function plan(input: BuildingGraph) {
  return input.nodes.find((node) => node.id === "node.art-kit-facade-plan")!.parameters;
}

function placements(input: BuildingGraph): FacadeModulePlacement[] {
  return plan(input).placements as FacadeModulePlacement[];
}

function bodyOpening(input: BuildingGraph, facade: "front" | "left" | "right" = "front") {
  const placement = placements(input).find((item) => item.layer === "opening" && item.floorIndex > 0 && item.facade === facade);
  expect(placement).toBeDefined();
  return placement!;
}

async function reidentify(input: BuildingGraph): Promise<BuildingGraph> {
  input.graphId = `graph-${(await hashCanonicalJson({ ...input, graphId: undefined })).slice(0, 16)}`;
  return input;
}

async function without(input: BuildingGraph, removedIds: string[]): Promise<BuildingGraph> {
  const result = structuredClone(input);
  plan(result).placements = placements(result).filter((placement) => !removedIds.includes(placement.id));
  plan(result).placementCount = placements(result).length;
  return reidentify(result);
}

function compare(afterGraph: unknown, beforeGraph: unknown = graph) {
  return compareOpeningLayoutGraphs({ beforeGraph, afterGraph, spec, catalog, kit: late19cApartmentKit });
}

function freezeJson<T>(input: T): T {
  if (input !== null && typeof input === "object") {
    Object.values(input).forEach(freezeJson);
    Object.freeze(input);
  }
  return input;
}

beforeAll(async () => {
  catalog = await buildComponentCatalog(spec, card.materialAnchors.atlasManifest);
  graph = await buildBuildingGraph(spec, catalog, { fidelityMode: "kit" });
});

describe("opening layout graph comparison", () => {
  it("accepts recursively frozen inputs without mutating them", async () => {
    const input = freezeJson(structuredClone({ beforeGraph: graph, afterGraph: graph, spec, catalog, kit: late19cApartmentKit }));
    const before = JSON.stringify(input);
    expect((await compareOpeningLayoutGraphs(input)).accepted).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("snapshots unknown nested graph data before asynchronous hashes and builder work", async () => {
    const input = structuredClone({ beforeGraph: graph, afterGraph: graph, spec, catalog, kit: late19cApartmentKit });
    const beforeHash = await hashCanonicalJson(graph);
    const pending = compareOpeningLayoutGraphs(input);
    // This runs immediately after the comparator's first await. Zod's unknown
    // parameters alone retain these nested references unless explicitly cloned.
    bodyOpening(input.beforeGraph).originMeters[0] += 0.25;
    bodyOpening(input.afterGraph).semanticPath += "/changed-after-call";
    input.spec.massing.widthM += 1;
    input.catalog.recipes[0].id += ".changed-after-call";
    input.kit.modules[1].boundsMeters.width += 1;
    const report = await pending;
    expect(report.before.sourceGraphHash).toBe(beforeHash);
    expect(report.after.sourceGraphHash).toBe(beforeHash);
    expect(report.immutable.specHash).toBe(await hashCanonicalJson(spec));
    expect(report.immutable.catalogHash).toBe(await hashCanonicalJson(catalog));
    expect(report.immutable.artKitManifestHash).toBe(await hashCanonicalJson(late19cApartmentKit));
  });

  it("accepts only real authored opening additions/removals on all three eligible facades and recomputes both identities", async () => {
    const selectedIds = (["front", "left", "right"] as const).map((facade) => bodyOpening(graph, facade).id);
    const ids = placements(graph).filter((item) => selectedIds.includes(item.id)).map((item) => item.id);
    const reduced = await without(graph, ids);
    const added = await compare(graph, reduced);
    const removed = await compare(reduced);
    expect(OpeningLayoutComparisonSchema.parse(JSON.parse(JSON.stringify(added)))).toEqual(added);
    expect(added.changes.addedPlacementIds).toEqual(ids);
    expect(added.changes.removedPlacementIds).toEqual([]);
    expect(removed.changes.removedPlacementIds).toEqual(ids);
    expect(removed.changes.addedPlacementIds).toEqual([]);
    expect(added.before.graphId).toBe(reduced.graphId);
    expect(added.after.graphId).toBe(graph.graphId);
    expect(added.before.sourceGraphHash).toBe(await hashCanonicalJson(reduced));
    expect(added.after.sourceGraphHash).toBe(await hashCanonicalJson(graph));
    expect(added.before.sourceGraphHash).not.toBe(added.after.sourceGraphHash);
    expect(added.after.openingCount - added.before.openingCount).toBe(3);
    expect(added.after.placementCount - added.before.placementCount).toBe(3);
    expect(added.immutable).toEqual(removed.immutable);
    expect(added.immutable.specHash).toBe(await hashCanonicalJson(spec));
    expect(added.immutable.catalogHash).toBe(await hashCanonicalJson(catalog));
    expect(added.immutable.catalogId).toBe(card.identity.catalogId);
    expect(added.immutable.artKitManifestHash).toBe(await hashCanonicalJson(late19cApartmentKit));
  });

  it("pins independent formerly blank front-row and side-cell candidate semantics", () => {
    // The old keyed 2:3 module choice is an independent oracle: changing both the
    // shared producer and comparator cannot silently change that authored choice.
    const frontCell = buildFacadeCells(spec).find((cell) => cell.facade === "front" && cell.floorIndex === 2 && cell.bayIndex === 0)!;
    const oldFrontModule = createSeedTree("building-seed").fork("art-kit/facades").chooseWeighted([
      { value: "opening.window.rectangular", weight: 2 }, { value: "opening.window.arched", weight: 3 }
    ], "building/family-86f9731664e70f71/facade/front/floor/2/bay/0");
    expect(oldFrontModule).toBe("opening.window.rectangular");
    expect(deriveFacadeBodyOpeningPlacement({ spec, kit: late19cApartmentKit, cell: frontCell })).toEqual({
      id: `placement.opening.front.floor2.bay0.${oldFrontModule}`, moduleId: oldFrontModule,
      facade: "front", floorIndex: 2, bayIndex: 0, zone: "body", layer: "opening",
      originMeters: [-13.06042857142857, 9.959, -7.5],
      sizeMeters: [1.25, 2.1, 0.42],
      semanticPath: `building/family-86f9731664e70f71/facade/front/floor/2/bay/0/opening/${oldFrontModule}`
    });
    const sideCell = buildFacadeCells(spec).find((cell) => cell.facade === "right" && cell.floorIndex === 1 && cell.bayIndex === 0)!;
    expect(deriveFacadeBodyOpeningPlacement({ spec, kit: late19cApartmentKit, cell: sideCell })).toEqual({
      id: "placement.opening.right.floor1.bay0.opening.window.rectangular",
      moduleId: "opening.window.rectangular", facade: "right", floorIndex: 1, bayIndex: 0,
      zone: "side", layer: "opening", originMeters: [29.016 / 2 - 0.6, 5.6 + (3.606 - 2.1) / 2, -6.25],
      sizeMeters: [0.42, 2.1, 1.25],
      semanticPath: "building/family-86f9731664e70f71/facade/right/floor/1/bay/0/opening/opening.window.rectangular"
    });
  });

  it.each([
    ["ground opening", (item: FacadeModulePlacement) => item.layer === "opening" && item.floorIndex === 0],
    ["rear opening", (item: FacadeModulePlacement) => item.layer === "opening" && item.facade === "rear"],
    ["wall placement", (item: FacadeModulePlacement) => item.layer === "wall"],
    ["storefront trim", (item: FacadeModulePlacement) => item.layer === "trim"]
  ] as const)("rejects removal of a %s", async (_name, predicate) => {
    const protectedId = placements(graph).find(predicate)!.id;
    await expect(compare(await without(graph, [protectedId]))).rejects.toThrow(/immutable/);
  });

  it.each([
    ["unrelated node", (value: BuildingGraph) => { value.nodes[0].parameters.widthM = 100; }],
    ["node order", (value: BuildingGraph) => { [value.nodes[0], value.nodes[1]] = [value.nodes[1], value.nodes[0]]; }],
    ["duplicate graph node ID", (value: BuildingGraph) => { value.nodes.push(structuredClone(value.nodes[0])); }],
    ["Group metadata", (value: BuildingGraph) => { plan(value).unitMeters = 2; }],
    ["cell count", (value: BuildingGraph) => { plan(value).cellCount = Number(plan(value).cellCount) + 1; }],
    ["placement count", (value: BuildingGraph) => { plan(value).placementCount = placements(value).length - 1; }],
    ["extra Group field", (value: BuildingGraph) => { plan(value).hiddenChange = true; }],
    ["duplicate placement ID", (value: BuildingGraph) => {
      placements(value).push(structuredClone(bodyOpening(value))); plan(value).placementCount = placements(value).length;
    }],
    ["retained opening transform", (value: BuildingGraph) => { bodyOpening(value).originMeters[0] += 0.01; }],
    ["retained placement order", (value: BuildingGraph) => {
      const items = placements(value); const index = items.findIndex((item) => item.id === bodyOpening(value).id);
      [items[index], items[index - 1]] = [items[index - 1], items[index]];
    }]
  ] as const)("fails closed for %s even with a correctly recomputed graph ID", async (_name, mutate) => {
    const edited = structuredClone(graph);
    mutate(edited);
    await expect(compare(await reidentify(edited))).rejects.toThrow();
  });

  it.each([
    ["arbitrary in-cell coordinate", (item: FacadeModulePlacement) => { item.originMeters[0] += 0.01; }],
    ["arbitrary opening size", (item: FacadeModulePlacement) => { item.sizeMeters[1] -= 0.01; }],
    ["wrong authored module", (item: FacadeModulePlacement) => { item.moduleId = "opening.window.made-up"; }],
    ["wrong cell", (item: FacadeModulePlacement) => { item.bayIndex = 100; }],
    ["wrong semantic path", (item: FacadeModulePlacement) => { item.semanticPath += "/hidden"; }]
  ] as const)("rejects a new placement with %s", async (_name, mutate) => {
    const original = bodyOpening(graph);
    const before = await without(graph, [original.id]);
    const edited = structuredClone(graph);
    mutate(placements(edited).find((item) => item.id === original.id)!);
    await expect(compare(await reidentify(edited), before)).rejects.toThrow(/authored/);
  });

  it("rejects a pair of equally fabricated wall-cell graphs", async () => {
    const edited = structuredClone(graph);
    const wall = placements(edited).find((item) => item.layer === "wall")!;
    wall.originMeters[0] += 0.05;
    await reidentify(edited);
    await expect(compare(edited, edited)).rejects.toThrow(/supplied immutable spec/);
  });

  it("rejects stale graph identity, unknown graph fields, nonfinite vectors and nonpositive size", async () => {
    const stale = structuredClone(graph); stale.graphId = "graph-0000000000000000";
    await expect(compare(stale)).rejects.toThrow(/graphId/);
    await expect(compare({ ...graph, hiddenChange: true })).rejects.toThrow(/versioned contract/);
    const nonfinite = structuredClone(graph); bodyOpening(nonfinite).originMeters[0] = Infinity;
    await expect(compare(nonfinite)).rejects.toThrow();
    const zeroSize = structuredClone(graph); bodyOpening(zeroSize).sizeMeters[0] = 0;
    await expect(compare(await reidentify(zeroSize))).rejects.toThrow();
  });

  it("binds the comparison to the unchanged resolved spec, catalog recipes and established kit", async () => {
    const changedSpec = structuredClone(spec); changedSpec.massing.widthM += 1;
    await expect(compareOpeningLayoutGraphs({ beforeGraph: graph, afterGraph: graph, spec: changedSpec, catalog, kit: late19cApartmentKit })).rejects.toThrow(/supplied immutable spec/);
    const changedCatalog = structuredClone(catalog); changedCatalog.recipes[0].id += ".changed";
    await expect(compareOpeningLayoutGraphs({ beforeGraph: graph, afterGraph: graph, spec, catalog: changedCatalog, kit: late19cApartmentKit })).rejects.toThrow(/catalogId/);
    const changedKit = structuredClone(late19cApartmentKit); changedKit.modules[1].boundsMeters.width += 0.01;
    await expect(compareOpeningLayoutGraphs({ beforeGraph: graph, afterGraph: graph, spec, catalog, kit: changedKit })).rejects.toThrow(/canonical kit/);
  });

  it("runtime-validates report version, identities, finite counts and change accounting", async () => {
    const report = await compare(graph);
    expect(OpeningLayoutComparisonSchema.safeParse({ ...report, schemaVersion: "0.2.0" }).success).toBe(false);
    expect(OpeningLayoutComparisonSchema.safeParse({ ...report, accepted: false }).success).toBe(false);
    expect(OpeningLayoutComparisonSchema.safeParse({ ...report, after: { ...report.after, sourceGraphHash: "not-a-hash" } }).success).toBe(false);
    expect(OpeningLayoutComparisonSchema.safeParse({ ...report, after: { ...report.after, placementCount: Infinity } }).success).toBe(false);
    expect(OpeningLayoutComparisonSchema.safeParse({ ...report, changes: { ...report.changes, addedPlacementIds: ["invented"] } }).success).toBe(false);
  });
});
