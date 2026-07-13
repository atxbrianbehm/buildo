import type { ArtKitManifest, ArtKitMaterialChannel, ArtKitMaterialRole } from "../art-kit/artKitContracts";
import type { Diagnostic } from "../core/diagnostics";

export interface ArtKitMaterialGltfHints {
  baseColorTexture: boolean;
  normalTexture: boolean;
  metallicRoughnessTexture: boolean;
  occlusionTexture: boolean;
  alphaMode: "OPAQUE" | "BLEND" | "MASK";
}

export interface ArtKitMaterialBinding {
  atlasSlotId: string;
  materialRoleId: string;
  label: string;
  channels: ArtKitMaterialChannel[];
  metersPerTile: number;
  proceduralSource: string;
  gltfHints: ArtKitMaterialGltfHints;
}

export interface ArtKitMaterialSet {
  schemaVersion: "0.1.0";
  artKitManifestId: string;
  bindings: ArtKitMaterialBinding[];
  diagnostics: Diagnostic[];
}

export function tilePhysicalSizeM(metersPerTile: number): { width: number; height: number } {
  const size = Math.max(0.05, metersPerTile);
  return { width: size, height: size };
}

/** Late-19c period ranges (V5) — brick courses ~75 mm; tile is a multi-course repeat. */
export const LATE19C_MATERIAL_SCALE_M = {
  brick: { min: 0.85, max: 1.05, ideal: 0.96 },
  plaster: { min: 1.0, max: 1.4, ideal: 1.2 },
  "trim-stone": { min: 0.5, max: 0.8, ideal: 0.64 },
  "painted-wood": { min: 0.25, max: 0.45, ideal: 0.32 },
  "painted-metal": { min: 0.12, max: 0.35, ideal: 0.2 },
  roof: { min: 1.2, max: 2.0, ideal: 1.5 },
  glass: { min: 0.8, max: 1.2, ideal: 1.0 },
  grime: { min: 0.5, max: 1.2, ideal: 0.8 }
} as const;

export type Late19cMaterialScaleId = keyof typeof LATE19C_MATERIAL_SCALE_M;

export function isPeriodMaterialScale(
  materialRoleId: string,
  metersPerTile: number
): boolean {
  const range = LATE19C_MATERIAL_SCALE_M[materialRoleId as Late19cMaterialScaleId];
  if (!range) {
    return metersPerTile > 0;
  }
  return metersPerTile >= range.min && metersPerTile <= range.max;
}

export function evaluateArtKitPeriodMaterialScale(kit: ArtKitManifest): {
  passCount: number;
  failCount: number;
  issues: string[];
} {
  const issues: string[] = [];
  let passCount = 0;
  let failCount = 0;
  for (const material of kit.materials) {
    if (isPeriodMaterialScale(material.id, material.metersPerTile)) {
      passCount += 1;
    } else {
      failCount += 1;
      const range = LATE19C_MATERIAL_SCALE_M[material.id as Late19cMaterialScaleId];
      issues.push(
        range
          ? `${material.id}: ${material.metersPerTile} m/tile outside ${range.min}–${range.max}`
          : `${material.id}: non-positive tile scale`
      );
    }
  }
  return { passCount, failCount, issues };
}

export function gltfHintsForChannels(channels: ArtKitMaterialChannel[]): ArtKitMaterialGltfHints {
  const hasOpacity = channels.includes("opacity");
  return {
    baseColorTexture: channels.includes("baseColor"),
    normalTexture: channels.includes("normal"),
    metallicRoughnessTexture: channels.includes("orm"),
    occlusionTexture: channels.includes("orm"),
    alphaMode: hasOpacity ? "BLEND" : "OPAQUE"
  };
}

/**
 * Map style-pack selected family ids / atlas roles onto art-kit material role ids.
 */
export function mapSelectedFamilyToArtKitMaterialId(
  atlasRoleOrFamily: string,
  selectedFamily: string
): string | undefined {
  const family = selectedFamily.toLowerCase();
  const role = atlasRoleOrFamily.toLowerCase();

  if (role.includes("glass") || family.includes("glass")) {
    return "glass";
  }
  if (role.includes("roof") || family.includes("membrane") || family.includes("gable") || family.includes("roof")) {
    return "roof";
  }
  if (role.includes("wall") || role === "wall") {
    if (family.includes("stucco") || family.includes("plaster")) {
      return "plaster";
    }
    if (family.includes("brick")) {
      return "brick";
    }
    return "brick";
  }
  if (role.includes("door") || role.includes("frame") || family.includes("wood")) {
    return "painted-wood";
  }
  if (role.includes("cornice") || family.includes("metal")) {
    return "painted-metal";
  }
  if (role.includes("trim") || family.includes("stone") || family.includes("pressed")) {
    return "trim-stone";
  }
  if (role.includes("ornament") || role.includes("utility") || family.includes("mask") || family.includes("grime")) {
    return "grime";
  }
  return undefined;
}

export function artKitMaterialForAtlasSlot(
  kit: ArtKitManifest,
  atlasSlotId: string
): ArtKitMaterialRole | undefined {
  return kit.materials.find((material) => material.atlasSlotHint === atlasSlotId);
}

export function resolveArtKitMaterialSet(kit: ArtKitManifest): ArtKitMaterialSet {
  const diagnostics: Diagnostic[] = [];
  const bindings: ArtKitMaterialBinding[] = [];
  const seenSlots = new Set<string>();

  for (const material of kit.materials) {
    if (!material.atlasSlotHint) {
      diagnostics.push({
        code: "artKit.materialSet.missingAtlasHint",
        message: `Art-kit material ${material.id} has no atlasSlotHint and cannot bind to the atlas planner.`,
        severity: "warning",
        path: `materials.${material.id}.atlasSlotHint`
      });
      continue;
    }

    if (seenSlots.has(material.atlasSlotHint)) {
      diagnostics.push({
        code: "artKit.materialSet.duplicateAtlasHint",
        message: `Multiple art-kit materials claim atlas slot ${material.atlasSlotHint}.`,
        severity: "warning",
        path: `materials.${material.id}.atlasSlotHint`,
        received: material.atlasSlotHint
      });
    }
    seenSlots.add(material.atlasSlotHint);

    bindings.push({
      atlasSlotId: material.atlasSlotHint,
      materialRoleId: material.id,
      label: material.label,
      channels: [...material.channels],
      metersPerTile: material.metersPerTile,
      proceduralSource: material.proceduralSource,
      gltfHints: gltfHintsForChannels(material.channels)
    });
  }

  return {
    schemaVersion: "0.1.0",
    artKitManifestId: kit.id,
    bindings,
    diagnostics
  };
}

export function bindingForSlot(
  materialSet: ArtKitMaterialSet,
  atlasSlotId: string
): ArtKitMaterialBinding | undefined {
  return materialSet.bindings.find((binding) => binding.atlasSlotId === atlasSlotId);
}
