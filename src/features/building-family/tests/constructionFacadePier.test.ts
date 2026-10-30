import { describe, expect, it } from "vitest";
import { resolveConstructionFacadePiers, readConstructionFacadePierPlan } from "../core/constructionFacadePier";
import { buildConstructionFacadePierGeometry } from "../compiler/constructionFacadePierGeometry";

const source = () => ({ schemaVersion: "0.1.0", kind: "construction-facade-pier-request", facadeWidthM: 12, bayCount: 4,
  floors: [1, 2].map((floorIndex, index) => ({ floorIndex, bottomM: 4.2 + index * 3.3, topM: 7.2 + index * 3.3,
    openingSpans: [[-5.5, -3.5], [-2.5, -0.5], [0.5, 2.5], [3.5, 5.5]] })),
  pierWidthM: 0.28, projectionM: 0.18, endHeightM: 0.15, clearanceM: 0.04 });

describe("procedural facade pier study", () => {
  it("owns and replays a bounded arrangement with distinct floor and bay-edge identities", () => {
    const input = source(), snapshot = structuredClone(input), plan = resolveConstructionFacadePiers(input);
    expect(input).toEqual(snapshot); expect(readConstructionFacadePierPlan(JSON.parse(JSON.stringify(plan)))).toEqual(plan);
    expect(plan.piers).toHaveLength(10);
    expect(new Set(plan.piers.map(pier => `${pier.floorIndex}/${pier.edgeIndex}`)).size).toBe(10);
    for (const pier of plan.piers) {
      expect(Math.abs(pier.centerXM) + pier.endWidthM / 2).toBeLessThanOrEqual(6 + 1e-9);
      for (const [left, right] of input.floors[pier.floorIndex - 1].openingSpans)
        expect(pier.centerXM + pier.endWidthM / 2 + input.clearanceM <= left || pier.centerXM - pier.endWidthM / 2 - input.clearanceM >= right).toBe(true);
    }
    const tampered = structuredClone(plan); tampered.piers[0].centerXM += 0.01;
    expect(() => readConstructionFacadePierPlan(tampered)).toThrow(/does not match/);
  });
  it("rejects conflicts with openings, insufficient vertical space and overlapping floors", () => {
    const conflict = source(); conflict.floors[0].openingSpans.push([-0.1, 0.1]);
    expect(() => resolveConstructionFacadePiers(conflict)).toThrow(/conflicts with an opening/);
    const short = source(); short.floors[0].topM = short.floors[0].bottomM + 0.35;
    expect(() => resolveConstructionFacadePiers(short)).toThrow(/too short/);
    const overlap = source(); overlap.floors[1].bottomM = overlap.floors[0].topM - 0.1;
    expect(() => resolveConstructionFacadePiers(overlap)).toThrow(/non-overlapping/);
    expect(() => resolveConstructionFacadePiers({ ...source(), bayCount: 20, pierWidthM: 0.8 })).toThrow(/clearance/);
  });
  it("builds three real outward-projecting solids per pier with finite geometry", () => {
    const plan = resolveConstructionFacadePiers(source()), piers = buildConstructionFacadePierGeometry(plan);
    expect(piers).toHaveLength(10);
    for (const pier of piers) {
      expect(pier.parts).toHaveLength(3);
      for (const part of pier.parts) {
        expect(part.positions.length).toBeGreaterThan(0); expect(part.indices.length).toBeGreaterThan(0);
        expect(part.positions.every(Number.isFinite)).toBe(true); expect(part.normals.every(Number.isFinite)).toBe(true); expect(part.uvs.every(Number.isFinite)).toBe(true);
        const z = part.positions.filter((_, index) => index % 3 === 2); expect(Math.min(...z)).toBeLessThan(0); expect(Math.max(...z)).toBeGreaterThan(0.1);
      }
    }
  });
});
