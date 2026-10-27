/**
 * G8 clay quality gate — automated evidence for geometry-node quality track exit.
 * Visual rows (clay orbit / Shift-light) remain estimated; structural IR rows are measured.
 */

import type { AssemblyHallFixture } from "../ui/assemblyHallFixture";
import { KIT_HIGH_DETAIL_MESH_BATCH_IDS } from "../compiler/expanders";
import type { FacadeSplitObservabilitySummary } from "./facadeSplitObservability";
import type { QualityChecklistItem, QualityCheckStatus } from "./moduleQualityReport";

export const CLAY_QUALITY_GATE_KIND = "dynamic-building-family-clay-quality-gate";

export interface ClayQualityGateCriterion {
  id: string;
  label: string;
  status: QualityCheckStatus;
  evidence: string;
  measuredValue?: unknown;
}

export interface ClayQualityGateReport {
  schemaVersion: "0.1.0";
  reportKind: typeof CLAY_QUALITY_GATE_KIND;
  familyId: string;
  buildingId: string;
  fidelityMode: "proof" | "kit";
  criteria: ClayQualityGateCriterion[];
  summary: {
    passCount: number;
    failCount: number;
    estimatedCount: number;
  };
  /** True when every measured criterion passes and no measured fails. */
  gateOpen: boolean;
}

function criterion(
  id: string,
  label: string,
  status: QualityCheckStatus,
  evidence: string,
  measuredValue?: unknown
): ClayQualityGateCriterion {
  return { id, label, status, evidence, measuredValue };
}

export function evaluateClayQualityGate(input: {
  fixture: AssemblyHallFixture;
  split?: FacadeSplitObservabilitySummary;
  seedCompositionCount?: number;
  detailLevel?: "high" | "low";
}): ClayQualityGateReport {
  const { fixture } = input;
  const detailLevel = input.detailLevel ?? "high";
  const batchIds = new Set(fixture.ir.meshBatches.map((batch) => batch.batchId));
  const pilasterCount = fixture.ir.semanticIndex.filter(
    (entry) => entry.batchId === "mesh.vertical-pilasters"
  ).length;
  const openingPockets = fixture.ir.semanticIndex.filter(
    (entry) => entry.batchId === "mesh.opening-pockets"
  ).length;
  const windowCount =
    fixture.ir.instanceBatches.find((batch) => batch.batchId === "instances.window")?.count ?? 0;
  const doorCount =
    fixture.ir.instanceBatches.find((batch) => batch.batchId === "instances.door")?.count ?? 0;
  const seedCount = input.seedCompositionCount ?? 0;
  const split = input.split;
  const missingKitBatches =
    detailLevel === "high"
      ? KIT_HIGH_DETAIL_MESH_BATCH_IDS.filter((id) => !batchIds.has(id))
      : [];

  const criteria: ClayQualityGateCriterion[] = [
    criterion(
      "floors-x-bays",
      "Mass reads as floors × bays (piers continuous)",
      detailLevel === "high" && pilasterCount >= fixture.spec.facade.frontBayCount ? "pass" : "fail",
      "Full-height pilaster mesh pieces ≥ front bay count.",
      { pilasterCount, frontBayCount: fixture.spec.facade.frontBayCount }
    ),
    criterion(
      "punched-openings",
      "Openings read punched (pocket + frame + glass)",
      detailLevel === "high" &&
        openingPockets > 0 &&
        windowCount + doorCount > 0 &&
        batchIds.has("mesh.opening-pockets")
        ? "pass"
        : "fail",
      "Opening pockets mesh plus window/door instance batches present.",
      { openingPockets, windowCount, doorCount }
    ),
    criterion(
      "storefront-hierarchy",
      "Ground storefront ≠ upper body",
      detailLevel === "high" &&
        batchIds.has("mesh.storefront-hierarchy") &&
        (split?.storefrontScopeCount ?? 0) > 0
        ? "pass"
        : detailLevel === "low"
          ? "estimated"
          : "fail",
      "Storefront hierarchy mesh + ground storefront scopes from split.",
      {
        hasStorefrontHierarchy: batchIds.has("mesh.storefront-hierarchy"),
        storefrontScopeCount: split?.storefrontScopeCount
      }
    ),
    criterion(
      "cornice-profile",
      "Cornice continuous molded profile",
      detailLevel === "high" && batchIds.has("mesh.cornice") ? "pass" : "fail",
      "mesh.cornice batch present from profile expander.",
      { hasCornice: batchIds.has("mesh.cornice") }
    ),
    criterion(
      "belt-courses",
      "Belts at intermediate floors",
      detailLevel === "high" && batchIds.has("mesh.belt-course") ? "pass" : "estimated",
      "mesh.belt-course batch present for intermediate floor rhythm.",
      { hasBeltCourse: batchIds.has("mesh.belt-course") }
    ),
    criterion(
      "base-plinth",
      "Base plinth present",
      detailLevel === "high" && batchIds.has("mesh.base-plinth") ? "pass" : "fail",
      "mesh.base-plinth batch present at ground line.",
      { hasBasePlinth: batchIds.has("mesh.base-plinth") }
    ),
    criterion(
      "seed-variety",
      "Seed variety still ≥6 compositions",
      seedCount >= 6 ? "pass" : seedCount > 0 ? "fail" : "estimated",
      seedCount > 0
        ? `Measured ${seedCount} distinct compositions from seed variation suite.`
        : "Seed composition count not supplied to this gate evaluation.",
      { seedCompositionCount: seedCount }
    ),
    criterion(
      "split-hash-qa",
      "Split hash in QA/trace",
      split && split.contentHash.length > 0 && split.openingCount > 0 ? "pass" : "fail",
      "FacadeSplitPlan content hash and opening count available for QA/trace.",
      {
        contentHash: split?.contentHash,
        openingCount: split?.openingCount,
        wallPieceCount: split?.wallPieceCount
      }
    ),
    criterion(
      "kit-no-dual-openings",
      "Kit mode has no default-opening dual path",
      fixture.fidelityMode === "kit"
        ? split && split.openingCount === windowCount + doorCount
          ? "pass"
          : "fail"
        : "estimated",
      "Kit frame instances match split opening slots 1:1 (G1 authority).",
      {
        fidelityMode: fixture.fidelityMode,
        splitOpenings: split?.openingCount,
        frameInstances: windowCount + doorCount
      }
    ),
    criterion(
      "kit-mesh-batch-set",
      "High-detail kit mesh batch set complete",
      detailLevel === "high" && missingKitBatches.length === 0 ? "pass" : "fail",
      "All documented KIT_HIGH_DETAIL_MESH_BATCH_IDS present in IR.",
      { missingKitBatches }
    ),
    criterion(
      "clay-orbit-manual",
      "Clay orbit + Shift-light visual read",
      "estimated",
      "Manual clay presentation with orbit and raking light; not pixel-captured in CI."
    )
  ];

  const summary = {
    passCount: criteria.filter((item) => item.status === "pass").length,
    failCount: criteria.filter((item) => item.status === "fail").length,
    estimatedCount: criteria.filter((item) => item.status === "estimated").length
  };

  return {
    schemaVersion: "0.1.0",
    reportKind: CLAY_QUALITY_GATE_KIND,
    familyId: fixture.spec.familyId,
    buildingId: fixture.ir.buildingId,
    fidelityMode: fixture.fidelityMode,
    criteria,
    summary,
    gateOpen: summary.failCount === 0
  };
}

/** Map clay gate rows into module quality checklist items for Visual QA packets. */
export function clayGateToQualityChecklistItems(gate: ClayQualityGateReport): QualityChecklistItem[] {
  return gate.criteria.map((row) => ({
    category:
      row.id === "punched-openings" || row.id === "kit-no-dual-openings"
        ? "openingDepth"
        : row.id === "cornice-profile" || row.id === "belt-courses" || row.id === "base-plinth"
          ? "trimLayering"
          : row.id === "clay-orbit-manual"
            ? "clayReadability"
            : row.id === "kit-mesh-batch-set"
              ? "performanceBudget"
              : "facadeRhythm",
    label: `[G8] ${row.label}`,
    status: row.status,
    evidence: row.evidence,
    measuredValue: row.measuredValue
  }));
}
