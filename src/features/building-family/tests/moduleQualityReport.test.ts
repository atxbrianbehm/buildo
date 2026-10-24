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
      // Split checklist may be IR-proxied when no splitEvidence is supplied.
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

  it("measures positive physical frame widths after proper front, rear and side rotations", async () => {
    const fixture = await createAssemblyHallFixture({
      promptControls: { ...defaultBuildingPromptControls, fidelityMode: "kit", detailLevel: "high" }
    });
    try {
      const nominalWidth = fixture.catalog.recipes.find((recipe) => recipe.role === "window")!.dimensionsM.width;
      // Known physical widths and proper rotations. Unequal height/depth scales
      // prevent a projected row or another basis axis from impersonating width.
      const cases = [
        { facade: "front", width: 1.2, matrix: [-1.2 / nominalWidth, 0, 0, 0, 0, 1.7, 0, 0, 0, 0, -0.4, 0, 0, 5, -8, 1] },
        { facade: "rear", width: 1.4, matrix: [1.4 / nominalWidth, 0, 0, 0, 0, 1.7, 0, 0, 0, 0, 0.4, 0, 0, 5, 8, 1] },
        { facade: "left", width: 1.6, matrix: [0, 0, 1.6 / nominalWidth, 0, 0, 1.7, 0, 0, -0.4, 0, 0, 0, -9, 5, 0, 1] },
        { facade: "right", width: 1.8, matrix: [0, 0, -1.8 / nominalWidth, 0, 0, 1.7, 0, 0, 0.4, 0, 0, 0, 9, 5, 0, 1] }
      ];
      const measuredOpening = (matrices: number[][]) => createModuleQualityReport({
        fixture: {
          ...fixture,
          ir: {
            ...fixture.ir,
            instanceBatches: fixture.ir.instanceBatches.map((batch) => batch.batchId === "instances.window"
              ? { ...batch, count: matrices.length, transforms: new Float32Array(matrices.flat()) }
              : batch)
          }
        },
        detailLevel: "high"
      }).checklist.find((row) => row.category === "openingDepth")!;
      for (const sample of cases) {
        const row = measuredOpening([sample.matrix]);
        expect(row.measuredValue, sample.facade).toEqual(expect.objectContaining({
          avgFrameWidthM: expect.closeTo(sample.width, 5), slotLockedFrames: true
        }));
        expect(row.status, sample.facade).toBe("pass");
      }
      expect(measuredOpening(cases.map((sample) => sample.matrix)).measuredValue).toEqual(expect.objectContaining({
        avgFrameWidthM: expect.closeTo(1.5, 5), slotLockedFrames: true
      }));
    } finally {
      fixture.familyRuntime.dispose();
    }
  });
});
