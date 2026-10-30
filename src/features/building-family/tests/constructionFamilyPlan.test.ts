import { describe, expect, it } from "vitest";
import { createBayConstructionGraph, createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionParapetSilhouette } from "../core/constructionParapetVocabulary";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { emptyConstructionComposition, setConstructionSurface } from "../core/constructionSurfaceAuthoring";
import { resolveConstructionFamilyPlan, readConstructionFamilyPlan } from "../core/constructionFamilyPlan";
import { evaluateConstruction } from "../compiler/evaluateConstruction";

function source() {
  const base = withConstructionParapetSilhouette(createBuildingConstructionGraph("authored"), 1);
  const edited = withConstructionOpeningWidth(base, { target: { documentId: base.documentId, storeysNodeId: "facade", windowNodeId: "window",
    face: "front", floorIndex: 1, bayIndex: 2 }, widthM: 1.8 });
  return { schemaVersion: "0.1.0" as const, kind: "construction-family-request" as const, familyId: "row_family", familySeed: "seed-family", graph: setConstructionSurface(edited, emptyConstructionComposition(edited.documentId)) };
}

describe("authored construction family plan", () => {
  it("owns six unique member graphs, rebasing exact local targets and surface documents", () => {
    const input = source(), before = structuredClone(input), plan = resolveConstructionFamilyPlan(input);
    expect(plan.members).toHaveLength(6); expect(input).toEqual(before);
    expect(new Set(plan.members.map(member => member.documentId)).size).toBe(6);
    expect(new Set(plan.members.map(member => member.buildingSeed)).size).toBe(6);
    for (const [index, member] of plan.members.entries()) {
      expect(member.ordinal).toBe(index + 1); expect(member.graph.documentId).toBe(member.documentId);
      expect(member.graph.nodes.find(node => node.type === "EditOpeningWidth")!.overrides[0].target.documentId).toBe(member.documentId);
      expect(member.graph.nodes.find(node => node.type === "SetSurface")!.composition.documentId).toBe(member.documentId);
      expect(member.graph.nodes.find(node => node.type === "BuildingRoof")!.parameters.parapetSilhouette).toBe(1);
    }
    input.graph.documentId = "changed"; expect(plan.source.graph.documentId).toBe("authored");
    plan.members[0].graph.nodes.find(node => node.type === "BuildingRoof")!.parameters.parapetSilhouette = 0;
    expect(plan.members[1].graph.nodes.find(node => node.type === "BuildingRoof")!.parameters.parapetSilhouette).toBe(1);
  });

  it("round-trips deterministically, rejects tampering and keeps identities stable across family seeds", () => {
    const input = source(), first = resolveConstructionFamilyPlan(input);
    expect(readConstructionFamilyPlan(JSON.parse(JSON.stringify(first)))).toEqual(first);
    expect(resolveConstructionFamilyPlan(input)).toEqual(first);
    const changed = resolveConstructionFamilyPlan({ ...input, familySeed: "another-seed" });
    expect(changed.members.map(m => m.documentId)).toEqual(first.members.map(m => m.documentId));
    expect(changed.members.map(m => m.buildingSeed)).not.toEqual(first.members.map(m => m.buildingSeed));
    const tampered = structuredClone(first); tampered.members[0].buildingSeed = "unexpected";
    expect(() => readConstructionFamilyPlan(tampered)).toThrow(/does not match/);
    const reordered = structuredClone(first); reordered.members.reverse();
    expect(() => readConstructionFamilyPlan(reordered)).toThrow(/does not match/);
  });

  it("rejects malformed requests and collisions with the source identity", () => {
    const input = source();
    expect(() => resolveConstructionFamilyPlan({ ...input, graph: createBayConstructionGraph() })).toThrow(/whole-building/);
    for (const value of [null, {}, { ...input, familyId: "invalid name" }, { ...input, familySeed: " " },
      { ...input, extra: true }, { ...input, familyId: "authored", graph: createBuildingConstructionGraph("authored_v01") }]) {
      expect(() => resolveConstructionFamilyPlan(value)).toThrow();
    }
  });

  it("compiles each rebased graph with distinct building semantic identities and preserved local geometry", async () => {
    const input = source(), plan = resolveConstructionFamilyPlan(input), original = await evaluateConstruction(input.graph);
    const outputs = await Promise.all(plan.members.map(member => evaluateConstruction(member.graph)));
    const allPaths = new Set<string>();
    for (let i = 0; i < outputs.length; i++) {
      const output = outputs[i]; expect(output.ir.buildingId).toBe(plan.members[i].documentId);
      expect(output.ir.metrics.triangleCount).toBe(original.ir.metrics.triangleCount);
      expect(output.ir.semanticIndex.length).toBe(original.ir.semanticIndex.length);
      for (const entry of output.ir.semanticIndex) { expect(entry.semanticPath).toContain(`building/${plan.members[i].documentId}/`); expect(allPaths.has(entry.semanticPath)).toBe(false); allPaths.add(entry.semanticPath); }
      expect(output.ir.bounds).toEqual(original.ir.bounds);
    }
  });
});
