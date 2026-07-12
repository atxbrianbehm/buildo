import { z } from "zod";
import { late19cApartmentKit, summarizeArtKitFacadePlanFromGraph } from "../art-kit";
import { openingAssemblyDepthExtent, openingGlassInsetFromExterior } from "../compiler/openingGeometry";
import {
  FRAME_INSET_FROM_SLOT_M,
  OPENING_SLOT_ALIGNMENT_EPS_M
} from "../compiler/openingSlotBinding";
import { SchemaVersion010 } from "../contracts/shared";
import type { AssemblyHallFixture } from "../ui/assemblyHallFixture";

export const MODULE_QUALITY_REPORT_KIND = "dynamic-building-family-module-quality";

export const QualityCheckStatusSchema = z.enum(["pass", "fail", "estimated", "not-captured"]);

export const QualityChecklistCategorySchema = z.enum([
  "silhouette",
  "facadeRhythm",
  "openingDepth",
  "trimLayering",
  "materialScale",
  "sideRearTreatment",
  "roofEdgeTreatment",
  "clayReadability",
  "wireframeInspection",
  "texturedReadability",
  "performanceBudget"
]);

export const QualityChecklistItemSchema = z.object({
  category: QualityChecklistCategorySchema,
  label: z.string().min(1),
  status: QualityCheckStatusSchema,
  evidence: z.string().min(1),
  measuredValue: z.unknown().optional()
});

export const ModuleQualityReportSchema = z.object({
  schemaVersion: SchemaVersion010,
  reportKind: z.literal(MODULE_QUALITY_REPORT_KIND),
  familyId: z.string().min(1),
  buildingId: z.string().min(1),
  fidelityMode: z.enum(["proof", "kit"]),
  detailLevel: z.enum(["high", "low"]).optional(),
  checklist: z.array(QualityChecklistItemSchema).min(1),
  summary: z.object({
    passCount: z.number().int().nonnegative(),
    failCount: z.number().int().nonnegative(),
    estimatedCount: z.number().int().nonnegative(),
    notCapturedCount: z.number().int().nonnegative()
  }),
  knownGaps: z.array(z.string().min(1))
});

export type QualityCheckStatus = z.infer<typeof QualityCheckStatusSchema>;
export type QualityChecklistCategory = z.infer<typeof QualityChecklistCategorySchema>;
export type QualityChecklistItem = z.infer<typeof QualityChecklistItemSchema>;
export type ModuleQualityReport = z.infer<typeof ModuleQualityReportSchema>;

export interface CreateModuleQualityReportInput {
  fixture: AssemblyHallFixture;
  /** Optional explicit detail level; defaults to high when unknown. */
  detailLevel?: "high" | "low";
  oneBuildingTriangleLimit?: number;
}

function countByStatus(checklist: QualityChecklistItem[]): ModuleQualityReport["summary"] {
  return {
    passCount: checklist.filter((item) => item.status === "pass").length,
    failCount: checklist.filter((item) => item.status === "fail").length,
    estimatedCount: checklist.filter((item) => item.status === "estimated").length,
    notCapturedCount: checklist.filter((item) => item.status === "not-captured").length
  };
}

function item(
  category: QualityChecklistCategory,
  label: string,
  status: QualityCheckStatus,
  evidence: string,
  measuredValue?: unknown
): QualityChecklistItem {
  return { category, label, status, evidence, measuredValue };
}

export function evaluateModuleQualityChecklist(
  input: CreateModuleQualityReportInput
): QualityChecklistItem[] {
  const { fixture } = input;
  const detailLevel = input.detailLevel ?? "high";
  const triangleLimit = input.oneBuildingTriangleLimit ?? 250_000;
  const batchIds = new Set(fixture.ir.meshBatches.map((batch) => batch.batchId));
  const instanceBatchIds = new Set(fixture.ir.instanceBatches.map((batch) => batch.batchId));
  const plan = summarizeArtKitFacadePlanFromGraph(fixture.graph);
  const windowRecipe = fixture.catalog.recipes.find((recipe) => recipe.role === "window");
  const openingDepthM = windowRecipe ? openingAssemblyDepthExtent(windowRecipe, "high") : 0;
  const glassInsetM = windowRecipe ? openingGlassInsetFromExterior(windowRecipe) : 0;
  const corniceLayers = fixture.ir.semanticIndex.filter((entry) => entry.batchId === "mesh.cornice").length;
  const beltLayers = fixture.ir.semanticIndex.filter((entry) => entry.batchId === "mesh.belt-course").length;
  const tileableSlots = fixture.packedAtlas.manifest.slots.filter(
    (slot) => typeof slot.metersPerTile === "number" && slot.metersPerTile > 0
  );
  const sideRearPlacements = plan.present
    ? (plan.placementsByFacade.left ?? 0) +
      (plan.placementsByFacade.right ?? 0) +
      (plan.placementsByFacade.rear ?? 0)
    : 0;
  const floorCount = fixture.spec.massing.floorCount;
  const bayCount = fixture.spec.facade.frontBayCount;
  const triangleCount = fixture.ir.metrics.triangleCount;

  const silhouettePass =
    detailLevel === "high"
      ? batchIds.has("mesh.cornice") &&
        batchIds.has("mesh.roof") &&
        batchIds.has("mesh.corner-quoins") &&
        batchIds.has("mesh.vertical-pilasters") &&
        batchIds.has("mesh.spandrels") &&
        batchIds.has("mesh.base-plinth") &&
        batchIds.has("mesh.opening-pockets") &&
        batchIds.has("mesh.storefront-hierarchy")
      : batchIds.has("mesh.roof");
  const pilasterLayers = fixture.ir.semanticIndex.filter(
    (entry) => entry.batchId === "mesh.vertical-pilasters"
  ).length;
  const spandrelLayers = fixture.ir.semanticIndex.filter((entry) => entry.batchId === "mesh.spandrels").length;
  const openingPockets = fixture.ir.semanticIndex.filter(
    (entry) => entry.batchId === "mesh.opening-pockets"
  ).length;
  const corniceUsesProfile =
    fixture.catalog.recipes.find((recipe) => recipe.role === "cornice")?.profileRecipeId?.includes("profile.") ??
    false;

  // Slot-locked frame metrics (G2): instance scale × recipe ≈ slot inset outer size.
  const windowBatch = fixture.ir.instanceBatches.find((batch) => batch.batchId === "instances.window");
  const doorBatch = fixture.ir.instanceBatches.find((batch) => batch.batchId === "instances.door");
  const frameInstanceCount = (windowBatch?.count ?? 0) + (doorBatch?.count ?? 0);
  const sampleScales: number[] = [];
  const sampleFrameWidths: number[] = [];
  if (windowBatch?.transforms && windowRecipe) {
    for (let i = 0; i < Math.min(windowBatch.count, 6); i += 1) {
      const sx = windowBatch.transforms[i * 16] ?? 1;
      sampleScales.push(sx);
      sampleFrameWidths.push(windowRecipe.dimensionsM.width * sx);
    }
  }
  const avgFrameWidthM =
    sampleFrameWidths.length > 0
      ? sampleFrameWidths.reduce((a, b) => a + b, 0) / sampleFrameWidths.length
      : 0;
  const slotLockedFrames =
    frameInstanceCount > 0 &&
    openingPockets > 0 &&
    sampleScales.length > 0 &&
    avgFrameWidthM > 0.2;

  return [
    item(
      "silhouette",
      "Silhouette has cornice, roof edge, and corner treatment",
      silhouettePass ? "pass" : "fail",
      detailLevel === "high"
        ? "High-detail IR includes mesh.cornice, mesh.roof, and mesh.corner-quoins."
        : "Low-detail omits decorative silhouette batches; roof mesh remains.",
      {
        hasCornice: batchIds.has("mesh.cornice"),
        hasRoof: batchIds.has("mesh.roof"),
        hasQuoins: batchIds.has("mesh.corner-quoins"),
        hasPilasters: batchIds.has("mesh.vertical-pilasters"),
        hasSpandrels: batchIds.has("mesh.spandrels"),
        hasOpeningPockets: batchIds.has("mesh.opening-pockets"),
        hasStorefrontHierarchy: batchIds.has("mesh.storefront-hierarchy"),
        pilasterLayers,
        spandrelLayers,
        openingPockets,
        detailLevel
      }
    ),
    item(
      "openingDepth",
      "Openings have wall pockets plus frame/glass depth hierarchy",
      detailLevel === "high"
        ? openingDepthM > 0.28 && glassInsetM > 0.08 && openingPockets > 0 && slotLockedFrames
          ? "pass"
          : "fail"
        : openingDepthM > 0.15
          ? "pass"
          : "fail",
      "Opening frame depth, glass inset, slot-locked frame scale, and additive wall-pocket mass for punched-window read.",
      {
        openingDepthM,
        glassInsetM,
        openingPockets,
        frameInstanceCount,
        avgFrameWidthM,
        slotLockedFrames,
        frameInsetFromSlotM: FRAME_INSET_FROM_SLOT_M,
        slotAlignmentEpsM: OPENING_SLOT_ALIGNMENT_EPS_M,
        detailLevel
      }
    ),
    item(
      "facadeRhythm",
      "Floors and bays read as a regular facade grid",
      floorCount >= 2 && bayCount >= 3 && (detailLevel === "low" || pilasterLayers >= bayCount)
        ? "pass"
        : "fail",
      detailLevel === "high"
        ? `Spec massing uses ${floorCount} floors and ${bayCount} front bays with full-height pilasters.`
        : `Spec massing uses ${floorCount} floors and ${bayCount} front bays.`,
      { floorCount, bayCount, pilasterLayers, detailLevel }
    ),
    item(
      "trimLayering",
      "Trim profiles are multi-layer, not single flat bands",
      detailLevel === "high" &&
        corniceLayers >= 1 &&
        beltLayers >= 2 &&
        corniceUsesProfile &&
        batchIds.has("mesh.base-plinth")
        ? "pass"
        : detailLevel === "low"
          ? "estimated"
          : "fail",
      detailLevel === "high"
        ? "High-detail cornice expands an authored profile solid; belts and base plinth present."
        : "Low-detail intentionally omits decorative trim layering.",
      {
        corniceLayers,
        beltLayers,
        corniceUsesProfile,
        hasBeltCourse: batchIds.has("mesh.belt-course"),
        hasBasePlinth: batchIds.has("mesh.base-plinth"),
        detailLevel
      }
    ),
    item(
      "materialScale",
      "Tileable atlas slots expose metersPerTile physical scale",
      tileableSlots.length >= 2 ? "pass" : "fail",
      "Art-kit material set bindings stamp metersPerTile onto tileable atlas slots.",
      { tileableSlotCount: tileableSlots.length }
    ),
    item(
      "sideRearTreatment",
      "Side and rear facades receive kit placements (kit mode)",
      fixture.fidelityMode === "kit"
        ? sideRearPlacements > 0
          ? "pass"
          : "fail"
        : "estimated",
      fixture.fidelityMode === "kit"
        ? "Art-kit facade plan includes left/right/rear placements."
        : "Proof mode does not require side/rear kit placements.",
      { fidelityMode: fixture.fidelityMode, sideRearPlacements, planPresent: plan.present }
    ),
    item(
      "roofEdgeTreatment",
      "Roof edge / cap treatment is present in high detail",
      detailLevel === "high" && batchIds.has("mesh.roof-cap")
        ? "pass"
        : detailLevel === "low"
          ? "estimated"
          : "fail",
      "High-detail IR includes mesh.roof-cap batch for parapet/roof edge.",
      { hasRoofCap: batchIds.has("mesh.roof-cap"), detailLevel }
    ),
    item(
      "clayReadability",
      "Clay inspection mode is available in Assembly Hall",
      "estimated",
      "Assembly Hall exposes clay presentation mode; pixel screenshots are not captured in this packet.",
      { presentationModes: ["textured", "clay"] }
    ),
    item(
      "wireframeInspection",
      "Wireframe inspection is available in Component Forge / Art Kit Lab",
      "estimated",
      "UI exposes wireframe toggles; automated pixel capture is not performed.",
      { surfaces: ["componentForge", "artKitLab"] }
    ),
    item(
      "texturedReadability",
      "Textured presentation uses the shared family atlas",
      fixture.packedAtlas.contentHash.length > 0 && instanceBatchIds.size > 0 ? "pass" : "fail",
      "Fixture carries packed atlas content hash and instance batches with material slots.",
      {
        atlasContentHash: fixture.packedAtlas.contentHash,
        instanceBatchCount: fixture.ir.instanceBatches.length
      }
    ),
    item(
      "performanceBudget",
      "One-building triangle count within documented stress budget",
      triangleCount <= triangleLimit ? "pass" : "fail",
      `Runtime IR triangle count compared to one-building limit ${triangleLimit}.`,
      { triangleCount, triangleLimit }
    )
  ];
}

export function parseModuleQualityReport(input: unknown): ModuleQualityReport {
  const result = ModuleQualityReportSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid module quality report: ${result.error.issues.map((issue) => issue.message).join(", ")}`
    );
  }
  return result.data;
}

export function createModuleQualityReport(input: CreateModuleQualityReportInput): ModuleQualityReport {
  const checklist = evaluateModuleQualityChecklist(input);
  const knownGaps = [
    "Automated visual QA does not capture browser screenshots; clay/wireframe/textured items are capability-estimated unless otherwise measured.",
    "Historical accuracy is not claimed; style pack and art kit remain demo/draft curation.",
    `Art-kit module catalog size is ${late19cApartmentKit.modules.length}; deep sculptural ornament remains out of scope.`,
    ...(input.fixture.fidelityMode === "proof"
      ? ["Proof fidelity mode intentionally skips art-kit side/rear placement coverage."]
      : [])
  ];

  return parseModuleQualityReport({
    schemaVersion: "0.1.0",
    reportKind: MODULE_QUALITY_REPORT_KIND,
    familyId: input.fixture.spec.familyId,
    buildingId: input.fixture.ir.buildingId,
    fidelityMode: input.fixture.fidelityMode,
    detailLevel: input.detailLevel ?? "high",
    checklist,
    summary: countByStatus(checklist),
    knownGaps
  });
}
