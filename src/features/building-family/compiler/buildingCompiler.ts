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
import { hashCanonicalJson } from "../core/contentHash";
import {
  buildModuleInstanceSet,
  late19cApartmentKit,
  planFacadeModules,
  type FacadeModulePlan
} from "../art-kit";
import { validateBuildingGraph } from "./buildingGraphBuilder";
import {
  boundsFromBox,
  buildBoxPrimitive,
  combinePrimitiveGeometry,
  emptyBounds,
  expandBounds,
  translationMatrix,
  type Bounds3,
  type PrimitiveGeometry,
  type Vec3
} from "./primitiveGeometry";
import {
  buildCorniceProfilePrimitives,
  buildCornerQuoinPrimitives,
  buildHorizontalBeltCoursePrimitives,
  buildRoofCapPrimitives,
  buildSpandrelBandPrimitives,
  buildVerticalPilasterPrimitives
} from "./profiledTrimGeometry";

export type BuildingComponentDetailLevel = "high" | "low";
export type BuildingFidelityMode = "proof" | "kit";

export interface CompileBuildingInput {
  spec: BuildingFamilySpec;
  catalog: ComponentCatalog;
  graph: BuildingGraph;
  buildingId?: string;
  detailLevel?: BuildingComponentDetailLevel;
  /** When omitted, kit mode is inferred from the art-kit graph Group node. */
  fidelityMode?: BuildingFidelityMode;
  facadePlan?: FacadeModulePlan;
  moduleInstances?: ModuleInstanceSet;
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

interface FacadePanelPlan {
  facade: "front" | "rear" | "left" | "right";
  floor: number;
  bay: number;
  center: Vec3;
  size: Vec3;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function floorBaseY(spec: BuildingFamilySpec, floor: number): number {
  return spec.massing.floorHeightsM.slice(0, floor).reduce((total, height) => total + height, 0);
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

function cloneInstancePlanWithRecipe(
  base: InstancePlan,
  input: {
    batchId: string;
    recipe: ComponentRecipe;
    materialSlotId: string;
    semanticPathSuffix?: string;
  }
): InstancePlan {
  return {
    batchId: input.batchId,
    recipe: input.recipe,
    materialSlotId: input.materialSlotId,
    stage: base.stage,
    transforms: [...base.transforms],
    instanceBounds: base.instanceBounds.map((bounds) => ({
      min: [...bounds.min] as Vec3,
      max: [...bounds.max] as Vec3
    })),
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
          cloneInstancePlanWithRecipe(framePlan, {
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
          cloneInstancePlanWithRecipe(framePlan, {
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

function sideBayCount(spec: BuildingFamilySpec): number {
  return Math.max(1, Math.round(spec.massing.depthM / spec.facade.sideBaySpacingM));
}

function wallPanelPlans(spec: BuildingFamilySpec, wallRecipe: ComponentRecipe): FacadePanelPlan[] {
  const plans: FacadePanelPlan[] = [];
  const thickness = Math.max(0.02, wallRecipe.dimensionsM.depth);
  const frontBayWidth = spec.massing.widthM / spec.facade.frontBayCount;
  const sideCount = sideBayCount(spec);
  const sidePanelDepth = spec.massing.depthM / sideCount;

  for (let floor = 0; floor < spec.massing.floorCount; floor += 1) {
    const height = spec.massing.floorHeightsM[floor] ?? spec.massing.floorHeightsM.at(-1) ?? wallRecipe.dimensionsM.height;
    const y = floorBaseY(spec, floor) + height / 2;

    // Ground floor projects slightly as a base/storefront plinth for clay silhouette.
    const baseProjection = floor === 0 ? Math.min(0.12, thickness * 0.45) : 0;
    const floorThickness = thickness + baseProjection;

    for (let bay = 0; bay < spec.facade.frontBayCount; bay += 1) {
      const x = -spec.massing.widthM / 2 + frontBayWidth * bay + frontBayWidth / 2;
      plans.push({
        facade: "front",
        floor,
        bay,
        center: [x, y, -spec.massing.depthM / 2 + floorThickness / 2],
        size: [frontBayWidth, height, floorThickness]
      });
      plans.push({
        facade: "rear",
        floor,
        bay,
        center: [x, y, spec.massing.depthM / 2 - floorThickness / 2],
        size: [frontBayWidth, height, floorThickness]
      });
    }

    for (let bay = 0; bay < sideCount; bay += 1) {
      const z = -spec.massing.depthM / 2 + sidePanelDepth * bay + sidePanelDepth / 2;
      plans.push({
        facade: "left",
        floor,
        bay,
        center: [-spec.massing.widthM / 2 + thickness / 2, y, z],
        size: [thickness, height, sidePanelDepth]
      });
      plans.push({
        facade: "right",
        floor,
        bay,
        center: [spec.massing.widthM / 2 - thickness / 2, y, z],
        size: [thickness, height, sidePanelDepth]
      });
    }
  }

  return plans;
}

function createWallMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog): MeshPlan {
  const recipe = recipeByRole(catalog, "wall");
  const plans = wallPanelPlans(spec, recipe);
  const primitives = plans.map((plan) => buildBoxPrimitive({ center: plan.center, size: plan.size }));

  return {
    batchId: "mesh.wall-panels",
    role: "wall",
    materialSlotId: firstAtlasSlot(recipe),
    stage: "facade",
    primitives,
    semanticEntries: plans.map((plan, elementIndex) => ({
      semanticPath: semanticPath(spec, `facade/${plan.facade}/floor/${plan.floor}/bay/${plan.bay}/wall/panel`),
      batchId: "mesh.wall-panels",
      elementIndex,
      stage: "facade"
    }))
  };
}

function createCorniceMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog): MeshPlan {
  const recipe = recipeByRole(catalog, "cornice");
  const primitives = buildCorniceProfilePrimitives(spec, recipe);

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

function createHorizontalBeltMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog): MeshPlan | undefined {
  const recipe = catalog.recipes.find((candidate) => candidate.role === "horizontalTrim");
  if (!recipe) {
    return undefined;
  }
  const primitives = buildHorizontalBeltCoursePrimitives(spec, recipe);
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
    primitives: [
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

function createWindowInstancePlan(spec: BuildingFamilySpec, catalog: ComponentCatalog): InstancePlan {
  const recipe = recipeByRole(catalog, "window");
  const transforms: number[] = [];
  const instanceBounds: Bounds3[] = [];
  const semanticEntries: SemanticIndexEntry[] = [];
  const bayWidth = spec.massing.widthM / spec.facade.frontBayCount;
  const z = -spec.massing.depthM / 2 + recipe.dimensionsM.depth / 2;

  for (let floor = 0; floor < spec.massing.floorCount; floor += 1) {
    const floorHeight = spec.massing.floorHeightsM[floor] ?? recipe.dimensionsM.height;
    const y = floorBaseY(spec, floor) + floorHeight * 0.55;

    for (let bay = 0; bay < spec.facade.frontBayCount; bay += 1) {
      const elementIndex = floor * spec.facade.frontBayCount + bay;
      const x = -spec.massing.widthM / 2 + bayWidth * bay + bayWidth / 2;
      const position: Vec3 = [x, y, z];
      transforms.push(...translationMatrix(position));
      instanceBounds.push(boundsFromBox(position, [recipe.dimensionsM.width, recipe.dimensionsM.height, recipe.dimensionsM.depth]));
      semanticEntries.push({
        semanticPath: semanticPath(spec, `facade/front/floor/${floor}/bay/${bay}/window/frame`),
        batchId: "instances.window",
        elementIndex,
        stage: "openings"
      });
    }
  }

  return {
    batchId: "instances.window",
    recipe,
    materialSlotId: preferredMaterialSlot(recipe, "frame"),
    stage: "openings",
    transforms,
    instanceBounds,
    semanticEntries
  };
}

function createDoorInstancePlan(spec: BuildingFamilySpec, catalog: ComponentCatalog): InstancePlan {
  const recipe = recipeByRole(catalog, "door");
  const bayWidth = spec.massing.widthM / spec.facade.frontBayCount;
  const bay = Math.floor(spec.facade.frontBayCount / 2);
  const position: Vec3 = [
    -spec.massing.widthM / 2 + bayWidth * bay + bayWidth / 2,
    recipe.dimensionsM.height / 2,
    -spec.massing.depthM / 2 + recipe.dimensionsM.depth / 2
  ];

  return {
    batchId: "instances.door",
    recipe,
    materialSlotId: preferredMaterialSlot(recipe, "frame"),
    stage: "openings",
    transforms: translationMatrix(position),
    instanceBounds: [boundsFromBox(position, [recipe.dimensionsM.width, recipe.dimensionsM.height, recipe.dimensionsM.depth])],
    semanticEntries: [
      {
        semanticPath: semanticPath(spec, `facade/front/floor/0/bay/${bay}/door/frame`),
        batchId: "instances.door",
        elementIndex: 0,
        stage: "openings"
      }
    ]
  };
}

function graphHasArtKitFacadePlan(graph: BuildingGraph): boolean {
  return graph.nodes.some((node) => node.id === "node.art-kit-facade-plan" && node.type === "Group");
}

function centerFromTransform(transform: number[]): Vec3 {
  return [transform[12] ?? 0, transform[13] ?? 0, transform[14] ?? 0];
}

function createOpeningInstancePlansFromModuleInstances(
  moduleInstances: ModuleInstanceSet,
  catalog: ComponentCatalog
): InstancePlan[] {
  const windowRecipe = recipeByRole(catalog, "window");
  const doorRecipe = recipeByRole(catalog, "door");
  const windowTransforms: number[] = [];
  const windowBounds: Bounds3[] = [];
  const windowSemantics: SemanticIndexEntry[] = [];
  const doorTransforms: number[] = [];
  const doorBounds: Bounds3[] = [];
  const doorSemantics: SemanticIndexEntry[] = [];

  for (const instance of moduleInstances.instances) {
    if (instance.layer !== "opening") {
      continue;
    }

    const center = centerFromTransform(instance.transform);
    const size: Vec3 = instance.boundsMeters.size;
    const isDoor = instance.moduleId.includes("door");
    if (isDoor) {
      const elementIndex = doorSemantics.length;
      doorTransforms.push(...instance.transform);
      doorBounds.push(boundsFromBox(center, size));
      doorSemantics.push({
        semanticPath: instance.semanticPath,
        batchId: "instances.door",
        elementIndex,
        stage: "openings"
      });
    } else {
      const elementIndex = windowSemantics.length;
      windowTransforms.push(...instance.transform);
      windowBounds.push(boundsFromBox(center, size));
      windowSemantics.push({
        semanticPath: instance.semanticPath,
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

async function resolveModuleInstances(input: CompileBuildingInput): Promise<ModuleInstanceSet | undefined> {
  if (input.moduleInstances) {
    return input.moduleInstances;
  }

  const useKit =
    input.fidelityMode === "kit" ||
    (input.fidelityMode !== "proof" && (Boolean(input.facadePlan) || graphHasArtKitFacadePlan(input.graph)));

  if (!useKit) {
    return undefined;
  }

  const plan =
    input.facadePlan ??
    planFacadeModules({
      spec: input.spec,
      kit: late19cApartmentKit
    });

  return buildModuleInstanceSet({
    spec: input.spec,
    kit: late19cApartmentKit,
    plan,
    buildingId: input.buildingId
  });
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

function createSpandrelMeshPlan(spec: BuildingFamilySpec, catalog: ComponentCatalog): MeshPlan | undefined {
  if (spec.massing.floorCount < 2) {
    return undefined;
  }
  const wallRecipe = catalog.recipes.find((candidate) => candidate.role === "wall");
  const materialSlotId = wallRecipe ? firstAtlasSlot(wallRecipe) : "wall.primary";
  const primitives = buildSpandrelBandPrimitives(spec);
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
  const moduleInstances = await resolveModuleInstances(input);
  const highDetailMeshPlans = highDetail
    ? [
        createCorniceMeshPlan(input.spec, input.catalog),
        createHorizontalBeltMeshPlan(input.spec, input.catalog),
        createVerticalPilasterMeshPlan(input.spec, input.catalog),
        createSpandrelMeshPlan(input.spec, input.catalog),
        createRoofCapMeshPlan(input.spec, input.catalog),
        createCornerQuoinMeshPlan(input.spec, input.catalog)
      ].filter((plan): plan is MeshPlan => plan !== undefined)
    : [];
  const meshPlans = [
    createWallMeshPlan(input.spec, input.catalog),
    ...highDetailMeshPlans,
    createRoofMeshPlan(input.spec, input.catalog)
  ];
  const openingPlans = moduleInstances
    ? createOpeningInstancePlansFromModuleInstances(moduleInstances, input.catalog)
    : withPairedGlassPlans(input.catalog, [
        createWindowInstancePlan(input.spec, input.catalog),
        createDoorInstancePlan(input.spec, input.catalog)
      ]);
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

  return RuntimeBuildingIRSchema.parse({
    schemaVersion: "0.1.0",
    buildingId: input.buildingId ?? input.spec.familyId,
    familyId: input.spec.familyId,
    sourceGraphHash:
      detailLevel === "high"
        ? await hashCanonicalJson(input.graph)
        : await hashCanonicalJson({ graph: input.graph, detailLevel }),
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
