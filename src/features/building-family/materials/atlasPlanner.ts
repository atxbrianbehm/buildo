import { AtlasManifestSchema, type AtlasManifest, type AtlasSlot } from "../contracts/atlasManifest";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { BuildingFamilySpecSchema } from "../contracts/buildingFamilySpec";
import type { Diagnostic } from "../core/diagnostics";
import { hashCanonicalJson } from "../core/contentHash";

export interface AtlasPlannerOptions {
  widthPx?: number;
  heightPx?: number;
  paddingPx?: number;
}

export interface AtlasMaterialSourcePlan {
  sourceId: string;
  role: AtlasSlot["role"];
  selectedFamily: string;
  seedPath: string;
  promptVocabulary: string[];
}

export interface AtlasPlan {
  manifest: AtlasManifest;
  materialSources: AtlasMaterialSourcePlan[];
  profileRecipeIds: string[];
  diagnostics: Diagnostic[];
}

interface SlotTemplate {
  id: string;
  role: AtlasSlot["role"];
  uvMode: AtlasSlot["uvMode"];
  periodicity: AtlasSlot["periodicity"];
  materialSourceId: string;
  selectedFamily: keyof BuildingFamilySpec["selectedFamilies"];
  profileRecipeId?: (spec: BuildingFamilySpec) => string;
  compatibilityTags: string[];
  promptTerms: string[];
  physicalSize: (spec: BuildingFamilySpec) => { width: number; height: number };
}

const slotTemplates: SlotTemplate[] = [
  {
    id: "wall.primary",
    role: "wall",
    uvMode: "repeat",
    periodicity: "xy",
    materialSourceId: "source.wall.primary",
    selectedFamily: "wall",
    compatibilityTags: ["masonry", "facade"],
    promptTerms: ["primary wall material"],
    physicalSize: (spec) => ({
      width: spec.massing.widthM,
      height: spec.massing.floorHeightsM.reduce((sum, height) => sum + height, 0)
    })
  },
  {
    id: "wall.secondary",
    role: "wall",
    uvMode: "repeat",
    periodicity: "xy",
    materialSourceId: "source.wall.secondary",
    selectedFamily: "wall",
    compatibilityTags: ["side", "rear", "masonry"],
    promptTerms: ["secondary wall material"],
    physicalSize: (spec) => ({
      width: spec.massing.depthM,
      height: spec.massing.floorHeightsM.reduce((sum, height) => sum + height, 0)
    })
  },
  {
    id: "roof.primary",
    role: "roof",
    uvMode: "repeat",
    periodicity: "xy",
    materialSourceId: "source.roof.primary",
    selectedFamily: "roof",
    compatibilityTags: ["roof"],
    promptTerms: ["roof surface"],
    physicalSize: (spec) => ({ width: spec.massing.widthM, height: spec.massing.depthM })
  },
  {
    id: "glass.primary",
    role: "glass",
    uvMode: "stretch",
    periodicity: "none",
    materialSourceId: "source.glass.primary",
    selectedFamily: "window",
    compatibilityTags: ["window", "glass"],
    promptTerms: ["slightly wavy glass"],
    physicalSize: () => ({ width: 1.4, height: 2.4 })
  },
  {
    id: "frame.primary",
    role: "frame",
    uvMode: "cap-repeat-cap",
    periodicity: "x",
    materialSourceId: "source.frame.primary",
    selectedFamily: "window",
    compatibilityTags: ["window", "frame"],
    promptTerms: ["painted frame"],
    physicalSize: () => ({ width: 1.6, height: 2.6 })
  },
  {
    id: "door.primary",
    role: "door",
    uvMode: "stretch",
    periodicity: "none",
    materialSourceId: "source.door.primary",
    selectedFamily: "door",
    compatibilityTags: ["door", "storefront"],
    promptTerms: ["recessed storefront door"],
    physicalSize: () => ({ width: 2.2, height: 3.2 })
  },
  {
    id: "trim.horizontal.primary",
    role: "horizontalTrim",
    uvMode: "cap-repeat-cap",
    periodicity: "x",
    materialSourceId: "source.trim.horizontal.primary",
    selectedFamily: "trim",
    profileRecipeId: (spec) => `profile.trim.${spec.selectedFamilies.trim}.horizontal-primary`,
    compatibilityTags: ["trim", "belt-course"],
    promptTerms: ["horizontal trim"],
    physicalSize: (spec) => ({ width: spec.massing.widthM, height: 0.45 })
  },
  {
    id: "trim.horizontal.secondary",
    role: "horizontalTrim",
    uvMode: "cap-repeat-cap",
    periodicity: "x",
    materialSourceId: "source.trim.horizontal.secondary",
    selectedFamily: "trim",
    profileRecipeId: (spec) => `profile.trim.${spec.selectedFamilies.trim}.horizontal-secondary`,
    compatibilityTags: ["trim", "sill", "lintel"],
    promptTerms: ["secondary horizontal trim"],
    physicalSize: (spec) => ({ width: spec.massing.widthM / spec.facade.frontBayCount, height: 0.3 })
  },
  {
    id: "trim.vertical.primary",
    role: "verticalTrim",
    uvMode: "cap-repeat-cap",
    periodicity: "x",
    materialSourceId: "source.trim.vertical.primary",
    selectedFamily: "trim",
    profileRecipeId: (spec) => `profile.trim.${spec.selectedFamilies.trim}.vertical-primary`,
    compatibilityTags: ["trim", "pilaster"],
    promptTerms: ["vertical trim"],
    physicalSize: (spec) => ({
      width: 0.36,
      height: spec.massing.floorHeightsM.reduce((sum, height) => sum + height, 0)
    })
  },
  {
    id: "cornice.primary",
    role: "horizontalTrim",
    uvMode: "cap-repeat-cap",
    periodicity: "x",
    materialSourceId: "source.cornice.primary",
    selectedFamily: "cornice",
    profileRecipeId: (spec) => `profile.cornice.${spec.selectedFamilies.cornice}.primary`,
    compatibilityTags: ["cornice", "profile"],
    promptTerms: ["primary cornice"],
    physicalSize: (spec) => ({ width: spec.massing.widthM, height: spec.facade.corniceHeightM })
  },
  {
    id: "ornament.primary",
    role: "ornament",
    uvMode: "nine-slice",
    periodicity: "none",
    materialSourceId: "source.ornament.primary",
    selectedFamily: "ornament",
    compatibilityTags: ["ornament", "mask"],
    promptTerms: ["shallow ornament mask"],
    physicalSize: () => ({ width: 1.2, height: 1.2 })
  },
  {
    id: "utility.mask",
    role: "ornament",
    uvMode: "stretch",
    periodicity: "none",
    materialSourceId: "source.utility.mask",
    selectedFamily: "ornament",
    compatibilityTags: ["utility", "mask"],
    promptTerms: ["utility mask"],
    physicalSize: () => ({ width: 1, height: 1 })
  }
];

function makeGridRect(index: number, widthPx: number, heightPx: number, paddingPx: number): AtlasSlot["rectPx"] {
  const columns = 4;
  const rows = 3;
  const column = index % columns;
  const row = Math.floor(index / columns);
  const slotWidth = Math.floor((widthPx - paddingPx * (columns + 1)) / columns);
  const slotHeight = Math.floor((heightPx - paddingPx * (rows + 1)) / rows);

  return {
    x: paddingPx + column * (slotWidth + paddingPx),
    y: paddingPx + row * (slotHeight + paddingPx),
    width: slotWidth,
    height: slotHeight
  };
}

function selectedFamily(spec: BuildingFamilySpec, key: keyof BuildingFamilySpec["selectedFamilies"]): string {
  return spec.selectedFamilies[key] ?? "utility";
}

function promptForSlot(spec: BuildingFamilySpec, template: SlotTemplate): string {
  const family = selectedFamily(spec, template.selectedFamily);
  return [family, ...template.promptTerms, ...template.compatibilityTags].join(", ");
}

function buildMaterialSources(spec: BuildingFamilySpec): AtlasMaterialSourcePlan[] {
  return slotTemplates.map((template) => ({
    sourceId: template.materialSourceId,
    role: template.role,
    selectedFamily: selectedFamily(spec, template.selectedFamily),
    seedPath: `atlas/source/${template.id}/${selectedFamily(spec, template.selectedFamily)}`,
    promptVocabulary: [selectedFamily(spec, template.selectedFamily), ...template.promptTerms]
  }));
}

export async function planAtlas(specInput: unknown, options: AtlasPlannerOptions = {}): Promise<AtlasPlan> {
  const spec = BuildingFamilySpecSchema.parse(specInput);
  const widthPx = options.widthPx ?? 1024;
  const heightPx = options.heightPx ?? 1024;
  const paddingPx = options.paddingPx ?? 12;
  const profileRecipeIds = slotTemplates
    .map((template) => template.profileRecipeId?.(spec))
    .filter((id): id is string => Boolean(id));

  const slots = slotTemplates.map((template, index): AtlasSlot => ({
    id: template.id,
    role: template.role,
    rectPx: makeGridRect(index, widthPx, heightPx, paddingPx),
    uvMode: template.uvMode,
    periodicity: template.periodicity,
    physicalSizeM: template.physicalSize(spec),
    materialSourceId: template.materialSourceId,
    profileRecipeId: template.profileRecipeId?.(spec),
    compatibilityTags: template.compatibilityTags,
    generationPrompt: promptForSlot(spec, template),
    seedPath: `atlas/slot/${template.id}/${spec.familyId}`
  }));

  const manifestWithoutId = {
    schemaVersion: "0.1.0" as const,
    atlasId: "pending",
    widthPx,
    heightPx,
    paddingPx,
    channels: ["baseColor", "normal", "orm", "height", "opacity"] as const,
    slots
  };

  const atlasId = `atlas-${(await hashCanonicalJson({ ...manifestWithoutId, atlasId: undefined })).slice(0, 16)}`;
  const manifest = AtlasManifestSchema.parse({ ...manifestWithoutId, atlasId });
  const plan = {
    manifest,
    materialSources: buildMaterialSources(spec),
    profileRecipeIds,
    diagnostics: [] satisfies Diagnostic[]
  };

  return {
    ...plan,
    diagnostics: validateAtlasPlan(plan)
  };
}

function rectRight(slot: AtlasSlot): number {
  return slot.rectPx.x + slot.rectPx.width;
}

function rectBottom(slot: AtlasSlot): number {
  return slot.rectPx.y + slot.rectPx.height;
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function slotRectsOverlap(left: AtlasSlot, right: AtlasSlot): boolean {
  return (
    intervalsOverlap(left.rectPx.x, rectRight(left), right.rectPx.x, rectRight(right)) &&
    intervalsOverlap(left.rectPx.y, rectBottom(left), right.rectPx.y, rectBottom(right))
  );
}

function gapBetween(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  if (aEnd <= bStart) {
    return bStart - aEnd;
  }
  if (bEnd <= aStart) {
    return aStart - bEnd;
  }
  return 0;
}

export function validateAtlasPlan(plan: AtlasPlan): Diagnostic[] {
  const manifest = AtlasManifestSchema.parse(plan.manifest);
  const diagnostics: Diagnostic[] = [];
  const knownMaterialSourceIds = new Set(plan.materialSources.map((source) => source.sourceId));
  const knownProfileRecipeIds = new Set(plan.profileRecipeIds);

  for (const slot of manifest.slots) {
    if (rectRight(slot) > manifest.widthPx || rectBottom(slot) > manifest.heightPx) {
      diagnostics.push({
        code: "atlas.slotOutOfBounds",
        message: `Atlas slot ${slot.id} falls outside the manifest bounds.`,
        severity: "error",
        path: `slots.${slot.id}.rectPx`
      });
    }

    if (
      slot.rectPx.x < manifest.paddingPx ||
      slot.rectPx.y < manifest.paddingPx ||
      rectRight(slot) > manifest.widthPx - manifest.paddingPx ||
      rectBottom(slot) > manifest.heightPx - manifest.paddingPx
    ) {
      diagnostics.push({
        code: "atlas.paddingViolation",
        message: `Atlas slot ${slot.id} omits required ${manifest.paddingPx}px atlas padding.`,
        severity: "error",
        path: `slots.${slot.id}.rectPx`
      });
    }

    if (!knownMaterialSourceIds.has(slot.materialSourceId)) {
      diagnostics.push({
        code: "atlas.unknownMaterialSource",
        message: `Atlas slot ${slot.id} references unknown material source ${slot.materialSourceId}.`,
        severity: "error",
        path: `slots.${slot.id}.materialSourceId`,
        received: slot.materialSourceId
      });
    }

    if (slot.profileRecipeId && !knownProfileRecipeIds.has(slot.profileRecipeId)) {
      diagnostics.push({
        code: "atlas.unknownProfileRecipe",
        message: `Atlas slot ${slot.id} references unknown profile recipe ${slot.profileRecipeId}.`,
        severity: "error",
        path: `slots.${slot.id}.profileRecipeId`,
        received: slot.profileRecipeId
      });
    }
  }

  for (let leftIndex = 0; leftIndex < manifest.slots.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < manifest.slots.length; rightIndex += 1) {
      const left = manifest.slots[leftIndex];
      const right = manifest.slots[rightIndex];
      const xOverlap = intervalsOverlap(left.rectPx.x, rectRight(left), right.rectPx.x, rectRight(right));
      const yOverlap = intervalsOverlap(left.rectPx.y, rectBottom(left), right.rectPx.y, rectBottom(right));

      if (slotRectsOverlap(left, right)) {
        diagnostics.push({
          code: "atlas.slotOverlap",
          message: `Atlas slots ${left.id} and ${right.id} overlap.`,
          severity: "error",
          path: `slots.${left.id}`
        });
        continue;
      }

      const horizontalGap = gapBetween(left.rectPx.x, rectRight(left), right.rectPx.x, rectRight(right));
      const verticalGap = gapBetween(left.rectPx.y, rectBottom(left), right.rectPx.y, rectBottom(right));
      if ((yOverlap && horizontalGap < manifest.paddingPx) || (xOverlap && verticalGap < manifest.paddingPx)) {
        diagnostics.push({
          code: "atlas.paddingViolation",
          message: `Atlas slots ${left.id} and ${right.id} omit required inter-slot padding.`,
          severity: "error",
          path: `slots.${left.id}`
        });
      }
    }
  }

  return diagnostics;
}
