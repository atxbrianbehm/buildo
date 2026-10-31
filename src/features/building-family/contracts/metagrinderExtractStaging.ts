import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

/** Narrow admission against the inspected public Metagrinder extract claim contract. */
export const METAGRINDER_EXTRACT_REVISION = "8485396ad0deaf99cca0d3794825f536ec748a26";
const identifier = z.string().min(1);
const attribution = z.enum(["quoted", "paraphrased", "inferred", "web-retrieved"]);
const confidence = z.enum(["low", "medium", "high"]);
const claim = z.object({ claimId: identifier, text: z.string(), claimType: z.string().optional(),
  category: z.enum(["wardrobe", "people-and-crowd", "weather-and-environment", "lighting", "materials-and-surfaces", "behavior-and-motion", "architecture-and-streetscape", "mood-and-social-tone"]),
  confidence, sourceInputIds: z.array(identifier).min(1), sourceChunkIds: z.array(identifier).min(1), attributionMode: attribution }).passthrough();
const artifact = z.object({ inputId: identifier, claims: z.array(claim).optional() }).passthrough();
const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
export const MetagrinderExtractStagingRequestSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("metagrinder-extract-staging-request"),
  declaredProducerRevision: z.literal(METAGRINDER_EXTRACT_REVISION), artifact }).strict());
const candidate = z.object({ claimId: identifier, text: z.string(), sourceInputIds: z.array(identifier).min(1), sourceChunkIds: z.array(identifier).min(1),
  attributionMode: attribution, confidence, review: z.literal("unreviewed") }).strict();
export const MetagrinderExtractStagingSchema = json.pipe(z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("metagrinder-extract-staging"),
  declaredProducerRevision: z.literal(METAGRINDER_EXTRACT_REVISION), artifact, architectureCoverage: z.literal("unknown"), candidates: z.array(candidate),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict());
