import { describe, expect, it } from "vitest";
import { BayConstructionGraphSchema, createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionGroupedBays } from "../core/constructionGroupedBayGraph";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { withConstructionRoundHead } from "../core/constructionRoundHeadVocabulary";
import { hashCanonicalJson } from "../core/contentHash";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { BayConstructionWorkerRequestSchema, BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";
import { withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { withConstructionParapetSilhouette } from "../core/constructionParapetVocabulary";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";

const directive = () => ({ storeysNodeId: "facade", floorIndex: 1, bayIndex: 0, memberCount: 2, memberWidthM: 0.9, pierWidthM: 0.24 });
const graph = () => withConstructionGroupedBays(createBuildingConstructionGraph(), [directive()]);
describe("grouped bay graph source", () => {
  it("rebuilds the authored group from current dimensions and retains stable paths", async () => {
    const input = graph(), before = await evaluateConstruction(input);
    const moved = structuredClone(input), footprint = moved.nodes.find(node => node.type === "Footprint")!; footprint.parameters.widthM = 12;
    const after = await evaluateConstruction(moved);
    const members = (result: typeof before) => result.ir.semanticIndex.filter(x => x.semanticPath.includes("/bay/0/opening/")).map(x => x.semanticPath);
    expect(members(before)).toHaveLength(6); expect(members(after)).toEqual(members(before));
    expect(after.ir.sourceGraphHash).toBe(await hashCanonicalJson(moved));
    expect(after.ir.meshBatches).not.toEqual(before.ir.meshBatches);
    expect((await evaluateConstruction(JSON.parse(JSON.stringify(moved)))).ir.semanticIndex).toEqual(after.ir.semanticIndex);
  });
  it("uses matching worker versions and rejects invalid directives", async () => {
    const input = graph(), result = await evaluateConstruction(input);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.11.0", type: "evaluate-bay", requestId: 1, graph: input }).success).toBe(true);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.10.0", type: "evaluate-bay", requestId: 1, graph: input }).success).toBe(false);
    expect(BayConstructionWorkerReplySchema.safeParse({ schemaVersion: "0.11.0", type: "bay-result", requestId: 1, result }).success).toBe(true);
    expect(BayConstructionGraphSchema.safeParse({ ...input, schemaVersion: "0.10.0" }).success).toBe(false);
    expect(BayConstructionGraphSchema.safeParse({ ...input, upperBayGroups: [directive(), directive()] }).success).toBe(false);
  });
  it("keeps the empty grouping geometry equal to the prior version", async () => {
    const prior = withConstructionRoundHead(createBuildingConstructionGraph(), 0), migrated = withConstructionGroupedBays(prior, []);
    const a = await evaluateConstruction(prior), b = await evaluateConstruction(migrated);
    expect(b.ir.meshBatches).toEqual(a.ir.meshBatches); expect(b.ir.instanceBatches).toEqual(a.ir.instanceBatches);
    expect(b.ir.semanticIndex).toEqual(a.ir.semanticIndex); expect(b.prototypes).toEqual(a.prototypes);
  });
  it("rejects missing scopes and ambiguous old overrides", async () => {
    const missing = graph(); missing.upperBayGroups![0].bayIndex = 19;
    await expect(evaluateConstruction(missing)).rejects.toThrow(/no longer exists/);
    const edited = withConstructionOpeningWidth(graph(), { target: { documentId: "authored-building", storeysNodeId: "facade", windowNodeId: "window", face: "front", floorIndex: 1, bayIndex: 0 }, widthM: 1 });
    await expect(evaluateConstruction(edited)).rejects.toThrow(/missing or ambiguous/);
  });
  it("compiles individually curved grouped openings without changing their stable semantic identities", async () => {
    const rectangular = graph(), curved = withConstructionRoundHead(rectangular, 1), before = structuredClone(curved);
    const [flat, arches] = await Promise.all([evaluateConstruction(rectangular), evaluateConstruction(curved)]);
    expect(curved).toEqual(before);
    const paths = (result: typeof flat) => result.ir.semanticIndex.filter(item => item.semanticPath.includes("/bay/0/opening/")).map(item => item.semanticPath);
    expect(paths(arches)).toEqual(paths(flat)); expect(paths(arches)).toHaveLength(6);
    expect(arches.ir.meshBatches.find(batch => batch.role === "wall")!.positions).not.toEqual(flat.ir.meshBatches.find(batch => batch.role === "wall")!.positions);
    expect(arches.prototypes).not.toEqual(flat.prototypes);
    const wall = arches.ir.meshBatches.find(batch => batch.role === "wall" && batch.batchId.includes("/facade/"))!;
    const covers = (mesh: typeof wall, x: number, y: number) => {
      const p = mesh.positions!, indices = mesh.indices!;
      for (let i = 0; i < indices.length; i += 3) {
        const points = [...indices.slice(i, i + 3)].map(index => [p[index * 3], p[index * 3 + 1], p[index * 3 + 2]]);
        if (points.some(point => Math.abs(point[2] + 4.2) > 1e-5)) continue;
        const cross = (a: number[], b: number[]) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
        const signs = [cross(points[0], points[1]), cross(points[1], points[2]), cross(points[2], points[0])];
        if (signs.every(value => value >= -1e-7) || signs.every(value => value <= 1e-7)) return true;
      }
      return false;
    };
    // The two apertures and their curved shoulders must align with the actual grouped centers.
    for (const center of [-4.77, -3.63]) { expect(covers(wall, center, 6.8)).toBe(false); expect(covers(wall, center + 0.4, 6.8)).toBe(true); }
    expect(covers(wall, -4.2, 6.3)).toBe(true);
    const triple = withConstructionRoundHead(withConstructionGroupedBays(createBuildingConstructionGraph(), [{ ...directive(), memberCount: 3, memberWidthM: 0.55 }]), 1);
    const tripleResult = await evaluateConstruction(triple), tripleWall = tripleResult.ir.meshBatches.find(batch => batch.role === "wall" && batch.batchId.includes("/facade/"))!;
    expect(paths(tripleResult)).toHaveLength(9);
    for (const center of [-4.99, -4.2, -3.41]) { expect(covers(tripleWall, center, 6.85)).toBe(false); expect(covers(tripleWall, center + 0.25, 6.85)).toBe(true); }
    const replay = await evaluateConstruction(JSON.parse(JSON.stringify(curved)));
    expect(replay.ir.meshBatches).toEqual(arches.ir.meshBatches); expect(replay.prototypes).toEqual(arches.prototypes);
  });
  it("preserves groups during roof edits and generation", async () => {
    const input = graph(), roof = withConstructionParapetSilhouette(withConstructionCorniceLayout(input, 1), 1);
    expect(roof.schemaVersion).toBe("0.11.0"); expect(roof.upperBayGroups).toEqual(input.upperBayGroups);
    expect((await evaluateConstruction(roof)).ir.semanticIndex.some(entry => entry.semanticPath.includes("/bay/0/opening/0/frame"))).toBe(true);
    expect((await resolveWorkbenchGeneration(input, null, defaultConstructionGenerationControls)).graph.upperBayGroups).toEqual(input.upperBayGroups);
  });
});
