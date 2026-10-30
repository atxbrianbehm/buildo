import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionRoundHead } from "../core/constructionRoundHeadVocabulary";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionGroupedBays } from "../core/constructionGroupedBayGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { evaluateConstructionFacadePierStudy } from "../compiler/evaluateConstructionFacadePierStudy";

const request = () => ({ schemaVersion: "0.1.0", kind: "construction-facade-pier-study-request", graph: withConstructionStorefront(createBuildingConstructionGraph("pier_study"), 1),
  pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 });

describe("facade pier compiler study", () => {
  it("derives upper openings from the real graph and adds only addressed pier geometry", async () => {
    const input = request(), original = structuredClone(input), baseline = await evaluateConstruction(input.graph), result = await evaluateConstructionFacadePierStudy(input);
    expect(input).toEqual(original); expect(result.graph).toEqual(input.graph);
    const piers = result.ir.meshBatches.filter(batch => batch.role === "facade-pier");
    expect(piers).toHaveLength(10); expect(new Set(piers.map(batch => batch.batchId)).size).toBe(10);
    expect(piers.every(batch => batch.materialSlotId === "trim.horizontal.primary" && batch.batchId.includes("/floor/") && batch.batchId.includes("/bay-edge/"))).toBe(true);
    expect(result.ir.meshBatches.filter(batch => batch.role !== "facade-pier")).toEqual(baseline.ir.meshBatches);
    expect(piers.every(batch => result.ir.semanticIndex.some(entry => entry.semanticPath === batch.batchId))).toBe(true);
    const footprint = input.graph.nodes.find(node => node.type === "Footprint")!.parameters;
    for (const pier of piers) {
      const z = Array.from(pier.positions!).filter((_, index) => index % 3 === 2);
      expect(Math.min(...z)).toBeLessThan(-footprint.depthM / 2 - 0.15);
      expect(Math.max(...z)).toBeGreaterThan(-footprint.depthM / 2);
      const y = Array.from(pier.positions!).filter((_, index) => index % 3 === 1);
      const floor = Number(pier.batchId.match(/\/floor\/(\d+)\//)![1]);
      const bottom = 4 + (floor - 1) * 3.7, top = bottom + 3.7;
      expect(Math.min(...y)).toBeGreaterThan(bottom);
      expect(Math.max(...y)).toBeLessThan(top - (floor === 2 ? 0.3 : 0.12));
    }
    expect(result.ir.instanceBatches).toEqual(baseline.ir.instanceBatches); expect(result.prototypes).toEqual(baseline.prototypes);
    expect(result.ir.sourceGraphHash).not.toBe(baseline.ir.sourceGraphHash);
    expect(await evaluateConstructionFacadePierStudy(input)).toEqual(result);
  });
  it("fits around round-headed upper openings without changing their executed geometry", async () => {
    const input = request(); input.graph = withConstructionRoundHead(input.graph, 1);
    const baseline = await evaluateConstruction(input.graph), study = await evaluateConstructionFacadePierStudy(input);
    expect(study.ir.meshBatches.filter(batch => batch.role === "facade-pier")).toHaveLength(10);
    expect(study.ir.meshBatches.filter(batch => batch.role !== "facade-pier")).toEqual(baseline.ir.meshBatches);
    expect(study.ir.instanceBatches).toEqual(baseline.ir.instanceBatches);
  });
  it("derives grouped opening clearances and rejects oversized piers without changing the original graph", async () => {
    const input = request(); input.graph = withConstructionGroupedBays(input.graph, [{ storeysNodeId: "facade", floorIndex: 1, bayIndex: 0, memberCount: 2, memberWidthM: 0.6, pierWidthM: 0.24 }]);
    const before = structuredClone(input.graph), result = await evaluateConstructionFacadePierStudy(input);
    expect(result.ir.meshBatches.filter(batch => batch.role === "facade-pier")).toHaveLength(10);
    expect(input.graph).toEqual(before);
    await expect(evaluateConstructionFacadePierStudy({ ...input, pierWidthM: 0.8, clearanceM: 0.5 })).rejects.toThrow(/conflicts with an opening|clearance/);
    const altered = structuredClone(input); altered.graph.nodes.find(node => node.type === "EmitWall")!.bypassed = true;
    await expect(evaluateConstructionFacadePierStudy(altered)).rejects.toThrow(/one active wall/);
    const partial = request();
    partial.graph.nodes.find(node => node.type === "SelectScopes")!.parameters.bayIndex = 0;
    partial.graph.nodes.find(node => node.type === "EmitWall")!.input.nodeId = "selection";
    await expect(evaluateConstructionFacadePierStudy(partial)).rejects.toThrow(/all upper-front floors and bays/);
  });
});
