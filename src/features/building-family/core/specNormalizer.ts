import { BuildingFamilySpecSchema, type BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { BuildingIntentSchema } from "../contracts/buildingIntent";
import {
  HistoricalStylePackSchema,
  type HistoricalStylePack
} from "../contracts/historicalStylePack";
import type { Diagnostic } from "./diagnostics";
import { withBuildingSeedVariation } from "./buildingSeedVariation";
import { hashCanonicalJson } from "./contentHash";
import { createSeedTree } from "./seedTree";

export interface NormalizeBuildingSpecResult {
  spec: BuildingFamilySpec;
  diagnostics: Diagnostic[];
}

function clampWithDiagnostic(
  value: number,
  min: number,
  max: number,
  path: string,
  diagnostics: Diagnostic[]
): number {
  const clamped = Math.min(max, Math.max(min, value));
  if (clamped !== value) {
    diagnostics.push({
      code: "spec.clamped",
      message: `Clamped ${path} from ${value} to ${clamped}.`,
      severity: "warning",
      path,
      received: value,
      allowedValues: [min, max]
    });
  }
  return clamped;
}

function firstPaletteId(pack: HistoricalStylePack, role: keyof HistoricalStylePack["materialPalette"]): string {
  return pack.materialPalette[role][0].id;
}

function selectKnown(
  requested: string | undefined,
  allowed: string[],
  fallback: string,
  path: string,
  diagnostics: Diagnostic[]
): string {
  if (!requested) {
    return fallback;
  }
  if (allowed.includes(requested)) {
    return requested;
  }
  diagnostics.push({
    code: "spec.invalidSelection",
    message: `Replaced unsupported ${path} value ${requested} with ${fallback}.`,
    severity: "warning",
    path,
    received: requested,
    allowedValues: allowed
  });
  return fallback;
}

function matchesForbidden(
  forbidden: HistoricalStylePack["compatibility"]["forbidden"][number],
  values: Record<string, string>
): boolean {
  return Object.entries(forbidden.when).every(([key, value]) => values[key] === value);
}

export async function normalizeBuildingSpec(
  intentInput: unknown,
  stylePackInput: unknown
): Promise<NormalizeBuildingSpecResult> {
  const intent = BuildingIntentSchema.parse(intentInput);
  const stylePack = HistoricalStylePackSchema.parse(stylePackInput);
  const diagnostics: Diagnostic[] = [];

  if (intent.stylePackId && intent.stylePackId !== stylePack.id) {
    diagnostics.push({
      code: "spec.stylePackMismatch",
      message: `Intent requested ${intent.stylePackId}, but ${stylePack.id} was supplied.`,
      severity: "warning",
      path: "stylePackId",
      received: intent.stylePackId,
      allowedValues: [stylePack.id]
    });
  }

  const floorCount = clampWithDiagnostic(
    intent.requested.floorCount ?? stylePack.defaults.floorCount,
    stylePack.massing.floorCount.min,
    stylePack.massing.floorCount.max,
    "requested.floorCount",
    diagnostics
  );
  const frontBayCount = clampWithDiagnostic(
    intent.requested.bayCount ?? stylePack.defaults.bayCount,
    stylePack.facade.frontBayCount.min,
    stylePack.facade.frontBayCount.max,
    "requested.bayCount",
    diagnostics
  );

  let roofType = selectKnown(
    intent.requested.roofType,
    stylePack.massing.roofTypes,
    stylePack.defaults.roofType,
    "requested.roofType",
    diagnostics
  ) as "flat" | "gable";
  const wallMaterial = selectKnown(
    intent.requested.wallMaterial,
    stylePack.componentFamilies.walls,
    stylePack.defaults.wallMaterial,
    "requested.wallMaterial",
    diagnostics
  );

  for (const forbidden of stylePack.compatibility.forbidden) {
    if (matchesForbidden(forbidden, { wallMaterial, roofType })) {
      diagnostics.push({
        code: "spec.incompatibleCombination",
        message: forbidden.reason,
        severity: "warning",
        path: "requested",
        received: { wallMaterial, roofType }
      });
      roofType = stylePack.defaults.roofType;
    }
  }

  const familySeedTree = createSeedTree(intent.seeds.family);
  const buildingSeedTree = createSeedTree(intent.seeds.building);
  const widthM = Number(Math.min(stylePack.massing.widthM.max, frontBayCount * 3.8 + 2).toFixed(3));
  const depthM = Number(
    clampWithDiagnostic(
      16 + familySeedTree.int(0, 4, "massing/depth"),
      stylePack.massing.depthM.min,
      stylePack.massing.depthM.max,
      "derived.depthM",
      diagnostics
    ).toFixed(3)
  );
  const typicalFloorHeight = Number(
    (
      stylePack.massing.floorHeightM.typical.min +
      familySeedTree.float01("massing/typicalFloorHeight") *
        (stylePack.massing.floorHeightM.typical.max - stylePack.massing.floorHeightM.typical.min)
    ).toFixed(3)
  );
  const floorHeightsM = [
    stylePack.massing.floorHeightM.ground,
    ...Array.from({ length: floorCount - 1 }, () => typicalFloorHeight)
  ];
  const parapetHeightM = Number(
    (
      stylePack.massing.parapetHeightM.min +
      familySeedTree.float01("massing/parapetHeight") *
        (stylePack.massing.parapetHeightM.max - stylePack.massing.parapetHeightM.min)
    ).toFixed(3)
  );

  const windowFamily = selectKnown(
    intent.requested.windowFamily,
    stylePack.componentFamilies.windows,
    stylePack.defaults.windowFamily,
    "requested.windowFamily",
    diagnostics
  );
  const corniceFamily = selectKnown(
    intent.requested.corniceFamily,
    stylePack.componentFamilies.cornices,
    stylePack.defaults.corniceFamily,
    "requested.corniceFamily",
    diagnostics
  );
  const roofFamily = roofType === "flat" ? "flat-membrane" : "simple-gable";

  // Family identity excludes building-scoped component families (window/door) so
  // sample variants can differ without splitting the shared family atlas lineage.
  const familyScopedIdentity = {
    stylePackId: stylePack.id,
    familySeed: intent.seeds.family,
    materialSeed: intent.seeds.material,
    trimSeed: intent.seeds.trim,
    floorCount,
    frontBayCount,
    wallMaterial,
    roofType,
    corniceFamily,
    trimDensity: intent.requested.trimDensity ?? stylePack.defaults.trimDensity
  };

  const sourceIntentHash = await hashCanonicalJson(intent);
  const familyId = `family-${(await hashCanonicalJson(familyScopedIdentity)).slice(0, 16)}`;
  const materialParameters = {
    wallWeathering: intent.requested.weathering ?? stylePack.defaults.weathering,
    materialSeed: createSeedTree(intent.seeds.material).uint32(`material/${wallMaterial}`)
  };

  const baseSpec = BuildingFamilySpecSchema.parse({
    schemaVersion: "0.1.0",
    familyId,
    sourceIntentHash,
    stylePackId: stylePack.id,
    seeds: intent.seeds,
    massing: {
      widthM,
      depthM,
      floorCount,
      floorHeightsM,
      parapetHeightM,
      roof: roofType === "gable" ? { type: roofType, pitchDegrees: 28 } : { type: roofType }
    },
    facade: {
      frontBayCount,
      sideBaySpacingM: stylePack.facade.sideBaySpacingM.min,
      groundFloorRatio: stylePack.facade.groundFloorRatio.min,
      corniceHeightM: stylePack.facade.corniceHeightM.max,
      symmetry: clampWithDiagnostic(
        intent.requested.symmetry ?? stylePack.defaults.symmetry,
        stylePack.facade.symmetry.min,
        stylePack.facade.symmetry.max,
        "requested.symmetry",
        diagnostics
      )
    },
    selectedFamilies: {
      wall: wallMaterial,
      roof: roofFamily || firstPaletteId(stylePack, "roof"),
      window: windowFamily,
      door: stylePack.defaults.doorFamily,
      cornice: corniceFamily,
      trim: stylePack.defaults.trimFamily,
      pilaster: stylePack.defaults.pilasterFamily,
      ornament: stylePack.defaults.ornamentFamily
    },
    materialParameters,
    componentParameters: {
      trimDensity: intent.requested.trimDensity ?? stylePack.defaults.trimDensity,
      requestedBayCount: frontBayCount,
      requestedFloorCount: floorCount,
      windowJitterSeed: buildingSeedTree.uint32("components/windows/jitter"),
      bayRhythmSeed: familySeedTree.uint32("facade/front/bay-rhythm")
    },
    variationPolicy: stylePack.variationPolicy,
    locks: intent.locks,
    diagnostics
  });

  // Apply building-seed structural variety (bays/depth/window family/rhythm) while
  // keeping familyId and material seeds stable for shared-family samples.
  const spec = withBuildingSeedVariation(baseSpec, intent.seeds.building, stylePack);

  return { spec, diagnostics };
}
