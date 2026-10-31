import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { compileConstructionGroupedFacadeRhythmStudy } from "../state/constructionGroupedFacadeRhythmStudy";

function fixture() {
  const storefront = withConstructionStorefront(createBuildingConstructionGraph("rhythm_study"), 1);
  const awnings = withConstructionAwnings(storefront, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
  const graph = withConstructionSignAwningClearance(withConstructionStorefrontSign(awnings, { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), 0.04);
  return { schemaVersion: "0.1.0" as const, kind: "construction-grouped-facade-rhythm-study" as const, graph,
    firstFloor: 1, lastFloor: 2, firstBay: 0, lastBay: 3, memberCount: 2 as const, memberWidthM: 0.6, pierWidthM: 0.24 };
}

describe("grouped facade rhythm study", () => {
  it("compiles a deterministic two-storey rhythm while retaining the signed storefront", async () => {
    const request = fixture(), original = structuredClone(request);
    const result = await compileConstructionGroupedFacadeRhythmStudy(request);
    expect(request).toEqual(original);
    expect(result.graph.upperBayGroups).toHaveLength(8);
    expect(result.graph.storefrontSign).toEqual(request.graph.storefrontSign);
    expect(result.graph.awnings).toEqual(request.graph.awnings);
    expect(result.graph.signAwningGapM).toBe(request.graph.signAwningGapM);
    expect(result.construction.ir.meshBatches.some(batch => batch.role === "sign.panel")).toBe(true);
    expect((await compileConstructionGroupedFacadeRhythmStudy(request)).construction.ir.sourceGraphHash).toBe(result.construction.ir.sourceGraphHash);
  });
  it("rejects invalid extents, overlapping authored groups and invalid physical fit", async () => {
    const request = fixture();
    await expect(compileConstructionGroupedFacadeRhythmStudy({ ...request, lastFloor: 20 })).rejects.toThrow(/range/);
    const first = await compileConstructionGroupedFacadeRhythmStudy(request);
    await expect(compileConstructionGroupedFacadeRhythmStudy({ ...request, graph: first.graph })).rejects.toThrow(/conflicts/);
    const edited = structuredClone(request.graph), edits = edited.nodes.find(node => node.type === "EditOpeningWidth")!;
    edits.overrides.push({ target: { documentId: edited.documentId, storeysNodeId: "facade", windowNodeId: "window", face: "front", floorIndex: 1, bayIndex: 1 }, widthM: 1.1 });
    await expect(compileConstructionGroupedFacadeRhythmStudy({ ...request, graph: edited })).rejects.toThrow(/local width edit/);
    await expect(compileConstructionGroupedFacadeRhythmStudy({ ...request, memberWidthM: 20 })).rejects.toThrow();
  });
});
