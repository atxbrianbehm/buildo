import type { ArtKitManifest } from "../art-kit/artKitContracts";
import type { FacadeModulePlan } from "../art-kit/facadeModulePlanner";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import {
  BuildingWindowSlotAddressSchema, BuildingWindowWidthOverrideSchema, BuildingWindowFloorWidthOverrideSchema, BuildingWindowBayWidthOverrideSchema, findBuildingDocumentJsonIssue,
  type BuildingWindowSlotAddress, type BuildingWindowWidthOverride, type BuildingWindowFloorWidthOverride, type BuildingWindowBayWidthOverride
} from "../contracts/buildingDocument";
import { hashCanonicalJson } from "../core/contentHash";
import {
  buildFacadeBayScopes,
  expandBayWallPrimitives,
  MIN_FACADE_PIER_WIDTH_M,
  type FacadeBayScope,
  type OpeningSlot,
  type WallFacadeName
} from "./facadeWallSubdivision";
import { translationMatrix, type PrimitiveGeometry, type Vec3 } from "./primitiveGeometry";
import { bindOpeningToSlot, FRAME_INSET_FROM_SLOT_M } from "./openingSlotBinding";

/**
 * Unified CGA/GN-style facade split: one plan drives wall scopes and opening slots.
 * Schema-versioned so it can enter traces / QA later.
 */
export interface FacadeSplitOpeningPlacement {
  facade: WallFacadeName;
  floorIndex: number;
  bayIndex: number;
  kind: "window" | "door";
  moduleId?: string;
  semanticPath: string;
  /** World-space center for module instance transform. */
  centerM: Vec3;
  sizeM: Vec3;
}

export interface FacadeSplitPlan {
  schemaVersion: "0.1.0";
  familyId: string;
  wallDepthM: number;
  contentHash: string;
  scopes: FacadeBayScope[];
  openings: FacadeSplitOpeningPlacement[];
}

export type BuildingWindowSlotTargetErrorCode =
  | "building.windowSlot.invalidAddress"
  | "building.windowSlot.unresolvedPath"
  | "building.windowSlot.missingOpening"
  | "building.windowSlot.ambiguousTarget"
  | "building.windowSlot.notWindow";

export class BuildingWindowSlotTargetError extends Error {
  constructor(public readonly code: BuildingWindowSlotTargetErrorCode, message: string) {
    super(message);
    this.name = "BuildingWindowSlotTargetError";
  }
}

function windowSlotAddress(input: unknown): BuildingWindowSlotAddress {
  const parsed = BuildingWindowSlotAddressSchema.safeParse(input);
  if (!parsed.success) {
    throw new BuildingWindowSlotTargetError("building.windowSlot.invalidAddress", "A window slot requires a valid versioned facade, floor and bay address.");
  }
  return parsed.data;
}

function openingPathAliases(opening: FacadeSplitOpeningPlacement): string[] {
  // These are the exact paired paths emitted by createPairedGlassPlan.
  return [opening.semanticPath, opening.semanticPath + (opening.kind === "window" ? "/glass" : "/transom-glass")];
}

function windowAtAddress(plan: FacadeSplitPlan, address: BuildingWindowSlotAddress): FacadeSplitOpeningPlacement {
  const matches = plan.openings.filter(opening => opening.facade === address.facade &&
    opening.floorIndex === address.floorIndex && opening.bayIndex === address.bayIndex);
  if (matches.length === 0) {
    throw new BuildingWindowSlotTargetError("building.windowSlot.missingOpening", "The current split plan has no opening at this slot.");
  }
  if (matches.length !== 1) {
    throw new BuildingWindowSlotTargetError("building.windowSlot.ambiguousTarget", "The current split plan has multiple openings at this slot.");
  }
  const opening = matches[0]!;
  if (opening.kind !== "window") {
    throw new BuildingWindowSlotTargetError("building.windowSlot.notWindow", "The current slot belongs to a door rather than a window.");
  }
  const aliases = openingPathAliases(opening);
  if (plan.openings.some(other => other !== opening && openingPathAliases(other).some(path => aliases.includes(path)))) {
    throw new BuildingWindowSlotTargetError("building.windowSlot.ambiguousTarget", "The current window paths also identify another opening.");
  }
  return opening;
}

/** Join only exact current frame/glass paths; a plausible stale path carries no authority. */
export function resolveWindowSlotAddressFromSemanticPath(
  plan: FacadeSplitPlan,
  semanticPath: string
): BuildingWindowSlotAddress {
  const matches = typeof semanticPath === "string" && semanticPath.length > 0
    ? plan.openings.filter(opening => openingPathAliases(opening).includes(semanticPath))
    : [];
  if (matches.length === 0) {
    throw new BuildingWindowSlotTargetError("building.windowSlot.unresolvedPath", "The path does not identify a current split-plan opening.");
  }
  if (matches.length !== 1) {
    throw new BuildingWindowSlotTargetError("building.windowSlot.ambiguousTarget", "The path identifies multiple current openings.");
  }
  const opening = matches[0]!;
  const address = windowSlotAddress({
    schemaVersion: "0.1.0", facade: opening.facade, floorIndex: opening.floorIndex, bayIndex: opening.bayIndex
  });
  windowAtAddress(plan, address);
  return address;
}

/** Resolve one current window and return an owned placement, including its coordinate arrays. */
export function resolveWindowOpeningFromSlotAddress(
  plan: FacadeSplitPlan,
  address: unknown
): FacadeSplitOpeningPlacement {
  const opening = windowAtAddress(plan, windowSlotAddress(address));
  return { ...opening, centerM: [...opening.centerM], sizeM: [...opening.sizeM] };
}

export type BuildingWindowWidthOverrideErrorCode =
  | "building.windowWidth.invalidDirective"
  | "building.windowWidth.unsupportedWidth"
  | "building.windowWidth.missingScope"
  | "building.windowWidth.ambiguousScope"
  | "building.windowWidth.incoherentPlan";

export class BuildingWindowWidthOverrideError extends Error {
  constructor(public readonly code: BuildingWindowWidthOverrideErrorCode, message: string) {
    super(message);
    this.name = "BuildingWindowWidthOverrideError";
  }
}

function parseWidthOverride(input: unknown): BuildingWindowWidthOverride {
  try { return BuildingWindowWidthOverrideSchema.parse(input); }
  catch { throw new BuildingWindowWidthOverrideError("building.windowWidth.invalidDirective", "A width override requires a valid versioned window-slot address and positive finite width."); }
}

function ownSplitPlan(plan: FacadeSplitPlan): FacadeSplitPlan {
  try {
    const issue = findBuildingDocumentJsonIssue(plan, path =>
      (path.length === 3 && path[0] === "scopes" && typeof path[1] === "number" && ["opening", "storefront"].includes(String(path[2]))) ||
      (path.length === 4 && path[0] === "scopes" && typeof path[1] === "number" && path[2] === "opening" && path[3] === "kind") ||
      (path.length === 3 && path[0] === "openings" && typeof path[1] === "number" && path[2] === "moduleId"));
    if (issue) throw new Error(issue.message);
    return structuredClone(plan);
  } catch {
    throw new BuildingWindowWidthOverrideError("building.windowWidth.incoherentPlan", "The split plan must contain finite plain data that can be owned before editing.");
  }
}

function finiteVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every(component => typeof component === "number" && Number.isFinite(component));
}

/** Narrow one owned aperture authority; compile/worker/source integration is intentionally separate. */
export async function applyWindowWidthOverride(plan: FacadeSplitPlan, input: unknown): Promise<FacadeSplitPlan> {
  const directive = parseWidthOverride(input);
  const owned = ownSplitPlan(plan);
  const record = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value);
  if (!record(owned) || owned.schemaVersion !== "0.1.0" || typeof owned.familyId !== "string" || !owned.familyId ||
      !Number.isFinite(owned.wallDepthM) || owned.wallDepthM <= 0 || typeof owned.contentHash !== "string" ||
      !Array.isArray(owned.scopes) || !owned.scopes.every(record) || !Array.isArray(owned.openings) || !owned.openings.every(record)) {
    throw new BuildingWindowWidthOverrideError("building.windowWidth.incoherentPlan", "The split plan header and opening/scope collections must be valid.");
  }
  // Reuse the exact current placement and alias checks, including door/window collisions.
  const placement = windowAtAddress(owned, directive.address);
  const scopeIndices = owned.scopes.flatMap((scope, index) => scope.facade === directive.address.facade &&
    scope.floorIndex === directive.address.floorIndex && scope.bayIndex === directive.address.bayIndex ? [index] : []);
  if (scopeIndices.length === 0) throw new BuildingWindowWidthOverrideError("building.windowWidth.missingScope", "The current window has no matching wall scope.");
  if (scopeIndices.length !== 1) throw new BuildingWindowWidthOverrideError("building.windowWidth.ambiguousScope", "The current window has multiple matching wall scopes.");
  const scopeIndex = scopeIndices[0]!, scope = owned.scopes[scopeIndex]!;
  const opening = scope.opening;
  const side = scope.facade === "left" || scope.facade === "right";
  const expectedWallDepthM = owned.wallDepthM + (scope.floorIndex === 0 ? Math.min(0.22, owned.wallDepthM * 0.65) : 0);
  if (!opening || typeof placement.semanticPath !== "string" || !placement.semanticPath ||
      (placement.moduleId !== undefined && typeof placement.moduleId !== "string") ||
      !finiteVec3(scope.originM) || !finiteVec3(scope.sizeM) || scope.sizeM.some(value => value <= 0) ||
      scope.zone !== (scope.floorIndex === 0 ? "ground" : "body") || scope.sizeM[side ? 0 : 2] !== expectedWallDepthM ||
      !finiteVec3(placement.centerM) || !finiteVec3(placement.sizeM) || placement.sizeM.some(value => value <= 0) ||
      !Number.isFinite(opening.widthM) || opening.widthM <= 0 || !Number.isFinite(opening.heightM) || opening.heightM <= 0 ||
      !Number.isFinite(opening.centerAlongM) || !Number.isFinite(opening.centerYM) || (opening.kind ?? "window") !== placement.kind ||
      opening.widthM !== placement.sizeM[0] || opening.heightM !== placement.sizeM[1] ||
      opening.centerYM - opening.heightM / 2 < scope.originM[1] || opening.centerYM + opening.heightM / 2 > scope.originM[1] + scope.sizeM[1] ||
      !openingWorldCenter(scope).every((value, axis) => value === placement.centerM[axis]) ||
      openingPlacementDepth(scope) !== placement.sizeM[2]) {
    throw new BuildingWindowWidthOverrideError("building.windowWidth.incoherentPlan", "The selected scope and placement must agree on window dimensions, center and depth.");
  }
  const { widthM } = directive;
  const proposed = { ...placement, sizeM: [widthM, placement.sizeM[1], placement.sizeM[2]] as Vec3 };
  const bound = bindOpeningToSlot({ placement: proposed, wallDepthM: owned.wallDepthM,
    recipeWidthM: widthM, recipeHeightM: placement.sizeM[1], recipeDepthM: placement.sizeM[2] });
  const alongMin = scope.originM[side ? 2 : 0], alongSize = scope.sizeM[side ? 2 : 0];
  if (widthM < 0.2 || bound.frameOuterSizeM[0] !== widthM - 2 * FRAME_INSET_FROM_SLOT_M || widthM > opening.widthM ||
      opening.centerAlongM - widthM / 2 - alongMin < MIN_FACADE_PIER_WIDTH_M ||
      alongMin + alongSize - (opening.centerAlongM + widthM / 2) < MIN_FACADE_PIER_WIDTH_M) {
    throw new BuildingWindowWidthOverrideError("building.windowWidth.unsupportedWidth", "Widths must narrow the current aperture without binder floors or piers below the minimum.");
  }
  // The established hash omits origins/module paths; selected geometry coherence is checked above.
  if (await hashCanonicalJson(splitPlanHashPayload(owned)) !== owned.contentHash) {
    throw new BuildingWindowWidthOverrideError("building.windowWidth.incoherentPlan", "The split plan content hash does not match its current authority.");
  }
  if (widthM === opening.widthM) return owned;
  // Replace selected records/arrays: structuredClone preserves aliases to unselected values.
  const edited: FacadeSplitPlan = {
    ...owned,
    scopes: owned.scopes.map((entry, index) => index === scopeIndex ? { ...scope, opening: { ...opening, widthM } } : entry),
    openings: owned.openings.map(entry => entry === placement ? proposed : entry)
  };
  edited.contentHash = await hashCanonicalJson(splitPlanHashPayload(edited));
  return edited;
}

export interface BuildFacadeSplitPlanInput {
  spec: BuildingFamilySpec;
  wallDepthM: number;
  /** When set, openings come only from the art-kit plan (no default punched grids). */
  facadePlan?: FacadeModulePlan;
  kit?: ArtKitManifest;
  /**
   * Proof-mode defaults when no facade plan: front-only grid.
   * Ignored when `facadePlan` is set (strict kit openings).
   */
  defaultOpeningMode?: "front-only" | "multi-facade";
}

export interface OpeningSeed {
  facade: WallFacadeName;
  floorIndex: number;
  bayIndex: number;
  widthM: number;
  heightM: number;
  kind?: "window" | "door";
  moduleId?: string;
  semanticPath?: string;
}

function openingWorldCenter(scope: FacadeBayScope): Vec3 {
  const open = scope.opening!;
  const isSide = scope.facade === "left" || scope.facade === "right";
  // Anchor on the outer wall face; casing/hoods project outward via local +Z orientation.
  // (Previously offset outside the face, which made openings read as floating boxes.)
  if (!isSide) {
    // Front: origin z is outer face, wall grows +Z inward. Rear: outer is origin+depth.
    const outerZ =
      scope.facade === "front"
        ? scope.originM[2]
        : scope.originM[2] + scope.sizeM[2];
    return [open.centerAlongM, open.centerYM, outerZ];
  }
  const outerX =
    scope.facade === "left" ? scope.originM[0] : scope.originM[0] + scope.sizeM[0];
  return [outerX, open.centerYM, open.centerAlongM];
}

function openingPlacementDepth(scope: FacadeBayScope): number {
  return scope.facade === "left" || scope.facade === "right" ? scope.sizeM[0] * 0.5 : scope.sizeM[2] * 0.55;
}

function openingsFromFacadePlan(plan: FacadeModulePlan, kit?: ArtKitManifest): OpeningSeed[] {
  const seeds: OpeningSeed[] = [];
  for (const placement of plan.placements) {
    if (placement.layer !== "opening") {
      continue;
    }
    const module = kit?.modules.find((entry) => entry.id === placement.moduleId);
    const kind: "window" | "door" =
      placement.moduleId.includes("door") || module?.kind === "door" ? "door" : "window";
    // Placement size is oriented; height is always sizeMeters[1].
    const widthM =
      placement.facade === "left" || placement.facade === "right"
        ? placement.sizeMeters[2]
        : placement.sizeMeters[0];
    const heightM = placement.sizeMeters[1];
    seeds.push({
      facade: placement.facade,
      floorIndex: placement.floorIndex,
      bayIndex: placement.bayIndex,
      widthM: Math.max(0.4, widthM),
      heightM: Math.max(0.6, heightM),
      kind,
      moduleId: placement.moduleId,
      semanticPath: placement.semanticPath
    });
  }
  return seeds;
}

function attachOpeningMeta(
  scopes: FacadeBayScope[],
  seeds: OpeningSeed[],
  familyId: string
): FacadeSplitOpeningPlacement[] {
  const seedMap = new Map(
    seeds.map((seed) => [`${seed.facade}:${seed.floorIndex}:${seed.bayIndex}`, seed])
  );
  const openings: FacadeSplitOpeningPlacement[] = [];

  for (const scope of scopes) {
    if (!scope.opening) {
      continue;
    }
    const key = `${scope.facade}:${scope.floorIndex}:${scope.bayIndex}`;
    const seed = seedMap.get(key);
    const resolvedKind: "window" | "door" =
      seed?.kind ?? scope.opening.kind ?? "window";
    const centerM = openingWorldCenter(scope);
    const depth = openingPlacementDepth(scope);
    openings.push({
      facade: scope.facade,
      floorIndex: scope.floorIndex,
      bayIndex: scope.bayIndex,
      kind: resolvedKind,
      moduleId: seed?.moduleId,
      semanticPath:
        seed?.semanticPath ??
        `building/${familyId}/facade/${scope.facade}/floor/${scope.floorIndex}/bay/${scope.bayIndex}/opening/${resolvedKind}`,
      centerM,
      sizeM: [scope.opening.widthM, scope.opening.heightM, depth]
    });
  }
  return openings;
}

function splitPlanHashPayload(plan: Pick<FacadeSplitPlan, "familyId" | "wallDepthM" | "scopes" | "openings">) {
  return {
    familyId: plan.familyId,
    wallDepthM: plan.wallDepthM,
    scopes: plan.scopes.map((scope) => ({
      facade: scope.facade,
      floorIndex: scope.floorIndex,
      bayIndex: scope.bayIndex,
      zone: scope.zone,
      opening: scope.opening,
      storefront: scope.storefront
        ? {
            bulkheadHeightM: scope.storefront.bulkheadHeightM,
            glazingHeightM: scope.storefront.glazingHeightM,
            lintelHeightM: scope.storefront.lintelHeightM
          }
        : undefined
    })),
    openings: plan.openings.map((opening) => ({
      facade: opening.facade,
      floorIndex: opening.floorIndex,
      bayIndex: opening.bayIndex,
      kind: opening.kind,
      centerM: opening.centerM,
      sizeM: opening.sizeM
    }))
  };
}

/**
 * Kit mode: openings come only from the art-kit facade plan.
 * Proof mode: no plan → front-only default slots (same split drives walls + frames).
 */
export async function buildFacadeSplitPlan(
  input: BuildFacadeSplitPlanInput
): Promise<FacadeSplitPlan> {
  const hasKitPlan = Boolean(input.facadePlan);
  const seeds = input.facadePlan
    ? openingsFromFacadePlan(input.facadePlan, input.kit)
    : undefined;
  const scopes = buildFacadeBayScopes({
    spec: input.spec,
    wallDepthM: input.wallDepthM,
    openings: seeds,
    /** When kit plan is present, only punch openings the planner chose. */
    strictOpenings: hasKitPlan,
    defaultOpeningMode: hasKitPlan ? undefined : (input.defaultOpeningMode ?? "front-only")
  });
  const openings = attachOpeningMeta(
    scopes,
    seeds ?? [],
    input.spec.familyId
  );

  if (hasKitPlan && seeds && openings.length !== seeds.length) {
    // Duplicate plan cells or failed attach — fail fast so dual authority cannot hide.
    throw new Error(
      `FacadeSplitPlan opening count ${openings.length} does not match kit plan opening seeds ${seeds.length}.`
    );
  }
  const contentHash = await hashCanonicalJson(splitPlanHashPayload({
    familyId: input.spec.familyId,
    wallDepthM: input.wallDepthM,
    scopes,
    openings
  }));

  return {
    schemaVersion: "0.1.0",
    familyId: input.spec.familyId,
    wallDepthM: input.wallDepthM,
    contentHash,
    scopes,
    openings
  };
}

export function wallPrimitivesFromSplitPlan(plan: FacadeSplitPlan): PrimitiveGeometry[] {
  const walls: Array<{ primitive: PrimitiveGeometry; facade: WallFacadeName }> = [];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const scope of plan.scopes) {
    for (const primitive of expandBayWallPrimitives(scope)) {
      walls.push({ primitive, facade: scope.facade });
      // Match the placed source positions that combinePrimitiveGeometry submits.
      for (let offset = 0; offset < primitive.positions.length; offset += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          const value = Math.fround(primitive.positions[offset + axis]);
          min[axis] = Math.min(min[axis], value);
          max[axis] = Math.max(max[axis], value);
        }
      }
    }
  }

  for (const { primitive, facade } of walls) {
    const side = facade === "left" || facade === "right";
    // buildBoxPrimitive's owned outward faces are rear 0, front 1, right 2, left 3.
    // Global bounds anchor the chart; they do not select faces or corner caps.
    const firstVertex = facade === "rear" ? 0 : facade === "front" ? 4 : facade === "right" ? 8 : 12;
    for (let vertex = firstVertex; vertex < firstVertex + 4; vertex += 1) {
      const offset = vertex * 3;
      const x = Math.fround(primitive.positions[offset]);
      const y = Math.fround(primitive.positions[offset + 1]);
      const z = Math.fround(primitive.positions[offset + 2]);
      primitive.uvs[vertex * 2] = side
        ? (facade === "right" ? max[2] - z : z - min[2])
        : (facade === "front" ? max[0] - x : x - min[0]);
      primitive.uvs[vertex * 2 + 1] = y - min[1];
    }
  }
  return walls.map(({ primitive }) => primitive);
}

export function openingTransformFromPlacement(placement: FacadeSplitOpeningPlacement): number[] {
  return translationMatrix(placement.centerM);
}

/** Re-export OpeningSlot typing for consumers. */
export type { FacadeBayScope, OpeningSlot, WallFacadeName };

export interface BuildingWindowFloorWidthOverrideResult {
  schemaVersion: "0.1.0";
  /** Changed members relative to the supplied split, in numeric bay order. */
  directives: BuildingWindowWidthOverride[];
  splitPlan: FacadeSplitPlan;
}

/** Atomically narrow one facade floor; source and compiler transport admission remain separate. */
export async function applyWindowFloorWidthOverride(
  plan: FacadeSplitPlan,
  input: unknown
): Promise<BuildingWindowFloorWidthOverrideResult> {
  let request: BuildingWindowFloorWidthOverride;
  try { request = BuildingWindowFloorWidthOverrideSchema.parse(input); }
  catch {
    throw new BuildingWindowWidthOverrideError("building.windowWidth.invalidDirective", "A floor width override requires a valid versioned facade, floor and positive finite width.");
  }
  // Both complete arguments are owned before any member reaches its first hash await.
  const owned = ownSplitPlan(plan);
  const record = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value);
  if (!record(owned) || owned.schemaVersion !== "0.1.0" || typeof owned.familyId !== "string" || !owned.familyId ||
      !Number.isFinite(owned.wallDepthM) || owned.wallDepthM <= 0 || typeof owned.contentHash !== "string" ||
      !Array.isArray(owned.scopes) || !owned.scopes.every(record) || !Array.isArray(owned.openings) || !owned.openings.every(record)) {
    throw new BuildingWindowWidthOverrideError("building.windowWidth.incoherentPlan", "The split plan header and opening/scope collections must be valid.");
  }
  const addresses = new Map<number, BuildingWindowSlotAddress>();
  const addressFor = (member: { facade: WallFacadeName; floorIndex: number; bayIndex: number }): BuildingWindowSlotAddress => {
    const parsed = BuildingWindowSlotAddressSchema.safeParse({ schemaVersion: "0.1.0", facade: member.facade,
      floorIndex: member.floorIndex, bayIndex: member.bayIndex });
    if (!parsed.success) throw new BuildingWindowWidthOverrideError("building.windowWidth.incoherentPlan", "The requested floor contains an invalid opening or scope address.");
    return parsed.data;
  };
  for (const placement of owned.openings) {
    if (placement.facade !== request.facade || placement.floorIndex !== request.floorIndex) continue;
    const address = addressFor(placement);
    if (placement.kind !== "window" && placement.kind !== "door") {
      throw new BuildingWindowWidthOverrideError("building.windowWidth.incoherentPlan", "Requested-floor placements must declare a window or door kind.");
    }
    if (placement.kind === "window") addresses.set(address.bayIndex, address);
  }
  for (const scope of owned.scopes) {
    if (scope.facade !== request.facade || scope.floorIndex !== request.floorIndex) continue;
    const address = addressFor(scope);
    if (scope.opening === undefined) continue;
    if (!record(scope.opening) || (scope.opening.kind !== undefined && scope.opening.kind !== "window" && scope.opening.kind !== "door")) {
      throw new BuildingWindowWidthOverrideError("building.windowWidth.incoherentPlan", "Requested-floor scopes must contain a valid window or door opening kind.");
    }
    if ((scope.opening.kind ?? "window") === "window") addresses.set(address.bayIndex, address);
  }
  if (addresses.size === 0) {
    throw new BuildingWindowWidthOverrideError("building.windowWidth.missingScope", "The requested facade floor has no window openings.");
  }
  const directives: BuildingWindowWidthOverride[] = [];
  let splitPlan = owned;
  for (const address of [...addresses.values()].sort((left, right) => left.bayIndex - right.bayIndex)) {
    const before = resolveWindowOpeningFromSlotAddress(splitPlan, address);
    const directive: BuildingWindowWidthOverride = { schemaVersion: "0.1.0", address: { ...address }, widthM: request.widthM };
    // Every member, including no-ops, passes the incumbent alias, scope, binder, pier and hash checks.
    splitPlan = await applyWindowWidthOverride(splitPlan, directive);
    if (request.widthM !== before.sizeM[0]) directives.push(directive);
  }
  return { schemaVersion: "0.1.0", directives, splitPlan };
}

export interface BuildingWindowBayWidthOverrideResult {
  schemaVersion: "0.1.0";
  /** Changed members relative to the supplied split, in numeric floor order. */
  directives: BuildingWindowWidthOverride[];
  splitPlan: FacadeSplitPlan;
}

/** Atomically narrow a vertical stack on one facade; source/transport admission remains separate. */
export async function applyWindowBayWidthOverride(
  plan: FacadeSplitPlan,
  input: unknown
): Promise<BuildingWindowBayWidthOverrideResult> {
  let request: BuildingWindowBayWidthOverride;
  try { request = BuildingWindowBayWidthOverrideSchema.parse(input); }
  catch {
    throw new BuildingWindowWidthOverrideError("building.windowWidth.invalidDirective", "A bay width override requires a valid versioned facade, bay and positive finite width.");
  }
  // Own both complete arguments before any selected member reaches a hash await.
  const owned = ownSplitPlan(plan);
  const record = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value);
  if (!record(owned) || owned.schemaVersion !== "0.1.0" || typeof owned.familyId !== "string" || !owned.familyId ||
      !Number.isFinite(owned.wallDepthM) || owned.wallDepthM <= 0 || typeof owned.contentHash !== "string" ||
      !Array.isArray(owned.scopes) || !owned.scopes.every(record) || !Array.isArray(owned.openings) || !owned.openings.every(record)) {
    throw new BuildingWindowWidthOverrideError("building.windowWidth.incoherentPlan", "The split plan header and opening/scope collections must be valid.");
  }
  const addresses = new Map<number, BuildingWindowSlotAddress>();
  const addressFor = (member: { facade: WallFacadeName; floorIndex: number; bayIndex: number }): BuildingWindowSlotAddress => {
    const parsed = BuildingWindowSlotAddressSchema.safeParse({ schemaVersion: "0.1.0", facade: member.facade,
      floorIndex: member.floorIndex, bayIndex: member.bayIndex });
    if (!parsed.success) throw new BuildingWindowWidthOverrideError("building.windowWidth.incoherentPlan", "The requested bay contains an invalid opening or scope address.");
    return parsed.data;
  };
  for (const placement of owned.openings) {
    if (placement.facade !== request.facade || placement.bayIndex !== request.bayIndex) continue;
    const address = addressFor(placement);
    if (placement.kind !== "window" && placement.kind !== "door") {
      throw new BuildingWindowWidthOverrideError("building.windowWidth.incoherentPlan", "Requested-bay placements must declare a window or door kind.");
    }
    if (placement.kind === "window") addresses.set(address.floorIndex, address);
  }
  for (const scope of owned.scopes) {
    if (scope.facade !== request.facade || scope.bayIndex !== request.bayIndex) continue;
    const address = addressFor(scope);
    if (scope.opening === undefined) continue;
    if (!record(scope.opening) || (scope.opening.kind !== undefined && scope.opening.kind !== "window" && scope.opening.kind !== "door")) {
      throw new BuildingWindowWidthOverrideError("building.windowWidth.incoherentPlan", "Requested-bay scopes must contain a valid window or door opening kind.");
    }
    if ((scope.opening.kind ?? "window") === "window") addresses.set(address.floorIndex, address);
  }
  if (addresses.size === 0) {
    throw new BuildingWindowWidthOverrideError("building.windowWidth.missingScope", "The requested facade bay has no window openings.");
  }
  const directives: BuildingWindowWidthOverride[] = [];
  let splitPlan = owned;
  for (const address of [...addresses.values()].sort((left, right) => left.floorIndex - right.floorIndex)) {
    const before = resolveWindowOpeningFromSlotAddress(splitPlan, address);
    const directive: BuildingWindowWidthOverride = { schemaVersion: "0.1.0", address: { ...address }, widthM: request.widthM };
    // Validate even equal-width members with the incumbent alias, scope, binder, pier and hash checks.
    splitPlan = await applyWindowWidthOverride(splitPlan, directive);
    if (request.widthM !== before.sizeM[0]) directives.push(directive);
  }
  return { schemaVersion: "0.1.0", directives, splitPlan };
}
