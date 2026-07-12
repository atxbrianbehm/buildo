import { z } from "zod";
import { late19cApartmentKit } from "../art-kit";
import { SchemaVersion010, SeedsSchema } from "../contracts/shared";
import { hashCanonicalJson } from "../core/contentHash";
import type { AssemblyHallFixture } from "../ui/assemblyHallFixture";
import {
  createModuleQualityReport,
  ModuleQualityReportSchema,
  parseModuleQualityReport,
  type CreateModuleQualityReportInput,
  type ModuleQualityReport
} from "./moduleQualityReport";
import {
  buildFacadeSplitObservabilitySummary,
  type FacadeSplitObservabilitySummary
} from "./facadeSplitObservability";
import {
  clayGateToQualityChecklistItems,
  evaluateClayQualityGate,
  type ClayQualityGateReport
} from "./clayQualityGate";

export const VISUAL_QA_PACKET_KIND = "dynamic-building-family-visual-qa";

export const FacadeSplitSummarySchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  contentHash: z.string().min(1),
  openingCount: z.number().int().nonnegative(),
  scopeCount: z.number().int().nonnegative(),
  storefrontScopeCount: z.number().int().nonnegative(),
  wallPieceCount: z.number().int().nonnegative(),
  doorCount: z.number().int().nonnegative(),
  windowCount: z.number().int().nonnegative(),
  fidelityMode: z.enum(["proof", "kit"])
});

export const VisualQaPacketSchema = z.object({
  schemaVersion: SchemaVersion010,
  packetKind: z.literal(VISUAL_QA_PACKET_KIND),
  createdAt: z.string().min(1),
  screenshotTargetRoute: z.string().min(1),
  prompt: z.string().min(1),
  seeds: SeedsSchema,
  fidelityMode: z.enum(["proof", "kit"]),
  detailLevel: z.enum(["high", "low"]).optional(),
  stylePackId: z.string().min(1),
  hashes: z.object({
    artKitManifestId: z.string().min(1),
    atlasId: z.string().min(1),
    atlasContentHash: z.string().min(1),
    graphId: z.string().min(1),
    sourceGraphHash: z.string().min(1),
    familyId: z.string().min(1),
    buildingId: z.string().min(1),
    componentCatalogId: z.string().min(1),
    contentFingerprint: z.string().min(1),
    facadeSplitContentHash: z.string().min(1).optional()
  }),
  facadeSplit: FacadeSplitSummarySchema.optional(),
  clayQualityGate: z
    .object({
      schemaVersion: z.literal("0.1.0"),
      reportKind: z.literal("dynamic-building-family-clay-quality-gate"),
      familyId: z.string().min(1),
      buildingId: z.string().min(1),
      fidelityMode: z.enum(["proof", "kit"]),
      criteria: z.array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          status: z.enum(["pass", "fail", "estimated", "not-captured"]),
          evidence: z.string().min(1),
          measuredValue: z.unknown().optional()
        })
      ),
      summary: z.object({
        passCount: z.number().int().nonnegative(),
        failCount: z.number().int().nonnegative(),
        estimatedCount: z.number().int().nonnegative()
      }),
      gateOpen: z.boolean()
    })
    .optional(),
  qualityReport: ModuleQualityReportSchema,
  knownGaps: z.array(z.string().min(1)),
  benchmarkProfileId: z.string().min(1).optional(),
  fieldCoverage: z.object({
    measured: z.array(z.string()),
    estimated: z.array(z.string()),
    notCaptured: z.array(z.string())
  })
});

export type VisualQaPacket = z.infer<typeof VisualQaPacketSchema>;

export interface CreateVisualQaPacketInput {
  fixture: AssemblyHallFixture;
  seeds?: {
    family: string;
    building: string;
    material: string;
    trim: string;
  };
  detailLevel?: "high" | "low";
  screenshotTargetRoute?: string;
  benchmarkProfileId?: string;
  now?: () => Date;
  qualityReport?: ModuleQualityReport;
  oneBuildingTriangleLimit?: number;
}

function fieldCoverageFromReport(report: ModuleQualityReport): VisualQaPacket["fieldCoverage"] {
  return {
    measured: report.checklist.filter((item) => item.status === "pass" || item.status === "fail").map((item) => item.category),
    estimated: report.checklist.filter((item) => item.status === "estimated").map((item) => item.category),
    notCaptured: report.checklist.filter((item) => item.status === "not-captured").map((item) => item.category)
  };
}

export function parseVisualQaPacket(input: unknown): VisualQaPacket {
  const result = VisualQaPacketSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid visual QA packet: ${result.error.issues.map((issue) => issue.message).join(", ")}`
    );
  }
  return result.data;
}

export async function createVisualQaPacket(input: CreateVisualQaPacketInput): Promise<VisualQaPacket> {
  const splitSummary: FacadeSplitObservabilitySummary = await buildFacadeSplitObservabilitySummary({
    spec: input.fixture.spec,
    catalog: input.fixture.catalog,
    fidelityMode: input.fixture.fidelityMode
  });
  const qualityInput: CreateModuleQualityReportInput = {
    fixture: input.fixture,
    detailLevel: input.detailLevel,
    oneBuildingTriangleLimit: input.oneBuildingTriangleLimit,
    splitEvidence: {
      contentHash: splitSummary.contentHash,
      openingCount: splitSummary.openingCount,
      scopeCount: splitSummary.scopeCount,
      storefrontScopeCount: splitSummary.storefrontScopeCount,
      wallPieceCount: splitSummary.wallPieceCount,
      doorCount: splitSummary.doorCount,
      windowCount: splitSummary.windowCount
    }
  };
  // Seed variety ≥6 is enforced by buildingSeedVariation unit tests; gate records that floor.
  const clayQualityGate: ClayQualityGateReport = evaluateClayQualityGate({
    fixture: input.fixture,
    split: splitSummary,
    detailLevel: input.detailLevel ?? "high",
    seedCompositionCount: 6
  });
  const baseQualityReport = input.qualityReport ?? createModuleQualityReport(qualityInput);
  const qualityReport =
    input.qualityReport ??
    parseModuleQualityReport({
      ...baseQualityReport,
      checklist: [...baseQualityReport.checklist, ...clayGateToQualityChecklistItems(clayQualityGate)],
      summary: {
        passCount:
          baseQualityReport.summary.passCount +
          clayQualityGate.criteria.filter((c) => c.status === "pass").length,
        failCount:
          baseQualityReport.summary.failCount +
          clayQualityGate.criteria.filter((c) => c.status === "fail").length,
        estimatedCount:
          baseQualityReport.summary.estimatedCount +
          clayQualityGate.criteria.filter((c) => c.status === "estimated").length,
        notCapturedCount: baseQualityReport.summary.notCapturedCount
      }
    });
  const seeds = input.seeds ?? input.fixture.spec.seeds;
  const createdAt = (input.now ?? (() => new Date()))().toISOString();
  const contentFingerprint = await hashCanonicalJson({
    familyId: input.fixture.spec.familyId,
    buildingId: input.fixture.ir.buildingId,
    fidelityMode: input.fixture.fidelityMode,
    atlasContentHash: input.fixture.packedAtlas.contentHash,
    sourceGraphHash: input.fixture.ir.sourceGraphHash,
    facadeSplitContentHash: splitSummary.contentHash,
    clayGateOpen: clayQualityGate.gateOpen,
    qualitySummary: qualityReport.summary
  });

  return parseVisualQaPacket({
    schemaVersion: "0.1.0",
    packetKind: VISUAL_QA_PACKET_KIND,
    createdAt,
    screenshotTargetRoute: input.screenshotTargetRoute ?? "#room=assemblyHall",
    prompt: input.fixture.prompt,
    seeds,
    fidelityMode: input.fixture.fidelityMode,
    detailLevel: input.detailLevel ?? "high",
    stylePackId: input.fixture.spec.stylePackId,
    hashes: {
      artKitManifestId: late19cApartmentKit.id,
      atlasId: input.fixture.packedAtlas.atlasId,
      atlasContentHash: input.fixture.packedAtlas.contentHash,
      graphId: input.fixture.graph.graphId,
      sourceGraphHash: input.fixture.ir.sourceGraphHash,
      familyId: input.fixture.spec.familyId,
      buildingId: input.fixture.ir.buildingId,
      componentCatalogId: input.fixture.catalog.catalogId,
      contentFingerprint,
      facadeSplitContentHash: splitSummary.contentHash
    },
    facadeSplit: splitSummary,
    clayQualityGate,
    qualityReport,
    knownGaps: [
      ...qualityReport.knownGaps,
      "G8 clay orbit / Shift-light rows are estimated until browser screenshot capture is automated."
    ],
    benchmarkProfileId: input.benchmarkProfileId,
    fieldCoverage: fieldCoverageFromReport(qualityReport)
  });
}
