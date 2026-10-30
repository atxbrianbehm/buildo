import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph, BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { resolveConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { resolveConstructionFamily } from "../state/constructionFamilyGeneration";
import { resolveWorkbenchGeneration, defaultConstructionGenerationControls } from "../state/constructionGenerationState";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionRoundHead } from "../core/constructionRoundHeadVocabulary";
import { withConstructionFacadePiers, withoutConstructionFacadePiers } from "../core/constructionFacadePierGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { evaluateConstructionFacadePierStudy } from "../compiler/evaluateConstructionFacadePierStudy";
import { BayConstructionWorkerRequestSchema, BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";

const directive = { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 };
describe("facade pier graph and worker", () => {
  it("retains authored awnings and supports and guards generation until it can preserve piers", async () => {
    const awning = withConstructionAwnings(withConstructionStorefront(createBuildingConstructionGraph("pier_graph"), 1), [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    const supported = withConstructionAwningSupports(awning, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
    const graph = withConstructionFacadePiers(supported, directive), compiled = await evaluateConstruction(graph);
    expect(graph.awnings).toEqual(supported.awnings); expect(graph.awningSupports).toEqual(supported.awningSupports);
    expect(withoutConstructionFacadePiers(graph)).toEqual(supported); expect(graph.facadePiers).toEqual(directive);
    expect(compiled.ir.meshBatches.filter(batch => batch.role === "awning.support")).toHaveLength(1);
    await expect(resolveWorkbenchGeneration(graph, null, defaultConstructionGenerationControls)).rejects.toThrow(/not yet supported in building generation/);
    const plan = resolveConstructionFamilyPlan({ schemaVersion: "0.1.0", kind: "construction-family-request", familyId: "test_family", familySeed: "seed", graph });
    await expect(resolveConstructionFamily(plan, null, defaultConstructionGenerationControls)).rejects.toThrow(/not yet supported in family generation/);
  });
  it("executes the versioned directive with study geometry and a graph-derived hash", async () => {
    const old = withConstructionRoundHead(withConstructionStorefront(createBuildingConstructionGraph("pier_graph"), 1), 0), snapshot = structuredClone(old);
    const graph = withConstructionFacadePiers(old, directive);
    expect(old).toEqual(snapshot); expect(graph.schemaVersion).toBe("0.15.0");
    expect(withoutConstructionFacadePiers(graph)).toEqual(old);
    const result = await evaluateConstruction(graph), study = await evaluateConstructionFacadePierStudy({ schemaVersion: "0.1.0", kind: "construction-facade-pier-study-request", graph: old, ...directive });
    expect(result.ir.meshBatches).toEqual(study.ir.meshBatches); expect(result.ir.instanceBatches).toEqual(study.ir.instanceBatches);
    expect(result.ir.meshBatches.filter(batch => batch.role === "facade-pier")).toHaveLength(10);
    expect(await evaluateConstruction(graph)).toEqual(result);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.15.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(true);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.14.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(false);
    expect(BayConstructionWorkerReplySchema.safeParse({ schemaVersion: "0.15.0", type: "bay-result", requestId: 1, result }).success).toBe(true);
    expect(BayConstructionWorkerReplySchema.safeParse({ schemaVersion: "0.14.0", type: "bay-result", requestId: 1, result }).success).toBe(false);
    expect(BayConstructionGraphSchema.safeParse({ ...graph, schemaVersion: "0.10.0" }).success).toBe(false);
    expect(BayConstructionGraphSchema.safeParse({ ...graph, facadePiers: undefined }).success).toBe(false);
  });
});
