import { z } from "zod";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";

const identifier = z.string().min(1).max(512).refine(value => value.trim() === value);
const byte = z.number().int().min(0).max(255), unit = z.number().finite().min(0).max(1);
const payload = z.object({
  schemaVersion: z.literal("0.1.0"), kind: z.literal("constant-opaque-pbr-base"),
  slotId: identifier, role: z.enum(["frame", "horizontalTrim", "verticalTrim"]),
  colorSrgb: z.tuple([byte, byte, byte]), roughness: unit, metalness: unit
}).strict();
const json = z.unknown().superRefine((input, context) => {
  const issue = findBuildingDocumentJsonIssue(input);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
export const ConstantSurfaceBasePayloadSchema = json.pipe(payload);
export const ConstantSurfaceBaseAppearanceSchema = json.pipe(payload.extend({ contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict());
export type ConstantSurfaceBaseAppearance = z.infer<typeof ConstantSurfaceBaseAppearanceSchema>;
