import { describe, expect, it } from "vitest";
import { resolveConstructionParapetSilhouette, readConstructionParapetSilhouettePlan } from "../core/constructionParapetSilhouette";
import type { ConstructionParapetSilhouetteRequest } from "../contracts/constructionParapetSilhouette";

function request(treatment: ConstructionParapetSilhouetteRequest["treatment"] = "raised-center"): ConstructionParapetSilhouetteRequest {
  return { schemaVersion: "0.1.0", kind: "construction-parapet-silhouette-request", treatment,
    building: { widthM: 12, depthM: 10, heightM: 11 }, parapet: { heightM: 0.8, copingProjectionM: 0.08 } };
}

describe("construction parapet silhouette planning", () => {
  it("plans a centered rise with continuous, balanced shoulders and a step-following coping path", () => {
    const plan = resolveConstructionParapetSilhouette(request());
    expect(plan.baseM).toBe(11);
    expect(plan.lowTopM).toBeCloseTo(11.8);
    expect(plan.highTopM).toBeCloseTo(12.4);
    expect(plan.spans.map(s => [s.startM, s.endM])).toEqual([[-6, -3], [-3, 3], [3, 6]]);
    expect(plan.spans.map(s => s.topM)).toEqual([plan.lowTopM, plan.highTopM, plan.lowTopM]);
    expect(plan.copingPath).toEqual([
      { alongM: -6, topM: plan.lowTopM }, { alongM: -3, topM: plan.lowTopM },
      { alongM: -3, topM: plan.highTopM }, { alongM: 3, topM: plan.highTopM },
      { alongM: 3, topM: plan.lowTopM }, { alongM: 6, topM: plan.lowTopM }
    ]);
  });

  it("keeps flat as one uninterrupted span and copies input ownership", () => {
    const source = request("flat"); const plan = resolveConstructionParapetSilhouette(source);
    expect(plan.highTopM).toBe(plan.lowTopM);
    expect(plan.spans).toEqual([{ startM: -6, endM: 6, topM: plan.lowTopM }]);
    expect(plan.copingPath).toHaveLength(2);
    source.building.widthM = 20; source.parapet.heightM = 1;
    expect(plan.source.building.widthM).toBe(12); expect(plan.source.parapet.heightM).toBe(0.8);
  });

  it.each([[3, 3, 2.5, 0.2, 0.02], [12, 10, 11, 0.8, 0.08], [100, 100, 100, 1.2, 0.2]])("preserves contiguous physical spans at dimensions %s/%s/%s", (widthM, depthM, heightM, parapetHeightM, copingProjectionM) => {
    const source = request(); source.building = { widthM, depthM, heightM };
    source.parapet = { heightM: parapetHeightM, copingProjectionM };
    const plan = resolveConstructionParapetSilhouette(source);
    expect(plan.spans[0].startM).toBe(-widthM / 2);
    expect(plan.spans[2].endM).toBe(widthM / 2);
    for (let i = 0; i < plan.spans.length; i++) {
      const span = plan.spans[i]; expect(span.endM).toBeGreaterThan(span.startM);
      expect(span.topM).toBeGreaterThan(plan.baseM);
      if (i) expect(span.startM).toBe(plan.spans[i - 1].endM);
    }
    expect(plan.spans[0].endM - plan.spans[0].startM).toBe(plan.spans[2].endM - plan.spans[2].startM);
    expect(readConstructionParapetSilhouettePlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    expect(resolveConstructionParapetSilhouette(source)).toEqual(plan);
  });

  it("rejects footprints without room for shoulders and coping", () => {
    const source = request(); source.building.widthM = 4 * (0.22 + 2 * source.parapet.copingProjectionM);
    expect(() => resolveConstructionParapetSilhouette(source)).toThrow(/do not fit/);
    source.building.widthM += 0.01; expect(() => resolveConstructionParapetSilhouette(source)).not.toThrow();
    source.building.depthM = 0.44 + 2 * source.parapet.copingProjectionM;
    expect(() => resolveConstructionParapetSilhouette(source)).toThrow(/do not fit/);
  });

  it("rejects malformed, nonfinite, non-JSON and altered derived data", () => {
    for (const input of [null, {}, { ...request(), extra: true }, { ...request(), treatment: "other" },
      { ...request(), building: { ...request().building, widthM: Infinity } },
      { ...request(), parapet: { ...request().parapet, heightM: NaN } },
      { ...request(), unexpected: () => 1 }]) {
      expect(() => resolveConstructionParapetSilhouette(input)).toThrow();
    }
    const plan = resolveConstructionParapetSilhouette(request());
    const altered = structuredClone(plan); altered.copingPath[2].topM += 0.01;
    expect(() => readConstructionParapetSilhouettePlan(altered)).toThrow(/does not match/);
    altered.copingPath[2].topM = plan.copingPath[2].topM; altered.spans.reverse();
    expect(() => readConstructionParapetSilhouettePlan(altered)).toThrow(/does not match/);
  });
});
