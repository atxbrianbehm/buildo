import { densifyProfile, horizontalMoldingFromProfile, sweepProfileToBoxPrimitives } from "../compiler/profileSweepGeometry";
import {
  late19cBeltProfile,
  late19cCorniceProfile,
  late19cPilasterProfile,
  listProfileDefinitions,
  requireProfileDefinition,
  scaleProfileToHeight
} from "../compiler/profileLibrary";

describe("profile library + sweep expander", () => {
  it("exposes authored late-19c profiles with non-decreasing u spans", () => {
    const profiles = listProfileDefinitions();
    expect(profiles.length).toBeGreaterThanOrEqual(4);
    for (const profile of profiles) {
      const loaded = requireProfileDefinition(profile.id);
      expect(loaded.points.length).toBeGreaterThanOrEqual(3);
      for (let index = 1; index < loaded.points.length; index += 1) {
        expect(loaded.points[index].u).toBeGreaterThanOrEqual(loaded.points[index - 1].u);
      }
    }
  });

  it("densifies and scales cornice profiles then sweeps to multi-segment solids", () => {
    const scaled = densifyProfile(scaleProfileToHeight(late19cCorniceProfile, 0.9), 2);
    const segments = horizontalMoldingFromProfile({
      profile: scaled,
      center: [0, 10, -8],
      widthM: 20
    });
    expect(scaled.points.length).toBeGreaterThan(late19cCorniceProfile.points.length);
    expect(segments.length).toBeGreaterThanOrEqual(8);
    for (const segment of segments) {
      expect(segment.positions.length).toBeGreaterThan(0);
      expect(segment.indices.length % 3).toBe(0);
    }
  });

  it("sweeps pilaster half-profiles along a vertical run", () => {
    const shaft = sweepProfileToBoxPrimitives({
      profile: densifyProfile(late19cPilasterProfile, 2),
      center: [0, 5, -9],
      runLengthM: 10,
      runAxis: "y"
    });
    expect(shaft.length).toBeGreaterThanOrEqual(4);
    const belt = horizontalMoldingFromProfile({
      profile: densifyProfile(scaleProfileToHeight(late19cBeltProfile, 0.3), 2),
      center: [0, 4, -9],
      widthM: 18
    });
    expect(belt.length).toBeGreaterThanOrEqual(3);
  });
});
