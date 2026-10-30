import { describe, expect, it } from "vitest";
import { BayConstructionGraphSchema, createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionFacadePiers } from "../core/constructionFacadePierGraph";
import { withConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { evaluateConstructionStorefrontSignStudy } from "../compiler/evaluateConstructionStorefrontSignStudy";
import { BayConstructionWorkerRequestSchema, BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";

describe("storefront sign graph and worker", () => {
  it("compiles a versioned sign with matching study geometry and retained piers", async () => {
    const base = withConstructionFacadePiers(withConstructionStorefront(createBuildingConstructionGraph("sign_graph"), 1),
      { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 });
    const directive = { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }, original = structuredClone(base);
    const graph = withConstructionStorefrontSign(base, directive), result = await evaluateConstruction(graph);
    const study = await evaluateConstructionStorefrontSignStudy({ schemaVersion: "0.1.0", kind: "construction-storefront-sign-study-request", graph: base, ...directive });
    expect(base).toEqual(original); expect(graph.schemaVersion).toBe("0.16.0"); expect(graph.facadePiers).toEqual(base.facadePiers);
    expect(result.ir.meshBatches).toEqual(study.ir.meshBatches); expect(result.ir.instanceBatches).toEqual(study.ir.instanceBatches);
    expect(result.ir.meshBatches.filter(batch => batch.role.startsWith("sign."))).toHaveLength(2);
    expect(await evaluateConstruction(graph)).toEqual(result);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.16.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(true);
    expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.15.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(false);
    expect(BayConstructionWorkerReplySchema.safeParse({ schemaVersion: "0.16.0", type: "bay-result", requestId: 1, result }).success).toBe(true);
    expect(BayConstructionGraphSchema.safeParse({ ...graph, schemaVersion: "0.15.0" }).success).toBe(false);
    expect(BayConstructionGraphSchema.safeParse({ ...graph, storefrontSign: undefined }).success).toBe(false);
    await expect(resolveWorkbenchGeneration(graph, null, defaultConstructionGenerationControls)).rejects.toThrow(/not yet supported/);
    await expect(evaluateConstruction(graph, "window")).rejects.toThrow(/complete matching graph/);
  });
});
