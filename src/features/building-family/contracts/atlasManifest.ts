import { z } from "zod";
import { SchemaVersion010 } from "./shared";

export const AtlasChannelSchema = z.enum(["baseColor", "normal", "orm", "height", "opacity"]);

export const AtlasSlotSchema = z.object({
  id: z.string(),
  role: z.enum([
    "wall",
    "roof",
    "glass",
    "frame",
    "door",
    "horizontalTrim",
    "verticalTrim",
    "ornament"
  ]),
  rectPx: z.object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive()
  }),
  uvMode: z.enum(["repeat", "repeat-x", "cap-repeat-cap", "nine-slice", "stretch"]),
  periodicity: z.enum(["none", "x", "xy"]),
  physicalSizeM: z.object({
    width: z.number().positive(),
    height: z.number().positive()
  }),
  materialSourceId: z.string(),
  profileRecipeId: z.string().optional(),
  compatibilityTags: z.array(z.string()),
  generationPrompt: z.string(),
  seedPath: z.string(),
  /** Optional art-kit physical tile scale for repeatable materials (glTF mapping). */
  metersPerTile: z.number().positive().optional(),
  artKitMaterialRoleId: z.string().optional(),
  proceduralSource: z.string().optional()
});

export const AtlasManifestSchema = z.object({
  schemaVersion: SchemaVersion010,
  atlasId: z.string(),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  paddingPx: z.number().int().nonnegative(),
  channels: z.array(AtlasChannelSchema),
  slots: z.array(AtlasSlotSchema)
});

export type AtlasChannel = z.infer<typeof AtlasChannelSchema>;
export type AtlasSlot = z.infer<typeof AtlasSlotSchema>;
export type AtlasManifest = z.infer<typeof AtlasManifestSchema>;

