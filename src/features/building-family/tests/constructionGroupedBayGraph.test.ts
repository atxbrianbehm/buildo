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
  it("rejects missing scopes, ambiguous old overrides and unsupported round heads", async () => {
    const missing = graph(); missing.upperBayGroups![0].bayIndex = 19;
    await expect(evaluateConstruction(missing)).rejects.toThrow(/no longer exists/);
    const edited = withConstructionOpeningWidth(graph(), { target: { documentId: "authored-building", storeysNodeId: "facade", windowNodeId: "window", face: "front", floorIndex: 1, bayIndex: 0 }, widthM: 1 });
    await expect(evaluateConstruction(edited)).rejects.toThrow(/missing or ambiguous/);
    await expect(evaluateConstruction(withConstructionRoundHead(graph(), 1))).rejects.toThrow(/does not match/);
  });
  it("preserves groups during roof edits and refuses generation until it can preserve them", async () => {
    const input = graph(), roof = withConstructionParapetSilhouette(withConstructionCorniceLayout(input, 1), 1);
    expect(roof.schemaVersion).toBe("0.11.0"); expect(roof.upperBayGroups).toEqual(input.upperBayGroups);
    expect((await evaluateConstruction(roof)).ir.semanticIndex.some(entry => entry.semanticPath.includes("/bay/0/opening/0/frame"))).toBe(true);
    await expect(resolveWorkbenchGeneration(input, null, defaultConstructionGenerationControls)).rejects.toThrow(/does not yet preserve grouped bays/);
  });
});
