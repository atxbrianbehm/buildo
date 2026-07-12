import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import {
  createModuleQualityReport,
  MODULE_QUALITY_REPORT_KIND,
  parseModuleQualityReport
} from "../qa/moduleQualityReport";

describe("moduleQualityReport", () => {
  it("evaluates kit-mode high-detail checklist items from fixture evidence", async () => {
    const fixture = await createAssemblyHallFixture({
      promptControls: { ...defaultBuildingPromptControls, fidelityMode: "kit", detailLevel: "high" }
    });

    try {
      const report = createModuleQualityReport({ fixture, detailLevel: "high" });
      expect(report.reportKind).toBe(MODULE_QUALITY_REPORT_KIND);
      expect(report.fidelityMode).toBe("kit");
      expect(report.checklist.length).toBeGreaterThanOrEqual(11);
      expect(report.checklist.map((item) => item.category)).toEqual(
        expect.arrayContaining([
          "silhouette",
          "openingDepth",
          "materialScale",
          "sideRearTreatment",
          "performanceBudget"
        ])
      );
      expect(report.checklist.find((item) => item.category === "openingDepth")?.status).toBe("pass");
      expect(report.checklist.find((item) => item.category === "materialScale")?.status).toBe("pass");
      expect(report.checklist.find((item) => item.category === "sideRearTreatment")?.status).toBe("pass");
      expect(report.summary.passCount).toBeGreaterThan(0);
      expect(parseModuleQualityReport(report)).toEqual(report);
    } finally {
      fixture.familyRuntime.dispose();
    }
  });

  it("marks side/rear coverage estimated in proof mode", async () => {
    const fixture = await createAssemblyHallFixture({
      promptControls: { ...defaultBuildingPromptControls, fidelityMode: "proof" }
    });

    try {
      const report = createModuleQualityReport({ fixture });
      expect(report.checklist.find((item) => item.category === "sideRearTreatment")?.status).toBe("estimated");
      expect(report.knownGaps.some((gap) => gap.includes("Proof fidelity"))).toBe(true);
    } finally {
      fixture.familyRuntime.dispose();
    }
  });
});
