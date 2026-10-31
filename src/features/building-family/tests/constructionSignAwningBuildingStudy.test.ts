import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { evaluateConstructionSignAwningBuildingStudy } from "../compiler/evaluateConstructionSignAwningBuildingStudy";
import { CONSTRUCTION_AWNING_FABRIC_SLOT } from "../contracts/constructionAwningFabric";

const request = (supports: boolean) => {
  const base = withConstructionStorefront(createBuildingConstructionGraph("combined_study"), 1);
  const awnings = withConstructionAwnings(base, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }, { bayIndex: 1, projectionM: 0.8, dropM: 0.4, valanceHeightM: 0.2 }]);
  const graph = supports ? withConstructionAwningSupports(awnings, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]) : awnings;
  return { schemaVersion: "0.1.0", kind: "construction-sign-awning-building-study-request", graph, bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035, gapM: 0.04 };
};
const yBounds = (positions: ArrayLike<number>) => {
  const values = Array.from(positions).filter((_, index) => index % 3 === 1);
  return { min: Math.min(...values), max: Math.max(...values) };
};

describe("whole-building sign and awning study", () => {
  it.each([false, true])("compiles a fitted canopy and optional rods with support=%s", async (supports) => {
    const input = request(supports), original = structuredClone(input), baseline = await evaluateConstruction(input.graph);
    const result = await evaluateConstructionSignAwningBuildingStudy(input), batches = result.ir.meshBatches;
    const inBay = (role: string) => batches.find(batch => batch.role === role && batch.batchId.includes("/floor/0/bay/0/"))!;
    const sign = inBay("sign.panel"), canopy = inBay("awning.canopy"), rod = inBay("awning.support");
    expect(sign).toBeDefined(); expect(canopy.materialSlotId).toBe(CONSTRUCTION_AWNING_FABRIC_SLOT);
    expect(yBounds(sign.positions!).min - yBounds(canopy.positions!).max).toBeGreaterThanOrEqual(input.gapM - 1e-6);
    if (supports) { expect(rod.materialSlotId).toBe("ornament.primary"); expect(yBounds(sign.positions!).min - yBounds(rod.positions!).max).toBeGreaterThanOrEqual(input.gapM - 1e-6); }
    else expect(rod).toBeUndefined();
    const otherBay = (role: string) => batches.find(batch => batch.role === role && batch.batchId.includes("/floor/0/bay/1/"));
    expect(otherBay("awning.canopy")).toEqual(baseline.ir.meshBatches.find(batch => batch.role === "awning.canopy" && batch.batchId.includes("/floor/0/bay/1/")));
    expect(result.ir.instanceBatches).toEqual(baseline.ir.instanceBatches); expect(result.graph).toEqual(input.graph); expect(input).toEqual(original);
    expect(await evaluateConstructionSignAwningBuildingStudy(input)).toEqual(result);
    const altered = await evaluateConstructionSignAwningBuildingStudy({ ...input, gapM: 0.03 });
    expect(altered.ir.sourceGraphHash).not.toBe(result.ir.sourceGraphHash);
  });
  it("rejects a missing awning and unsafe rod mounting", async () => {
    const input = request(true);
    await expect(evaluateConstructionSignAwningBuildingStudy({ ...input, bayIndex: 2 })).rejects.toThrow(/existing awning/);
    await expect(evaluateConstructionSignAwningBuildingStudy({ ...input, gapM: 0.15 })).rejects.toThrow(/storefront opening/);
  });
});
