import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph, BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { captureConstructionGenerationSource } from "../core/constructionGenerationSource";
import { resolveConstructionGeneration } from "../core/constructionGenerationResolver";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { resolveWorkbenchGeneration, defaultConstructionGenerationControls } from "../state/constructionGenerationState";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionRoundHead } from "../core/constructionRoundHeadVocabulary";
import { withConstructionFacadePiers, withoutConstructionFacadePiers } from "../core/constructionFacadePierGraph";
import { withConstructionOpeningWidth, withoutConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { withConstructionGroupedBays } from "../core/constructionGroupedBayGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { evaluateConstructionFacadePierStudy } from "../compiler/evaluateConstructionFacadePierStudy";
import { BayConstructionWorkerRequestSchema, BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";

const directive = { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 };
describe("facade pier graph and worker", () => {
  it("edits grouped windows while retaining facade piers and rejects a collision", async () => {
    const graph = withConstructionFacadePiers(createBuildingConstructionGraph("pier_group"), directive), original = structuredClone(graph);
    const group = { storeysNodeId: "facade", floorIndex: 1, bayIndex: 0, memberCount: 2, memberWidthM: 0.55, pierWidthM: 0.24 };
    const edited = withConstructionGroupedBays(graph, [group]);
    expect(edited.schemaVersion).toBe("0.15.0"); expect(edited.facadePiers).toEqual(directive);
    expect((await evaluateConstruction(edited)).ir.meshBatches.some(batch => batch.role === "facade-pier")).toBe(true);
    expect(withConstructionGroupedBays(edited, []).facadePiers).toEqual(directive);
    await expect(evaluateConstruction(withConstructionGroupedBays(graph, [{ ...group, memberWidthM: 0.9 }]))).rejects.toThrow(/conflicts with an opening clearance/);
    expect(graph).toEqual(original);
  });
  it("edits a local window while retaining piers and rejects a conflicting width", async () => {
    const graph = withConstructionFacadePiers(createBuildingConstructionGraph("pier_local"), directive), original = structuredClone(graph);
    const target = { documentId: graph.documentId, storeysNodeId: "facade", windowNodeId: "window", face: "front" as const, floorIndex: 1, bayIndex: 1 };
    const edited = withConstructionOpeningWidth(graph, { target, widthM: 1 });
    expect(edited.schemaVersion).toBe("0.15.0"); expect(edited.facadePiers).toEqual(directive);
    expect((await evaluateConstruction(edited)).ir.meshBatches.some(batch => batch.role === "facade-pier")).toBe(true);
    expect(withoutConstructionOpeningWidth(edited, target)).toEqual(original);
    const conflicting = withConstructionOpeningWidth(graph, { target, widthM: 2.4 });
    await expect(evaluateConstruction(conflicting)).rejects.toThrow(/conflicts with an opening clearance/);
    expect(graph).toEqual(original);
  });
  it("retains authored piers, awnings and supports or explicitly releases them", async () => {
    const awning = withConstructionAwnings(withConstructionStorefront(createBuildingConstructionGraph("pier_graph"), 1), [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    const supported = withConstructionAwningSupports(awning, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
    const graph = withConstructionFacadePiers(supported, directive), compiled = await evaluateConstruction(graph);
    expect(graph.awnings).toEqual(supported.awnings); expect(graph.awningSupports).toEqual(supported.awningSupports);
    expect(withoutConstructionFacadePiers(graph)).toEqual(supported); expect(graph.facadePiers).toEqual(directive);
    expect(compiled.ir.meshBatches.filter(batch => batch.role === "awning.support")).toHaveLength(1);
    const retained = await resolveWorkbenchGeneration(graph, null, defaultConstructionGenerationControls);
    expect(retained.graph.facadePiers).toEqual(directive); expect(retained.graph.awningSupports).toEqual(supported.awningSupports);
    const locked = await resolveWorkbenchGeneration(graph, null, { ...defaultConstructionGenerationControls, preserveAuthored: false, lockOpenings: true });
    expect(locked.graph.facadePiers).toEqual(directive);
    const released = await resolveWorkbenchGeneration(graph, null, { ...defaultConstructionGenerationControls, preserveAuthored: false });
    expect(released.graph.facadePiers).toBeUndefined(); expect(released.graph.awnings).toBeUndefined();
  });
  it("retains piers when an imported opening lock protects the layout", async () => {
    const initial = await resolveWorkbenchGeneration(createBuildingConstructionGraph("pier_lock"), null, defaultConstructionGenerationControls);
    const old = initial.source, pinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: old.documentId,
      intent: { ...old.intent, locks: [{ semanticPath: "construction/opening/widthM", scope: "building", lockedValue: 1.22, reason: "Imported pin" }] },
      recipe: old.recipe, reference: old.reference, intentionalExceptions: old.intentionalExceptions });
    const resolution = await resolveConstructionGeneration(pinned), template = (await normalizeBuildingSpec(pinned.intent, stylePack)).spec;
    const materialPlan = await planConstructionReferenceMaterials(template, pinned);
    const lineage = { schemaVersion: "0.1.0" as const, kind: "construction-generation-lineage" as const, source: pinned, resolution, materialPlan, materialSourceHash: "a".repeat(64) };
    const graph = withConstructionFacadePiers(initial.graph, directive);
    const result = await resolveWorkbenchGeneration(graph, lineage, { ...defaultConstructionGenerationControls, preserveAuthored: false, lockOpenings: false });
    expect(result.graph.facadePiers).toEqual(directive);
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
