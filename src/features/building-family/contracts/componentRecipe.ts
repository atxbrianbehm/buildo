import { z } from "zod";
import { SchemaVersion010, VariationScopeSchema } from "./shared";

export const ComponentRecipeKindSchema = z.enum([
  "boxAssembly",
  "frame",
  "recess",
  "profileSweep",
  "panel",
  "flatRoof",
  "gableRoof"
]);

export const ComponentRecipeSchema = z.object({
  schemaVersion: SchemaVersion010,
  id: z.string(),
  kind: ComponentRecipeKindSchema,
  role: z.string(),
  dimensionsM: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().nonnegative()
  }),
  parameterRanges: z.record(
    z.string(),
    z.object({
      min: z.number(),
      max: z.number()
    })
  ),
  anchors: z.array(
    z.object({
      id: z.string(),
      position: z.tuple([z.number(), z.number(), z.number()]),
      normal: z.tuple([z.number(), z.number(), z.number()]).optional()
    })
  ),
  attachmentPlane: z.string().optional(),
  subcomponentRecipeIds: z.array(z.string()).optional(),
  atlasSlotIds: z.array(z.string()),
  profileRecipeId: z.string().optional(),
  uvBehavior: z.enum(["repeat", "repeat-x", "cap-repeat-cap", "nine-slice", "stretch"]),
  variationScope: VariationScopeSchema,
  lowDetailRecipeId: z.string()
});

export type ComponentRecipeKind = z.infer<typeof ComponentRecipeKindSchema>;
export type ComponentRecipe = z.infer<typeof ComponentRecipeSchema>;
