import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { defaultBuildingPromptControls } from "../state/buildingStore";
import {
  createVisualQaPacket,
  parseVisualQaPacket,
  VISUAL_QA_PACKET_KIND
} from "../qa/visualQaPacket";

describe("visualQaPacket", () => {
  it("creates a schema-valid exportable visual QA packet from a fixture", async () => {
    const fixture = await createAssemblyHallFixture({
      promptControls: { ...defaultBuildingPromptControls, fidelityMode: "kit" }
    });

    try {
      const packet = await createVisualQaPacket({
        fixture,
        seeds: defaultBuildingPromptControls.seeds,
        detailLevel: "high",
        screenshotTargetRoute: "#room=assemblyHall",
        benchmarkProfileId: "profile-demo",
        now: () => new Date("2026-07-12T12:00:00.000Z")
      });

      expect(packet.packetKind).toBe(VISUAL_QA_PACKET_KIND);
      expect(packet.createdAt).toBe("2026-07-12T12:00:00.000Z");
      expect(packet.fidelityMode).toBe("kit");
      expect(packet.screenshotTargetRoute).toBe("#room=assemblyHall");
      expect(packet.hashes.atlasContentHash).toBe(fixture.packedAtlas.contentHash);
      expect(packet.hashes.sourceGraphHash).toBe(fixture.ir.sourceGraphHash);
      expect(packet.hashes.contentFingerprint.length).toBeGreaterThan(8);
      expect(packet.hashes.facadeSplitContentHash).toBe(packet.facadeSplit?.contentHash);
      expect(packet.facadeSplit?.openingCount).toBeGreaterThan(0);
      expect(packet.facadeSplit?.wallPieceCount).toBeGreaterThan(0);
      expect(packet.qualityReport.checklist.length).toBeGreaterThanOrEqual(12);
      expect(
        packet.qualityReport.checklist.some((item) => item.label.includes("Facade split plan"))
      ).toBe(true);
      expect(packet.clayQualityGate?.gateOpen).toBe(true);
      expect(packet.clayQualityGate?.criteria.some((row) => row.id === "split-hash-qa")).toBe(true);
      expect(packet.fieldCoverage.measured.length).toBeGreaterThan(0);
      expect(packet.benchmarkProfileId).toBe("profile-demo");
      expect(parseVisualQaPacket(packet)).toEqual(packet);
    } finally {
      fixture.familyRuntime.dispose();
    }
  });
});
