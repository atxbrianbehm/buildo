import { Color, MeshStandardMaterial } from "three";
import type { AtlasDebugExport } from "../materials/atlasDebugExport";

export interface AtlasMaterialRegistryInput {
  atlasId: string;
  atlasContentHash: string;
  debugExport?: AtlasDebugExport;
}

export interface AtlasMaterialRegistry {
  getMaterial(slotId: string): MeshStandardMaterial;
  listMaterialSlotIds(): string[];
  listMaterials(): MeshStandardMaterial[];
  dispose(): void;
}

function colorFromSlotId(slotId: string): Color {
  let hash = 2166136261;
  for (let index = 0; index < slotId.length; index += 1) {
    hash ^= slotId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const red = 0.32 + ((hash & 0xff) / 255) * 0.42;
  const green = 0.32 + (((hash >>> 8) & 0xff) / 255) * 0.42;
  const blue = 0.32 + (((hash >>> 16) & 0xff) / 255) * 0.42;
  return new Color(red, green, blue);
}

export function createAtlasMaterialRegistry(input: AtlasMaterialRegistryInput): AtlasMaterialRegistry {
  const slotIds = new Set(input.debugExport?.slotOverlays.map((slot) => slot.slotId) ?? []);
  const materials = new Map<string, MeshStandardMaterial>();

  function getMaterial(slotId: string): MeshStandardMaterial {
    slotIds.add(slotId);
    const existing = materials.get(slotId);
    if (existing) {
      return existing;
    }

    const material = new MeshStandardMaterial({
      color: colorFromSlotId(slotId),
      roughness: 0.82,
      metalness: slotId.includes("frame") || slotId.includes("trim") ? 0.12 : 0
    });
    material.name = `building-atlas.${slotId}`;
    material.userData = {
      atlasId: input.atlasId,
      atlasContentHash: input.atlasContentHash,
      atlasSlotId: slotId,
      rendererBoundary: "building-family"
    };
    materials.set(slotId, material);
    return material;
  }

  return {
    getMaterial,
    listMaterialSlotIds: () => Array.from(slotIds).sort(),
    listMaterials: () => Array.from(materials.values()),
    dispose: () => {
      for (const material of materials.values()) {
        material.dispose();
        material.userData.disposed = true;
      }
      materials.clear();
    }
  };
}
