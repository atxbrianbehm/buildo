import { existsSync } from "node:fs";
import path from "node:path";
import catalogJson from "../../../../docs/ref/catalog.json";
import {
  createPeriodComparisonNotes,
  getPeriodReferenceEntry,
  listPeriodReferenceEntries,
  parsePeriodComparisonNotes,
  parsePeriodReferenceCatalog,
  periodReferenceCatalog,
  periodReferenceImageUrl,
  PERIOD_COMPARISON_NOTES_KIND,
  PERIOD_REFERENCE_CATALOG_KIND
} from "../qa/periodReferenceCatalog";
import {
  defaultPeriodReferenceStaticRoots,
  resolvePeriodReferenceStaticPath
} from "../../../../server/building-family/periodReferenceStaticPlugin";

describe("periodReferenceCatalog", () => {
  it("validates the docs/ref catalog and exposes primary user refs", () => {
    const catalog = parsePeriodReferenceCatalog(catalogJson);
    expect(catalog.catalogKind).toBe(PERIOD_REFERENCE_CATALOG_KIND);
    expect(catalog).toEqual(periodReferenceCatalog);
    expect(catalog.rubric.length).toBeGreaterThanOrEqual(5);
    expect(catalog.entries.length).toBeGreaterThanOrEqual(10);

    const primary = listPeriodReferenceEntries({ priority: "primary" });
    expect(primary.some((entry) => entry.id === "ref-marx-grocery-buffalo")).toBe(true);
    expect(primary.some((entry) => entry.collection === "habs")).toBe(true);
  });

  it("builds image URLs and resolves static files for catalog entries", () => {
    const entry = getPeriodReferenceEntry("ref-marx-grocery-buffalo");
    expect(entry).toBeDefined();
    const url = periodReferenceImageUrl(entry!);
    expect(url).toBe(
      `/period-ref/user/${encodeURIComponent("Former_John_Marx_Grocery_Store,_Buffalo,_New_York_-_20200821.jpg")}`
    );

    const roots = defaultPeriodReferenceStaticRoots(path.resolve("."));
    const resolved = resolvePeriodReferenceStaticPath(url, roots);
    expect(resolved).not.toBeNull();
    expect(existsSync(resolved!)).toBe(true);

    const plusEntry = getPeriodReferenceEntry("ref-boykin-school-facade");
    expect(plusEntry).toBeDefined();
    const plusUrl = periodReferenceImageUrl(plusEntry!);
    expect(plusUrl).toContain(encodeURIComponent("+.jpg"));
    expect(existsSync(resolvePeriodReferenceStaticPath(plusUrl, roots)!)).toBe(true);

    const habsEntry = getPeriodReferenceEntry("habs-columbus-apartment-front");
    const habsUrl = periodReferenceImageUrl(habsEntry!);
    expect(habsUrl.startsWith("/period-ref/habs/")).toBe(true);
    expect(existsSync(resolvePeriodReferenceStaticPath(habsUrl, roots)!)).toBe(true);
  });

  it("rejects path traversal in the static resolver", () => {
    const roots = defaultPeriodReferenceStaticRoots(path.resolve("."));
    expect(resolvePeriodReferenceStaticPath("/period-ref/user/../catalog.json", roots)).toBeNull();
    expect(
      resolvePeriodReferenceStaticPath("/period-ref/user/%2e%2e%2fcatalog.json", roots)
    ).toBeNull();
    expect(resolvePeriodReferenceStaticPath("/period-ref/other/file.jpg", roots)).toBeNull();
  });

  it("creates schema-valid comparison notes from rubric scores", () => {
    const notes = createPeriodComparisonNotes({
      referenceId: "ref-marx-grocery-buffalo",
      presentationMode: "clay",
      fidelityMode: "kit",
      seeds: {
        family: "family-seed",
        building: "building-seed",
        material: "material-seed",
        trim: "trim-seed"
      },
      rubricScores: periodReferenceCatalog.rubric.map((item, index) => ({
        id: item.id,
        status: index === 0 ? "pass" : index === 1 ? "partial" : "not-reviewed",
        notes: index === 1 ? "cornice thinner than ref" : undefined
      })),
      freeformNotes: "First side-by-side pass.",
      now: () => new Date("2026-07-12T18:00:00.000Z")
    });

    expect(notes.packetKind).toBe(PERIOD_COMPARISON_NOTES_KIND);
    expect(notes.createdAt).toBe("2026-07-12T18:00:00.000Z");
    expect(notes.summary.passCount).toBe(1);
    expect(notes.summary.partialCount).toBe(1);
    expect(notes.summary.notReviewedCount).toBe(periodReferenceCatalog.rubric.length - 2);
    expect(parsePeriodComparisonNotes(notes)).toEqual(notes);
  });

  it("rejects comparison notes for unknown reference or rubric ids", () => {
    expect(() =>
      createPeriodComparisonNotes({
        referenceId: "missing-ref",
        rubricScores: [{ id: "silhouette", status: "pass" }]
      })
    ).toThrow(/Unknown period reference/i);

    expect(() =>
      createPeriodComparisonNotes({
        referenceId: "ref-marx-grocery-buffalo",
        rubricScores: [{ id: "not-a-rubric", status: "pass" }]
      })
    ).toThrow(/Unknown rubric/i);
  });
});
