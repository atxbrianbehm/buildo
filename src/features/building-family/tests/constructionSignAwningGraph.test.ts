import { describe, expect, it } from "vitest";
import { BayConstructionGraphSchema, createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { withConstructionStorefrontSign, withoutConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance, withoutConstructionSignAwning } from "../core/constructionSignAwningGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { evaluateConstructionSignAwningBuildingStudy } from "../compiler/evaluateConstructionSignAwningBuildingStudy";
import { BayConstructionWorkerReplySchema, BayConstructionWorkerRequestSchema } from "../compiler/bayConstructionWorkerProtocol";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";
import { supportsGroupedConstruction } from "../ui/constructionBuildingBindings";

describe("versioned sign and awning graph", () => {
  it("retains authored geometry and matches the building study", async () => {
    const base = withConstructionAwningSupports(withConstructionAwnings(withConstructionStorefront(createBuildingConstructionGraph("shared_graph"), 1),
      [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]), [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
    const sign = { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }, signed = withConstructionStorefrontSign(base, sign);
    const graph = withConstructionSignAwningClearance(signed, 0.04), original = structuredClone(graph);
    expect(supportsGroupedConstruction(graph)).toBe(true);
    expect(withoutConstructionStorefrontSign(graph)).toEqual(base);
    const adjusted = withConstructionStorefrontSign(graph, { ...sign, projectionM: 0.1 });
    expect(adjusted.schemaVersion).toBe("0.17.0"); expect(adjusted.signAwningGapM).toBe(graph.signAwningGapM);
    expect(adjusted.awnings).toEqual(graph.awnings); expect(adjusted.awningSupports).toEqual(graph.awningSupports);
    expect(BayConstructionGraphSchema.safeParse({ ...adjusted, storefrontSign: { ...sign, bayIndex: 2 } }).success).toBe(false);
    await expect(evaluateConstruction(signed)).rejects.toThrow(/shared clearance/);
    const result = await evaluateConstruction(JSON.parse(JSON.stringify(graph)));
    const study = await evaluateConstructionSignAwningBuildingStudy({ schemaVersion: "0.1.0", kind: "construction-sign-awning-building-study-request", graph: base, ...sign, gapM: 0.04 });
    expect(result.ir.meshBatches).toEqual(study.ir.meshBatches); expect(result.ir.instanceBatches).toEqual(study.ir.instanceBatches);
    expect(result.graph).toEqual(original); expect(graph).toEqual(original);
    expect(BayConstructionGraphSchema.safeParse({ ...graph, schemaVersion: "0.16.0" }).success).toBe(false);
    expect(BayConstructionGraphSchema.safeParse({ ...graph, signAwningGapM: undefined }).success).toBe(false);
    expect(BayConstructionGraphSchema.safeParse({ ...graph, awnings: undefined }).success).toBe(false);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.17.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(true);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.16.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(false);
    expect(BayConstructionWorkerReplySchema.safeParse({ schemaVersion: "0.17.0", type: "bay-result", requestId: 1, result }).success).toBe(true);
    expect(BayConstructionWorkerReplySchema.safeParse({ schemaVersion: "0.16.0", type: "bay-result", requestId: 1, result }).success).toBe(false);
    await expect(resolveWorkbenchGeneration(graph, null, defaultConstructionGenerationControls)).rejects.toThrow(/not yet supported/);
    await expect(evaluateConstruction(graph, "window")).rejects.toThrow(/complete matching graph/);
  });
});

it("removes only the shared awning and its rods while keeping the sign and other bay", async () => {
  const base = withConstructionAwningSupports(withConstructionAwnings(withConstructionStorefront(createBuildingConstructionGraph("remove_combined"), 1),
    [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }, { bayIndex: 1, projectionM: 0.8, dropM: 0.4, valanceHeightM: 0.2 }]),
    [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }, { bayIndex: 1, anchorRiseM: 0.15, thicknessM: 0.03 }]);
  const sign = { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }, combined = withConstructionSignAwningClearance(withConstructionStorefrontSign(base, sign), 0.04);
  const result = withoutConstructionSignAwning(combined);
  expect(result.schemaVersion).toBe("0.16.0"); expect(result.storefrontSign).toEqual(sign); expect(result.signAwningGapM).toBeUndefined();
  expect(result.awnings).toEqual([base.awnings![1]]); expect(result.awningSupports).toEqual([base.awningSupports![1]]);
  expect((await evaluateConstruction(result)).ir.meshBatches.some(batch => batch.role === "sign.panel")).toBe(true);
  expect(combined.awnings).toEqual(base.awnings); expect(() => withoutConstructionSignAwning(result)).toThrow(/combined/);
});
