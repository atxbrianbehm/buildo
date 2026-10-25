import { readFileSync } from "node:fs";
import path from "node:path";
import { late19cApartmentKit, planFacadeModules } from "../art-kit";
import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import type { ComponentCatalog } from "../components/componentCatalogBuilder";
import { resolveCorniceProfileRecipeId } from "../components/profiledTrimBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import { buildFacadeSplitPlan } from "../compiler/facadeSplitPlan";
import type { FacadeSplitOpeningPlacement } from "../compiler/facadeSplitPlan";
import { buildOpeningAssemblyGeometry } from "../compiler/openingGeometry";
import type { OpeningGeometryDetail } from "../compiler/openingGeometry";
import type { WallFacadeName } from "../compiler/facadeWallSubdivision";
import { buildBoxPrimitive, type Vec3 } from "../compiler/primitiveGeometry";
import { BuildingFamilySpecSchema, type BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { HistoricalStylePackSchema } from "../contracts/historicalStylePack";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { hashCanonicalJson } from "../core/contentHash";
import { R1AcceptanceCardSchema } from "../qa/r1BaselineContracts";
import stylePackData from "../style-packs/late-19c-commercial-demo.json";

const frozenAcceptanceCard = R1AcceptanceCardSchema.parse(JSON.parse(readFileSync(
  path.resolve("docs/reviews/2026-10-14-r1-s1/acceptance-card.json"), "utf8"
)));
const stylePack = HistoricalStylePackSchema.parse(stylePackData);

// These tests trace the emitted triangles, including opaque back faces. A plane
// being behind the slot's center does not prove that its exterior face is clear.
interface Triangle {
  a: Vec3;
  b: Vec3;
  c: Vec3;
  batchId: string;
  elementIndex?: number;
}

function fixtureSpec(): BuildingFamilySpec {
  return structuredClone(frozenAcceptanceCard.resolvedSpec);
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, scale: number): Vec3 => [a[0] * scale, a[1] * scale, a[2] * scale];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function transform(point: Vec3, matrix?: ArrayLike<number>): Vec3 {
  if (!matrix) return point;
  return [
    matrix[0]! * point[0] + matrix[4]! * point[1] + matrix[8]! * point[2] + matrix[12]!,
    matrix[1]! * point[0] + matrix[5]! * point[1] + matrix[9]! * point[2] + matrix[13]!,
    matrix[2]! * point[0] + matrix[6]! * point[1] + matrix[10]! * point[2] + matrix[14]!
  ];
}

function triangles(
  positions: ArrayLike<number>, indices: ArrayLike<number>, batchId: string,
  matrix?: ArrayLike<number>, elementIndex?: number
): Triangle[] {
  const vertex = (index: number): Vec3 => transform([
    positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!
  ], matrix);
  const result: Triangle[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    result.push({ a: vertex(indices[i]!), b: vertex(indices[i + 1]!), c: vertex(indices[i + 2]!), batchId, elementIndex });
  }
  return result;
}

/** Two-sided Möller–Trumbore: independent of render materials and GPU culling. */
function intersectionDistance(origin: Vec3, direction: Vec3, triangle: Triangle): number | undefined {
  const edge1 = sub(triangle.b, triangle.a);
  const edge2 = sub(triangle.c, triangle.a);
  const p = cross(direction, edge2);
  const determinant = dot(edge1, p);
  if (Math.abs(determinant) < 1e-10) return;
  const inverse = 1 / determinant;
  const offset = sub(origin, triangle.a);
  const u = dot(offset, p) * inverse;
  if (u < -1e-8 || u > 1 + 1e-8) return;
  const q = cross(offset, edge1);
  const v = dot(direction, q) * inverse;
  if (v < -1e-8 || u + v > 1 + 1e-8) return;
  const distance = dot(edge2, q) * inverse;
  return distance >= 0 ? distance : undefined;
}

function hits(origin: Vec3, direction: Vec3, geometry: Triangle[]) {
  return geometry.flatMap((triangle) => {
    const distance = intersectionDistance(origin, direction, triangle);
    return distance === undefined ? [] : [{ distance, batchId: triangle.batchId, elementIndex: triangle.elementIndex, triangle }];
  }).sort((a, b) => a.distance - b.distance);
}

function outward(facade: WallFacadeName): Vec3 {
  return facade === "front" ? [0, 0, -1] : facade === "rear" ? [0, 0, 1] : facade === "left" ? [-1, 0, 0] : [1, 0, 0];
}

function exteriorRayOrigin(target: Vec3, exterior: Vec3, ir: RuntimeBuildingIR): Vec3 {
  const furthestExterior = Math.max(dot(ir.bounds.min, exterior), dot(ir.bounds.max, exterior));
  return add(target, mul(exterior, furthestExterior - dot(target, exterior) + 1));
}

interface FrontPaneRectangle {
  semanticPath: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  exteriorZ: number;
}

function actualFrontPaneRectangles(ir: RuntimeBuildingIR, catalog: ComponentCatalog, openings: FacadeSplitOpeningPlacement[]): FrontPaneRectangle[] {
  const rectangles: FrontPaneRectangle[] = [];
  for (const kind of ["window", "door"] as const) {
    const batch = ir.instanceBatches.find((candidate) => candidate.batchId === `instances.${kind}.glass`)!;
    const recipe = catalog.recipes.find((candidate) => candidate.id === batch.recipeId)!;
    const glass = buildOpeningAssemblyGeometry({ recipe, part: "glass" });
    const placements = openings.filter((opening) => opening.kind === kind);
    for (let index = 0; index < placements.length; index += 1) {
      const opening = placements[index]!;
      if (opening.facade !== "front") continue;
      const matrix = batch.transforms!.subarray(index * 16, index * 16 + 16);
      const corners = [
        [glass.bounds.min[0], glass.bounds.min[1], glass.bounds.max[2]],
        [glass.bounds.max[0], glass.bounds.min[1], glass.bounds.max[2]],
        [glass.bounds.max[0], glass.bounds.max[1], glass.bounds.max[2]],
        [glass.bounds.min[0], glass.bounds.max[1], glass.bounds.max[2]]
      ].map((corner) => transform(corner as Vec3, matrix));
      rectangles.push({ semanticPath: opening.semanticPath,
        minX: Math.min(...corners.map((point) => point[0])), maxX: Math.max(...corners.map((point) => point[0])),
        minY: Math.min(...corners.map((point) => point[1])), maxY: Math.max(...corners.map((point) => point[1])),
        exteriorZ: Math.min(...corners.map((point) => point[2])) });
    }
  }
  return rectangles;
}

// Independent 3D triangle clipping, followed by exact projected XY area. This
// covers every point in the pane rectangle rather than the nine sparse rays.
function clipPolygon(polygon: Vec3[], signedDistance: (point: Vec3) => number): Vec3[] {
  const result: Vec3[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    const da = signedDistance(a);
    const db = signedDistance(b);
    const aInside = da >= 0;
    const bInside = db >= 0;
    if (aInside) result.push(a);
    if (aInside !== bInside) result.push(add(a, mul(sub(b, a), da / (da - db))));
  }
  return result;
}

function projectedPaneOverlapArea(triangle: Triangle, pane: FrontPaneRectangle): number {
  let polygon = clipPolygon([triangle.a, triangle.b, triangle.c], (point) => pane.exteriorZ - point[2]);
  for (const distance of [
    (point: Vec3) => point[0] - pane.minX, (point: Vec3) => pane.maxX - point[0],
    (point: Vec3) => point[1] - pane.minY, (point: Vec3) => pane.maxY - point[1]
  ]) polygon = clipPolygon(polygon, distance);
  // Subtract the rectangle origin before the shoelace sum to avoid cancellation
  // from the taller legal buildings' absolute world coordinates.
  let twiceArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = sub(polygon[index]!, [pane.minX, pane.minY, 0]);
    const b = sub(polygon[(index + 1) % polygon.length]!, [pane.minX, pane.minY, 0]);
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twiceArea) / 2;
}

function legalTrimFixture(floorCount: number, bodyHeightM: number, corniceHeightM: number, profile: "layered" | "restrained"): BuildingFamilySpec {
  const spec = fixtureSpec();
  spec.massing.floorCount = floorCount;
  spec.massing.floorHeightsM = [stylePack.massing.floorHeightM.ground, ...Array.from({ length: floorCount - 1 }, () => bodyHeightM)];
  spec.facade.corniceHeightM = corniceHeightM;
  for (let seed = 0; seed < 64; seed += 1) {
    spec.seeds.trim = `r1-s3-${profile}-${seed}`;
    if (resolveCorniceProfileRecipeId(spec).endsWith(`.${profile}`)) return BuildingFamilySpecSchema.parse(spec);
  }
  throw new Error(`Missing deterministic fixture seed for ${profile} cornice.`);
}

const trimFixtures = [
  { name: "frozen canonical", spec: fixtureSpec(), profile: undefined },
  ...(["layered", "restrained"] as const).flatMap((profile) => [
    { name: `legal two-floor short body / ${profile}`, profile, spec: legalTrimFixture(stylePack.massing.floorCount.min,
      stylePack.massing.floorHeightM.typical.min, stylePack.facade.corniceHeightM.max, profile) },
    { name: `legal eight-floor tall body / ${profile}`, profile, spec: legalTrimFixture(stylePack.massing.floorCount.max,
      stylePack.massing.floorHeightM.typical.max, stylePack.facade.corniceHeightM.min, profile) }
  ])
];

function actualGeometry(ir: RuntimeBuildingIR, catalog: ComponentCatalog, detail: OpeningGeometryDetail): Triangle[] {
  const result = ir.meshBatches.flatMap((batch) => triangles(batch.positions!, batch.indices!, batch.batchId));
  for (const batch of ir.instanceBatches) {
    const recipe = catalog.recipes.find((candidate) => candidate.id === batch.recipeId)!;
    expect(["window", "door", "windowGlass", "doorGlass"]).toContain(recipe.role);
    const source = buildOpeningAssemblyGeometry({ recipe, detail });
    for (let index = 0; index < batch.count; index += 1) {
      result.push(...triangles(source.positions, source.indices, batch.batchId, batch.transforms!.subarray(index * 16, index * 16 + 16), index));
    }
  }
  return result;
}

async function compileFixture(detail: OpeningGeometryDetail, spec = fixtureSpec()) {
  const manifest = structuredClone(frozenAcceptanceCard.materialAnchors.atlasManifest);
  const catalog = await buildComponentCatalog(spec, manifest);
  const graph = await buildBuildingGraph(spec, catalog);
  const facadePlan = planFacadeModules({ spec, kit: late19cApartmentKit });
  const wallDepthM = catalog.recipes.find((recipe) => recipe.role === "wall")!.dimensionsM.depth;
  const split = await buildFacadeSplitPlan({ spec, wallDepthM, facadePlan, kit: late19cApartmentKit });
  const ir = await compileBuilding({ spec, catalog, graph, facadePlan, fidelityMode: "kit", detailLevel: detail });
  return { spec, catalog, graph, ir, split, geometry: actualGeometry(ir, catalog, detail) };
}

describe("compiled opening aperture visibility", () => {
  it.each(["high", "low"] as const)("keeps complete-scene glazing clear on all four facades at %s detail", async (detail) => {
    const { catalog, ir, split, geometry } = await compileFixture(detail);
    const windows = split.openings.filter((opening) => opening.kind === "window");
    expect(new Set(windows.map((opening) => opening.facade))).toEqual(new Set(["front", "rear", "left", "right"]));
    const glassBatch = ir.instanceBatches.find((batch) => batch.batchId === "instances.window.glass")!;
    const glassRecipe = catalog.recipes.find((recipe) => recipe.id === glassBatch.recipeId)!;
    const glass = buildOpeningAssemblyGeometry({ recipe: glassRecipe, detail, part: "glass" });
    const failures: string[] = [];
    let rayCount = 0;

    // Nine points span each pane. They deliberately avoid the two sash mullions;
    // checking only the center would hit a legitimate rail or miss partial fills.
    for (let index = 0; index < windows.length; index += 1) {
      const opening = windows[index]!;
      const matrix = glassBatch.transforms!.subarray(index * 16, index * 16 + 16);
      const exterior = outward(opening.facade);
      for (const xFraction of [-0.43, 0.1, 0.43]) {
        for (const yFraction of [-0.43, 0.11, 0.43]) {
          rayCount += 1;
          const target = transform([
            xFraction * glassRecipe.dimensionsM.width,
            yFraction * glassRecipe.dimensionsM.height,
            (glass.bounds.min[2] + glass.bounds.max[2]) / 2
          ], matrix);
          const intersections = hits(exteriorRayOrigin(target, exterior, ir), mul(exterior, -1), geometry);
          const first = intersections[0];
          if (first?.batchId !== glassBatch.batchId || first.elementIndex !== index) {
            failures.push(`${opening.semanticPath} pane(${xFraction},${yFraction}) blocked by ${first?.batchId ?? "missing glass"}`);
          }
          if (first && dot(cross(sub(first.triangle.b, first.triangle.a), sub(first.triangle.c, first.triangle.a)), exterior) <= 0) {
            failures.push(`${opening.semanticPath} pane(${xFraction},${yFraction}) exterior triangle has inward winding`);
          }
          // The first opaque hit must be strictly behind the pane's *rear* face,
          // so transparent glazing sees an intentional dark interior/backing.
          const glassHits = intersections.filter((hit) => hit.batchId === glassBatch.batchId && hit.elementIndex === index);
          const opaque = intersections.find((hit) => !hit.batchId.endsWith(".glass"));
          if (!glassHits.length || !opaque || opaque.distance <= Math.max(...glassHits.map((hit) => hit.distance)) + 0.001) {
            failures.push(`${opening.semanticPath} pane(${xFraction},${yFraction}) missing ordered backing`);
          }
          if (opaque && glassHits.length && opaque.distance - Math.max(...glassHits.map((hit) => hit.distance)) > 0.3) {
            failures.push(`${opening.semanticPath} pane(${xFraction},${yFraction}) sees a distant wall instead of local backing`);
          }
          if (detail === "high" && opaque?.batchId !== "mesh.opening-pockets") {
            failures.push(`${opening.semanticPath} pane(${xFraction},${yFraction}) first opaque backing is ${opaque?.batchId}`);
          }
        }
      }
    }
    expect(rayCount).toBe(522);
    expect(failures.length, failures.slice(0, 12).join("\n")).toBe(0);
  });

  it("requires zero sampled pane blockers in the complete high-detail scene", async () => {
    const { catalog, ir, split, geometry } = await compileFixture("high");
    const windows = split.openings.filter((opening) => opening.kind === "window");
    const glassBatch = ir.instanceBatches.find((batch) => batch.batchId === "instances.window.glass")!;
    const recipe = catalog.recipes.find((candidate) => candidate.id === glassBatch.recipeId)!;
    const glass = buildOpeningAssemblyGeometry({ recipe, detail: "high", part: "glass" });
    const blocked: Array<{ semanticPath: string; facade: WallFacadeName; floorIndex: number; batchId?: string }> = [];
    let rayCount = 0;
    for (let index = 0; index < windows.length; index += 1) {
      const opening = windows[index]!;
      const matrix = glassBatch.transforms!.subarray(index * 16, index * 16 + 16);
      const exterior = outward(opening.facade);
      for (const x of [-0.43, 0.1, 0.43]) {
        for (const y of [-0.43, 0.11, 0.43]) {
          rayCount += 1;
          const target = transform([recipe.dimensionsM.width * x, recipe.dimensionsM.height * y,
            (glass.bounds.min[2] + glass.bounds.max[2]) / 2], matrix);
          const first = hits(exteriorRayOrigin(target, exterior, ir), mul(exterior, -1), geometry)[0];
          if (first?.batchId !== glassBatch.batchId || first.elementIndex !== index) {
            blocked.push({ semanticPath: opening.semanticPath, facade: opening.facade, floorIndex: opening.floorIndex, batchId: first?.batchId });
          }
        }
      }
    }
    expect(rayCount).toBe(522);
    expect(blocked, "Complete-scene rays include every trim batch.").toEqual([]);
  });

  it.each(trimFixtures)("keeps complete front pane rectangles clear of crown, belts and spandrels: $name", async ({ spec, profile }) => {
    const { catalog, ir, split, geometry } = await compileFixture("high", structuredClone(spec));
    const panes = actualFrontPaneRectangles(ir, catalog, split.openings);
    expect(panes.length).toBeGreaterThan(0);
    const trimBatchIds = ["mesh.cornice", "mesh.belt-course", "mesh.spandrels"];
    expect(ir.meshBatches.map((batch) => batch.batchId)).toEqual(expect.arrayContaining(trimBatchIds));
    if (profile) expect(catalog.recipes.find((recipe) => recipe.role === "cornice")!.profileRecipeId).toMatch(new RegExp(`\\.${profile}$`));
    const trim = geometry.filter((triangle) => trimBatchIds.includes(triangle.batchId));
    const failures: string[] = [];
    for (const pane of panes) {
      for (const triangle of trim) {
        const area = projectedPaneOverlapArea(triangle, pane);
        if (area > 1e-10) failures.push(`${pane.semanticPath}: ${triangle.batchId} overlaps ${area.toFixed(8)} m² of pane`);
      }
    }
    expect(failures.length, failures.slice(0, 12).join("\n")).toBe(0);
  });

  it("detects a narrow course between all nine ray samples in an actual pane rectangle", async () => {
    const { catalog, ir, split } = await compileFixture("high");
    const pane = actualFrontPaneRectangles(ir, catalog, split.openings)[0]!;
    const width = pane.maxX - pane.minX;
    const height = pane.maxY - pane.minY;
    const centerX = (pane.minX + pane.maxX) / 2;
    const centerY = (pane.minY + pane.maxY) / 2;
    const course = buildBoxPrimitive({ center: [centerX, centerY + height * 0.24, pane.exteriorZ - 0.1], size: [width, 0.002, 0.02] });
    const courseTriangles = triangles(course.positions, course.indices, "fixture.narrow-course");
    for (const x of [-0.43, 0.1, 0.43]) {
      for (const y of [-0.43, 0.11, 0.43]) {
        const target: Vec3 = [centerX + width * x, centerY + height * y, pane.exteriorZ];
        expect(hits(exteriorRayOrigin(target, [0, 0, -1], ir), [0, 0, 1], courseTriangles)).toEqual([]);
      }
    }
    // Each rectangular face splits into two triangles, so one triangle covers
    // half of the independently known width × 2mm projected course area.
    expect(Math.max(...courseTriangles.map((triangle) => projectedPaneOverlapArea(triangle, pane)))).toBeCloseTo(width * 0.002 / 2, 8);
  });

  it.each(["high", "low"] as const)("keeps split layout and paired frame/glass counts stable at %s detail", async (detail) => {
    const { spec, catalog, graph, ir, split } = await compileFixture(detail);
    const bodyMasks = Object.fromEntries((["front", "left", "right", "rear"] as const).map((facade) => [
      facade,
      Array.from({ length: spec.massing.floorCount - 1 }, (_, index) => split.openings
        .filter((opening) => opening.kind === "window" && opening.facade === facade && opening.floorIndex === index + 1)
        .map((opening) => opening.bayIndex))
    ]));
    expect(bodyMasks).toEqual({
      front: [[0, 1, 3, 5, 6], [0, 1, 2, 3, 5, 6], [0, 1, 2, 3, 4, 5, 6]],
      left: [[0, 1], [0, 1, 2], [0, 1]],
      right: [[1, 2], [2, 3], [2, 3]],
      rear: [[0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]]
    });
    for (const kind of ["window", "door"] as const) {
      const openings = split.openings.filter((opening) => opening.kind === kind);
      expect(openings.length).toBe(kind === "window" ? 58 : 1);
      const frameBatch = ir.instanceBatches.find((batch) => batch.batchId === `instances.${kind}`)!;
      const glassBatch = ir.instanceBatches.find((batch) => batch.batchId === `instances.${kind}.glass`)!;
      expect(frameBatch.count).toBe(openings.length);
      expect(glassBatch.count).toBe(openings.length);
      expect(glassBatch.materialSlotId).toBe("glass.primary");
      const frameRecipe = catalog.recipes.find((recipe) => recipe.id === frameBatch.recipeId)!;
      for (let index = 0; index < openings.length; index += 1) {
        const opening = openings[index]!;
        const frameMatrix = frameBatch.transforms!.subarray(index * 16, index * 16 + 16);
        const glassMatrix = glassBatch.transforms!.subarray(index * 16, index * 16 + 16);
        const frameCenter = transform([0, 0, 0], frameMatrix);
        expect(frameCenter).toEqual(opening.centerM.map((coordinate) => Math.fround(coordinate)));
        const actualExterior = mul([frameMatrix[8]!, frameMatrix[9]!, frameMatrix[10]!], 1 / Math.hypot(frameMatrix[8]!, frameMatrix[9]!, frameMatrix[10]!));
        expect(actualExterior).toEqual(outward(opening.facade));
        const glassCenter = transform([0, 0, 0], glassMatrix);
        const inwardDepth = -dot(sub(glassCenter, frameCenter), actualExterior);
        const frameDepthScale = Math.hypot(frameMatrix[8]!, frameMatrix[9]!, frameMatrix[10]!);
        expect(inwardDepth).toBeCloseTo(frameRecipe.dimensionsM.depth * frameDepthScale * 0.72, 5);
        // A thin pane's depth is in metres, not multiplied by the frame's depth.
        expect(Math.hypot(glassMatrix[8]!, glassMatrix[9]!, glassMatrix[10]!)).toBeCloseTo(1, 6);
        if (kind === "window") expect(glassCenter[1]).toBeCloseTo(frameCenter[1], 5);
        else expect(glassCenter[1]).toBeGreaterThan(frameCenter[1]);
        const suffix = kind === "window" ? "/glass" : "/transom-glass";
        expect(ir.semanticIndex).toContainEqual({ semanticPath: opening.semanticPath, batchId: frameBatch.batchId, elementIndex: index, stage: "openings" });
        expect(ir.semanticIndex).toContainEqual({ semanticPath: `${opening.semanticPath}${suffix}`, batchId: glassBatch.batchId, elementIndex: index, stage: "openings" });
      }
    }
    expect(spec.facade.frontBayCount).toBe(7);
    expect(ir.sourceGraphHash).toMatch(/^[a-f0-9]{64}$/);
    expect(catalog.catalogId).toBe(frozenAcceptanceCard.identity.catalogId);
    expect(ir.sourceGraphHash).toBe(await hashCanonicalJson(detail === "high" ? graph : { graph, detailLevel: detail }));
    // S4 legitimately changes serialized facade placements. The separate graph
    // comparison gate restricts that change; this IR must reference the new graph.
    if (detail === "high") expect(ir.sourceGraphHash).not.toBe(frozenAcceptanceCard.identity.sourceGraphHash);
  });

  it.each(["high", "low"] as const)("shows door transom glass before wall, frame and leaf at %s detail", async (detail) => {
    const { catalog, ir, split, geometry } = await compileFixture(detail);
    const doors = split.openings.filter((opening) => opening.kind === "door");
    expect(doors.length).toBeGreaterThan(0);
    const glassBatch = ir.instanceBatches.find((batch) => batch.batchId === "instances.door.glass")!;
    const recipe = catalog.recipes.find((candidate) => candidate.id === glassBatch.recipeId)!;
    const source = buildOpeningAssemblyGeometry({ recipe, detail, part: "glass" });
    const failures: string[] = [];
    let rayCount = 0;
    for (let index = 0; index < doors.length; index += 1) {
      const matrix = glassBatch.transforms!.subarray(index * 16, index * 16 + 16);
      const exterior = outward(doors[index]!.facade);
      for (const x of [-0.43, 0.13, 0.43]) {
        for (const y of [-0.43, 0.11, 0.43]) {
          rayCount += 1;
          const target = transform([recipe.dimensionsM.width * x, recipe.dimensionsM.height * y, (source.bounds.min[2] + source.bounds.max[2]) / 2], matrix);
          const intersections = hits(exteriorRayOrigin(target, exterior, ir), mul(exterior, -1), geometry);
          if (intersections[0]?.batchId !== glassBatch.batchId || intersections[0].elementIndex !== index) {
            failures.push(`${doors[index]!.semanticPath} transom(${x},${y}) blocked by ${intersections[0]?.batchId}`);
          }
          const first = intersections[0];
          if (first && dot(cross(sub(first.triangle.b, first.triangle.a), sub(first.triangle.c, first.triangle.a)), exterior) <= 0) {
            failures.push(`${doors[index]!.semanticPath} transom(${x},${y}) exterior triangle has inward winding`);
          }
          const glassHits = intersections.filter((hit) => hit.batchId === glassBatch.batchId && hit.elementIndex === index);
          const opaque = intersections.find((hit) => !hit.batchId.endsWith(".glass"));
          const rearDistance = Math.max(...glassHits.map((hit) => hit.distance));
          if (!glassHits.length || !opaque || opaque.distance <= rearDistance + 0.001 || opaque.distance - rearDistance > 0.3) {
            failures.push(`${doors[index]!.semanticPath} transom(${x},${y}) missing nearby backing behind pane rear`);
          }
        }
      }
    }
    expect(rayCount).toBe(9);
    expect(failures.length, failures.slice(0, 12).join("\n")).toBe(0);
  });

  it.each(["high", "low"] as const)("shows the intended lower door leaf before wall backing at %s detail", async (detail) => {
    const { catalog, ir, split, geometry } = await compileFixture(detail);
    const doors = split.openings.filter((opening) => opening.kind === "door");
    const frameBatch = ir.instanceBatches.find((batch) => batch.batchId === "instances.door")!;
    const recipe = catalog.recipes.find((candidate) => candidate.id === frameBatch.recipeId)!;
    const failures: string[] = [];
    let rayCount = 0;
    for (let index = 0; index < doors.length; index += 1) {
      const matrix = frameBatch.transforms!.subarray(index * 16, index * 16 + 16);
      const exterior = outward(doors[index]!.facade);
      // Six lower interior points avoid perimeter bars, center stile and transom.
      for (const x of [-0.25, 0.13, 0.25]) {
        for (const y of [-0.3, -0.1]) {
          rayCount += 1;
          const target = transform([recipe.dimensionsM.width * x, recipe.dimensionsM.height * y, 0], matrix);
          const intersections = hits(exteriorRayOrigin(target, exterior, ir), mul(exterior, -1), geometry);
          const first = intersections[0];
          const backing = intersections.find((hit) => hit.batchId === "mesh.opening-pockets");
          if (first?.batchId !== frameBatch.batchId || first.elementIndex !== index || !backing || first.distance >= backing.distance) {
            failures.push(`${doors[index]!.semanticPath} leaf(${x},${y}) first hits ${first?.batchId}`);
          }
          if (first && dot(cross(sub(first.triangle.b, first.triangle.a), sub(first.triangle.c, first.triangle.a)), exterior) <= 0) {
            failures.push(`${doors[index]!.semanticPath} leaf(${x},${y}) exterior triangle has inward winding`);
          }
        }
      }
    }
    expect(rayCount).toBe(6);
    expect(failures.length, failures.slice(0, 12).join("\n")).toBe(0);
  });
});
