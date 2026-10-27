import { readFileSync } from "node:fs";
import path from "node:path";
import {
  parsePeriodComparisonNotes,
  PERIOD_COMPARISON_NOTES_KIND
} from "../qa/periodReferenceCatalog";

const comparisonDir = path.resolve("docs/ref/comparisons/2026-07-12-first-pass");

describe("period comparison notes fixtures", () => {
  it("validates the first-pass Marx Grocery comparison packet", () => {
    const raw = JSON.parse(
      readFileSync(path.join(comparisonDir, "ref-marx-grocery-buffalo-period-comparison.json"), "utf8")
    );
    const notes = parsePeriodComparisonNotes(raw);
    expect(notes.packetKind).toBe(PERIOD_COMPARISON_NOTES_KIND);
    expect(notes.referenceId).toBe("ref-marx-grocery-buffalo");
    expect(notes.summary.failCount).toBe(0);
    expect(notes.summary.partialCount).toBeGreaterThanOrEqual(5);
    expect(
      notes.rubricScores.some((row) => row.id === "silhouette" && row.status === "partial")
    ).toBe(true);
    expect(
      notes.rubricScores.some((row) => row.id === "trimLayering" && row.status === "partial")
    ).toBe(true);
  });

  it("validates the first-pass Brooklyn Vanderbilt comparison packet", () => {
    const raw = JSON.parse(
      readFileSync(
        path.join(comparisonDir, "ref-brooklyn-vanderbilt-nara-period-comparison.json"),
        "utf8"
      )
    );
    const notes = parsePeriodComparisonNotes(raw);
    expect(notes.referenceId).toBe("ref-brooklyn-vanderbilt-nara");
    expect(notes.summary.failCount).toBeGreaterThanOrEqual(3);
    expect(notes.rubricScores.some((row) => row.id === "storefrontBase" && row.status === "fail")).toBe(
      true
    );
  });
});
