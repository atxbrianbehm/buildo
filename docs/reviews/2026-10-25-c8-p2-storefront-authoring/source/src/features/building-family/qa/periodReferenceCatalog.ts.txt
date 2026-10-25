import { z } from "zod";
import { SchemaVersion010 } from "../contracts/shared";
import catalogJson from "../../../../docs/ref/catalog.json";

export const PERIOD_REFERENCE_CATALOG_KIND = "dynamic-building-family-period-reference";
export const PERIOD_COMPARISON_NOTES_KIND = "dynamic-building-family-period-comparison";

/** URL prefix served by the Vite period-ref static middleware. */
export const PERIOD_REF_STATIC_PREFIX = "/period-ref";

export const PeriodRefCollectionSchema = z.enum(["user", "habs"]);
export const PeriodRefPrioritySchema = z.enum(["primary", "secondary", "detail", "context"]);

export const PeriodReferenceRubricItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  prompt: z.string().min(1)
});

export const PeriodReferenceEntrySchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  collection: PeriodRefCollectionSchema,
  title: z.string().min(1),
  priority: PeriodRefPrioritySchema,
  tags: z.array(z.string().min(1)),
  lookFor: z.array(z.string().min(1)).min(1),
  rightsNote: z.string().min(1)
});

export const PeriodReferenceCatalogSchema = z.object({
  schemaVersion: SchemaVersion010,
  catalogKind: z.literal(PERIOD_REFERENCE_CATALOG_KIND),
  id: z.string().min(1),
  label: z.string().min(1),
  purpose: z.string().min(1),
  compareProtocol: z.object({
    presentation: z.string().min(1),
    camera: z.string().min(1),
    lighting: z.string().min(1),
    route: z.string().min(1)
  }),
  rubric: z.array(PeriodReferenceRubricItemSchema).min(1),
  entries: z.array(PeriodReferenceEntrySchema).min(1)
});

export const PeriodComparisonRubricStatusSchema = z.enum([
  "pass",
  "partial",
  "fail",
  "not-reviewed"
]);

export const PeriodComparisonNotesSchema = z.object({
  schemaVersion: SchemaVersion010,
  packetKind: z.literal(PERIOD_COMPARISON_NOTES_KIND),
  createdAt: z.string().min(1),
  catalogId: z.string().min(1),
  referenceId: z.string().min(1),
  referenceTitle: z.string().min(1),
  presentationMode: z.enum(["clay", "textured"]),
  fidelityMode: z.enum(["proof", "kit"]).optional(),
  seeds: z
    .object({
      family: z.string().min(1),
      building: z.string().min(1),
      material: z.string().min(1),
      trim: z.string().min(1)
    })
    .optional(),
  screenshotTargetRoute: z.string().min(1),
  rubricScores: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      status: PeriodComparisonRubricStatusSchema,
      notes: z.string().optional()
    })
  ),
  freeformNotes: z.string().optional(),
  summary: z.object({
    passCount: z.number().int().nonnegative(),
    partialCount: z.number().int().nonnegative(),
    failCount: z.number().int().nonnegative(),
    notReviewedCount: z.number().int().nonnegative()
  })
});

export type PeriodReferenceCatalog = z.infer<typeof PeriodReferenceCatalogSchema>;
export type PeriodReferenceEntry = z.infer<typeof PeriodReferenceEntrySchema>;
export type PeriodReferenceRubricItem = z.infer<typeof PeriodReferenceRubricItemSchema>;
export type PeriodComparisonNotes = z.infer<typeof PeriodComparisonNotesSchema>;
export type PeriodComparisonRubricStatus = z.infer<typeof PeriodComparisonRubricStatusSchema>;

export function parsePeriodReferenceCatalog(input: unknown): PeriodReferenceCatalog {
  const result = PeriodReferenceCatalogSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid period reference catalog: ${result.error.issues.map((issue) => issue.message).join(", ")}`
    );
  }
  return result.data;
}

export function parsePeriodComparisonNotes(input: unknown): PeriodComparisonNotes {
  const result = PeriodComparisonNotesSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid period comparison notes: ${result.error.issues.map((issue) => issue.message).join(", ")}`
    );
  }
  return result.data;
}

/** Validated catalog loaded from `docs/ref/catalog.json`. */
export const periodReferenceCatalog: PeriodReferenceCatalog =
  parsePeriodReferenceCatalog(catalogJson);

export function listPeriodReferenceEntries(options?: {
  priority?: PeriodReferenceEntry["priority"] | "all";
  collection?: PeriodReferenceEntry["collection"] | "all";
}): PeriodReferenceEntry[] {
  const priority = options?.priority ?? "all";
  const collection = options?.collection ?? "all";
  return periodReferenceCatalog.entries.filter((entry) => {
    if (priority !== "all" && entry.priority !== priority) {
      return false;
    }
    if (collection !== "all" && entry.collection !== collection) {
      return false;
    }
    return true;
  });
}

export function getPeriodReferenceEntry(id: string): PeriodReferenceEntry | undefined {
  return periodReferenceCatalog.entries.find((entry) => entry.id === id);
}

/**
 * Browser URL for a catalog entry when the Vite period-ref static middleware is active.
 * Files are served from docs/ref (user) and docs/research/period-reference/images (habs).
 */
export function periodReferenceImageUrl(entry: PeriodReferenceEntry): string {
  const encoded = entry.file
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${PERIOD_REF_STATIC_PREFIX}/${entry.collection}/${encoded}`;
}

export interface CreatePeriodComparisonNotesInput {
  referenceId: string;
  presentationMode?: "clay" | "textured";
  fidelityMode?: "proof" | "kit";
  seeds?: {
    family: string;
    building: string;
    material: string;
    trim: string;
  };
  screenshotTargetRoute?: string;
  rubricScores: Array<{
    id: string;
    status: PeriodComparisonRubricStatus;
    notes?: string;
  }>;
  freeformNotes?: string;
  now?: () => Date;
}

export function createPeriodComparisonNotes(
  input: CreatePeriodComparisonNotesInput
): PeriodComparisonNotes {
  const entry = getPeriodReferenceEntry(input.referenceId);
  if (!entry) {
    throw new Error(`Unknown period reference id: ${input.referenceId}`);
  }

  const rubricById = new Map(periodReferenceCatalog.rubric.map((item) => [item.id, item]));
  const rubricScores = input.rubricScores.map((score) => {
    const item = rubricById.get(score.id);
    if (!item) {
      throw new Error(`Unknown rubric id: ${score.id}`);
    }
    return {
      id: item.id,
      label: item.label,
      status: score.status,
      ...(score.notes ? { notes: score.notes } : {})
    };
  });

  const summary = {
    passCount: rubricScores.filter((row) => row.status === "pass").length,
    partialCount: rubricScores.filter((row) => row.status === "partial").length,
    failCount: rubricScores.filter((row) => row.status === "fail").length,
    notReviewedCount: rubricScores.filter((row) => row.status === "not-reviewed").length
  };

  return parsePeriodComparisonNotes({
    schemaVersion: "0.1.0",
    packetKind: PERIOD_COMPARISON_NOTES_KIND,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
    catalogId: periodReferenceCatalog.id,
    referenceId: entry.id,
    referenceTitle: entry.title,
    presentationMode: input.presentationMode ?? "clay",
    fidelityMode: input.fidelityMode,
    seeds: input.seeds,
    screenshotTargetRoute: input.screenshotTargetRoute ?? "#room=assemblyHall",
    rubricScores,
    freeformNotes: input.freeformNotes,
    summary
  });
}
