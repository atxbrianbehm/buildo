import { expect, it } from "vitest";
import { buildConstructionSillSeat } from "../compiler/constructionOpeningTrimGeometry";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionRoundHead } from "../core/constructionRoundHeadVocabulary";
import { evaluateConstruction } from "../compiler/evaluateConstruction";

it("seats a physical stone surface above the reveal and against the recessed frame", () => {
  for (const [width, bottom, recess] of [[1.22, 0.78, 0.14], [0.6, 1.25, 0.25], [1.8, 0.3, 0.02]]) {
    const seat = buildConstructionSillSeat(width, bottom, recess);
    expect(seat.bounds.min[0]).toBeCloseTo(-width / 2); expect(seat.bounds.max[0]).toBeCloseTo(width / 2);
    expect(seat.bounds.min[1]).toBeCloseTo(bottom); expect(seat.bounds.max[1]).toBeCloseTo(bottom + 0.02);
    expect(seat.bounds.min[2]).toBeCloseTo(-recess); expect(seat.bounds.max[2]).toBeCloseTo(0);
    expect(seat.positions.every(Number.isFinite)).toBe(true); expect(seat.uvs.every(Number.isFinite)).toBe(true);
    expect(seat.indices).toHaveLength(36);
  }
  expect(() => buildConstructionSillSeat(1, 0.5, 0)).toThrow(/positive recess/);
});

it("adds the seat to flat and round windows without changing material roles", async () => {
  for (const head of [0, 1] as const) {
    const graph = withConstructionRoundHead(createBuildingConstructionGraph(), head), result = await evaluateConstruction(graph);
    const trim = result.prototypes!.filter(batch => batch.role === "trim");
    expect(trim.length).toBeGreaterThan(0);
    expect(trim.every(batch => batch.materialSlotId === "trim.horizontal.primary")).toBe(true);
    expect(trim.some(batch => batch.positions!.length >= 72 && batch.uvs!.length === batch.positions!.length / 3 * 2)).toBe(true);
  }
});
