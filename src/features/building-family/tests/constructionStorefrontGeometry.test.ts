import { describe, expect, it } from "vitest";
import { BayConstructionGraphSchema, createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionWindowLayout } from "../core/constructionWindowVocabulary";
import { resolveConstructionStorefront } from "../core/constructionStorefront";
import { buildConstructionStorefrontGeometry } from "../compiler/constructionStorefrontGeometry";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { BayConstructionWorkerReplySchema, BayConstructionWorkerRequestSchema } from "../compiler/bayConstructionWorkerProtocol";
import { hashCanonicalJson } from "../core/contentHash";
import { setConstructionSurface } from "../core/constructionSurfaceAuthoring";
import { constructionFacadeSolid } from "../compiler/buildingShellGeometry";

const create = () => withConstructionStorefront(createBuildingConstructionGraph(), 1);
const frontageOf = (graph: ReturnType<typeof create>) => graph.nodes.find(node => node.type === "PlaceStorefront")!;
const scopeId = (result: Awaited<ReturnType<typeof evaluateConstruction>>) => result.ir.semanticIndex.map(entry => entry.semanticPath);

describe("procedural storefront compiler", () => {
  it.each([0.35, 0.65, 1.1])("seats a display sill above the real masonry reveal at %sm without changing metre UV scale", bulkheadHeightM => {
    const plan = resolveConstructionStorefront({ schemaVersion: "0.1.0", kind: "construction-storefront-request", assembly: "display",
      scope: { id: "front/0/0", face: "front", floorIndex: 0, bayIndex: 0, originM: [-1.4, 2, -0.36], sizeM: [2.8, 4, 0.36] },
      parameters: { pierWidthM: 0.16, bulkheadHeightM, headHeightM: 0.45, transomBaseM: 2.35, frameWidthM: 0.075, recessM: 0.14, entranceWidthM: 1.22 } });
    const a = plan.aperture, sill = buildConstructionStorefrontGeometry(plan).trim[0];
    const wall = constructionFacadeSolid([{ facade: "front", floorIndex: 0, bayIndex: 0, zone: "ground",
      originM: [-1.4, 2, -0.36], sizeM: [2.8, 4, 0.36], opening: {
        centerAlongM: a.leftM + a.widthM / 2, centerYM: a.bottomM + a.heightM / 2, widthM: a.widthM, heightM: a.heightM } }]);
    const reveal = wall.positions.filter((_, i) => i % 3 === 1 && wall.normals[i] > 0.99);
    expect(reveal.some(y => Math.abs(y - a.bottomM) < 1e-8)).toBe(true);
    expect(sill.bounds.min[1] + 2).toBeCloseTo(a.bottomM, 9);
    for (let i = 0; i < sill.positions.length; i += 3) if (sill.normals[i + 1] > 0.99) {
      expect(sill.positions[i + 1] + 2 - a.bottomM).toBeCloseTo(0.03, 9);
      expect(sill.uvs[i / 3 * 2]).toBeCloseTo(sill.positions[i] - sill.bounds.min[0], 9);
      expect(sill.uvs[i / 3 * 2 + 1]).toBeCloseTo(sill.positions[i + 2] - sill.bounds.min[2], 9);
    }
    // Translation changes physical placement, never the source tile or UV scale.
    expect(sill.bounds.max[1] - sill.bounds.min[1]).toBeCloseTo(0.03, 9);
    expect(sill.bounds.max[2]).toBeCloseTo(0.15, 9);
  });

  it("migrates explicitly, owns source and preserves the C7 window choice", () => {
    const old = withConstructionWindowLayout(createBuildingConstructionGraph(), "window", 2), before = structuredClone(old);
    const graph = withConstructionStorefront(old, 1);
    expect(graph.schemaVersion).toBe("0.6.0");
    expect(graph.nodes.find(node => node.type === "AssembleWindow")!.parameters.layout).toBe(2);
    expect(old).toEqual(before);
    for (const id of ["wall", "selection", "door"]) expect(graph.nodes.find(node => node.id === id)).toMatchObject({ input: { nodeId: "frontage", socket: "scope" } });
    expect(graph.nodes.find(node => node.id === "frontage")).toMatchObject({ input: { nodeId: "entrance", socket: "scope" } });
    frontageOf(graph).parameters.pierWidthM = 0.3;
    expect(old.nodes.some(node => node.type === "PlaceStorefront")).toBe(false);
  });

  it("does not guess custom migration topology", () => {
    const old = createBuildingConstructionGraph(); old.nodes.find(node => node.type === "EmitWall")!.input.nodeId = "opening";
    expect(() => withConstructionStorefront(old, 1)).toThrow("registered whole-building");
  });

  it("rejects operator downgrade and a missing explicit window layout", () => {
    const graph = create();
    expect(BayConstructionGraphSchema.safeParse({ ...graph, schemaVersion: "0.5.0" }).success).toBe(false);
    delete graph.nodes.find(node => node.type === "AssembleWindow")!.parameters.layout;
    expect(BayConstructionGraphSchema.safeParse(graph).success).toBe(false);
  });

  it("preserves exact C7 geometry with the new operator off or bypassed", async () => {
    const old = await evaluateConstruction(withConstructionWindowLayout(createBuildingConstructionGraph(), "window", 0));
    for (const graph of [withConstructionStorefront(createBuildingConstructionGraph(), 0), create()]) {
      if (frontageOf(graph).parameters.mode === 1) frontageOf(graph).bypassed = true;
      const result = await evaluateConstruction(graph);
      expect(result.ir.meshBatches).toEqual(old.ir.meshBatches);
      expect(result.ir.instanceBatches).toEqual(old.ir.instanceBatches);
      expect(result.prototypes).toEqual(old.prototypes);
      expect(result.ir.semanticIndex).toEqual(old.ir.semanticIndex);
    }
    expect(await hashCanonicalJson(await evaluateConstruction(createBuildingConstructionGraph()))).toBe("3fa73210cad319eb1a5f3320fac9907af68a4cee766298c7bdc06961968a0c47");
  });

  it("builds three shared display bays and one glazed door without duplicate semantic assemblies", async () => {
    const graph = create(), before = structuredClone(graph), old = await evaluateConstruction(createBuildingConstructionGraph()), result = await evaluateConstruction(graph);
    expect(graph).toEqual(before);
    expect(await evaluateConstruction(graph)).toEqual(result);
    expect(scopeId(result)).toEqual(scopeId(old));
    expect(new Set(scopeId(result)).size).toBe(scopeId(result).length);
    expect(result.ir.instanceBatches.filter(batch => batch.materialSlotId === "frame.primary").map(batch => batch.count).sort((a,b) => a-b)).toEqual([3, 44]);
    const door = result.ir.meshBatches.find(batch => batch.batchId.endsWith("/leaf"))!;
    const doorGlass = result.ir.meshBatches.find(batch => batch.batchId.includes("/node/door/") && batch.role === "glass")!;
    expect(doorGlass.positions).toHaveLength(2 * 24 * 3);
    expect(door.positions).not.toEqual(old.ir.meshBatches.find(batch => batch.batchId === door.batchId)!.positions);
    expect(result.trace.find(entry => entry.type === "PlaceStorefront")).toMatchObject({ output: "scope", scopeCount: 48, openingCount: 48 });
  });

  it("retains the other three walls, roof, material slots and regular window prototype buffers", async () => {
    const old = await evaluateConstruction(withConstructionWindowLayout(createBuildingConstructionGraph(), "window", 0)), result = await evaluateConstruction(create());
    const stable = old.ir.meshBatches.filter(batch => !batch.batchId.includes("/node/door/") && !batch.batchId.endsWith("/facade/wall"));
    expect(stable.filter(batch => batch.role === "wall")).toHaveLength(3);
    for (const batch of stable) expect(result.ir.meshBatches.find(item => item.batchId === batch.batchId)).toEqual(batch);
    for (const prototype of old.prototypes!) expect(result.prototypes!.find(item => item.batchId === prototype.batchId)).toEqual(prototype);
    expect(new Set([...result.ir.meshBatches, ...result.prototypes!].map(batch => batch.materialSlotId)))
      .toEqual(new Set([...old.ir.meshBatches, ...old.prototypes!].map(batch => batch.materialSlotId)));
  });

  it("punches the continuous front wall to the exact display and door aperture area", async () => {
    const result = await evaluateConstruction(create()), wall = result.ir.meshBatches.find(batch => batch.batchId.endsWith("/facade/wall"))!;
    let area = 0;
    for (let i = 0; i < wall.indices!.length; i += 3) {
      const ids = Array.from(wall.indices!.slice(i, i + 3)), points = ids.map(id => Array.from(wall.positions!.slice(id * 3, id * 3 + 3)));
      if (!ids.every(id => wall.normals![id * 3 + 2] < -0.99) || !points.every(point => Math.abs(point[2] + 4.2) < 0.00001)) continue;
      const [a,b,c] = points;
      area += Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])) / 2;
    }
    const apertures = 3 * 2.48 * 3 + 1.22 * 3.55 + 8 * 1.22 * 2.12;
    expect(area).toBeCloseTo(11.2 * 11.4 - apertures, 4);
  });

  it("changes executed display geometry with pier/transom controls and entrance width", async () => {
    const graph = create(), a = await evaluateConstruction(graph);
    frontageOf(graph).parameters.pierWidthM = 0.3; frontageOf(graph).parameters.transomBaseM = 2.55;
    graph.nodes.find(node => node.type === "PlaceDoor")!.parameters.widthM = 1.4;
    const b = await evaluateConstruction(graph);
    expect(b.ir.meshBatches.find(batch => batch.batchId.endsWith("/facade/wall"))!.positions).not.toEqual(a.ir.meshBatches.find(batch => batch.batchId.endsWith("/facade/wall"))!.positions);
    expect(b.ir.meshBatches.find(batch => batch.batchId.endsWith("/leaf"))!.positions).not.toEqual(a.ir.meshBatches.find(batch => batch.batchId.endsWith("/leaf"))!.positions);
    expect(b.prototypes!.filter(batch => !a.prototypes!.some(old => old.batchId === batch.batchId))).toHaveLength(3);
  });

  it("rejects an infeasible bay or transom without mutating source", async () => {
    for (const groundHeightM of [2.9, 3]) {
      const graph = create(); graph.nodes.find(node => node.type === "Storeys")!.parameters.groundHeightM = groundHeightM;
      graph.nodes.find(node => node.type === "PlaceOpening")!.parameters.heightM = 1.9;
      graph.nodes.find(node => node.type === "PlaceDoor")!.parameters.heightM = 2.5;
      const before = structuredClone(graph);
      await expect(evaluateConstruction(graph)).rejects.toThrow("150 mm"); expect(graph).toEqual(before);
    }
  });

  it("rejects missing entrance and inconsistent wall/window scope branches", async () => {
    const noDoor = create(); noDoor.nodes.find(node => node.type === "PlaceDoor")!.bypassed = true;
    await expect(evaluateConstruction(noDoor)).rejects.toThrow("one existing ground-floor entrance");
    const mismatch = create(); mismatch.nodes.find(node => node.type === "EmitWall")!.input.nodeId = "entrance";
    await expect(evaluateConstruction(mismatch)).rejects.toThrow("same opening layout");
  });

  it("requires matching protocol and preserves surface instructions without downgrade", async () => {
    const graph = create(), composition = graph.nodes.find(node => node.type === "SetSurface")!.composition;
    composition.revision = 1;
    const finished = setConstructionSurface(graph, composition), result = await evaluateConstruction(finished);
    expect(finished.schemaVersion).toBe("0.6.0");
    expect(result.surfaceComposition).toEqual(composition);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.6.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(true);
    expect(BayConstructionWorkerReplySchema.safeParse({ schemaVersion: "0.6.0", type: "bay-result", requestId: 1, result }).success).toBe(true);
    for (const schemaVersion of ["0.4.0", "0.5.0"]) {
      expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion, type: "evaluate-bay", requestId: 1, graph }).success).toBe(false);
      expect(BayConstructionWorkerReplySchema.safeParse({ schemaVersion, type: "bay-result", requestId: 1, result }).success).toBe(false);
    }
  });

  it.each(["display", "glazed-entrance"] as const)("emits real finite outward metre-UV %s geometry", assembly => {
    const plan = resolveConstructionStorefront({ schemaVersion: "0.1.0", kind: "construction-storefront-request", assembly,
      scope: { id: "front/0/0", face: "front", floorIndex: 0, bayIndex: 0, originM: [-1.4,0,-0.36], sizeM: [2.8,4,0.36] },
      parameters: { pierWidthM: 0.16, bulkheadHeightM: 0.55, headHeightM: 0.45, transomBaseM: 2.35, frameWidthM: 0.075, recessM: 0.14, entranceWidthM: 1.22 } });
    const geometry = buildConstructionStorefrontGeometry(plan);
    expect(geometry.glass).toHaveLength(2);
    for (const part of Object.values(geometry).flat()) {
      expect([...part.positions, ...part.normals, ...part.uvs].every(Number.isFinite)).toBe(true);
      for (let i = 0; i < part.indices.length; i += 3) {
        const ids = part.indices.slice(i, i + 3), v = ids.map(id => part.positions.slice(id * 3, id * 3 + 3));
        const ab = v[1].map((x,j) => x-v[0][j]), ac = v[2].map((x,j) => x-v[0][j]);
        const cross = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]], normal = part.normals.slice(ids[0]*3,ids[0]*3+3);
        expect(cross.reduce((sum,x,j) => sum+x*normal[j],0)).toBeGreaterThan(0);
        const uv = ids.map(id => part.uvs.slice(id*2,id*2+2));
        expect(Math.abs((uv[1][0]-uv[0][0])*(uv[2][1]-uv[0][1])-(uv[1][1]-uv[0][1])*(uv[2][0]-uv[0][0]))).toBeGreaterThan(1e-12);
      }
    }
    if (assembly === "glazed-entrance") expect(Math.min(...geometry.glass[1].positions.filter((_,i) => i%3===1))).toBeGreaterThan(0.45);
    expect(() => buildConstructionStorefrontGeometry(plan, NaN)).toThrow("projection");
  });
});
