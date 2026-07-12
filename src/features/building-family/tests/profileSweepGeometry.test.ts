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

  it("densifies and scales cornice profiles then extrudes a closed solid", () => {
    const scaled = densifyProfile(scaleProfileToHeight(late19cCorniceProfile, 0.9), 2);
    const segments = horizontalMoldingFromProfile({
      profile: scaled,
      center: [0, 10, -8],
      widthM: 20
    });
    expect(scaled.points.length).toBeGreaterThan(late19cCorniceProfile.points.length);
    expect(segments).toHaveLength(1);
    const solid = segments[0];
    // Closed profile loft: many ring edges × side quads + caps.
    expect(solid.positions.length / 3).toBeGreaterThan(40);
    expect(solid.indices.length).toBeGreaterThan(100);
    expect(solid.indices.length % 3).toBe(0);
    expect(solid.bounds.max[0] - solid.bounds.min[0]).toBeGreaterThan(19);
  });

  it("extrudes pilaster half-profiles along a vertical run as one solid", () => {
    const shaft = sweepProfileToBoxPrimitives({
      profile: densifyProfile(late19cPilasterProfile, 2),
      center: [0, 5, -9],
      runLengthM: 10,
      runAxis: "y"
    });
    expect(shaft).toHaveLength(1);
    expect(shaft[0].positions.length / 3).toBeGreaterThan(20);
    const belt = horizontalMoldingFromProfile({
      profile: densifyProfile(scaleProfileToHeight(late19cBeltProfile, 0.3), 2),
      center: [0, 4, -9],
      widthM: 18
    });
    expect(belt).toHaveLength(1);
    expect(belt[0].indices.length % 3).toBe(0);
  });
});
