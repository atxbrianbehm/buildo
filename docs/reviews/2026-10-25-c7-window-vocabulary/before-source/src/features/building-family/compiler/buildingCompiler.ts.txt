import { z } from "zod";
import type { BuildingGraph } from "../contracts/buildingGraph";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import {
  RuntimeBuildingIRSchema,
  type InstanceBatchIR,
  type MeshBatchIR,
  type RuntimeBuildingIR
} from "../contracts/runtimeBuildingIR";
import type { AssemblyStage } from "../contracts/shared";
import type { ComponentRecipe } from "../contracts/componentRecipe";
import type { ModuleInstanceSet } from "../contracts/moduleInstanceSet";
import type { ComponentCatalog } from "../components/componentCatalogBuilder";
import {
  BuildingWindowWidthOverrideSchema, findBuildingDocumentJsonIssue, type BuildingWindowWidthOverride
} from "../contracts/buildingDocument";
import { hashCanonicalJson } from "../core/contentHash";
import { late19cApartmentKit, planFacadeModules, type FacadeModulePlan } from "../art-kit";
import { validateBuildingGraph } from "./buildingGraphBuilder";
import {
  boundsFromBox,
  buildBoxPrimitive,
  combinePrimitiveGeometry,
  emptyBounds,
  expandBounds,
  type Bounds3,
  type PrimitiveGeometry,
  type Vec3
} from "./primitiveGeometry";
import {
  buildBasePlinthPrimitives,
  buildCorniceProfilePrimitives,
  buildCornerQuoinPrimitives,
  buildHorizontalBeltCoursePrimitives,
  buildRoofCapPrimitives,
  buildSpandrelBandPrimitives,
  buildVerticalPilasterPrimitives
} from "./profiledTrimGeometry";
import {
  buildFacadeSplitPlan,
  applyWindowWidthOverride,
  BuildingWindowWidthOverrideError,
  wallPrimitivesFromSplitPlan,
  type FacadeSplitPlan
} from "./facadeSplitPlan";
import {
  bindOpeningsFromSplitPlan,
  openingGlazingCenterZ,
  openingPaneThicknessM,
  type BoundOpeningGeometry
} from "./openingSlotBinding";
import { buildOpeningAssemblyGeometry, openingTransomGlazingBand } from "./openingGeometry";
import { deriveFrontTrimClearance, type FrontOpeningEnvelope, type FrontTrimClearance } from "./frontTrimClearance";

export type BuildingComponentDetailLevel = "high" | "low";
export type BuildingFidelityMode = "proof" | "kit";

/** Validate the complete list before Zod reads any element or index accessor. */
export const BuildingWindowWidthOverridesSchema = z.unknown().superRefine((value, context) => {
  if (value === undefined) return;
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
}).pipe(z.array(BuildingWindowWidthOverrideSchema).max(1)).optional();

function invalidWindowWidthOverrides(): BuildingWindowWidthOverrideError {
  return new BuildingWindowWidthOverrideError("building.windowWidth.invalidDirective", "Window width overrides must be an optional list containing at most one valid directive.");
}

export function parseWindowWidthOverrides(value: unknown): BuildingWindowWidthOverride[] | undefined {
  try { return BuildingWindowWidthOverridesSchema.parse(value); }
  catch { throw invalidWindowWidthOverrides(); }
}

/** Read the new option without invoking a getter or losing inherited/non-JSON authority. */
export function readWindowWidthOverrides(input: object): BuildingWindowWidthOverride[] | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(input, "windowWidthOverrides");
  if (descriptor) {
    if (!descriptor.enumerable || !("value" in descriptor)) throw invalidWindowWidthOverrides();
    return parseWindowWidthOverrides(descriptor.value);
  }
  if ("windowWidthOverrides" in input) throw invalidWindowWidthOverrides();
  return undefined;
}

const windowWidthBatchFacadeOrder = { front: 0, rear: 1, left: 2, right: 3 } as const;

/** A compiler-only batch authority; saved source continues to use the standalone max-one list. */
export const BuildingWindowWidthBatchSchema = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
}).pipe(z.object({
  schemaVersion: z.literal("0.1.0"),
  directives: z.array(BuildingWindowWidthOverrideSchema)
}).strict()).superRefine((batch, context) => {
  const addresses = new Set<string>();
  for (const [index, directive] of batch.directives.entries()) {
    const { facade, floorIndex, bayIndex } = directive.address;
    const key = `${facade}:${floorIndex}:${bayIndex}`;
    if (addresses.has(key)) {
      context.addIssue({ code: "custom", path: ["directives", index, "address"], message: "A window slot may occur only once in a width batch." });
    }
    addresses.add(key);
  }
}).transform((batch) => ({
  ...batch,
  directives: [...batch.directives].sort((left, right) =>
    windowWidthBatchFacadeOrder[left.address.facade] - windowWidthBatchFacadeOrder[right.address.facade]
    || left.address.floorIndex - right.address.floorIndex
    || left.address.bayIndex - right.address.bayIndex)
}));

export type BuildingWindowWidthBatch = z.infer<typeof BuildingWindowWidthBatchSchema>;

function invalidWindowWidthBatch(): BuildingWindowWidthOverrideError {
  return new BuildingWindowWidthOverrideError("building.windowWidth.invalidDirective", "Window width compilation requires one valid standalone list or one versioned batch with unique slot addresses.");
}

/** Admit both authorities before cloning or changing an active compiler request. */
export function readWindowWidthCompileOptions(input: object): {
  windowWidthOverrides: BuildingWindowWidthOverride[] | undefined;
  windowWidthBatch: BuildingWindowWidthBatch | undefined;
} {
  const windowWidthOverrides = readWindowWidthOverrides(input);
  try {
    let windowWidthBatch: BuildingWindowWidthBatch | undefined;
    const descriptor = Object.getOwnPropertyDescriptor(input, "windowWidthBatch");
    if (descriptor) {
      if (!descriptor.enumerable || !("value" in descriptor)) throw invalidWindowWidthBatch();
      if (descriptor.value !== undefined) windowWidthBatch = BuildingWindowWidthBatchSchema.parse(descriptor.value);
    } else if ("windowWidthBatch" in input) throw invalidWindowWidthBatch();
    if (windowWidthOverrides !== undefined && windowWidthBatch !== undefined) throw invalidWindowWidthBatch();
    return { windowWidthOverrides, windowWidthBatch };
  } catch { throw invalidWindowWidthBatch(); }
}

export interface CompileBuildingInput {
  spec: BuildingFamilySpec;
  catalog: ComponentCatalog;
  graph: BuildingGraph;
  buildingId?: string;
  detailLevel?: BuildingComponentDetailLevel;
  /** When omitted, current compilation defaults to kit mode. */
  fidelityMode?: BuildingFidelityMode;
  facadePlan?: FacadeModulePlan;
  /**
   * Optional prebuilt module instances (non-opening layers / diagnostics).
   * Opening layout authority is always FacadeSplitPlan — not this set.
   */
  moduleInstances?: ModuleInstanceSet;
  /** One standalone narrowing directive; fixture/cache/source admission is separate. */
  windowWidthOverrides?: readonly BuildingWindowWidthOverride[];
  /** Versioned compiler-only batch; mutually exclusive with a defined standalone list. */
  windowWidthBatch?: BuildingWindowWidthBatch;
}

interface SemanticIndexEntry {
  semanticPath: string;
  batchId: string;
  elementIndex?: number;
  stage: AssemblyStage;
}

interface MeshPlan {
  batchId: string;
  role: string;
  materialSlotId: string;
  stage: AssemblyStage;
  primitives: PrimitiveGeometry[];
  semanticEntries: SemanticIndexEntry[];
}

interface InstancePlan {
  batchId: string;
  recipe: ComponentRecipe;
  materialSlotId: string;
  stage: AssemblyStage;
  transforms: number[];
  instanceBounds: Bounds3[];
  semanticEntries: SemanticIndexEntry[];
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function recipeById(catalog: ComponentCatalog, recipeId: string): ComponentRecipe {
  const recipe = catalog.recipes.find((candidate) => candidate.id === recipeId);
  if (!recipe) {
    throw new Error(`Missing component recipe ${recipeId}.`);
  }
  return recipe;
}

function recipeByRole(catalog: ComponentCatalog, role: string): ComponentRecipe {
  const recipe = catalog.recipes.find((candidate) => candidate.role === role);
  if (!recipe) {
    throw new Error(`Missing component recipe for role ${role}.`);
  }
  return recipe;
}

function firstAtlasSlot(recipe: ComponentRecipe): string {
  const slotId = recipe.atlasSlotIds[0];
  if (!slotId) {
    throw new Error(`Component recipe ${recipe.id} does not reference an atlas slot.`);
  }
  return slotId;
}

/** Prefer non-glass slots for frame/door assemblies so glass can be a paired batch. */
function preferredMaterialSlot(recipe: ComponentRecipe, prefer: "frame" | "glass" | "any" = "any"): string {
  if (prefer === "glass") {
    const glass = recipe.atlasSlotIds.find((slotId) => slotId.includes("glass"));
    if (glass) {
      return glass;
    }
  }
  if (prefer === "frame") {
    const frame = recipe.atlasSlotIds.find((slotId) => !slotId.includes("glass"));
    if (frame) {
      return frame;
    }
  }
  return firstAtlasSlot(recipe);
}

function recipeByRoleOptional(catalog: ComponentCatalog, role: string): ComponentRecipe | undefined {
  return catalog.recipes.find((candidate) => candidate.role === role);
}

function createPairedGlassPlan(
  base: InstancePlan,
  input: {
    batchId: string;
    recipe: ComponentRecipe;
    materialSlotId: string;
    semanticPathSuffix?: string;
  }
): InstancePlan {
  const transforms = [...base.transforms];
  const transom = base.recipe.role === "door" ? openingTransomGlazingBand(base.recipe) : undefined;
  const localZ = openingGlazingCenterZ(base.recipe.dimensionsM.depth);
  const instanceBounds: Bounds3[] = [];
  for (let offset = 0; offset < transforms.length; offset += 16) {
    const depthScale = Math.hypot(transforms[offset + 8], transforms[offset + 9], transforms[offset + 10]);
    const yScale = transom ? transom.heightM / input.recipe.dimensionsM.height : 1;
    for (let axis = 0; axis < 3; axis += 1) {
      transforms[offset + 12 + axis] += transforms[offset + 8 + axis] * localZ +
        transforms[offset + 4 + axis] * (transom?.centerY ?? 0);
      transforms[offset + 4 + axis] *= yScale;
      // A 20 mm pane remains 20 mm even when the frame's throat is scaled.
      transforms[offset + 8 + axis] /= depthScale;
    }
    const halfSize = [input.recipe.dimensionsM.width / 2, input.recipe.dimensionsM.height / 2,
      openingPaneThicknessM(input.recipe.dimensionsM.depth) / 2];
    const extent: Vec3 = [0, 1, 2].map((axis) =>
      Math.abs(transforms[offset + axis]) * halfSize[0] +
      Math.abs(transforms[offset + 4 + axis]) * halfSize[1] +
      Math.abs(transforms[offset + 8 + axis]) * halfSize[2]) as Vec3;
    const center = transforms.slice(offset + 12, offset + 15) as Vec3;
    instanceBounds.push(boundsFromBox(center, extent.map((value) => value * 2) as Vec3));
  }
  return {
    batchId: input.batchId,
    recipe: input.recipe,
    materialSlotId: input.materialSlotId,
    stage: base.stage,
    transforms,
    instanceBounds,
    semanticEntries: base.semanticEntries.map((entry, elementIndex) => ({
      ...entry,
      batchId: input.batchId,
      elementIndex,
      semanticPath: input.semanticPathSuffix
        ? `${entry.semanticPath}${input.semanticPathSuffix}`
        : entry.semanticPath
    }))
  };
}

function withPairedGlassPlans(
  catalog: ComponentCatalog,
  framePlans: InstancePlan[]
): InstancePlan[] {
  const plans: InstancePlan[] = [];
  for (const framePlan of framePlans) {
    plans.push(framePlan);
    if (framePlan.batchId === "instances.window") {
      const glassRecipe = recipeByRoleOptional(catalog, "windowGlass");
      if (glassRecipe && framePlan.transforms.length > 0) {
        plans.push(
          createPairedGlassPlan(framePlan, {
            batchId: "instances.window.glass",
            recipe: glassRecipe,
            materialSlotId: preferredMaterialSlot(glassRecipe, "glass"),
            semanticPathSuffix: "/glass"
          })
        );
      }
    }
    if (framePlan.batchId === "instances.door") {
      const glassRecipe = recipeByRoleOptional(catalog, "doorGlass");
      if (glassRecipe && framePlan.transforms.length > 0) {
        plans.push(
          createPairedGlassPlan(framePlan, {
            batchId: "instances.door.glass",
            recipe: glassRecipe,
            materialSlotId: preferredMaterialSlot(glassRecipe, "glass"),
            semanticPathSuffix: "/transom-glass"
          })
        );
      }
    }
  }
  return plans;
}

function semanticPath(spec: BuildingFamilySpec, suffix: string): string {
  return `building/${spec.familyId}/${suffix}`;
}

function createWallMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog, split: FacadeSplitPlan): MeshPlan {
  const recipe = recipeByRole(catalog, "wall");
  const primitives = wallPrimitivesFromSplitPlan(split);

  return {
    batchId: "mesh.wall-panels",
    role: "wall",
    materialSlotId: firstAtlasSlot(recipe),
    stage: "facade",
    primitives,
    semanticEntries: primitives.map((_, elementIndex) => ({
      semanticPath: semanticPath(spec, `facade/wall/subdivided/piece/${elementIndex}`),
      batchId: "mesh.wall-panels",
      elementIndex,
      stage: "facade"
    }))
  };
}

/** Slot-lock opening instances: size/transform from FacadeSplitPlan + openingSlotBinding (G2). */
function bindSplitOpenings(split: FacadeSplitPlan, catalog: ComponentCatalog): BoundOpeningGeometry[] {
  const windowRecipe = recipeByRole(catalog, "window");
  const doorRecipe = recipeByRole(catalog, "door");
  return bindOpeningsFromSplitPlan(split.openings, split.wallDepthM, {
    window: {
      width: windowRecipe.dimensionsM.width,
      height: windowRecipe.dimensionsM.height,
      depth: windowRecipe.dimensionsM.depth,
      glazingThicknessM: recipeByRoleOptional(catalog, "windowGlass")?.dimensionsM.depth
    },
    door: {
      width: doorRecipe.dimensionsM.width,
      height: doorRecipe.dimensionsM.height,
      depth: doorRecipe.dimensionsM.depth,
      glazingThicknessM: recipeByRoleOptional(catalog, "doorGlass")?.dimensionsM.depth
    }
  });
}

function createOpeningInstancePlansFromBindings(
  split: FacadeSplitPlan,
  catalog: ComponentCatalog,
  bindings: BoundOpeningGeometry[]
): InstancePlan[] {
  const windowRecipe = recipeByRole(catalog, "window");
  const doorRecipe = recipeByRole(catalog, "door");
  const windowTransforms: number[] = [];
  const windowBounds: Bounds3[] = [];
  const windowSemantics: SemanticIndexEntry[] = [];
  const doorTransforms: number[] = [];
  const doorBounds: Bounds3[] = [];
  const doorSemantics: SemanticIndexEntry[] = [];

  for (let index = 0; index < bindings.length; index += 1) {
    const bound = bindings[index]!;
    const placement = split.openings[index]!;
    if (bound.kind === "door") {
      const elementIndex = doorSemantics.length;
      doorTransforms.push(...bound.transform);
      doorBounds.push(boundsFromBox(bound.frameCenterM, bound.frameOuterSizeM));
      doorSemantics.push({
        semanticPath: placement.semanticPath,
        batchId: "instances.door",
        elementIndex,
        stage: "openings"
      });
    } else {
      const elementIndex = windowSemantics.length;
      windowTransforms.push(...bound.transform);
      windowBounds.push(boundsFromBox(bound.frameCenterM, bound.frameOuterSizeM));
      windowSemantics.push({
        semanticPath: placement.semanticPath,
        batchId: "instances.window",
        elementIndex,
        stage: "openings"
      });
    }
  }

  const plans: InstancePlan[] = [];
  if (windowTransforms.length > 0) {
    plans.push({
      batchId: "instances.window",
      recipe: windowRecipe,
      materialSlotId: preferredMaterialSlot(windowRecipe, "frame"),
      stage: "openings",
      transforms: windowTransforms,
      instanceBounds: windowBounds,
      semanticEntries: windowSemantics
    });
  }
  if (doorTransforms.length > 0) {
    plans.push({
      batchId: "instances.door",
      recipe: doorRecipe,
      materialSlotId: preferredMaterialSlot(doorRecipe, "frame"),
      stage: "openings",
      transforms: doorTransforms,
      instanceBounds: doorBounds,
      semanticEntries: doorSemantics
    });
  }
  return withPairedGlassPlans(catalog, plans);
}

function createCorniceMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog, clearance: FrontTrimClearance): MeshPlan | undefined {
  const recipe = recipeByRole(catalog, "cornice");
  const primitives = buildCorniceProfilePrimitives(spec, recipe, clearance);
  if (!primitives.length) return undefined;

  return {
    batchId: "mesh.cornice",
    role: "cornice",
    materialSlotId: firstAtlasSlot(recipe),
    stage: "trim",
    primitives,
    semanticEntries: primitives.map((_, elementIndex) => ({
      semanticPath: semanticPath(spec, `facade/front/cornice/layer/${elementIndex}`),
      batchId: "mesh.cornice",
      elementIndex,
      stage: "trim" as const
    }))
  };
}

function createHorizontalBeltMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog, clearance: FrontTrimClearance): MeshPlan | undefined {
  const recipe = catalog.recipes.find((candidate) => candidate.role === "horizontalTrim");
  if (!recipe) {
    return undefined;
  }
  const primitives = buildHorizontalBeltCoursePrimitives(spec, recipe, clearance);
  if (!primitives.length) return undefined;
  return {
    batchId: "mesh.belt-course",
    role: "horizontalTrim",
    materialSlotId: firstAtlasSlot(recipe),
    stage: "trim",
    primitives,
    semanticEntries: primitives.map((_, elementIndex) => ({
      semanticPath: semanticPath(spec, `facade/front/belt-course/layer/${elementIndex}`),
      batchId: "mesh.belt-course",
      elementIndex,
      stage: "trim" as const
    }))
  };
}

function createRoofCapMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog): MeshPlan | undefined {
  const recipe = catalog.recipes.find((candidate) => candidate.role === "roofCap");
  if (!recipe) {
    return undefined;
  }
  const primitives = buildRoofCapPrimitives(spec, recipe);
  return {
    batchId: "mesh.roof-cap",
    role: "roofCap",
    materialSlotId: firstAtlasSlot(recipe),
    stage: "trim",
    primitives,
    semanticEntries: primitives.map((_, elementIndex) => ({
      semanticPath: semanticPath(spec, `roof/cap/layer/${elementIndex}`),
      batchId: "mesh.roof-cap",
      elementIndex,
      stage: "trim" as const
    }))
  };
}

function createCornerQuoinMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog): MeshPlan | undefined {
  const recipe = catalog.recipes.find((candidate) => candidate.role === "cornerQuoin");
  if (!recipe) {
    return undefined;
  }
  const primitives = buildCornerQuoinPrimitives(spec, recipe);
  return {
    batchId: "mesh.corner-quoins",
    role: "cornerQuoin",
    materialSlotId: firstAtlasSlot(recipe),
    stage: "trim",
    primitives,
    semanticEntries: primitives.map((_, elementIndex) => ({
      semanticPath: semanticPath(spec, `facade/corner/quoin/${elementIndex}`),
      batchId: "mesh.corner-quoins",
      elementIndex,
      stage: "trim" as const
    }))
  };
}

/** A closed gable prism on massing.top. The ridge follows X; rise matches roofBuilder. */
function buildGableRoofPrimitive(spec: BuildingFamilySpec): PrimitiveGeometry {
  const pitchDegrees = spec.massing.roof.pitchDegrees ?? 28;
  if (!Number.isFinite(pitchDegrees) || pitchDegrees <= 0 || pitchDegrees >= 90) {
    throw new Error("Gable roof pitch must be finite and between 0 and 90 degrees.");
  }
  const { widthM: width, depthM: depth } = spec.massing;
  const eaveY = sum(spec.massing.floorHeightsM);
  const radians = pitchDegrees * Math.PI / 180;
  const rise = Math.tan(radians) * depth * 0.5;
  const ridgeY = eaveY + rise;
  const x0 = -width / 2, x1 = width / 2, z0 = -depth / 2, z1 = depth / 2;
  const slopeLength = Math.hypot(depth / 2, rise);
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const face = (corners: Vec3[], normal: Vec3, coordinates: number[]) => {
    const offset = positions.length / 3;
    for (const corner of corners) {
      positions.push(...corner);
      normals.push(...normal);
    }
    uvs.push(...coordinates);
    for (let i = 1; i < corners.length - 1; i += 1) indices.push(offset, offset + i, offset + i + 1);
  };

  // Face-local metre UVs follow the ridge and true slope distance.
  face([[x0, eaveY, z1], [x1, eaveY, z1], [x1, ridgeY, 0], [x0, ridgeY, 0]],
    [0, cos, sin], [0, 0, width, 0, width, slopeLength, 0, slopeLength]);
  face([[x1, eaveY, z0], [x0, eaveY, z0], [x0, ridgeY, 0], [x1, ridgeY, 0]],
    [0, cos, -sin], [0, 0, width, 0, width, slopeLength, 0, slopeLength]);
  face([[x1, eaveY, z1], [x1, eaveY, z0], [x1, ridgeY, 0]],
    [1, 0, 0], [0, 0, depth, 0, depth / 2, rise]);
  face([[x0, eaveY, z0], [x0, eaveY, z1], [x0, ridgeY, 0]],
    [-1, 0, 0], [0, 0, depth, 0, depth / 2, rise]);
  face([[x0, eaveY, z0], [x1, eaveY, z0], [x1, eaveY, z1], [x0, eaveY, z1]],
    [0, -1, 0], [0, 0, width, 0, width, depth, 0, depth]);

  return { positions, normals, uvs, indices, bounds: { min: [x0, eaveY, z0], max: [x1, ridgeY, z1] } };
}

function createRoofMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog): MeshPlan {
  const recipe = recipeByRole(catalog, "roof");
  const totalHeight = sum(spec.massing.floorHeightsM);
  const roofHeight = Math.max(0.01, spec.massing.parapetHeightM);
  const center: Vec3 = [0, totalHeight + roofHeight / 2, 0];

  return {
    batchId: "mesh.roof",
    role: "roof",
    materialSlotId: firstAtlasSlot(recipe),
    stage: "roof",
    primitives: spec.massing.roof.type === "gable" ? [buildGableRoofPrimitive(spec)] : [
      buildBoxPrimitive({
        center,
        size: [spec.massing.widthM, roofHeight, spec.massing.depthM]
      })
    ],
    semanticEntries: [
      {
        semanticPath: semanticPath(spec, "roof/primary"),
        batchId: "mesh.roof",
        elementIndex: 0,
        stage: "roof"
      }
    ]
  };
}

function graphHasArtKitFacadePlan(graph: BuildingGraph): boolean {
  return graph.nodes.some((node) => node.id === "node.art-kit-facade-plan" && node.type === "Group");
}

/** Full-width trim must clear the actual opening assembly, including its hood. */
function frontTrimClearanceFromOpeningPlans(
  spec: BuildingFamilySpec,
  split: FacadeSplitPlan,
  plans: InstancePlan[]
): FrontTrimClearance {
  const openingsByPath = new Map(split.openings.map((opening) => [opening.semanticPath, opening]));
  const recipeBounds = new Map<string, Bounds3>();
  const envelopes: FrontOpeningEnvelope[] = [];
  for (const plan of plans) {
    const glassSuffix = plan.recipe.role === "windowGlass" ? "/glass" :
      plan.recipe.role === "doorGlass" ? "/transom-glass" : "";
    let localBounds = recipeBounds.get(plan.recipe.id);
    for (const entry of plan.semanticEntries) {
      const sourcePath = glassSuffix && entry.semanticPath.endsWith(glassSuffix)
        ? entry.semanticPath.slice(0, -glassSuffix.length)
        : entry.semanticPath;
      const opening = openingsByPath.get(sourcePath);
      if (!opening) throw new Error(`Trim clearance cannot resolve split opening ${sourcePath}.`);
      if (opening.facade !== "front") continue;
      if (!localBounds) {
        localBounds = buildOpeningAssemblyGeometry({ recipe: plan.recipe, detail: "high" }).bounds;
        recipeBounds.set(plan.recipe.id, localBounds);
      }
      const offset = (entry.elementIndex ?? 0) * 16;
      const matrix = plan.transforms.slice(offset, offset + 16);
      let minYM = Number.POSITIVE_INFINITY;
      let maxYM = Number.NEGATIVE_INFINITY;
      for (const x of [localBounds.min[0], localBounds.max[0]]) {
        for (const y of [localBounds.min[1], localBounds.max[1]]) {
          for (const z of [localBounds.min[2], localBounds.max[2]]) {
            const worldY = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!;
            minYM = Math.min(minYM, worldY);
            maxYM = Math.max(maxYM, worldY);
          }
        }
      }
      envelopes.push({ floorIndex: opening.floorIndex, minYM, maxYM });
    }
  }
  return deriveFrontTrimClearance(spec, envelopes);
}

function createVerticalPilasterMeshPlan(
  spec: BuildingFamilySpec,
  catalog: ComponentCatalog
): MeshPlan | undefined {
  const recipe = catalog.recipes.find((candidate) => candidate.role === "verticalTrim");
  if (!recipe) {
    return undefined;
  }
  const bayWidth = spec.massing.widthM / spec.facade.frontBayCount;
  const primitives: PrimitiveGeometry[] = [];
  const semanticEntries: SemanticIndexEntry[] = [];

  for (let edge = 0; edge <= spec.facade.frontBayCount; edge += 1) {
    const x = -spec.massing.widthM / 2 + bayWidth * edge;
    const edgePrimitives = buildVerticalPilasterPrimitives(spec, recipe, x);
    const baseIndex = primitives.length;
    primitives.push(...edgePrimitives);
    for (let layer = 0; layer < edgePrimitives.length; layer += 1) {
      semanticEntries.push({
        semanticPath: semanticPath(spec, `facade/front/bay-edge/${edge}/pilaster/layer/${layer}`),
        batchId: "mesh.vertical-pilasters",
        elementIndex: baseIndex + layer,
        stage: "trim"
      });
    }
  }

  return {
    batchId: "mesh.vertical-pilasters",
    role: "verticalTrim",
    materialSlotId: firstAtlasSlot(recipe),
    stage: "trim",
    primitives,
    semanticEntries
  };
}

function createSpandrelMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog, clearance: FrontTrimClearance): MeshPlan | undefined {
  if (spec.massing.floorCount < 2) {
    return undefined;
  }
  const wallRecipe = catalog.recipes.find((candidate) => candidate.role === "wall");
  const materialSlotId = wallRecipe ? firstAtlasSlot(wallRecipe) : "wall.primary";
  const primitives = buildSpandrelBandPrimitives(spec, { clearance });
  if (primitives.length === 0) {
    return undefined;
  }
  return {
    batchId: "mesh.spandrels",
    role: "wall",
    materialSlotId,
    stage: "facade",
    primitives,
    semanticEntries: primitives.map((_, elementIndex) => ({
      semanticPath: semanticPath(spec, `facade/front/spandrel/layer/${elementIndex}`),
      batchId: "mesh.spandrels",
      elementIndex,
      stage: "facade" as const
    }))
  };
}

function createBasePlinthMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog): MeshPlan | undefined {
  const trimRecipe =
    catalog.recipes.find((candidate) => candidate.role === "horizontalTrim") ??
    catalog.recipes.find((candidate) => candidate.role === "wall");
  if (!trimRecipe) {
    return undefined;
  }
  const primitives = buildBasePlinthPrimitives(spec);
  return {
    batchId: "mesh.base-plinth",
    role: "horizontalTrim",
    materialSlotId: firstAtlasSlot(trimRecipe),
    stage: "facade",
    primitives,
    semanticEntries: primitives.map((_, elementIndex) => ({
      semanticPath: semanticPath(spec, `facade/front/base-plinth/layer/${elementIndex}`),
      batchId: "mesh.base-plinth",
      elementIndex,
      stage: "facade" as const
    }))
  };
}

/**
 * Perimeter returns and interior backing from the same slot/depth authority as frames.
 * Never cover the aperture with a solid face in front of glazing.
 */
function createOpeningPocketMeshPlan(
  spec: BuildingFamilySpec,
  catalog: ComponentCatalog,
  bindings: BoundOpeningGeometry[],
  detailLevel: BuildingComponentDetailLevel
): MeshPlan | undefined {
  const wallRecipe = catalog.recipes.find((candidate) => candidate.role === "wall");
  if (!wallRecipe || bindings.length === 0) {
    return undefined;
  }
  const primitives: PrimitiveGeometry[] = [];
  const semanticEntries: SemanticIndexEntry[] = [];

  for (let index = 0; index < bindings.length; index += 1) {
    const bound = bindings[index]!;
    const elementIndex = primitives.length;
    if (detailLevel === "high") {
      const side = bound.facade === "left" || bound.facade === "right";
      const alongAxis = side ? 2 : 0;
      const depthAxis = side ? 0 : 2;
      const outerWidth = bound.pocketSizeM[alongAxis];
      const outerHeight = bound.pocketSizeM[1];
      const [innerWidth, innerHeight] = bound.frameOuterSizeM;
      const borderWidth = (outerWidth - innerWidth) / 2;
      const borderHeight = (outerHeight - innerHeight) / 2;
      const addReturn = (along: number, y: number, width: number, height: number) => {
        const center: Vec3 = [...bound.pocketCenterM];
        center[alongAxis] += along;
        center[1] += y;
        const size: Vec3 = [...bound.pocketSizeM];
        size[alongAxis] = width;
        size[1] = height;
        size[depthAxis] = bound.pocketSizeM[depthAxis];
        primitives.push(buildBoxPrimitive({ center, size }));
      };
      addReturn(-(innerWidth + borderWidth) / 2, 0, borderWidth, outerHeight);
      addReturn((innerWidth + borderWidth) / 2, 0, borderWidth, outerHeight);
      addReturn(0, -(innerHeight + borderHeight) / 2, innerWidth, borderHeight);
      addReturn(0, (innerHeight + borderHeight) / 2, innerWidth, borderHeight);
    }
    primitives.push(buildBoxPrimitive({ center: bound.backingCenterM, size: bound.backingSizeM }));
    semanticEntries.push({
      semanticPath: semanticPath(
        spec,
        `facade/${bound.facade}/opening-pocket/${bound.kind}/${index}`
      ),
      batchId: "mesh.opening-pockets",
      elementIndex,
      stage: "openings"
    });
  }

  return {
    batchId: "mesh.opening-pockets",
    role: "opening",
    materialSlotId: firstAtlasSlot(wallRecipe),
    stage: "openings",
    primitives,
    semanticEntries
  };
}

/**
 * Proud storefront bulkhead/lintel/fascia from ground-front split scopes (G3).
 * Structural bulkhead/lintel already live in subdivided wall pieces; this batch
 * adds slightly proud hierarchy so clay reads as a storefront system.
 */
function createStorefrontHierarchyMeshPlan(
  spec: BuildingFamilySpec,
  catalog: ComponentCatalog,
  split: FacadeSplitPlan
): MeshPlan | undefined {
  if (spec.massing.floorCount < 1) {
    return undefined;
  }
  const wallRecipe = catalog.recipes.find((candidate) => candidate.role === "wall");
  const trimRecipe = catalog.recipes.find((candidate) => candidate.role === "horizontalTrim");
  if (!wallRecipe) {
    return undefined;
  }
  const groundFront = split.scopes.filter(
    (scope) => scope.facade === "front" && scope.zone === "ground" && scope.storefront
  );
  if (groundFront.length === 0) {
    return undefined;
  }
  const wallDepth = wallRecipe.dimensionsM.depth;
  const primitives: PrimitiveGeometry[] = [];
  const semanticEntries: SemanticIndexEntry[] = [];

  for (const scope of groundFront) {
    const sf = scope.storefront!;
    const [ox, , oz] = scope.originM;
    const sx = scope.sizeM[0];
    const bayCenterX = ox + sx / 2;
    // Front outer face is oz; project hierarchy outward (−Z) so clay reads a proud base.
    const proudDepth = Math.max(0.12, wallDepth * 0.55);
    const bulkheadZ = oz - proudDepth * 0.55;
    const lintelZ = oz - proudDepth * 0.65;
    const fasciaZ = oz - proudDepth * 0.78;

    primitives.push(
      buildBoxPrimitive({
        center: [bayCenterX, sf.bulkheadCenterYM, bulkheadZ],
        size: [sx * 0.98, sf.bulkheadHeightM * 0.95, proudDepth]
      })
    );
    semanticEntries.push({
      semanticPath: semanticPath(spec, `facade/front/bay/${scope.bayIndex}/storefront/bulkhead`),
      batchId: "mesh.storefront-hierarchy",
      elementIndex: semanticEntries.length,
      stage: "facade"
    });

    primitives.push(
      buildBoxPrimitive({
        center: [bayCenterX, sf.lintelCenterYM, lintelZ],
        size: [sx * 0.99, sf.lintelHeightM * 1.05, proudDepth * 1.15]
      })
    );
    semanticEntries.push({
      semanticPath: semanticPath(spec, `facade/front/bay/${scope.bayIndex}/storefront/lintel`),
      batchId: "mesh.storefront-hierarchy",
      elementIndex: semanticEntries.length,
      stage: "facade"
    });

    primitives.push(
      buildBoxPrimitive({
        center: [bayCenterX, sf.lintelCenterYM + sf.lintelHeightM * 0.4, fasciaZ],
        size: [sx + 0.06, sf.lintelHeightM * 0.42, proudDepth * 0.85]
      })
    );
    semanticEntries.push({
      semanticPath: semanticPath(spec, `facade/front/bay/${scope.bayIndex}/storefront/fascia`),
      batchId: "mesh.storefront-hierarchy",
      elementIndex: semanticEntries.length,
      stage: "facade"
    });
  }

  const materialSlotId = trimRecipe ? firstAtlasSlot(trimRecipe) : firstAtlasSlot(wallRecipe);
  return {
    batchId: "mesh.storefront-hierarchy",
    role: "wall",
    materialSlotId,
    stage: "facade",
    primitives,
    semanticEntries
  };
}

function toMeshBatch(plan: MeshPlan): { batch: MeshBatchIR; bounds: Bounds3; vertexCount: number; triangleCount: number } {
  const combined = combinePrimitiveGeometry(plan.primitives);
  return {
    batch: {
      batchId: plan.batchId,
      role: plan.role,
      positions: combined.positions,
      normals: combined.normals,
      uvs: combined.uvs,
      indices: combined.indices,
      materialSlotId: plan.materialSlotId
    },
    bounds: combined.bounds,
    vertexCount: combined.positions.length / 3,
    triangleCount: combined.indices.length / 3
  };
}

function toInstanceBatch(plan: InstancePlan): InstanceBatchIR {
  return {
    batchId: plan.batchId,
    recipeId: plan.recipe.id,
    materialSlotId: plan.materialSlotId,
    transforms: new Float32Array(plan.transforms) as Float32Array<ArrayBuffer>,
    count: plan.transforms.length / 16
  };
}

function expandBoundsForPlans(meshBounds: Bounds3[], instancePlans: InstancePlan[]): Bounds3 {
  let bounds = emptyBounds();

  for (const next of meshBounds) {
    bounds = expandBounds(bounds, next);
  }

  for (const plan of instancePlans) {
    for (const next of plan.instanceBounds) {
      bounds = expandBounds(bounds, next);
    }
  }

  return bounds;
}

export async function compileBuilding(input: CompileBuildingInput): Promise<RuntimeBuildingIR> {
  const widthOptions = readWindowWidthCompileOptions(input);
  input = structuredClone({ ...input, ...widthOptions });
  const graphDiagnostics = validateBuildingGraph(input.graph);
  if (graphDiagnostics.length > 0) {
    throw new Error(`Cannot compile invalid building graph: ${graphDiagnostics.map((item) => item.code).join(", ")}`);
  }

  for (const node of input.graph.nodes) {
    if (node.type === "InstanceComponent" && typeof node.parameters.recipeId === "string") {
      recipeById(input.catalog, node.parameters.recipeId);
    }
  }

  const detailLevel = input.detailLevel ?? "high";
  const highDetail = detailLevel === "high";
  const wallRecipe = recipeByRole(input.catalog, "wall");
  const wallDepthM = Math.max(0.02, wallRecipe.dimensionsM.depth);

  // --- Opening layout authority (G1) ---
  // kit  → art-kit FacadeModulePlan → FacadeSplitPlan (strict) → instances
  // proof → FacadeSplitPlan defaults (front-only) → instances
  // Never place openings from ModuleInstanceSet or hard-coded bay loops in parallel.
  const isProofMode = input.fidelityMode === "proof";
  const isKitMode =
    !isProofMode &&
    (input.fidelityMode === "kit" ||
      Boolean(input.facadePlan) ||
      graphHasArtKitFacadePlan(input.graph) ||
      input.fidelityMode === undefined);

  const facadePlanForSplit =
    isKitMode
      ? (input.facadePlan ??
        planFacadeModules({
          spec: input.spec,
          kit: late19cApartmentKit
        }))
      : undefined;

  const originalSplit = await buildFacadeSplitPlan({
    spec: input.spec,
    wallDepthM,
    facadePlan: facadePlanForSplit,
    kit: facadePlanForSplit ? late19cApartmentKit : undefined,
    // Proof (and any non-kit path) uses front-only defaults; kit plan implies strictOpenings.
    defaultOpeningMode: "front-only"
  });
  let facadeSplit = input.windowWidthOverrides?.[0]
    ? await applyWindowWidthOverride(originalSplit, input.windowWidthOverrides[0])
    : originalSplit;
  for (const directive of input.windowWidthBatch?.directives ?? []) {
    facadeSplit = await applyWindowWidthOverride(facadeSplit, directive);
  }

  const openingBindings = bindSplitOpenings(facadeSplit, input.catalog);
  const openingPlans = createOpeningInstancePlansFromBindings(facadeSplit, input.catalog, openingBindings);
  const frameOpeningCount = openingPlans
    .filter((plan) => plan.batchId === "instances.window" || plan.batchId === "instances.door")
    .reduce((total, plan) => total + plan.transforms.length / 16, 0);
  if (frameOpeningCount !== facadeSplit.openings.length || openingBindings.length !== facadeSplit.openings.length) {
    throw new Error(
      `Opening authority violation: ${frameOpeningCount} frame instances / ${openingBindings.length} bindings vs ${facadeSplit.openings.length} split openings.`
    );
  }

  const trimClearance: FrontTrimClearance = highDetail
    ? frontTrimClearanceFromOpeningPlans(input.spec, facadeSplit, openingPlans)
    : { floorBands: [] };
  const highDetailMeshPlans = highDetail
    ? [
        createBasePlinthMeshPlan(input.spec, input.catalog),
        createStorefrontHierarchyMeshPlan(input.spec, input.catalog, facadeSplit),
        createCorniceMeshPlan(input.spec, input.catalog, trimClearance),
        createHorizontalBeltMeshPlan(input.spec, input.catalog, trimClearance),
        createVerticalPilasterMeshPlan(input.spec, input.catalog),
        createSpandrelMeshPlan(input.spec, input.catalog, trimClearance),
        createRoofCapMeshPlan(input.spec, input.catalog),
        createCornerQuoinMeshPlan(input.spec, input.catalog)
      ].filter((plan): plan is MeshPlan => plan !== undefined)
    : [];
  const meshPlans = [
    createWallMeshPlan(input.spec, input.catalog, facadeSplit),
    ...[createOpeningPocketMeshPlan(input.spec, input.catalog, openingBindings, detailLevel)]
      .filter((plan): plan is MeshPlan => plan !== undefined),
    ...highDetailMeshPlans,
    createRoofMeshPlan(input.spec, input.catalog)
  ];
  const instancePlans = [...openingPlans];

  const compiledMeshes = meshPlans.map(toMeshBatch);
  const meshBatches = compiledMeshes.map((compiled) => compiled.batch);
  const instanceBatches = instancePlans.map(toInstanceBatch);
  const semanticIndex = [
    ...meshPlans.flatMap((plan) => plan.semanticEntries),
    ...instancePlans.flatMap((plan) => plan.semanticEntries)
  ];
  const bounds = expandBoundsForPlans(
    compiledMeshes.map((compiled) => compiled.bounds),
    instancePlans
  );

  const legacySourceGraphHash = detailLevel === "high"
    ? await hashCanonicalJson(input.graph)
    : await hashCanonicalJson({ graph: input.graph, detailLevel });
  const sourceGraphHash = facadeSplit.contentHash === originalSplit.contentHash
    ? legacySourceGraphHash
    : await hashCanonicalJson({
      schemaVersion: "0.1.0", kind: "building-window-width-compile", legacySourceGraphHash,
      fidelityMode: isKitMode ? "kit" : "proof", splitContentHash: facadeSplit.contentHash
    });
  return RuntimeBuildingIRSchema.parse({
    schemaVersion: "0.1.0",
    buildingId: input.buildingId ?? input.spec.familyId,
    familyId: input.spec.familyId,
    sourceGraphHash,
    bounds,
    meshBatches,
    instanceBatches,
    semanticIndex,
    metrics: {
      vertexCount: compiledMeshes.reduce((total, compiled) => total + compiled.vertexCount, 0),
      triangleCount: compiledMeshes.reduce((total, compiled) => total + compiled.triangleCount, 0),
      instanceCount: instanceBatches.reduce((total, batch) => total + batch.count, 0)
    }
  });
}
