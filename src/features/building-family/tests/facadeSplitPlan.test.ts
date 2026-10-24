import { late19cApartmentKit, planFacadeModules } from "../art-kit";
import {
  buildFacadeSplitPlan, wallPrimitivesFromSplitPlan, BuildingWindowSlotTargetError,
  applyWindowWidthOverride, BuildingWindowWidthOverrideError,
  resolveWindowSlotAddressFromSemanticPath, resolveWindowOpeningFromSlotAddress, type FacadeSplitPlan
} from "../compiler/facadeSplitPlan";
import { buildFacadeBayScopes, expandBayWallPrimitives, type FacadeBayScope, type WallFacadeName } from "../compiler/facadeWallSubdivision";
import { combinePrimitiveGeometry } from "../compiler/primitiveGeometry";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import { BuildingWindowSlotAddressSchema, BuildingWindowWidthOverrideSchema, type BuildingWindowSlotAddress } from "../contracts/buildingDocument";
import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { hashCanonicalJson } from "../core/contentHash";
import { planAtlas } from "../materials/atlasPlanner";

function fixtureSpec(): BuildingFamilySpec {
  return {
    schemaVersion: "0.1.0",
    familyId: "family-split-plan",
    sourceIntentHash: "intent-split-plan",
    stylePackId: "late-19c-commercial-demo",
    seeds: { family: "family-seed", building: "building-seed", material: "material-seed", trim: "trim-seed" },
    massing: {
      widthM: 24,
      depthM: 16,
      floorCount: 3,
      floorHeightsM: [4.2, 3.2, 3.2],
      parapetHeightM: 1,
      roof: { type: "flat" }
    },
    facade: {
      frontBayCount: 5,
      sideBaySpacingM: 4,
      groundFloorRatio: 0.26,
      corniceHeightM: 1,
      symmetry: 0.9
    },
    selectedFamilies: {
      wall: "brick-red",
      roof: "flat-membrane",
      window: "tall-arched",
      door: "recessed-storefront",
      cornice: "bracketed-metal",
      trim: "pressed-metal"
    },
    materialParameters: {},
    componentParameters: {},
    variationPolicy: {},
    locks: [],
    diagnostics: []
  };
}

const exteriorFace: Record<WallFacadeName, number> = { rear: 0, front: 1, right: 2, left: 3 };

function planWithScopes(scopes: FacadeBayScope[]): FacadeSplitPlan {
  return {
    schemaVersion: "0.1.0", familyId: "family-phase-test", wallDepthM: 0.34,
    contentHash: "phase-test", scopes, openings: []
  };
}

function solidPlan(): FacadeSplitPlan {
  return planWithScopes(buildFacadeBayScopes({
    spec: fixtureSpec(), wallDepthM: 0.34, openings: [], strictOpenings: true
  }));
}

// Literal receipts captured from the unmodified P2 fixture before any P3 production edit.
// The ordered scope digest seals facade:floor:bay:geometryHash for every emitted scope.
const p3Goldens = {
  kit: { split: "fffaeb69d914350dd0dd7b5a715f7b56c41280f467f2a760ec7fa5a0cee70623", geometry: "48e07c8c79e0eb466bed2318405d5ff552bf986b581d3ddd2471a137d377a3b3", scopes: "1bc412c405fc91288408764ce3c624836e37dc21d537a9c24f2c7fe818b7498c" },
  "proof-front": { split: "b8917fe3cdecf00f2565b3a25e7da10cf5a0237820d3058f9a681135ff50a39b", geometry: "31f79ed2c90f96ce55bcce1f30be0472ae52887b851bf1fefc94b45b665acdf7", scopes: "b155480835504f51b8b6f5d73254e677c71b63721d36d182f59d4edf59dbc161" },
  "proof-multifacade": { split: "d30a0c82d593c29d97668f924f901730f64d38408712603451a1df6ab7cc1313", geometry: "abbf7d5a33fdff5efbe1226776aacc32edd1aeaf7e5a05a47bc157db4ed62616", scopes: "453bc6edcd8779e887d98fab8eaaf63ce6859c2dba3c0547568a8680c9690b87" }
} as const;
type P3Mode = keyof typeof p3Goldens;
const p3Address = (opening: Pick<FacadeSplitPlan["openings"][number], "facade" | "floorIndex" | "bayIndex">): BuildingWindowSlotAddress =>
  ({ schemaVersion: "0.1.0", facade: opening.facade, floorIndex: opening.floorIndex, bayIndex: opening.bayIndex });
const p3Key = (value: Pick<FacadeBayScope, "facade" | "floorIndex" | "bayIndex">) => `${value.facade}:${value.floorIndex}:${value.bayIndex}`;
async function p3Plan(mode: P3Mode): Promise<FacadeSplitPlan> {
  const spec = fixtureSpec();
  return buildFacadeSplitPlan({ spec, wallDepthM: 0.34, ...(mode === "kit"
    ? { facadePlan: planFacadeModules({ spec, kit: late19cApartmentKit }), kit: late19cApartmentKit }
    : { defaultOpeningMode: mode === "proof-front" ? "front-only" as const : "multi-facade" as const }) });
}
async function p3GeometryHash(primitives: ReturnType<typeof wallPrimitivesFromSplitPlan>): Promise<string> {
  const geometry = combinePrimitiveGeometry(primitives);
  const payload = Object.fromEntries((["positions", "normals", "uvs", "indices"] as const).map(name => {
    const value = geometry[name];
    return [name, { type: value.constructor.name, bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) }];
  }));
  return hashCanonicalJson({ ...payload, bounds: geometry.bounds });
}
async function p3ScopeGeometry(plan: FacadeSplitPlan) {
  const walls = wallPrimitivesFromSplitPlan(plan);
  let offset = 0;
  const scopes = [];
  for (const scope of plan.scopes) {
    const count = expandBayWallPrimitives(scope).length;
    const primitives = walls.slice(offset, offset + count);
    scopes.push({ key: p3Key(scope), primitives, hash: await p3GeometryHash(primitives) });
    offset += count;
  }
  expect(offset).toBe(walls.length);
  return scopes;
}
async function p3RefreshHash(plan: FacadeSplitPlan): Promise<void> {
  plan.contentHash = await hashCanonicalJson({ familyId: plan.familyId, wallDepthM: plan.wallDepthM,
    scopes: plan.scopes.map(scope => ({ facade: scope.facade, floorIndex: scope.floorIndex, bayIndex: scope.bayIndex, zone: scope.zone,
      opening: scope.opening, storefront: scope.storefront ? { bulkheadHeightM: scope.storefront.bulkheadHeightM, glazingHeightM: scope.storefront.glazingHeightM, lintelHeightM: scope.storefront.lintelHeightM } : undefined })),
    openings: plan.openings.map(opening => ({ facade: opening.facade, floorIndex: opening.floorIndex, bayIndex: opening.bayIndex, kind: opening.kind, centerM: opening.centerM, sizeM: opening.sizeM })) });
}
async function p3Reject(plan: FacadeSplitPlan, input: unknown, code: string) {
  const before = structuredClone(plan);
  const failure = await applyWindowWidthOverride(plan, input).then(() => undefined, (error: unknown) => error);
  expect(failure).toBeInstanceOf(code.startsWith("building.windowSlot.") ? BuildingWindowSlotTargetError : BuildingWindowWidthOverrideError);
  expect(failure).toMatchObject({ code });
  expect(plan).toEqual(before);
}

describe("R3.P3 window-width split kernel", () => {
  let plans: Record<P3Mode, FacadeSplitPlan>;
  beforeAll(async () => {
    plans = { kit: await p3Plan("kit"), "proof-front": await p3Plan("proof-front"), "proof-multifacade": await p3Plan("proof-multifacade") };
  });

  it("preserves the pre-edit split and all typed wall/scoped receipts on owned no-ops", async () => {
    for (const mode of Object.keys(p3Goldens) as P3Mode[]) {
      const plan = plans[mode], opening = plan.openings.find(entry => entry.kind === "window")!;
      const original = structuredClone(plan);
      expect(plan.contentHash).toBe(p3Goldens[mode].split);
      expect(await p3GeometryHash(wallPrimitivesFromSplitPlan(plan))).toBe(p3Goldens[mode].geometry);
      const scopes = await p3ScopeGeometry(plan);
      expect(scopes).toHaveLength(54);
      expect(await hashCanonicalJson(scopes.map(scope => scope.key + ":" + scope.hash))).toBe(p3Goldens[mode].scopes);
      const result = await applyWindowWidthOverride(plan, { schemaVersion: "0.1.0", address: p3Address(opening), widthM: opening.sizeM[0] });
      expect(result).toEqual(original); expect(result).not.toBe(plan);
      expect(result.scopes).not.toBe(plan.scopes); expect(result.openings).not.toBe(plan.openings);
      expect(await p3GeometryHash(wallPrimitivesFromSplitPlan(result))).toBe(p3Goldens[mode].geometry);
      result.openings[0].centerM[0] += 100;
      expect(plan).toEqual(original);
    }
  }, 20000);

  it("narrows only one actual aperture across kit/proof modes and every applicable facade", async () => {
    for (const mode of Object.keys(p3Goldens) as P3Mode[]) {
      for (const facade of (mode === "proof-front" ? ["front"] : ["front", "rear", "left", "right"]) as WallFacadeName[]) {
        const plan = plans[mode], original = structuredClone(plan);
        const openingIndex = plan.openings.findIndex(entry => entry.kind === "window" && entry.facade === facade && entry.floorIndex === 1);
        expect(openingIndex).toBeGreaterThanOrEqual(0);
        const opening = plan.openings[openingIndex], key = p3Key(opening);
        const scopeIndex = plan.scopes.findIndex(scope => p3Key(scope) === key);
        const widthM = 0.6, before = await p3ScopeGeometry(plan);
        const result = await applyWindowWidthOverride(plan, { schemaVersion: "0.1.0", address: p3Address(opening), widthM });
        const expected = structuredClone(plan);
        expected.openings[openingIndex].sizeM[0] = widthM;
        expected.scopes[scopeIndex].opening!.widthM = widthM;
        await p3RefreshHash(expected);
        expect(result).toEqual(expected);
        expect(result.contentHash).not.toBe(plan.contentHash);
        expect(plan).toEqual(original);
        const after = await p3ScopeGeometry(result);
        for (let index = 0; index < before.length; index += 1) {
          expect(after[index].key).toBe(before[index].key);
          if (index !== scopeIndex) expect(after[index].hash).toBe(before[index].hash);
          else expect(after[index].hash).not.toBe(before[index].hash);
        }
        const scope = result.scopes[scopeIndex], along = facade === "left" || facade === "right" ? 2 : 0;
        const center = scope.opening!.centerAlongM, y = scope.opening!.centerYM;
        const spans = after[scopeIndex].primitives.filter(piece => piece.bounds.min[1] < y && piece.bounds.max[1] > y).map(piece => {
          const coordinates = new Float32Array(piece.positions).filter((_, index) => index % 3 === along);
          return { min: Math.min(...coordinates), max: Math.max(...coordinates) };
        });
        const left = Math.max(...spans.filter(span => span.max < center).map(span => span.max));
        const right = Math.min(...spans.filter(span => span.min > center).map(span => span.min));
        expect(left).toBe(Math.fround(center - widthM / 2));
        expect(right).toBe(Math.fround(center + widthM / 2));
        expect(right - left).toBeCloseTo(widthM, 5);
      }
    }
  }, 20000);

  it("detaches legal selected aliases so a rear scope and placement remain exact", async () => {
    const plan = structuredClone(plans["proof-multifacade"]);
    const front = plan.openings.find(entry => entry.facade === "front" && entry.floorIndex === 1 && entry.bayIndex === 0)!;
    const rear = plan.openings.find(entry => entry.facade === "rear" && entry.floorIndex === 1 && entry.bayIndex === 0)!;
    const frontScope = plan.scopes.find(scope => p3Key(scope) === p3Key(front))!;
    const rearScope = plan.scopes.find(scope => p3Key(scope) === p3Key(rear))!;
    expect(rearScope.opening).toEqual(frontScope.opening); expect(rear.sizeM).toEqual(front.sizeM);
    rearScope.opening = frontScope.opening; rear.sizeM = front.sizeM;
    await p3RefreshHash(plan);
    const original = structuredClone(plan);
    const result = await applyWindowWidthOverride(plan, { schemaVersion: "0.1.0", address: p3Address(front), widthM: 0.6 });
    expect(result.scopes.find(scope => p3Key(scope) === p3Key(rear))).toEqual(original.scopes.find(scope => p3Key(scope) === p3Key(rear)));
    expect(result.openings.find(entry => p3Key(entry) === p3Key(rear))).toEqual(rear);
    expect(result.scopes.find(scope => p3Key(scope) === p3Key(front))!.opening!.widthM).toBe(0.6);
    expect(result.openings.find(entry => p3Key(entry) === p3Key(front))!.sizeM[0]).toBe(0.6);
    expect(plan).toEqual(original); expect(rear.sizeM).toBe(front.sizeM); expect(rearScope.opening).toBe(frontScope.opening);
  });

  it("accepts the exact binder floor and rejects narrower floors or widening atomically", async () => {
    const plan = plans["proof-multifacade"], opening = plan.openings.find(entry => entry.kind === "window")!;
    const input = { schemaVersion: "0.1.0", address: p3Address(opening), widthM: 0.23 };
    expect((await applyWindowWidthOverride(plan, input)).openings.find(entry => p3Key(entry) === p3Key(opening))!.sizeM[0]).toBe(0.23);
    for (const widthM of [0.1, 0.2, 0.23 - 1e-12, opening.sizeM[0] + 0.01]) await p3Reject(plan, { ...input, widthM }, "building.windowWidth.unsupportedWidth");
  });

  it("measures both actual piers instead of assuming a centered opening", async () => {
    for (const facade of ["front", "right"] as const) for (const edge of ["min", "max"] as const) {
      const plan = structuredClone(plans["proof-multifacade"]), opening = plan.openings.find(entry => entry.facade === facade && entry.floorIndex === 1 && entry.kind === "window")!;
      const scope = plan.scopes.find(entry => p3Key(entry) === p3Key(opening))!, axis = facade === "front" ? 0 : 2;
      const center = edge === "min" ? scope.originM[axis] + 0.3 + 0.079 : scope.originM[axis] + scope.sizeM[axis] - 0.3 - 0.079;
      scope.opening!.centerAlongM = center; opening.centerM[axis] = center;
      await p3RefreshHash(plan);
      await p3Reject(plan, { schemaVersion: "0.1.0", address: p3Address(opening), widthM: 0.6 }, "building.windowWidth.unsupportedWidth");
    }
  });

  it("rejects malformed directives before unsafe property reads", async () => {
    const plan = plans.kit, opening = plan.openings.find(entry => entry.kind === "window")!;
    const input = { schemaVersion: "0.1.0", address: p3Address(opening), widthM: 0.6 };
    expect(BuildingWindowWidthOverrideSchema.parse(input)).toEqual(input);
    for (const malformed of [null, { ...input, schemaVersion: "0.2.0" }, { ...input, widthM: 0 }, { ...input, widthM: Number.NaN },
      { ...input, widthM: Infinity }, { ...input, widthM: "0.6" }, { ...input, widthM: -1 }, { ...input, extra: undefined }, { ...input, address: { ...input.address, bayIndex: -1 } }]) {
      await p3Reject(plan, malformed, "building.windowWidth.invalidDirective");
    }
    let reads = 0;
    const accessor = Object.defineProperty({ ...input }, "widthM", { enumerable: true, get() { reads += 1; return 0.6; } });
    await p3Reject(plan, accessor, "building.windowWidth.invalidDirective");
    expect(reads).toBe(0);
  });

  it("keeps target errors and rejects missing, duplicate and contradictory scope joins", async () => {
    const base = plans.kit, target = base.openings.find(entry => entry.kind === "window")!;
    const directive = { schemaVersion: "0.1.0", address: p3Address(target), widthM: 0.6 };
    const door = base.openings.find(entry => entry.kind === "door")!;
    await p3Reject(base, { ...directive, address: p3Address(door) }, "building.windowSlot.notWindow");
    for (const kind of ["missing-opening", "duplicate-opening", "missing-scope", "duplicate-scope", "placement-center", "scope-width", "scope-depth", "scope-zone", "hash"] as const) {
      const plan = structuredClone(base), index = plan.scopes.findIndex(scope => p3Key(scope) === p3Key(target));
      const opening = plan.openings.find(entry => p3Key(entry) === p3Key(target))!;
      let code = "building.windowWidth.incoherentPlan";
      if (kind === "missing-opening") { plan.openings.splice(plan.openings.indexOf(opening), 1); code = "building.windowSlot.missingOpening"; }
      if (kind === "duplicate-opening") { plan.openings.push(structuredClone(opening)); code = "building.windowSlot.ambiguousTarget"; }
      if (kind === "missing-scope") { plan.scopes.splice(index, 1); code = "building.windowWidth.missingScope"; }
      if (kind === "duplicate-scope") { plan.scopes.push(structuredClone(plan.scopes[index])); code = "building.windowWidth.ambiguousScope"; }
      if (kind === "placement-center") opening.centerM[1] += 0.1;
      if (kind === "scope-width") plan.scopes[index].opening!.widthM += 0.1;
      if (kind === "scope-depth") {
        const scope = plan.scopes[index], side = scope.facade === "left" || scope.facade === "right", radial = side ? 0 : 2;
        scope.sizeM[radial] += 0.1;
        opening.sizeM[2] = scope.sizeM[radial] * (side ? 0.5 : 0.55);
        opening.centerM[radial] = scope.originM[radial] + (scope.facade === "rear" || scope.facade === "right" ? scope.sizeM[radial] : 0);
      }
      if (kind === "scope-zone") plan.scopes[index].zone = plan.scopes[index].floorIndex === 0 ? "body" : "ground";
      await p3RefreshHash(plan);
      if (kind === "hash") plan.contentHash = "0".repeat(64);
      await p3Reject(plan, directive, code);
    }
  });

  it("owns plan and directive values synchronously before the first hash await", async () => {
    const plan = structuredClone(plans.kit), opening = plan.openings.find(entry => entry.kind === "window")!;
    const directive = { schemaVersion: "0.1.0", address: p3Address(opening), widthM: 0.6 };
    const expected = await applyWindowWidthOverride(structuredClone(plan), structuredClone(directive));
    const pending = applyWindowWidthOverride(plan, directive);
    directive.widthM = 99; directive.address.facade = "right"; directive.address.floorIndex = 999;
    opening.centerM[0] += 50; opening.sizeM[0] = 99; plan.scopes[0].originM[0] -= 100; plan.contentHash = "caller-mutated";
    const result = await pending;
    expect(result).toEqual(expected);
    result.scopes[0].originM[0] += 200;
    expect(plan.scopes[0].originM[0]).not.toBe(result.scopes[0].originM[0]);
  });
});

describe("facadeSplitPlan", () => {
  it("builds a hash-stable split where openings match kit plan bays only", async () => {
    const spec = fixtureSpec();
    const facadePlan = planFacadeModules({ spec, kit: late19cApartmentKit });
    const first = await buildFacadeSplitPlan({
      spec,
      wallDepthM: 0.34,
      facadePlan,
      kit: late19cApartmentKit
    });
    const second = await buildFacadeSplitPlan({
      spec,
      wallDepthM: 0.34,
      facadePlan,
      kit: late19cApartmentKit
    });

    expect(first.contentHash).toBe(second.contentHash);
    expect(first.schemaVersion).toBe("0.1.0");
    expect(first.openings.length).toBeGreaterThan(0);
    expect(first.openings.some((opening) => opening.kind === "door")).toBe(true);
    expect(first.openings.every((opening) => opening.centerM.every((value) => Number.isFinite(value)))).toBe(
      true
    );

    const kitOpeningCells = new Set(
      facadePlan.placements
        .filter((placement) => placement.layer === "opening")
        .map((placement) => `${placement.facade}:${placement.floorIndex}:${placement.bayIndex}`)
    );
    for (const opening of first.openings) {
      expect(kitOpeningCells.has(`${opening.facade}:${opening.floorIndex}:${opening.bayIndex}`)).toBe(true);
    }
  });

  it("emits wall pieces only around split openings (not a default front grid)", async () => {
    const spec = fixtureSpec();
    const facadePlan = planFacadeModules({ spec, kit: late19cApartmentKit });
    const split = await buildFacadeSplitPlan({
      spec,
      wallDepthM: 0.34,
      facadePlan,
      kit: late19cApartmentKit
    });
    const solidScopes = split.scopes.filter((scope) => !scope.opening);
    const openScopes = split.scopes.filter((scope) => scope.opening);
    expect(openScopes.length).toBe(split.openings.length);
    expect(solidScopes.length).toBeGreaterThan(0);

    const walls = wallPrimitivesFromSplitPlan(split);
    // Subdivided walls produce many more pieces than bay count.
    expect(walls.length).toBeGreaterThan(split.scopes.length);
  });

  it("proof-style defaults use front-only openings with one ground door", async () => {
    const spec = fixtureSpec();
    const split = await buildFacadeSplitPlan({
      spec,
      wallDepthM: 0.34,
      defaultOpeningMode: "front-only"
    });
    const frontOpenings = split.openings.filter((opening) => opening.facade === "front");
    const nonFront = split.openings.filter((opening) => opening.facade !== "front");
    expect(nonFront).toHaveLength(0);
    expect(frontOpenings).toHaveLength(spec.massing.floorCount * spec.facade.frontBayCount);
    expect(frontOpenings.filter((opening) => opening.kind === "door")).toHaveLength(1);
    expect(frontOpenings.filter((opening) => opening.kind === "window")).toHaveLength(
      frontOpenings.length - 1
    );
  });

  it.each<WallFacadeName>(["front", "rear", "left", "right"])(
    "shares the handed %s exterior chart across bay and floor joints",
    (facade) => {
      const plan = solidPlan();
      const walls = wallPrimitivesFromSplitPlan(plan);
      const records = plan.scopes.flatMap((scope) =>
        expandBayWallPrimitives(scope).map(() => scope));
      const sharedPoints = new Map<string, { uv: number[]; bay: number; floor: number }>();
      let bayJoints = 0;
      let floorJoints = 0;
      walls.forEach((wall, index) => {
        const scope = records[index];
        if (scope.facade !== facade) return;
        const firstVertex = exteriorFace[facade] * 4;
        const typedUvs = new Float32Array(wall.uvs);
        for (let corner = 0; corner < 4; corner += 1) {
          const vertex = firstVertex + corner;
          const [x, y, z] = wall.positions.slice(vertex * 3, vertex * 3 + 3).map(Math.fround);
          const uv = Array.from(typedUvs.slice(vertex * 2, vertex * 2 + 2));
          const expectedU = facade === "front" ? 12 - x : facade === "rear" ? x + 12
            : facade === "left" ? z + 8 : 8 - z;
          expect(uv).toEqual([Math.fround(expectedU), y]);
          const key = `${x}/${y}/${z}`;
          const prior = sharedPoints.get(key);
          if (prior) {
            expect(uv).toEqual(prior.uv);
            if (prior.bay !== scope.bayIndex) bayJoints += 1;
            if (prior.floor !== scope.floorIndex) floorJoints += 1;
          }
          sharedPoints.set(key, { uv, bay: scope.bayIndex, floor: scope.floorIndex });
        }
        const [u0, v0, u1, v1, u2, v2, u3, v3] = typedUvs.slice(firstVertex * 2, firstVertex * 2 + 8);
        expect(u1).toBeGreaterThan(u0);
        expect(v2).toBeGreaterThan(v1);
        expect([u2, u3, v1, v3]).toEqual([u1, u0, v0, v2]);
      });
      expect(bayJoints).toBeGreaterThan(0);
      expect(floorJoints).toBeGreaterThan(0);
    }
  );

  it("preserves primitive order, geometry and all five unowned UV faces around kit openings", async () => {
    const spec = fixtureSpec();
    const split = await buildFacadeSplitPlan({
      spec, wallDepthM: 0.34, facadePlan: planFacadeModules({ spec, kit: late19cApartmentKit }),
      kit: late19cApartmentKit
    });
    const originalPlan = structuredClone(split);
    const originals = split.scopes.flatMap((scope) =>
      expandBayWallPrimitives(scope).map((primitive) => ({ primitive, facade: scope.facade })));
    const walls = wallPrimitivesFromSplitPlan(split);
    expect(walls).toHaveLength(originals.length);
    walls.forEach((wall, index) => {
      const original = originals[index];
      expect({ ...wall, uvs: [] }).toEqual({ ...original.primitive, uvs: [] });
      for (let face = 0; face < 6; face += 1) {
        if (face !== exteriorFace[original.facade]) {
          expect(wall.uvs.slice(face * 8, face * 8 + 8)).toEqual(original.primitive.uvs.slice(face * 8, face * 8 + 8));
        }
      }
    });
    expect(split).toEqual(originalPlan);
    expect(wallPrimitivesFromSplitPlan(split)).toEqual(walls);
  });

  it("protects a front corner cap that is also on the global right plane", () => {
    const plan = solidPlan();
    const index = plan.scopes.findIndex((scope) => scope.facade === "front" && scope.floorIndex === 0 && scope.bayIndex === 4);
    const original = expandBayWallPrimitives(plan.scopes[index])[0];
    const wall = wallPrimitivesFromSplitPlan(plan)[index];
    const rightFace = exteriorFace.right;
    expect(wall.positions.slice(rightFace * 12, rightFace * 12 + 12).filter((_, offset) => offset % 3 === 0))
      .toEqual([12, 12, 12, 12]);
    expect(wall.uvs.slice(rightFace * 8, rightFace * 8 + 8)).toEqual(original.uvs.slice(rightFace * 8, rightFace * 8 + 8));
    expect(wall.uvs.slice(exteriorFace.front * 8, exteriorFace.front * 8 + 8))
      .not.toEqual(original.uvs.slice(exteriorFace.front * 8, exteriorFace.front * 8 + 8));
  });

  it("selects an owned side face even when another piece extends beyond its facade plane", () => {
    const plan = solidPlan();
    plan.scopes.push({
      facade: "front", floorIndex: 0, bayIndex: 5, zone: "ground",
      originM: [12, 0, -8], sizeM: [1, 4.2, 0.34]
    });
    const walls = wallPrimitivesFromSplitPlan(plan);
    expect(Math.max(...walls.flatMap((wall) => wall.positions.filter((_, offset) => offset % 3 === 0)))).toBe(13);
    const index = plan.scopes.findIndex((scope) => scope.facade === "right" && scope.floorIndex === 0 && scope.bayIndex === 0);
    const wall = walls[index];
    expect(Math.fround(wall.positions[exteriorFace.right * 12])).toBe(12);
    expect(wall.uvs.slice(exteriorFace.right * 8, exteriorFace.right * 8 + 2)).toEqual([12, 0]);
  });

  it("anchors phase in compiled Float32 positions rather than unrounded box dimensions", () => {
    const plan = planWithScopes([{
      facade: "front", floorIndex: 0, bayIndex: 0, zone: "ground",
      originM: [13.7, 0, -7.5], sizeM: [0.808, 4.2, 0.34]
    }]);
    const walls = wallPrimitivesFromSplitPlan(plan);
    const compiled = combinePrimitiveGeometry(walls);
    const face = exteriorFace.front;
    expect(compiled.positions[(face * 4 + 1) * 3]).toBe(13.699999809265137);
    expect(compiled.uvs[(face * 4 + 1) * 2]).toBe(0.8080005645751953);
    expect(compiled.uvs[(face * 4 + 1) * 2]).not.toBe(Math.fround(0.808));
    expect(compiled.uvs[(face * 4 + 2) * 2 + 1]).toBe(Math.fround(4.2));
  });

  it("retains empty-plan behavior", () => {
    expect(wallPrimitivesFromSplitPlan(planWithScopes([]))).toEqual([]);
  });
});

describe("R3.P2 current window-slot targeting", () => {
  async function kitSplit(spec = fixtureSpec(), kit = late19cApartmentKit) {
    return buildFacadeSplitPlan({ spec, wallDepthM: 0.34, facadePlan: planFacadeModules({ spec, kit }), kit });
  }
  function addressOf(opening: Pick<FacadeSplitPlan["openings"][number], "facade" | "floorIndex" | "bayIndex">): BuildingWindowSlotAddress {
    return { schemaVersion: "0.1.0", facade: opening.facade, floorIndex: opening.floorIndex, bayIndex: opening.bayIndex };
  }
  function expectTargetError(run: () => unknown, code: BuildingWindowSlotTargetError["code"]) {
    let failure: unknown;
    try { run(); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(BuildingWindowSlotTargetError);
    expect(failure).toMatchObject({ code });
  }

  // Preserve every own metadata key (including undefined values) and every typed span,
  // without requiring Node structuredClone and jsdom to share constructor identities.
  function completeSnapshot(value: unknown): unknown {
    if (value === undefined) return { type: "undefined" };
    if (typeof value === "number") return { type: "number", value: Object.is(value, -0) ? "-0" : String(value) };
    if (value === null || typeof value !== "object") return value;
    const properties = (omitIndices = false) => Reflect.ownKeys(value)
      .filter(key => !omitIndices || typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key))
      .map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!("value" in descriptor)) throw new Error("Compiler snapshots require data properties");
        return { key: typeof key === "string" ? ["string", key] : ["symbol", String(key)], value: completeSnapshot(descriptor.value) };
      });
    if (ArrayBuffer.isView(value)) {
      return {
        type: "view", tag: Object.prototype.toString.call(value), constructorName: value.constructor.name,
        elementLength: (value as unknown as { length?: number }).length ?? null,
        byteOffset: value.byteOffset, byteLength: value.byteLength, bufferByteLength: value.buffer.byteLength,
        bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)), properties: properties(true)
      };
    }
    return { type: Array.isArray(value) ? "array" : "object", tag: Object.prototype.toString.call(value), properties: properties() };
  }

  it.each(["kit", "proof"] as const)("joins actual %s compiler frame and glass paths to the same current slot", async fidelityMode => {
    const spec = fixtureSpec();
    const atlas = await planAtlas(spec);
    const catalog = await buildComponentCatalog(spec, atlas.manifest);
    const graph = await buildBuildingGraph(spec, catalog, { fidelityMode });
    const facadePlan = fidelityMode === "kit" ? planFacadeModules({ spec, kit: late19cApartmentKit }) : undefined;
    const wallDepthM = Math.max(0.02, catalog.recipes.find(recipe => recipe.role === "wall")!.dimensionsM.depth);
    const split = await buildFacadeSplitPlan({ spec, wallDepthM, facadePlan, kit: facadePlan ? late19cApartmentKit : undefined });
    const ir = await compileBuilding({ spec, catalog, graph, fidelityMode, facadePlan });
    const cloned = structuredClone({ split, ir });
    const before = completeSnapshot({ split, ir }), clonedSnapshot = completeSnapshot(cloned);
    const positions = ir.meshBatches.find(batch => batch.positions && batch.positions.length > 0)!.positions!;
    const clonedPositions = cloned.ir.meshBatches.find(batch => batch.positions && batch.positions.length > 0)!.positions!;
    console.log("R3_P2_ORACLE_REALM " + JSON.stringify({
      schemaVersion: "0.1.0", packetKind: "buildo-r3-p2-test-oracle-realm", fidelityMode,
      originalTag: Object.prototype.toString.call(positions), clonedTag: Object.prototype.toString.call(clonedPositions),
      constructorEqual: positions.constructor === clonedPositions.constructor,
      snapshotCloneEqual: JSON.stringify(before) === JSON.stringify(clonedSnapshot)
    }));
    expect(clonedSnapshot).toEqual(before);
    const entries = ir.semanticIndex.filter(entry => entry.batchId === "instances.window" || entry.batchId === "instances.window.glass");
    const windows = split.openings.filter(opening => opening.kind === "window");
    expect(entries).toHaveLength(windows.length * 2);
    expect(windows.length).toBeGreaterThan(0);
    if (fidelityMode === "kit") expect([...new Set(windows.map(opening => opening.facade))].sort()).toEqual(["front", "left", "rear", "right"]);
    for (const opening of windows) {
      const frame = entries.find(entry => entry.batchId === "instances.window" && entry.semanticPath === opening.semanticPath);
      const glass = entries.find(entry => entry.batchId === "instances.window.glass" && entry.semanticPath === opening.semanticPath + "/glass");
      expect(frame).toBeDefined(); expect(glass).toBeDefined();
      const fromFrame = resolveWindowSlotAddressFromSemanticPath(split, frame!.semanticPath);
      const fromGlass = resolveWindowSlotAddressFromSemanticPath(split, glass!.semanticPath);
      expect(fromFrame).toEqual(addressOf(opening));
      expect(fromGlass).toEqual(fromFrame);
      expect(BuildingWindowSlotAddressSchema.safeParse(fromFrame).success).toBe(true);
      expect(resolveWindowOpeningFromSlotAddress(split, fromFrame)).toEqual(opening);
    }
    expect(completeSnapshot({ split, ir })).toEqual(before);
    const vertexBytes = new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength);
    const originalByte = vertexBytes[0];
    try {
      vertexBytes[0] ^= 1;
      expect(completeSnapshot({ split, ir })).not.toEqual(before);
    } finally { vertexBytes[0] = originalByte; }
    expect(completeSnapshot({ split, ir })).toEqual(before);
  });

  it("preserves surviving addresses across real module/family changes, added floors and opening reordering", async () => {
    const original = await kitSplit();
    const spec = fixtureSpec();
    spec.familyId = "family-split-plan-expanded";
    spec.massing.floorCount += 1; spec.massing.floorHeightsM.push(3.2);
    const kit = structuredClone(late19cApartmentKit);
    for (const module of kit.modules) if (module.kind === "opening") module.id += ".p2-variant";
    const expanded = await kitSplit(spec, kit);
    const reordered = { ...expanded, openings: [...expanded.openings].reverse() };
    const survivors = original.openings.filter(opening => opening.kind === "window").flatMap(opening => {
      const next = expanded.openings.find(candidate => candidate.kind === "window" && candidate.facade === opening.facade &&
        candidate.floorIndex === opening.floorIndex && candidate.bayIndex === opening.bayIndex);
      return next ? [{ opening, next }] : [];
    });
    expect(survivors.length).toBeGreaterThan(0);
    expect(expanded.openings.some(opening => opening.floorIndex === 3)).toBe(true);
    expect(survivors.some(({ opening, next }) => opening.moduleId !== next.moduleId)).toBe(true);
    for (const { opening, next } of survivors) {
      const address = resolveWindowSlotAddressFromSemanticPath(original, opening.semanticPath);
      expect(resolveWindowSlotAddressFromSemanticPath(expanded, next.semanticPath + "/glass")).toEqual(address);
      expect(resolveWindowOpeningFromSlotAddress(reordered, address)).toEqual(next);
      expect(next.semanticPath).not.toBe(opening.semanticPath);
      expectTargetError(() => resolveWindowSlotAddressFromSemanticPath(expanded, opening.semanticPath), "building.windowSlot.unresolvedPath");
    }
  });

  it.each<WallFacadeName>(["front", "rear", "left", "right"])("uses the existing %s facade floor/bay cell coordinates", async facade => {
    const plan = await kitSplit();
    const windows = plan.openings.filter(opening => opening.kind === "window" && opening.facade === facade && opening.floorIndex === 1)
      .sort((a, b) => a.bayIndex - b.bayIndex);
    expect(windows.length).toBeGreaterThanOrEqual(2);
    const axis = facade === "front" || facade === "rear" ? 0 : 2;
    for (let index = 0; index < windows.length; index += 1) {
      const opening = windows[index];
      expect(resolveWindowSlotAddressFromSemanticPath(plan, opening.semanticPath)).toEqual(addressOf(opening));
      expect(addressOf(opening).floorIndex).toBe(1);
      if (index > 0) expect(opening.centerM[axis]).toBeGreaterThan(windows[index - 1].centerM[axis]);
    }
  });

  it("rejects malformed addresses through the runtime boundary without reading accessors", async () => {
    const plan = await kitSplit();
    const valid = addressOf(plan.openings.find(opening => opening.kind === "window")!);
    let reads = 0;
    const accessor = Object.defineProperty({ ...valid }, "bayIndex", { enumerable: true, get() { reads += 1; return 0; } });
    for (const address of [null, [], "front/0/0", { ...valid, schemaVersion: "0.2.0" }, { ...valid, facade: "south" },
      { ...valid, floorIndex: -1 }, { ...valid, bayIndex: 0.5 }, { ...valid, bayIndex: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, floorIndex: Number.NaN }, { ...valid, moduleId: "not-address-authority" }, accessor]) {
      expectTargetError(() => resolveWindowOpeningFromSlotAddress(plan, address), "building.windowSlot.invalidAddress");
    }
    expect(reads).toBe(0);
  });

  it("rejects doors, their transom paths, absent openings and plausible unmatched paths", async () => {
    const plan = await kitSplit();
    const door = plan.openings.find(opening => opening.kind === "door")!;
    const window = plan.openings.find(opening => opening.kind === "window")!;
    expect(door).toBeDefined(); expect(window).toBeDefined();
    for (const path of [door.semanticPath, door.semanticPath + "/transom-glass"]) {
      expectTargetError(() => resolveWindowSlotAddressFromSemanticPath(plan, path), "building.windowSlot.notWindow");
    }
    expectTargetError(() => resolveWindowOpeningFromSlotAddress(plan, addressOf(door)), "building.windowSlot.notWindow");
    const solid = plan.scopes.find(scope => !scope.opening)!;
    expect(solid).toBeDefined();
    expectTargetError(() => resolveWindowOpeningFromSlotAddress(plan, addressOf(solid)), "building.windowSlot.missingOpening");
    expectTargetError(() => resolveWindowOpeningFromSlotAddress(plan, { ...addressOf(window), floorIndex: 999 }), "building.windowSlot.missingOpening");
    for (const path of ["", window.semanticPath + "/glass/glass", window.semanticPath + "/transom-glass",
      window.semanticPath.replace(plan.familyId, "stale-family"), window.semanticPath + ".other-module"]) {
      expectTargetError(() => resolveWindowSlotAddressFromSemanticPath(plan, path), "building.windowSlot.unresolvedPath");
    }
  });

  it.each(["window", "door"] as const)("rejects a duplicate target cell even when the extra entry is a %s", async kind => {
    const plan = await kitSplit();
    const opening = plan.openings.find(entry => entry.kind === "window")!;
    plan.openings.push({ ...structuredClone(opening), kind, semanticPath: opening.semanticPath + "/different-entry" });
    expectTargetError(() => resolveWindowOpeningFromSlotAddress(plan, addressOf(opening)), "building.windowSlot.ambiguousTarget");
    expectTargetError(() => resolveWindowSlotAddressFromSemanticPath(plan, opening.semanticPath), "building.windowSlot.ambiguousTarget");
    expectTargetError(() => resolveWindowSlotAddressFromSemanticPath(plan, opening.semanticPath + "/glass"), "building.windowSlot.ambiguousTarget");
  });

  it.each(["base", "glass"] as const)("rejects cross-entry %s alias collisions in either lookup direction", async alias => {
    const plan = await kitSplit();
    const windows = plan.openings.filter(opening => opening.kind === "window");
    const first = windows[0], second = windows[1];
    second.semanticPath = first.semanticPath + (alias === "glass" ? "/glass" : "");
    if (alias === "glass") second.kind = "door";
    expectTargetError(() => resolveWindowSlotAddressFromSemanticPath(plan, first.semanticPath), "building.windowSlot.ambiguousTarget");
    expectTargetError(() => resolveWindowSlotAddressFromSemanticPath(plan, first.semanticPath + "/glass"), "building.windowSlot.ambiguousTarget");
    expectTargetError(() => resolveWindowOpeningFromSlotAddress(plan, addressOf(first)), "building.windowSlot.ambiguousTarget");
  });

  it("returns caller-owned values and leaves the complete plan, hash and geometry unchanged", async () => {
    const plan = await kitSplit();
    const original = structuredClone(plan), hash = await hashCanonicalJson(plan);
    const geometry = combinePrimitiveGeometry(wallPrimitivesFromSplitPlan(plan));
    const opening = plan.openings.find(entry => entry.kind === "window")!;
    const address = resolveWindowSlotAddressFromSemanticPath(plan, opening.semanticPath);
    const resolved = resolveWindowOpeningFromSlotAddress(plan, address);
    expect(resolved).not.toBe(opening);
    expect(resolved.centerM).not.toBe(opening.centerM); expect(resolved.sizeM).not.toBe(opening.sizeM);
    resolved.centerM[0] += 100; resolved.sizeM[1] = 0;
    resolved.semanticPath = "caller-only"; resolved.moduleId = "caller-module";
    address.floorIndex = 100;
    expect(resolveWindowSlotAddressFromSemanticPath(plan, opening.semanticPath)).toEqual(addressOf(opening));
    expect(resolveWindowOpeningFromSlotAddress(plan, addressOf(opening))).toEqual(opening);
    expect(plan).toEqual(original);
    expect(plan.contentHash).toBe(original.contentHash);
    expect(await hashCanonicalJson(plan)).toBe(hash);
    expect(combinePrimitiveGeometry(wallPrimitivesFromSplitPlan(plan))).toEqual(geometry);
  });
});


type P13FloorResult = import("../compiler/facadeSplitPlan").BuildingWindowFloorWidthOverrideResult;
const p13Request = (facade: WallFacadeName = "front", floorIndex = 1, widthM = 0.6) =>
  ({ schemaVersion: "0.1.0" as const, facade, floorIndex, widthM });
const p13Windows = (plan: FacadeSplitPlan, facade: WallFacadeName, floorIndex: number) =>
  plan.openings.filter(opening => opening.facade === facade && opening.floorIndex === floorIndex && opening.kind === "window")
    .sort((a, b) => a.bayIndex - b.bayIndex);

async function p13Expected(plan: FacadeSplitPlan, facade: WallFacadeName, floorIndex: number, widthM: number) {
  const expected = structuredClone(plan), keys = new Set(p13Windows(plan, facade, floorIndex).map(p3Key));
  expected.scopes = expected.scopes.map(scope => keys.has(p3Key(scope))
    ? { ...scope, opening: { ...scope.opening!, widthM } } : scope);
  expected.openings = expected.openings.map(opening => keys.has(p3Key(opening))
    ? { ...opening, sizeM: [widthM, opening.sizeM[1], opening.sizeM[2]] as [number, number, number] } : opening);
  await p3RefreshHash(expected);
  return expected;
}

describe("R3.P13 atomic floor-width split kernel", () => {
  let edit: (plan: FacadeSplitPlan, input: unknown) => Promise<P13FloorResult>;
  let plans: Record<P3Mode, FacadeSplitPlan>;
  beforeAll(async () => {
    edit = (await import("../compiler/facadeSplitPlan")).applyWindowFloorWidthOverride;
    plans = { kit: await p3Plan("kit"), "proof-front": await p3Plan("proof-front"), "proof-multifacade": await p3Plan("proof-multifacade") };
  });

  async function rejected(plan: FacadeSplitPlan, input: unknown, code: string) {
    const before = structuredClone(plan);
    const failure = await edit(plan, input).then(() => undefined, (error: unknown) => error);
    expect(failure).toBeInstanceOf(code.startsWith("building.windowSlot.") ? BuildingWindowSlotTargetError : BuildingWindowWidthOverrideError);
    expect(failure).toMatchObject({ code });
    expect(plan).toEqual(before);
  }

  it("narrows each real kit facade and mixed ground floor plus proof-front while preserving all unselected wall bytes and plan data", async () => {
    const targets: Array<{ mode: P3Mode; facade: WallFacadeName; floor: number }> = [
      ...(["front", "rear", "left", "right"] as const).map(facade => ({ mode: "kit" as const, facade, floor: 1 })),
      { mode: "kit", facade: "front", floor: 0 }, { mode: "proof-front", facade: "front", floor: 1 }
    ];
    for (const { mode, facade, floor } of targets) {
      const plan = plans[mode], before = structuredClone(plan), windows = p13Windows(plan, facade, floor), widthM = 0.23;
      expect(windows.length).toBeGreaterThan(0);
      expect(windows.every(opening => opening.sizeM[0] > widthM)).toBe(true);
      if (floor === 0) expect(plan.openings.some(opening => opening.facade === facade && opening.floorIndex === 0 && opening.kind === "door")).toBe(true);
      const geometryBefore = await p3ScopeGeometry(plan);
      const result = await edit(plan, p13Request(facade, floor, widthM));
      expect(result.schemaVersion).toBe("0.1.0");
      expect(result.directives).toEqual(windows.map(opening => ({ schemaVersion: "0.1.0", address: p3Address(opening), widthM })));
      expect(result.directives.every(directive => BuildingWindowWidthOverrideSchema.safeParse(directive).success)).toBe(true);
      expect(result.splitPlan).toEqual(await p13Expected(plan, facade, floor, widthM));
      expect(result.splitPlan.contentHash).not.toBe(plan.contentHash);
      expect(plan).toEqual(before);
      const changed = new Set(windows.map(p3Key)), geometryAfter = await p3ScopeGeometry(result.splitPlan);
      expect(geometryAfter.map(scope => scope.key)).toEqual(geometryBefore.map(scope => scope.key));
      for (let index = 0; index < geometryBefore.length; index++) {
        if (changed.has(geometryBefore[index].key)) expect(geometryAfter[index].hash).not.toBe(geometryBefore[index].hash);
        else expect(geometryAfter[index].hash).toBe(geometryBefore[index].hash);
      }
      for (const door of plan.openings.filter(opening => opening.kind === "door")) {
        expect(result.splitPlan.openings.find(opening => p3Key(opening) === p3Key(door))).toEqual(door);
      }
    }
  }, 20_000);

  it("sorts directives numerically while preserving supplied legacy scope/opening order and deterministic hash payload", async () => {
    const spec = fixtureSpec();
    spec.massing.widthM = 48; spec.facade.frontBayCount = 12;
    const plan = await buildFacadeSplitPlan({ spec, wallDepthM: 0.34, defaultOpeningMode: "front-only" });
    const windows = p13Windows(plan, "front", 1);
    expect(windows.map(opening => opening.bayIndex)).toEqual(Array.from({ length: 12 }, (_, index) => index));
    const request = p13Request("front", 1, 0.23);
    const first = await edit(plan, request), repeat = await edit(plan, structuredClone(request));
    expect(repeat).toEqual(first);
    expect(first.directives.map(directive => directive.address.bayIndex)).toEqual(Array.from({ length: 12 }, (_, index) => index));
    const reordered = structuredClone(plan);
    reordered.scopes.reverse(); reordered.openings.reverse();
    await p3RefreshHash(reordered);
    const result = await edit(reordered, request);
    expect(result.directives).toEqual(first.directives);
    expect(result.splitPlan.scopes.map(p3Key)).toEqual(reordered.scopes.map(p3Key));
    expect(result.splitPlan.openings.map(opening => opening.semanticPath)).toEqual(reordered.openings.map(opening => opening.semanticPath));
    expect(result.splitPlan).toEqual(await p13Expected(reordered, "front", 1, 0.23));
    expect(result.splitPlan.contentHash).not.toBe(first.splitPlan.contentHash);
  });

  it("returns an owned literal no-op and omits only validated equal-width members from mixed results", async () => {
    const plan = plans["proof-front"], windows = p13Windows(plan, "front", 1), widthM = windows[0].sizeM[0];
    expect(new Set(windows.map(opening => opening.sizeM[0])).size).toBe(1);
    const result = await edit(plan, p13Request("front", 1, widthM));
    expect(result).toEqual({ schemaVersion: "0.1.0", directives: [], splitPlan: plan });
    expect(result.splitPlan).not.toBe(plan);
    expect(result.splitPlan.scopes).not.toBe(plan.scopes); expect(result.splitPlan.openings).not.toBe(plan.openings);
    expect(result.splitPlan.contentHash).toBe(p3Goldens["proof-front"].split);
    expect(await p3GeometryHash(wallPrimitivesFromSplitPlan(result.splitPlan))).toBe(p3Goldens["proof-front"].geometry);
    const original = structuredClone(plan);
    result.splitPlan.openings[0].centerM[0] += 200;
    expect(plan).toEqual(original);

    const mixed = structuredClone(plan), first = p13Windows(mixed, "front", 1)[0];
    const scope = mixed.scopes.find(entry => p3Key(entry) === p3Key(first))!;
    first.sizeM[0] = 0.6; scope.opening!.widthM = 0.6;
    await p3RefreshHash(mixed);
    const changed = await edit(mixed, p13Request());
    expect(changed.directives).toEqual(p13Windows(mixed, "front", 1).filter(opening => opening.sizeM[0] !== 0.6)
      .map(opening => ({ schemaVersion: "0.1.0", address: p3Address(opening), widthM: 0.6 })));
    expect(changed.splitPlan).toEqual(await p13Expected(mixed, "front", 1, 0.6));
    expect(changed.splitPlan.openings.find(opening => p3Key(opening) === p3Key(first))).toEqual(first);
    expect(changed.splitPlan.scopes.find(entry => p3Key(entry) === p3Key(first))).toEqual(scope);
  });

  it("rejects an invalid last selected member atomically and enforces binder floors, widening and both pier limits", async () => {
    const base = plans["proof-front"], plan = structuredClone(base), windows = p13Windows(plan, "front", 1), last = windows.at(-1)!;
    expect(windows.length).toBeGreaterThan(1);
    const scope = plan.scopes.find(entry => p3Key(entry) === p3Key(last))!;
    last.sizeM[0] = 0.5; scope.opening!.widthM = 0.5;
    expect(windows.slice(0, -1).every(opening => opening.sizeM[0] > 0.6)).toBe(true);
    await p3RefreshHash(plan);
    const geometry = await p3GeometryHash(wallPrimitivesFromSplitPlan(plan));
    await rejected(plan, p13Request(), "building.windowWidth.unsupportedWidth");
    expect(await p3GeometryHash(wallPrimitivesFromSplitPlan(plan))).toBe(geometry);
    for (const widthM of [0.2, 0.23 - 1e-12, p13Windows(base, "front", 1)[0].sizeM[0] + 0.01]) {
      await rejected(base, p13Request("front", 1, widthM), "building.windowWidth.unsupportedWidth");
    }
    for (const edge of ["min", "max"] as const) {
      const pier = structuredClone(base), opening = p13Windows(pier, "front", 1).at(-1)!;
      const wall = pier.scopes.find(entry => p3Key(entry) === p3Key(opening))!;
      const center = edge === "min" ? wall.originM[0] + 0.3 + 0.079 : wall.originM[0] + wall.sizeM[0] - 0.3 - 0.079;
      wall.opening!.centerAlongM = center; opening.centerM[0] = center;
      await p3RefreshHash(pier);
      await rejected(pier, p13Request(), "building.windowWidth.unsupportedWidth");
    }
  });

  it("validates equal-width members before omission including selected dimensions omitted from the legacy hash", async () => {
    for (const kind of ["depth", "zone", "height", "center", "hash", "binder-floor"] as const) {
      const plan = structuredClone(plans["proof-front"]), windows = p13Windows(plan, "front", 1), selected = windows.at(-1)!;
      const scope = plan.scopes.find(entry => p3Key(entry) === p3Key(selected))!;
      let widthM = selected.sizeM[0], code = "building.windowWidth.incoherentPlan";
      if (kind === "depth") {
        scope.sizeM[2] += 0.1;
        selected.sizeM[2] = scope.sizeM[2] * 0.55;
        selected.centerM[2] = scope.originM[2];
      }
      if (kind === "zone") scope.zone = "ground";
      if (kind === "height") selected.sizeM[1] += 0.1;
      if (kind === "center") selected.centerM[1] += 0.1;
      if (kind === "binder-floor") {
        widthM = 0.2; code = "building.windowWidth.unsupportedWidth";
        for (const opening of windows) {
          opening.sizeM[0] = widthM;
          plan.scopes.find(entry => p3Key(entry) === p3Key(opening))!.opening!.widthM = widthM;
        }
      }
      await p3RefreshHash(plan);
      if (kind === "hash") plan.contentHash = "0".repeat(64);
      await rejected(plan, p13Request("front", 1, widthM), code);
    }
  });

  it("discovers the scope/placement union and rejects missing, ghost, duplicate, colliding or malformed selected-floor joins", async () => {
    const variants = [
      ["missing-placement", "building.windowSlot.missingOpening"], ["missing-scope", "building.windowWidth.missingScope"],
      ["missing-scope-opening", "building.windowWidth.incoherentPlan"], ["duplicate-placement", "building.windowSlot.ambiguousTarget"],
      ["duplicate-placement-door", "building.windowSlot.ambiguousTarget"], ["duplicate-scope", "building.windowWidth.ambiguousScope"],
      ["duplicate-scope-door", "building.windowWidth.ambiguousScope"], ["placement-door", "building.windowSlot.notWindow"],
      ["scope-door", "building.windowWidth.incoherentPlan"], ["missing-kind", "building.windowWidth.incoherentPlan"],
      ["undefined-placement-kind", "building.windowWidth.incoherentPlan"], ["unknown-placement-kind", "building.windowWidth.incoherentPlan"],
      ["unknown-scope-kind", "building.windowWidth.incoherentPlan"],
      ["ghost-scope", "building.windowSlot.missingOpening"], ["ghost-placement", "building.windowWidth.missingScope"],
      ["path-alias", "building.windowSlot.ambiguousTarget"]
    ] as const;
    for (const [kind, code] of variants) {
      const plan = structuredClone(plans.kit), windows = p13Windows(plan, "front", 1), opening = windows[0];
      const index = plan.scopes.findIndex(scope => p3Key(scope) === p3Key(opening)), scope = plan.scopes[index];
      if (kind === "missing-placement") plan.openings.splice(plan.openings.indexOf(opening), 1);
      if (kind === "missing-scope") plan.scopes.splice(index, 1);
      if (kind === "missing-scope-opening") scope.opening = undefined;
      if (kind === "duplicate-placement" || kind === "duplicate-placement-door") plan.openings.push({
        ...structuredClone(opening), kind: kind === "duplicate-placement-door" ? "door" : "window", semanticPath: opening.semanticPath + "/extra-entry"
      });
      if (kind === "duplicate-scope" || kind === "duplicate-scope-door") {
        const duplicate = structuredClone(scope);
        if (kind === "duplicate-scope-door") duplicate.opening!.kind = "door";
        plan.scopes.push(duplicate);
      }
      if (kind === "placement-door") opening.kind = "door";
      if (kind === "scope-door") scope.opening!.kind = "door";
      if (kind === "missing-kind") Reflect.deleteProperty(opening, "kind");
      if (kind === "undefined-placement-kind") Object.assign(opening, { kind: undefined });
      if (kind === "unknown-placement-kind") Object.assign(opening, { kind: "unknown" });
      if (kind === "unknown-scope-kind") Object.assign(scope.opening!, { kind: "unknown" });
      if (kind === "ghost-scope") plan.scopes.push({ ...structuredClone(scope), bayIndex: 999 });
      if (kind === "ghost-placement") plan.openings.push({ ...structuredClone(opening), bayIndex: 999, semanticPath: opening.semanticPath + "/ghost" });
      if (kind === "path-alias") windows[1].semanticPath = opening.semanticPath + "/glass";
      await p3RefreshHash(plan);
      await rejected(plan, p13Request(), code);
    }
  });

  it("uses omitted scope kinds as windows, excludes valid doors, and rejects an actually empty window floor", async () => {
    for (const mode of ["omitted", "undefined"] as const) {
      const plan = structuredClone(plans["proof-multifacade"]);
      for (const scope of plan.scopes.filter(entry => entry.facade === "right" && entry.floorIndex === 1 && entry.opening)) {
        if (mode === "omitted") Reflect.deleteProperty(scope.opening!, "kind");
        else scope.opening!.kind = undefined;
      }
      await p3RefreshHash(plan);
      const result = await edit(plan, p13Request("right", 1));
      expect(result.directives.length).toBe(p13Windows(plan, "right", 1).length);
      expect(result.splitPlan).toEqual(await p13Expected(plan, "right", 1, 0.6));
    }
    for (const request of [p13Request("front", 999), p13Request("rear", 1)]) await rejected(plans["proof-front"], request, "building.windowWidth.missingScope");
    const onlyDoors = structuredClone(plans.kit), removed = new Set(p13Windows(onlyDoors, "front", 0).map(p3Key));
    onlyDoors.openings = onlyDoors.openings.filter(opening => !removed.has(p3Key(opening)));
    onlyDoors.scopes = onlyDoors.scopes.map(scope => removed.has(p3Key(scope)) ? { ...scope, opening: undefined } : scope);
    expect(onlyDoors.openings.some(opening => opening.facade === "front" && opening.floorIndex === 0 && opening.kind === "door")).toBe(true);
    await p3RefreshHash(onlyDoors);
    await rejected(onlyDoors, p13Request("front", 0), "building.windowWidth.missingScope");
  });

  it("detaches legal shared opening records and size arrays while retaining unselected aliases and data", async () => {
    const plan = structuredClone(plans["proof-multifacade"]), front = p13Windows(plan, "front", 1)[0], rear = p13Windows(plan, "rear", 1)[0];
    const frontScope = plan.scopes.find(scope => p3Key(scope) === p3Key(front))!, rearScope = plan.scopes.find(scope => p3Key(scope) === p3Key(rear))!;
    expect(frontScope.opening).toEqual(rearScope.opening); expect(front.sizeM).toEqual(rear.sizeM);
    rearScope.opening = frontScope.opening; rear.sizeM = front.sizeM;
    await p3RefreshHash(plan);
    const before = structuredClone(plan), result = await edit(plan, p13Request());
    expect(result.splitPlan).toEqual(await p13Expected(plan, "front", 1, 0.6));
    expect(result.splitPlan.scopes.find(scope => p3Key(scope) === p3Key(rear))).toEqual(before.scopes.find(scope => p3Key(scope) === p3Key(rear)));
    expect(result.splitPlan.openings.find(opening => p3Key(opening) === p3Key(rear))).toEqual(rear);
    expect(result.splitPlan.openings.find(opening => p3Key(opening) === p3Key(front))!.sizeM).not.toBe(result.splitPlan.openings.find(opening => p3Key(opening) === p3Key(rear))!.sizeM);
    expect(plan).toEqual(before); expect(front.sizeM).toBe(rear.sizeM); expect(frontScope.opening).toBe(rearScope.opening);
    result.directives[0].address.bayIndex = 999;
    result.splitPlan.openings[0].centerM[0] += 100;
    expect(plan).toEqual(before);
  });

  it("owns the complete plan and directive before its first await without freezing callers or authenticating unselected scope coherence", async () => {
    const plan = structuredClone(plans.kit), request = p13Request(), expected = await edit(structuredClone(plan), structuredClone(request));
    const pending = edit(plan, request);
    request.widthM = 99; request.floorIndex = 999; request.facade = "right";
    plan.familyId = "late-family"; plan.contentHash = "late-hash";
    plan.openings[0].centerM[0] += 200; plan.openings[0].sizeM[0] = 100;
    plan.scopes.at(-1)!.originM[0] += 300; plan.scopes.reverse();
    expect(await pending).toEqual(expected);
    expect(Object.isFrozen(plan)).toBe(false); expect(Object.isFrozen(request)).toBe(false);
    expect(Object.isFrozen(plan.scopes)).toBe(false); expect(Object.isFrozen(plan.openings[0].centerM)).toBe(false);

    const limited = structuredClone(plans.kit), unselected = p13Windows(limited, "rear", 2)[0];
    expect(unselected).toBeDefined();
    unselected.centerM[1] += 0.1;
    await p3RefreshHash(limited);
    const result = await edit(limited, p13Request());
    expect(result.splitPlan).toEqual(await p13Expected(limited, "front", 1, 0.6));
    expect(result.splitPlan.openings.find(opening => p3Key(opening) === p3Key(unselected))).toEqual(unselected);
  });

  it("rejects malformed floor requests and unsafe whole-plan data without invoking accessors", async () => {
    const { BuildingWindowFloorWidthOverrideSchema } = await import("../contracts/buildingDocument");
    const valid = p13Request();
    expect(BuildingWindowFloorWidthOverrideSchema.parse(valid)).toEqual(valid);
    let reads = 0;
    const accessor = Object.defineProperty({ ...valid }, "widthM", { enumerable: true, get() { reads += 1; return 0.6; } });
    const inherited = Object.create(valid) as unknown;
    for (const input of [null, [], "front/1", { ...valid, schemaVersion: "0.2.0" }, { ...valid, facade: "south" },
      { ...valid, floorIndex: -1 }, { ...valid, floorIndex: 0.5 }, { ...valid, floorIndex: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, floorIndex: Number.NaN }, { ...valid, widthM: 0 }, { ...valid, widthM: -1 }, { ...valid, widthM: Infinity },
      { ...valid, widthM: Number.NaN }, { ...valid, widthM: "0.6" }, { ...valid, extra: undefined }, inherited, accessor]) {
      expect(BuildingWindowFloorWidthOverrideSchema.safeParse(input).success).toBe(false);
      await rejected(plans.kit, input, "building.windowWidth.invalidDirective");
    }
    expect(reads).toBe(0);
    for (const kind of ["accessor", "sparse", "array-extra", "nonplain"] as const) {
      const plan = structuredClone(plans.kit);
      if (kind === "accessor") Object.defineProperty(plan.scopes.at(-1)!, "opening", { enumerable: true, get() { reads += 1; return undefined; } });
      if (kind === "sparse") Reflect.deleteProperty(plan.scopes, "0");
      if (kind === "array-extra") Object.assign(plan.openings, { unrecognized: true });
      if (kind === "nonplain") Object.setPrototypeOf(plan.openings[0], { injected: true });
      const failure = await edit(plan, valid).then(() => undefined, (error: unknown) => error);
      expect(failure).toBeInstanceOf(BuildingWindowWidthOverrideError);
      expect(failure).toMatchObject({ code: "building.windowWidth.incoherentPlan" });
      expect(reads).toBe(0);
    }
  });
});

type P17BayResult = import("../compiler/facadeSplitPlan").BuildingWindowBayWidthOverrideResult;
const p17Request = (facade: WallFacadeName = "front", bayIndex = 2, widthM = 0.6) =>
  ({ schemaVersion: "0.1.0" as const, facade, bayIndex, widthM });
const p17Windows = (plan: FacadeSplitPlan, facade: WallFacadeName, bayIndex: number) =>
  plan.openings.filter(opening => opening.facade === facade && opening.bayIndex === bayIndex && opening.kind === "window")
    .sort((a, b) => a.floorIndex - b.floorIndex);
async function p17Expected(plan: FacadeSplitPlan, facade: WallFacadeName, bayIndex: number, widthM: number) {
  const expected = structuredClone(plan), keys = new Set(p17Windows(plan, facade, bayIndex).map(p3Key));
  expected.scopes = expected.scopes.map(scope => keys.has(p3Key(scope))
    ? { ...scope, opening: { ...scope.opening!, widthM } } : scope);
  expected.openings = expected.openings.map(opening => keys.has(p3Key(opening))
    ? { ...opening, sizeM: [widthM, opening.sizeM[1], opening.sizeM[2]] as [number, number, number] } : opening);
  await p3RefreshHash(expected);
  return expected;
}

describe("R3.P17 atomic matching-bay split kernel", () => {
  let edit: (plan: FacadeSplitPlan, input: unknown) => Promise<P17BayResult>;
  let plans: Record<P3Mode, FacadeSplitPlan>;
  beforeAll(async () => {
    edit = (await import("../compiler/facadeSplitPlan")).applyWindowBayWidthOverride;
    plans = { kit: await p3Plan("kit"), "proof-front": await p3Plan("proof-front"), "proof-multifacade": await p3Plan("proof-multifacade") };
  });
  async function rejected(plan: FacadeSplitPlan, input: unknown, code: string) {
    const before = structuredClone(plan);
    const failure = await edit(plan, input).then(() => undefined, (error: unknown) => error);
    expect(failure).toBeInstanceOf(code.startsWith("building.windowSlot.") ? BuildingWindowSlotTargetError : BuildingWindowWidthOverrideError);
    expect(failure).toMatchObject({ code });
    expect(plan).toEqual(before);
  }

  it("narrows actual vertical stacks on one facade and preserves every outside scope, opening and door", async () => {
    const targets = [
      ...(["front", "rear", "left", "right"] as const).map(facade => ({ mode: "kit" as P3Mode, facade })),
      { mode: "proof-front" as P3Mode, facade: "front" as const },
      { mode: "proof-multifacade" as P3Mode, facade: "right" as const }
    ];
    for (const { mode, facade } of targets) {
      let plan = plans[mode];
      if (mode === "proof-multifacade") {
        // Alternating side bays need four body floors to provide real multi-window stacks.
        const spec = fixtureSpec();
        spec.massing.floorCount = 5; spec.massing.floorHeightsM = [4.2, 3.2, 3.2, 3.2, 3.2];
        plan = await buildFacadeSplitPlan({ spec, wallDepthM: 0.34, defaultOpeningMode: "multi-facade" });
      }
      const before = structuredClone(plan);
      const bay = [...new Set(plan.openings.filter(opening => opening.facade === facade).map(opening => opening.bayIndex))]
        .find(index => p17Windows(plan, facade, index).length >= 2);
      expect(bay).toBeDefined();
      const windows = p17Windows(plan, facade, bay!), geometryBefore = await p3ScopeGeometry(plan), widthM = 0.23;
      const result = await edit(plan, p17Request(facade, bay!, widthM));
      expect(result.schemaVersion).toBe("0.1.0");
      expect(result.directives).toEqual(windows.map(opening => ({ schemaVersion: "0.1.0", address: p3Address(opening), widthM })));
      expect(result.directives.every(directive => BuildingWindowWidthOverrideSchema.safeParse(directive).success)).toBe(true);
      expect(result.splitPlan).toEqual(await p17Expected(plan, facade, bay!, widthM));
      expect(plan).toEqual(before);
      const keys = new Set(windows.map(p3Key)), geometryAfter = await p3ScopeGeometry(result.splitPlan);
      expect(geometryAfter.map(scope => scope.key)).toEqual(geometryBefore.map(scope => scope.key));
      for (let index = 0; index < geometryBefore.length; index++) {
        if (keys.has(geometryBefore[index].key)) expect(geometryAfter[index].hash).not.toBe(geometryBefore[index].hash);
        else expect(geometryAfter[index].hash).toBe(geometryBefore[index].hash);
      }
      for (const opening of plan.openings.filter(opening => !keys.has(p3Key(opening)))) {
        expect(result.splitPlan.openings.find(entry => p3Key(entry) === p3Key(opening))).toEqual(opening);
      }
    }
  }, 20_000);

  it("feeds the existing batch compiler with the exact independently targeted set for kit and proof at high and low detail", async () => {
    for (const fidelityMode of ["kit", "proof"] as const) {
      const spec = fixtureSpec(), atlas = await planAtlas(spec, { widthPx: 128, heightPx: 128, paddingPx: 4 });
      const catalog = await buildComponentCatalog(spec, atlas.manifest), graph = await buildBuildingGraph(spec, catalog, { fidelityMode });
      const facadePlan = fidelityMode === "kit" ? planFacadeModules({ spec, kit: late19cApartmentKit }) : undefined;
      const wallDepthM = Math.max(0.02, catalog.recipes.find(recipe => recipe.role === "wall")!.dimensionsM.depth);
      const split = await buildFacadeSplitPlan({ spec, wallDepthM, facadePlan, kit: facadePlan ? late19cApartmentKit : undefined });
      const bay = [...new Set(split.openings.filter(opening => opening.facade === "front").map(opening => opening.bayIndex))]
        .find(index => p17Windows(split, "front", index).length >= 2);
      expect(bay).toBeDefined();
      const before = await hashCanonicalJson({ spec, catalog, graph, split, manifest: atlas.manifest });
      const result = await edit(split, p17Request("front", bay!, 0.6));
      const manual = p17Windows(split, "front", bay!).map(opening => ({ schemaVersion: "0.1.0" as const, address: p3Address(opening), widthM: 0.6 }));
      expect(result.directives).toEqual(manual);
      expect(result.splitPlan).toEqual(await p17Expected(split, "front", bay!, 0.6));
      for (const detailLevel of ["high", "low"] as const) {
        const args = { spec, catalog, graph, fidelityMode, facadePlan, detailLevel };
        const actual = await compileBuilding({ ...args, windowWidthBatch: { schemaVersion: "0.1.0", directives: result.directives } });
        const expected = await compileBuilding({ ...args, windowWidthBatch: { schemaVersion: "0.1.0", directives: manual } });
        expect(actual).toEqual(expected);
        const legacySourceGraphHash = await hashCanonicalJson(detailLevel === "high" ? graph : { graph, detailLevel });
        expect(actual.sourceGraphHash).toBe(await hashCanonicalJson({
          schemaVersion: "0.1.0", kind: "building-window-width-compile", legacySourceGraphHash,
          fidelityMode, splitContentHash: result.splitPlan.contentHash
        }));
      }
      expect(await hashCanonicalJson({ spec, catalog, graph, split, manifest: atlas.manifest })).toBe(before);
    }
  }, 30_000);

  it("sorts floor 1, 2 and 10 numerically while preserving the supplied legacy collections and deterministic hash", async () => {
    const spec = fixtureSpec();
    spec.massing.floorCount = 12; spec.massing.floorHeightsM = [4.2, ...Array.from({ length: 11 }, () => 3.2)];
    const plan = await buildFacadeSplitPlan({ spec, wallDepthM: 0.34, defaultOpeningMode: "front-only" });
    expect(p17Windows(plan, "front", 2).map(opening => opening.floorIndex)).toEqual(Array.from({ length: 11 }, (_, index) => index + 1));
    const request = p17Request("front", 2, 0.23), first = await edit(plan, request);
    expect(first.directives.map(directive => directive.address.floorIndex)).toEqual(Array.from({ length: 11 }, (_, index) => index + 1));
    expect(await edit(plan, structuredClone(request))).toEqual(first);
    const reversed = structuredClone(plan); reversed.scopes.reverse(); reversed.openings.reverse(); await p3RefreshHash(reversed);
    const result = await edit(reversed, request);
    expect(result.directives).toEqual(first.directives);
    expect(result.splitPlan.scopes.map(p3Key)).toEqual(reversed.scopes.map(p3Key));
    expect(result.splitPlan.openings.map(opening => opening.semanticPath)).toEqual(reversed.openings.map(opening => opening.semanticPath));
    expect(result.splitPlan).toEqual(await p17Expected(reversed, "front", 2, 0.23));
    expect(result.splitPlan.contentHash).not.toBe(first.splitPlan.contentHash);
  });

  it("returns a detached literal no-op and omits only validated equal-width members of a mixed stack", async () => {
    const plan = plans["proof-front"], windows = p17Windows(plan, "front", 2), widthM = windows[0].sizeM[0];
    expect(windows.length).toBeGreaterThan(1); expect(new Set(windows.map(opening => opening.sizeM[0])).size).toBe(1);
    const result = await edit(plan, p17Request("front", 2, widthM));
    expect(result).toEqual({ schemaVersion: "0.1.0", directives: [], splitPlan: plan });
    expect(result.splitPlan).not.toBe(plan); expect(result.splitPlan.scopes).not.toBe(plan.scopes);
    expect(result.splitPlan.openings).not.toBe(plan.openings); expect(result.splitPlan.contentHash).toBe(p3Goldens["proof-front"].split);
    expect(await p3GeometryHash(wallPrimitivesFromSplitPlan(result.splitPlan))).toBe(p3Goldens["proof-front"].geometry);
    const before = structuredClone(plan); result.splitPlan.openings[0].centerM[0] += 200; expect(plan).toEqual(before);
    const mixed = structuredClone(plan), first = p17Windows(mixed, "front", 2)[0];
    first.sizeM[0] = 0.6; mixed.scopes.find(scope => p3Key(scope) === p3Key(first))!.opening!.widthM = 0.6;
    await p3RefreshHash(mixed);
    const changed = await edit(mixed, p17Request());
    expect(changed.directives).toEqual(p17Windows(mixed, "front", 2).filter(opening => opening.sizeM[0] !== 0.6)
      .map(opening => ({ schemaVersion: "0.1.0", address: p3Address(opening), widthM: 0.6 })));
    expect(changed.splitPlan).toEqual(await p17Expected(mixed, "front", 2, 0.6));
  });

  it("rejects actual later narrower members and a coherent last-member failure without partial output or caller mutation", async () => {
    const stacks = [...new Set(plans.kit.openings.filter(opening => opening.facade === "front").map(opening => opening.bayIndex))]
      .map(bay => p17Windows(plans.kit, "front", bay));
    const natural = stacks.find(windows => windows.length > 1 && windows[0].floorIndex === 0 &&
      windows.slice(1).some(opening => opening.sizeM[0] < windows[0].sizeM[0]));
    expect(natural).toBeDefined();
    const widthM = (natural![0].sizeM[0] + Math.min(...natural!.slice(1).map(opening => opening.sizeM[0]))) / 2;
    const firstInvalid = natural!.findIndex(opening => opening.sizeM[0] < widthM);
    expect(firstInvalid).toBeGreaterThan(0);
    for (const opening of natural!.slice(0, firstInvalid)) {
      const valid = await applyWindowWidthOverride(plans.kit, { schemaVersion: "0.1.0", address: p3Address(opening), widthM });
      expect(resolveWindowOpeningFromSlotAddress(valid, p3Address(opening)).sizeM[0]).toBe(widthM);
    }
    await rejected(plans.kit, p17Request("front", natural![0].bayIndex, widthM), "building.windowWidth.unsupportedWidth");

    const base = plans["proof-front"], plan = structuredClone(base), windows = p17Windows(plan, "front", 2), last = windows.at(-1)!;
    expect(windows.length).toBeGreaterThan(1);
    last.sizeM[0] = 0.5; plan.scopes.find(scope => p3Key(scope) === p3Key(last))!.opening!.widthM = 0.5;
    await p3RefreshHash(plan);
    for (const opening of windows.slice(0, -1)) {
      expect(opening.sizeM[0]).toBeGreaterThan(0.6);
      await applyWindowWidthOverride(plan, { schemaVersion: "0.1.0", address: p3Address(opening), widthM: 0.6 });
    }
    const geometry = await p3GeometryHash(wallPrimitivesFromSplitPlan(plan));
    await rejected(plan, p17Request(), "building.windowWidth.unsupportedWidth");
    expect(await p3GeometryHash(wallPrimitivesFromSplitPlan(plan))).toBe(geometry);
    for (const width of [0.2, 0.23 - 1e-12, p17Windows(base, "front", 2)[0].sizeM[0] + 0.01]) {
      await rejected(base, p17Request("front", 2, width), "building.windowWidth.unsupportedWidth");
    }
    for (const edge of ["min", "max"] as const) {
      const pier = structuredClone(base), opening = p17Windows(pier, "front", 2).at(-1)!;
      const wall = pier.scopes.find(scope => p3Key(scope) === p3Key(opening))!;
      const center = edge === "min" ? wall.originM[0] + 0.3 + 0.079 : wall.originM[0] + wall.sizeM[0] - 0.3 - 0.079;
      wall.opening!.centerAlongM = center; opening.centerM[0] = center; await p3RefreshHash(pier);
      await rejected(pier, p17Request(), "building.windowWidth.unsupportedWidth");
    }
  });

  it("validates equal-width members including incoherent dimensions omitted from the legacy hash before omission", async () => {
    for (const kind of ["depth", "zone", "height", "center", "hash", "binder-floor"] as const) {
      const plan = structuredClone(plans["proof-front"]), windows = p17Windows(plan, "front", 2), selected = windows.at(-1)!;
      const scope = plan.scopes.find(entry => p3Key(entry) === p3Key(selected))!;
      let widthM = selected.sizeM[0], code = "building.windowWidth.incoherentPlan";
      if (kind === "depth") {
        scope.sizeM[2] += 0.1; selected.sizeM[2] = scope.sizeM[2] * 0.55; selected.centerM[2] = scope.originM[2];
      }
      if (kind === "zone") scope.zone = "ground";
      if (kind === "height") selected.sizeM[1] += 0.1;
      if (kind === "center") selected.centerM[1] += 0.1;
      if (kind === "binder-floor") {
        widthM = 0.2; code = "building.windowWidth.unsupportedWidth";
        for (const opening of windows) {
          opening.sizeM[0] = widthM; plan.scopes.find(entry => p3Key(entry) === p3Key(opening))!.opening!.widthM = widthM;
        }
      }
      await p3RefreshHash(plan); if (kind === "hash") plan.contentHash = "0".repeat(64);
      await rejected(plan, p17Request("front", 2, widthM), code);
    }
  });

  it("discovers both collections and rejects selected-bay ghosts, duplicate joins, kind conflicts and semantic aliases", async () => {
    const variants = [
      ["missing-placement", "building.windowSlot.missingOpening"], ["missing-scope", "building.windowWidth.missingScope"],
      ["missing-scope-opening", "building.windowWidth.incoherentPlan"], ["duplicate-placement", "building.windowSlot.ambiguousTarget"],
      ["duplicate-placement-door", "building.windowSlot.ambiguousTarget"], ["duplicate-scope", "building.windowWidth.ambiguousScope"],
      ["duplicate-scope-door", "building.windowWidth.ambiguousScope"], ["placement-door", "building.windowSlot.notWindow"],
      ["scope-door", "building.windowWidth.incoherentPlan"], ["missing-kind", "building.windowWidth.incoherentPlan"],
      ["undefined-placement-kind", "building.windowWidth.incoherentPlan"], ["unknown-placement-kind", "building.windowWidth.incoherentPlan"],
      ["unknown-scope-kind", "building.windowWidth.incoherentPlan"], ["invalid-placement-floor", "building.windowWidth.incoherentPlan"],
      ["invalid-scope-floor", "building.windowWidth.incoherentPlan"], ["ghost-scope", "building.windowSlot.missingOpening"],
      ["ghost-placement", "building.windowWidth.missingScope"], ["path-alias", "building.windowSlot.ambiguousTarget"]
    ] as const;
    for (const [kind, code] of variants) {
      const plan = structuredClone(plans["proof-front"]), windows = p17Windows(plan, "front", 2), opening = windows[0];
      const index = plan.scopes.findIndex(scope => p3Key(scope) === p3Key(opening)), scope = plan.scopes[index];
      if (kind === "missing-placement") plan.openings.splice(plan.openings.indexOf(opening), 1);
      if (kind === "missing-scope") plan.scopes.splice(index, 1);
      if (kind === "missing-scope-opening") scope.opening = undefined;
      if (kind === "duplicate-placement" || kind === "duplicate-placement-door") plan.openings.push({
        ...structuredClone(opening), kind: kind === "duplicate-placement-door" ? "door" : "window", semanticPath: opening.semanticPath + "/extra"
      });
      if (kind === "duplicate-scope" || kind === "duplicate-scope-door") {
        const duplicate = structuredClone(scope); if (kind === "duplicate-scope-door") duplicate.opening!.kind = "door";
        plan.scopes.push(duplicate);
      }
      if (kind === "placement-door") opening.kind = "door";
      if (kind === "scope-door") scope.opening!.kind = "door";
      if (kind === "missing-kind") Reflect.deleteProperty(opening, "kind");
      if (kind === "undefined-placement-kind") Object.assign(opening, { kind: undefined });
      if (kind === "unknown-placement-kind") Object.assign(opening, { kind: "unknown" });
      if (kind === "unknown-scope-kind") Object.assign(scope.opening!, { kind: "unknown" });
      if (kind === "invalid-placement-floor") opening.floorIndex = -1;
      if (kind === "invalid-scope-floor") scope.floorIndex = -1;
      if (kind === "ghost-scope") plan.scopes.push({ ...structuredClone(scope), floorIndex: 999 });
      if (kind === "ghost-placement") plan.openings.push({ ...structuredClone(opening), floorIndex: 999, semanticPath: opening.semanticPath + "/ghost" });
      if (kind === "path-alias") windows[1].semanticPath = opening.semanticPath + "/glass";
      await p3RefreshHash(plan); await rejected(plan, p17Request(), code);
    }
  });

  it("accepts omitted scope window kinds, skips actual ground doors and rejects missing or door-only stacks", async () => {
    for (const mode of ["omitted", "undefined"] as const) {
      const plan = structuredClone(plans["proof-multifacade"]);
      for (const scope of plan.scopes.filter(entry => entry.facade === "right" && entry.bayIndex === 2 && entry.opening)) {
        if (mode === "omitted") Reflect.deleteProperty(scope.opening!, "kind"); else scope.opening!.kind = undefined;
      }
      await p3RefreshHash(plan);
      const result = await edit(plan, p17Request("right", 2));
      expect(result.directives.length).toBe(p17Windows(plan, "right", 2).length);
      expect(result.splitPlan).toEqual(await p17Expected(plan, "right", 2, 0.6));
    }
    for (const request of [p17Request("front", 999), p17Request("rear", 2)]) {
      await rejected(plans["proof-front"], request, "building.windowWidth.missingScope");
    }
    const plan = plans["proof-front"], door = plan.openings.find(opening => opening.facade === "front" && opening.bayIndex === 2 && opening.kind === "door");
    expect(door).toBeDefined();
    const result = await edit(plan, p17Request());
    expect(result.splitPlan.openings.find(opening => p3Key(opening) === p3Key(door!))).toEqual(door);
    expect(result.directives.every(directive => directive.address.floorIndex !== 0)).toBe(true);
    const onlyDoors = structuredClone(plan), removed = new Set(p17Windows(onlyDoors, "front", 2).map(p3Key));
    onlyDoors.openings = onlyDoors.openings.filter(opening => !removed.has(p3Key(opening)));
    onlyDoors.scopes = onlyDoors.scopes.map(scope => removed.has(p3Key(scope)) ? { ...scope, opening: undefined } : scope);
    await p3RefreshHash(onlyDoors);
    await rejected(onlyDoors, p17Request(), "building.windowWidth.missingScope");
  });

  it("detaches legal shared selected records and arrays from unselected rear aliases and owns the output", async () => {
    const plan = structuredClone(plans["proof-multifacade"]), front = p17Windows(plan, "front", 2).find(opening => opening.floorIndex === 1)!;
    const rear = p17Windows(plan, "rear", 2).find(opening => opening.floorIndex === 1)!;
    const frontScope = plan.scopes.find(scope => p3Key(scope) === p3Key(front))!, rearScope = plan.scopes.find(scope => p3Key(scope) === p3Key(rear))!;
    expect(frontScope.opening).toEqual(rearScope.opening); expect(front.sizeM).toEqual(rear.sizeM);
    rearScope.opening = frontScope.opening; rear.sizeM = front.sizeM; await p3RefreshHash(plan);
    const before = structuredClone(plan), result = await edit(plan, p17Request());
    expect(result.splitPlan).toEqual(await p17Expected(plan, "front", 2, 0.6));
    expect(result.splitPlan.scopes.find(scope => p3Key(scope) === p3Key(rear))).toEqual(before.scopes.find(scope => p3Key(scope) === p3Key(rear)));
    expect(result.splitPlan.openings.find(opening => p3Key(opening) === p3Key(rear))).toEqual(rear);
    expect(result.splitPlan.openings.find(opening => p3Key(opening) === p3Key(front))!.sizeM)
      .not.toBe(result.splitPlan.openings.find(opening => p3Key(opening) === p3Key(rear))!.sizeM);
    expect(plan).toEqual(before); expect(front.sizeM).toBe(rear.sizeM); expect(frontScope.opening).toBe(rearScope.opening);
    result.directives[0].address.floorIndex = 999; result.splitPlan.openings[0].centerM[0] += 200;
    expect(plan).toEqual(before);
  });

  it("owns both whole inputs across an actual held hash await and leaves unselected coherence outside this operation", async () => {
    const hashModule = await import("../core/contentHash"), actualHash = hashModule.hashCanonicalJson;
    const plan = structuredClone(plans.kit);
    const bay = [...new Set(plan.openings.filter(opening => opening.facade === "front").map(opening => opening.bayIndex))]
      .find(index => p17Windows(plan, "front", index).length >= 2)!;
    expect(bay).toBeDefined();
    const request = p17Request("front", bay), expected = await edit(structuredClone(plan), structuredClone(request));
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    const held = vi.spyOn(hashModule, "hashCanonicalJson").mockImplementationOnce(async payload => {
      enter(); await gate; return actualHash(payload);
    });
    let pending: Promise<P17BayResult> | undefined;
    try {
      pending = edit(plan, request);
      await Promise.race([entered, pending.then(() => { throw new Error("Bay operation escaped the actual hash gate"); })]);
      request.widthM = 99; request.bayIndex = 999; request.facade = "right";
      plan.familyId = "late-family"; plan.contentHash = "late-hash";
      plan.openings[0].centerM[0] += 200; plan.openings[0].sizeM[0] = 100;
      plan.scopes.at(-1)!.originM[0] += 300; plan.scopes.reverse();
      release(); expect(await pending).toEqual(expected);
      expect(Object.isFrozen(plan)).toBe(false); expect(Object.isFrozen(request)).toBe(false);
      expect(Object.isFrozen(plan.scopes)).toBe(false); expect(Object.isFrozen(plan.openings[0].centerM)).toBe(false);
    } finally { release(); await pending?.catch(() => undefined); held.mockRestore(); }

    const limited = structuredClone(plans.kit), unselected = limited.openings.find(opening => opening.facade === "rear" && opening.kind === "window")!;
    unselected.centerM[1] += 0.1; await p3RefreshHash(limited);
    const result = await edit(limited, p17Request("front", bay));
    expect(result.splitPlan).toEqual(await p17Expected(limited, "front", bay, 0.6));
    expect(result.splitPlan.openings.find(opening => p3Key(opening) === p3Key(unselected))).toEqual(unselected);
  });

  it("rejects malformed bay requests and unsafe whole-plan data without invoking accessors", async () => {
    const { BuildingWindowBayWidthOverrideSchema } = await import("../contracts/buildingDocument");
    const valid = p17Request(); expect(BuildingWindowBayWidthOverrideSchema.parse(valid)).toEqual(valid);
    let reads = 0;
    const getter = Object.defineProperty({ ...valid }, "widthM", { enumerable: true, get() { reads++; return 0.6; } });
    const inherited = Object.create(valid) as unknown, symbol = { ...valid, [Symbol("unrecognized")]: true };
    for (const input of [null, [], "front/2", { ...valid, schemaVersion: "0.2.0" }, { ...valid, facade: "south" },
      { ...valid, bayIndex: -1 }, { ...valid, bayIndex: 0.5 }, { ...valid, bayIndex: Number.MAX_SAFE_INTEGER + 1 },
      { ...valid, bayIndex: Number.NaN }, { ...valid, widthM: 0 }, { ...valid, widthM: -1 }, { ...valid, widthM: Infinity },
      { ...valid, widthM: Number.NaN }, { ...valid, widthM: "0.6" }, { ...valid, extra: undefined },
      { ...valid, floorIndex: 1 }, p13Request(), inherited, getter, symbol]) {
      expect(BuildingWindowBayWidthOverrideSchema.safeParse(input).success).toBe(false);
      await rejected(plans["proof-front"], input, "building.windowWidth.invalidDirective");
    }
    expect(reads).toBe(0);
    for (const kind of ["accessor", "sparse", "array-extra", "nonplain", "nonfinite", "header-version", "header-family", "header-depth", "header-scopes"] as const) {
      const plan = structuredClone(plans["proof-front"]);
      if (kind === "accessor") Object.defineProperty(plan.scopes.at(-1)!, "opening", { enumerable: true, get() { reads++; return undefined; } });
      if (kind === "sparse") Reflect.deleteProperty(plan.scopes, "0");
      if (kind === "array-extra") Object.assign(plan.openings, { unrecognized: true });
      if (kind === "nonplain") Object.setPrototypeOf(plan.openings[0], { injected: true });
      if (kind === "nonfinite") plan.scopes.at(-1)!.originM[0] = Number.NaN;
      if (kind === "header-version") Object.assign(plan, { schemaVersion: "0.2.0" });
      if (kind === "header-family") plan.familyId = "";
      if (kind === "header-depth") plan.wallDepthM = 0;
      if (kind === "header-scopes") Object.assign(plan, { scopes: {} });
      const failure = await edit(plan, valid).then(() => undefined, (error: unknown) => error);
      expect(failure).toBeInstanceOf(BuildingWindowWidthOverrideError);
      expect(failure).toMatchObject({ code: "building.windowWidth.incoherentPlan" }); expect(reads).toBe(0);
    }
  });
});
