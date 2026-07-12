import {
  buildBoxPrimitive,
  type PrimitiveGeometry,
  type Vec3
} from "./primitiveGeometry";
import type { ProfileDefinition, ProfilePoint2 } from "./profileLibrary";

export type ProfileRunAxis = "x" | "y";

export interface SweepProfileAlongRunInput {
  profile: ProfileDefinition;
  /** World-space center of the run's bounding box. */
  center: Vec3;
  /** Length of the extrusion along the run axis (meters). */
  runLengthM: number;
  /** Which axis the profile is extruded along. */
  runAxis: ProfileRunAxis;
  /**
   * For runAxis "x": profile u maps to world Y, d to world Z (front facade).
   * For runAxis "y": profile u maps to half-width X (mirrored), d to world Z.
   */
  facadeSign?: 1 | -1;
}

/**
 * Expand an authored 2D profile into box segments — a Geometry-Nodes-like
 * "profile curve → solid" approximation without mesh booleans.
 */
export function sweepProfileToBoxPrimitives(input: SweepProfileAlongRunInput): PrimitiveGeometry[] {
  const points = input.profile.points;
  if (points.length < 2) {
    return [];
  }
  const facadeSign = input.facadeSign ?? 1;
  const primitives: PrimitiveGeometry[] = [];

  if (input.runAxis === "x") {
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      const u0 = Math.min(a.u, b.u);
      const u1 = Math.max(a.u, b.u);
      const height = Math.max(0.02, u1 - u0);
      const depth = Math.max(0.02, (a.d + b.d) / 2);
      const midU = (u0 + u1) / 2;
      // Center profile so u-mid of full span sits at center.y
      const uMin = points[0].u;
      const uMax = points[points.length - 1].u;
      const uMid = (uMin + uMax) / 2;
      const y = input.center[1] + (midU - uMid);
      const z = input.center[2] + facadeSign * (depth / 2 - 0.02);
      primitives.push(
        buildBoxPrimitive({
          center: [input.center[0], y, z],
          size: [input.runLengthM, height, depth]
        })
      );
    }
    return primitives;
  }

  // Vertical run: build shaft from mirrored half-profile (u = half-width).
  const halfWidths = points.map((point) => point.u);
  const maxHalf = Math.max(...halfWidths, 0.05);
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const halfW = Math.max(0.04, (a.u + b.u) / 2);
    const depth = Math.max(0.04, (a.d + b.d) / 2);
    // Stack layers along height using index as normalized band
    const band = 1 / (points.length - 1);
    const y0 = -input.runLengthM / 2 + index * band * input.runLengthM;
    const y1 = -input.runLengthM / 2 + (index + 1) * band * input.runLengthM;
    const height = Math.max(0.05, y1 - y0);
    const y = input.center[1] + (y0 + y1) / 2;
    primitives.push(
      buildBoxPrimitive({
        center: [input.center[0], y, input.center[2] + facadeSign * (depth / 2)],
        size: [halfW * 2, height, depth]
      })
    );
  }
  // Outer fillet at max projection for capital/base readability
  const tip = points[points.length - 1];
  primitives.push(
    buildBoxPrimitive({
      center: [input.center[0], input.center[1], input.center[2] + facadeSign * (tip.d * 0.55)],
      size: [maxHalf * 1.35, input.runLengthM * 0.08, tip.d * 0.45]
    })
  );
  void tip;
  return primitives;
}

/** Horizontal molding run on the front facade from an authored profile. */
export function horizontalMoldingFromProfile(input: {
  profile: ProfileDefinition;
  center: Vec3;
  widthM: number;
  facadeSign?: 1 | -1;
}): PrimitiveGeometry[] {
  return sweepProfileToBoxPrimitives({
    profile: input.profile,
    center: input.center,
    runLengthM: input.widthM,
    runAxis: "x",
    facadeSign: input.facadeSign
  });
}

/** Sample denser steps for smoother moldings (still box primitives). */
export function densifyProfile(profile: ProfileDefinition, stepsPerSegment = 2): ProfileDefinition {
  if (stepsPerSegment <= 1) {
    return profile;
  }
  const points: ProfilePoint2[] = [];
  for (let index = 0; index < profile.points.length - 1; index += 1) {
    const a = profile.points[index];
    const b = profile.points[index + 1];
    points.push(a);
    for (let step = 1; step < stepsPerSegment; step += 1) {
      const t = step / stepsPerSegment;
      points.push({
        u: a.u + (b.u - a.u) * t,
        d: a.d + (b.d - a.d) * t
      });
    }
  }
  points.push(profile.points[profile.points.length - 1]);
  return {
    ...profile,
    id: `${profile.id}.dense-${stepsPerSegment}`,
    points
  };
}
