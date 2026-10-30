import { createBuildingConstructionGraph, BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { BayConstructionWorkerRequestSchema, BayConstructionWorkerReplySchema } from "../compiler/bayConstructionWorkerProtocol";

it("compiles opt-in scoped support rods with deterministic identities and preserves old output", async () => {
  const base = withConstructionAwnings(withConstructionStorefront(createBuildingConstructionGraph(), 1), [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
  const before = await evaluateConstruction(base);
  const graph = withConstructionAwningSupports(base, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
  const result = await evaluateConstruction(graph), replay = await evaluateConstruction(JSON.parse(JSON.stringify(graph)));
  const rods = result.ir.meshBatches.filter(batch => batch.role === "awning.support");
  expect(rods).toHaveLength(1); expect(rods[0].materialSlotId).toBe("ornament.primary");
  expect(rods[0]).toEqual(replay.ir.meshBatches.find(batch => batch.role === "awning.support"));
  expect(result.ir.semanticIndex.filter(entry => entry.semanticPath.includes("awning.support"))).toHaveLength(1);
  expect(result.ir.meshBatches.filter(batch => batch.role !== "awning.support")).toEqual(before.ir.meshBatches);
  expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.14.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(true);
  expect(BayConstructionWorkerRequestSchema.safeParse({ schemaVersion: "0.13.0", type: "evaluate-bay", requestId: 1, graph }).success).toBe(false);
  expect(BayConstructionWorkerReplySchema.safeParse({ schemaVersion: "0.14.0", type: "bay-result", requestId: 1, result }).success).toBe(true);
  expect(BayConstructionGraphSchema.safeParse({ ...graph, schemaVersion: "0.13.0" }).success).toBe(false);
  await expect(resolveWorkbenchGeneration(graph, null, defaultConstructionGenerationControls)).rejects.toThrow(/cannot yet be regenerated/);
  expect(() => withConstructionAwningSupports(base, [{ bayIndex: 1, anchorRiseM: 0.15, thicknessM: 0.03 }])).toThrow(/unique authored awning/);
  expect(() => withConstructionAwningSupports(base, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }, { bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }])).toThrow(/unique authored awning/);
});
