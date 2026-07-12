import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import { buildFacadeSplitObservabilitySummary } from "../qa/facadeSplitObservability";
import {
  CLAY_QUALITY_GATE_KIND,
  evaluateClayQualityGate
} from "../qa/clayQualityGate";

describe("clayQualityGate (G8)", () => {
  it("opens the clay gate for default kit high-detail demo fixture", async () => {
    const fixture = await createAssemblyHallFixture({
      promptControls: { ...defaultBuildingPromptControls, fidelityMode: "kit", detailLevel: "high" }
    });
    try {
      const split = await buildFacadeSplitObservabilitySummary({
        spec: fixture.spec,
        catalog: fixture.catalog,
        fidelityMode: "kit"
      });
      const gate = evaluateClayQualityGate({
        fixture,
        split,
        detailLevel: "high",
        seedCompositionCount: 6
      });
      expect(gate.reportKind).toBe(CLAY_QUALITY_GATE_KIND);
      expect(gate.criteria.length).toBeGreaterThanOrEqual(10);
      expect(gate.summary.failCount).toBe(0);
      expect(gate.gateOpen).toBe(true);
      expect(gate.criteria.find((row) => row.id === "split-hash-qa")?.status).toBe("pass");
      expect(gate.criteria.find((row) => row.id === "kit-no-dual-openings")?.status).toBe("pass");
      expect(gate.criteria.find((row) => row.id === "storefront-hierarchy")?.status).toBe("pass");
    } finally {
      fixture.familyRuntime.dispose();
    }
  });
});
