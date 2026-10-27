import { z } from "zod";
import type { Diagnostic } from "../core/diagnostics";
import { SchemaVersion010 } from "../contracts/shared";

const ArtKitPositiveMetersSchema = z.number().positive();

export const ArtKitMaterialChannelSchema = z.enum(["baseColor", "normal", "orm", "height", "opacity"]);

export const ArtKitMaterialRoleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  channels: z.array(ArtKitMaterialChannelSchema).min(1),
  metersPerTile: ArtKitPositiveMetersSchema,
  atlasSlotHint: z.string().min(1).optional(),
  proceduralSource: z.string().min(1)
});

export const ArtKitSocketKindSchema = z.enum(["grid", "edge", "opening", "trim", "roof"]);

export const ArtKitSocketSchema = z.object({
  id: z.string().min(1),
  kind: ArtKitSocketKindSchema,
  positionMeters: z.tuple([z.number(), z.number(), z.number()]),
  normal: z.tuple([z.number(), z.number(), z.number()]),
  accepts: z.array(ArtKitSocketKindSchema)
});

export const ArtKitRecipeRefSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["boxAssembly", "frame", "recess", "profileSweep", "panel", "flatRoof", "gableRoof"])
});

export const ArtKitModuleKindSchema = z.enum([
  "wall-panel",
  "opening",
  "door",
  "storefront",
  "trim-run",
  "cornice",
  "parapet",
  "roof-cap",
  "corner-quoin",
  "balcony",
  "accessory"
]);

export const ArtKitPivotSchema = z.enum(["bottom-left-back", "bottom-center-back", "center"]);

export const ArtKitFacadeZoneSchema = z.enum(["ground", "body", "cornice", "roof", "side", "rear"]);

export const ArtKitModuleSchema = z.object({
  id: z.string().min(1),
  kind: ArtKitModuleKindSchema,
  boundsMeters: z.object({
    width: ArtKitPositiveMetersSchema,
    height: ArtKitPositiveMetersSchema,
    depth: ArtKitPositiveMetersSchema
  }),
  pivot: ArtKitPivotSchema,
  facadeZones: z.array(ArtKitFacadeZoneSchema).min(1),
  sockets: z.array(ArtKitSocketSchema),
  materialRoles: z.record(z.string().min(1), z.string().min(1)),
  recipe: ArtKitRecipeRefSchema,
  lod: z.object({
    high: z.boolean(),
    lowFallbackModuleId: z.string().min(1).optional()
  }),
  tags: z.array(z.string())
});

export const ArtKitQualityMetadataSchema = z.object({
  target: z.literal("stylized-apartment-kit"),
  status: z.enum(["draft", "review", "ready"]),
  notes: z.array(z.string())
});

export const ArtKitManifestSchema = z.object({
  schemaVersion: SchemaVersion010,
  id: z.string().min(1),
  label: z.string().min(1),
  unitMeters: z.literal(1),
  stylePackIds: z.array(z.string().min(1)).min(1),
  materials: z.array(ArtKitMaterialRoleSchema).min(1),
  modules: z.array(ArtKitModuleSchema).min(1),
  quality: ArtKitQualityMetadataSchema
});

export type ArtKitMaterialChannel = z.infer<typeof ArtKitMaterialChannelSchema>;
export type ArtKitMaterialRole = z.infer<typeof ArtKitMaterialRoleSchema>;
export type ArtKitSocketKind = z.infer<typeof ArtKitSocketKindSchema>;
export type ArtKitSocket = z.infer<typeof ArtKitSocketSchema>;
export type ArtKitRecipeRef = z.infer<typeof ArtKitRecipeRefSchema>;
export type ArtKitModuleKind = z.infer<typeof ArtKitModuleKindSchema>;
export type ArtKitPivot = z.infer<typeof ArtKitPivotSchema>;
export type ArtKitFacadeZone = z.infer<typeof ArtKitFacadeZoneSchema>;
export type ArtKitModule = z.infer<typeof ArtKitModuleSchema>;
export type ArtKitQualityMetadata = z.infer<typeof ArtKitQualityMetadataSchema>;
export type ArtKitManifest = z.infer<typeof ArtKitManifestSchema>;

export type ArtKitManifestValidationResult =
  | {
      success: true;
      data: ArtKitManifest;
      diagnostics: [];
    }
  | {
      success: false;
      diagnostics: Diagnostic[];
    };

export function validateArtKitManifest(input: unknown): ArtKitManifestValidationResult {
  const parsed = ArtKitManifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      diagnostics: parsed.error.issues.map((issue) => ({
        code: "artKit.schema.invalid",
        message: issue.message,
        severity: "error",
        path: formatDiagnosticPath(issue.path),
        received: "input" in issue ? issue.input : undefined
      }))
    };
  }

  const diagnostics = validateManifestSemantics(parsed.data);
  if (diagnostics.length > 0) {
    return {
      success: false,
      diagnostics
    };
  }

  return {
    success: true,
    data: parsed.data,
    diagnostics: []
  };
}

function validateManifestSemantics(manifest: ArtKitManifest): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const materialRoleIds = new Set(manifest.materials.map((material) => material.id));
  const moduleIds = new Set(manifest.modules.map((module) => module.id));
  const sortedModuleIds = [...moduleIds].sort();
  const seenMaterialRoleIds = new Set<string>();
  const seenModuleIds = new Set<string>();

  manifest.materials.forEach((material, index) => {
    if (seenMaterialRoleIds.has(material.id)) {
      diagnostics.push({
        code: "artKit.materialRole.duplicateId",
        message: `Duplicate material role id "${material.id}".`,
        severity: "error",
        path: `materials[${index}].id`,
        received: material.id
      });
    }
    seenMaterialRoleIds.add(material.id);
  });

  manifest.modules.forEach((module, moduleIndex) => {
    if (seenModuleIds.has(module.id)) {
      diagnostics.push({
        code: "artKit.module.duplicateId",
        message: `Duplicate module id "${module.id}".`,
        severity: "error",
        path: `modules[${moduleIndex}].id`,
        received: module.id
      });
    }
    seenModuleIds.add(module.id);

    if (module.lod.lowFallbackModuleId !== undefined && !moduleIds.has(module.lod.lowFallbackModuleId)) {
      diagnostics.push({
        code: "artKit.module.lowFallbackUnknown",
        message: `Module "${module.id}" references unknown low-detail fallback module "${module.lod.lowFallbackModuleId}".`,
        severity: "error",
        path: `modules[${moduleIndex}].lod.lowFallbackModuleId`,
        received: module.lod.lowFallbackModuleId,
        allowedValues: sortedModuleIds
      });
    }

    Object.entries(module.materialRoles).forEach(([slot, materialRoleId]) => {
      if (!materialRoleIds.has(materialRoleId)) {
        diagnostics.push({
          code: "artKit.materialRole.unknown",
          message: `Module "${module.id}" references unknown material role "${materialRoleId}".`,
          severity: "error",
          path: `modules[${moduleIndex}].materialRoles.${slot}`,
          received: materialRoleId,
          allowedValues: [...materialRoleIds].sort()
        });
      }
    });

    const seenSocketIds = new Set<string>();
    module.sockets.forEach((socket, socketIndex) => {
      if (seenSocketIds.has(socket.id)) {
        diagnostics.push({
          code: "artKit.socket.duplicateId",
          message: `Module "${module.id}" has duplicate socket id "${socket.id}".`,
          severity: "error",
          path: `modules[${moduleIndex}].sockets[${socketIndex}].id`,
          received: socket.id
        });
      }
      seenSocketIds.add(socket.id);

      if (socket.accepts.length === 0) {
        diagnostics.push({
          code: "artKit.socket.accepts.empty",
          message: `Socket "${socket.id}" on module "${module.id}" must accept at least one socket kind.`,
          severity: "error",
          path: `modules[${moduleIndex}].sockets[${socketIndex}].accepts`
        });
      }

      if (socket.normal.every((component) => component === 0)) {
        diagnostics.push({
          code: "artKit.socket.normal.zero",
          message: `Socket "${socket.id}" on module "${module.id}" must have a non-zero normal.`,
          severity: "error",
          path: `modules[${moduleIndex}].sockets[${socketIndex}].normal`,
          received: socket.normal
        });
      }
    });
  });

  return diagnostics;
}

function formatDiagnosticPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "$";
  }

  let formatted = "";
  for (const segment of path) {
    if (typeof segment === "number") {
      formatted = `${formatted}[${segment}]`;
      continue;
    }

    const text = String(segment);
    formatted = formatted.length === 0 ? text : `${formatted}.${text}`;
  }

  return formatted;
}
