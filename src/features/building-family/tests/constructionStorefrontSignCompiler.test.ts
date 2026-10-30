import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionFacadePiers } from "../core/constructionFacadePierGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { evaluateConstructionStorefrontSignStudy } from "../compiler/evaluateConstructionStorefrontSignStudy";
import { evaluateFacadeConstruction } from "../compiler/evaluateFacadeConstruction";
import { DEFAULT_BAY_MATERIALS } from "../compiler/evaluateBayConstruction";

const request = () => ({ schemaVersion: "0.1.0" as const, kind: "construction-storefront-sign-study-request" as const, graph: withConstructionStorefront(createBuildingConstructionGraph("sign_study"), 1),
  bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 });

describe("real-building storefront sign study", () => {
  it("compiles a scoped sign while preserving existing building geometry and identity", async () => {
    const input = request(), snapshot = structuredClone(input), baseline = await evaluateConstruction(input.graph), result = await evaluateConstructionStorefrontSignStudy(input);
    expect(input).toEqual(snapshot); expect(result.graph).toEqual(input.graph);
    expect(result.ir.meshBatches.filter(batch => batch.role.startsWith("sign.")).map(batch => batch.role).sort()).toEqual(["sign.frame", "sign.panel"]);
    expect(result.ir.meshBatches.filter(batch => !batch.role.startsWith("sign."))).toEqual(baseline.ir.meshBatches);
    expect(result.ir.instanceBatches).toEqual(baseline.ir.instanceBatches); expect(result.prototypes).toEqual(baseline.prototypes);
    expect(result.ir.meshBatches.filter(batch => batch.role.startsWith("sign.")).every(batch => batch.batchId.includes("/floor/0/bay/0/") && result.ir.semanticIndex.some(entry => entry.semanticPath === batch.batchId))).toBe(true);
    expect(result.ir.sourceGraphHash).not.toBe(baseline.ir.sourceGraphHash); expect(await evaluateConstructionStorefrontSignStudy(input)).toEqual(result);
  });
  it("derives awning conflict from the graph and rejects missing storefront scopes", async () => {
    const input = request(), awning = withConstructionAwnings(input.graph, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    await expect(evaluateConstructionStorefrontSignStudy({ ...input, graph: awning })).rejects.toThrow(/shared clearance/);
    const pierStudy = { schemaVersion: "0.1.0" as const, kind: "construction-facade-pier-study-request" as const, graph: input.graph,
      pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 };
    await expect(evaluateFacadeConstruction(input.graph, DEFAULT_BAY_MATERIALS, undefined, [], pierStudy, input)).rejects.toThrow(/two experimental studies/);
    await expect(evaluateConstructionStorefrontSignStudy({ ...input, heightM: 0.3 })).rejects.toThrow(/storey trim band/);
    await expect(evaluateConstructionStorefrontSignStudy({ ...input, bayIndex: 19 })).rejects.toThrow(/existing front storefront/);
    await expect(evaluateConstructionStorefrontSignStudy({ ...input, graph: createBuildingConstructionGraph("sign_study") })).rejects.toThrow(/existing front storefront/);
    const noWall = structuredClone(input.graph); noWall.nodes.find(node => node.type === "EmitWall")!.bypassed = true;
    await expect(evaluateConstructionStorefrontSignStudy({ ...input, graph: noWall })).rejects.toThrow(/matching storefront wall/);
    const otherBay = withConstructionAwnings(input.graph, [{ bayIndex: 2, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
    const pierGraph = withConstructionFacadePiers(otherBay, { pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 });
    const result = await evaluateConstructionStorefrontSignStudy({ ...input, graph: pierGraph });
    expect(result.ir.meshBatches.some(batch => batch.role === "awning.canopy")).toBe(true);
    expect(result.ir.meshBatches.some(batch => batch.role === "facade-pier")).toBe(true);
    expect(result.ir.meshBatches.some(batch => batch.role === "sign.panel")).toBe(true);
  });
});
