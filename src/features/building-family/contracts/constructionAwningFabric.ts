import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const json = z.unknown().superRefine((value, context) => { const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message }); });
const color = z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)]);
const request = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-awning-fabric-request"),
  seed: z.string().trim().min(1).max(128), pattern: z.enum(["solid", "striped"]), primary: color, secondary: color,
  physicalSizeM: z.tuple([z.number().finite().min(0.1).max(4), z.number().finite().min(0.1).max(4)]) }).strict();
const payload = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-awning-fabric-artifact"),
  source: request, widthPx: z.literal(64), heightPx: z.literal(64), baseColorRgbaHex: z.string().regex(/^[0-9a-f]{32768}$/),
  roughness: z.literal(0.9), metalness: z.literal(0) }).strict();
export const ConstructionAwningFabricRequestSchema = json.pipe(request);
export const ConstructionAwningFabricArtifactSchema = json.pipe(payload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict());
export type ConstructionAwningFabricArtifact = z.infer<typeof ConstructionAwningFabricArtifactSchema>;
