import {
  ClampToEdgeWrapping, Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, NoColorSpace, RGBAFormat,
  SRGBColorSpace, UnsignedByteType, Vector2
} from "three";
import { AtlasChannelSchema } from "../contracts/atlasManifest";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { BuildingSurfaceCompositionSchema, SURFACE_TILE_ALGORITHM_V1, SURFACE_TILE_ALGORITHM_CONSTANT_BASE_V2, type BuildingSurfaceTileArtifact } from "../contracts/surfaceComposition";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import type { PackedAtlas, PackedAtlasChannels } from "../materials/atlasPacker";
import { composeBuildingSurfaceTile } from "../materials/composeSurfaceTile";
import { resolveBuildingSurfaceBindings } from "../materials/resolveSurfaceBindings";
import { ConstantSurfaceBaseAppearanceSchema, type ConstantSurfaceBaseAppearance } from "../contracts/surfaceBaseAppearance";
import { surfaceBaseRgba, verifyConstantSurfaceBaseAppearance } from "../materials/surfaceBaseAppearance";
import type { AtlasMaterialRegistry } from "./buildingAtlasMaterialFactory";
import { ConstructionAwningFabricArtifactSchema } from "../contracts/constructionAwningFabric";
import { readConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { CONSTRUCTION_AWNING_FABRIC_SLOT } from "./constructionAwningFabricRuntime";

export class BuildingSurfaceRuntimeError extends Error {
  readonly name = "BuildingSurfaceRuntimeError";
  constructor(readonly code: "surfaceRuntime.invalidInput" | "surfaceRuntime.staleContext" |
    "surfaceRuntime.unsupportedMeshScope" | "surfaceRuntime.disposed", message: string) { super(message); }
}
function fail(code: BuildingSurfaceRuntimeError["code"], message: string): never {
  throw new BuildingSurfaceRuntimeError(code, message);
}
function record(value: unknown): Record<string, PropertyDescriptor> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length)
    fail("surfaceRuntime.invalidInput", "Expected plain data records.");
  const result = Object.getOwnPropertyDescriptors(value);
  if (Object.values(result).some(item => !item.enumerable || !("value" in item)))
    fail("surfaceRuntime.invalidInput", "Accessors and hidden properties are unsupported.");
  return result;
}
function field(value: unknown, name: string, optional = false): unknown {
  const descriptor = record(value)[name];
  if (!descriptor && !optional) fail("surfaceRuntime.invalidInput", "Missing field: " + name);
  return descriptor?.value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length)
    fail("surfaceRuntime.invalidInput", "Expected a plain dense array.");
  const descriptors = Object.getOwnPropertyDescriptors(value), length = Object.getOwnPropertyDescriptor(value, "length")!.value as number;
  if (!Number.isSafeInteger(length) || length > 100_000 ||
      Object.keys(descriptors).some(key => key !== "length" && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)))
    fail("surfaceRuntime.invalidInput", "Unsupported array bounds/properties.");
  return Array.from({ length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      fail("surfaceRuntime.invalidInput", "Array holes/accessors are unsupported.");
    return descriptor.value;
  });
}
function ownJson(value: unknown, optional: (path: Array<string | number>) => boolean = () => false): unknown {
  if (findBuildingDocumentJsonIssue(value, optional)) fail("surfaceRuntime.invalidInput", "Expected finite JSON metadata.");
  return structuredClone(value);
}
/** Geometry arrays are deliberately excluded; structural bytes stay with the compiler. */
function contextKey(ir: unknown): string {
  const projection = {
    buildingId: field(ir, "buildingId"), familyId: field(ir, "familyId"), sourceGraphHash: field(ir, "sourceGraphHash"),
    meshes: array(field(ir, "meshBatches")).map(batch => ({
      batchId: field(batch, "batchId"), slot: field(batch, "materialSlotId", true) ?? "utility.mask"
    })),
    instances: array(field(ir, "instanceBatches")).map(batch => ({
      batchId: field(batch, "batchId"), recipeId: field(batch, "recipeId"),
      slot: field(batch, "materialSlotId"), count: field(batch, "count")
    })),
    semantics: array(field(ir, "semanticIndex")).map(entry => ({
      path: field(entry, "semanticPath"), batch: field(entry, "batchId"),
      index: field(entry, "elementIndex", true) ?? null, stage: field(entry, "stage")
    }))
  };
  return canonicalJson(ownJson(projection));
}
const names = AtlasChannelSchema.options;
const typed = Object.getPrototypeOf(Uint8ClampedArray.prototype);
const typedTag = Object.getOwnPropertyDescriptor(typed, Symbol.toStringTag)!.get!;
const typedBytes = Object.getOwnPropertyDescriptor(typed, "byteLength")!.get!;
const typedBuffer = Object.getOwnPropertyDescriptor(typed, "buffer")!.get!;
const bufferBytes = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!;
function ownAtlas(value: unknown): PackedAtlas {
  const descriptors = record(value), keys = ["schemaVersion", "atlasId", "manifest", "channels", "slotProvenance", "contentHash", "diagnostics"];
  if (Object.keys(descriptors).sort().join(",") !== keys.sort().join(","))
    fail("surfaceRuntime.invalidInput", "Unexpected atlas fields.");
  const metadata = Object.fromEntries(keys.filter(key => key !== "channels").map(key => [key, field(value, key)]));
  ownJson(metadata, path => path.length === 4 && path[0] === "manifest" && path[1] === "slots" &&
    typeof path[2] === "number" && ["profileRecipeId", "metersPerTile", "artKitMaterialRoleId", "proceduralSource"].includes(String(path[3])));
  const owned = structuredClone(metadata) as unknown as Omit<PackedAtlas, "channels">;
  const manifest = field(owned, "manifest");
  const width = field(manifest, "widthPx") as number, height = field(manifest, "heightPx") as number, size = width * height * 4;
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0 && n <= 8192) || size * names.length > 128 * 1024 * 1024)
    fail("surfaceRuntime.invalidInput", "Atlas exceeds the supported pixel budget.");
  const raw = field(value, "channels");
  if (Object.keys(record(raw)).sort().join(",") !== [...names].sort().join(","))
    fail("surfaceRuntime.invalidInput", "All five atlas channels are required.");
  const channels = Object.fromEntries(names.map(name => {
    const layer = field(raw, name), data = field(layer, "data");
    if (Object.keys(record(layer)).sort().join(",") !== "channels,data,heightPx,widthPx" ||
        field(layer, "widthPx") !== width || field(layer, "heightPx") !== height || field(layer, "channels") !== "rgba8")
      fail("surfaceRuntime.invalidInput", "Atlas channel dimensions must align.");
    try {
      if (!ArrayBuffer.isView(data) || typedTag.call(data) !== "Uint8ClampedArray" ||
          typedBytes.call(data) !== size || bufferBytes.call(typedBuffer.call(data)) < size)
        fail("surfaceRuntime.invalidInput", "Expected available ArrayBuffer RGBA8 planes.");
    } catch (error) {
      if (error instanceof BuildingSurfaceRuntimeError) throw error;
      fail("surfaceRuntime.invalidInput", "Atlas bytes are unavailable.");
    }
    return [name, { widthPx: width, heightPx: height, channels: "rgba8", data: new Uint8ClampedArray(data as Uint8ClampedArray) }];
  })) as unknown as PackedAtlasChannels;
  return { ...owned, channels };
}
const address = (batchId: string, index?: number) => JSON.stringify([batchId, index ?? null]);
export interface BuildingSurfaceLease {
  getMaterial(batchId: string, elementIndex?: number): MeshStandardMaterial | undefined;
  release(): void;
}
export interface BuildingSurfaceRuntime {
  readonly supplementalAwningFabricHash?: string;
  readonly metrics: { evaluatedRecipes: number; materialCount: number; textureCount: number; leases: number };
  readonly disposed: boolean;
  acquire(ir: RuntimeBuildingIR, registry: AtlasMaterialRegistry): BuildingSurfaceLease;
  listMaterials(): MeshStandardMaterial[];
  listTextures(): DataTexture[];
  /** Close caller ownership. Live scene leases defer resource disposal until their release. */
  dispose(): void;
}
function materialSettings(slotId: string, constantBase = false) {
  return {
    roughness: constantBase ? 1 : slotId.includes("glass") ? 0.22 : 0.82,
    metalness: constantBase ? 1 : slotId.includes("frame") || slotId.includes("trim") ? 0.12 : 0,
    transparent: slotId.includes("glass") || slotId.includes("ornament"),
    opacity: slotId.includes("glass") ? 0.82 : 1,
    depthWrite: !slotId.includes("glass"),
    alphaTest: slotId.includes("ornament") ? 0.2 : 0
  };
}
type RuntimeTile = Pick<BuildingSurfaceTileArtifact, "schemaVersion" | "baseSlotId" | "widthPx" | "heightPx" | "physicalSizeM" | "channels" | "channelHashes" | "pixelContentHash"> & {
  baseAppearanceRef?: { schemaVersion: "0.1.0"; contentHash: string; slotId: string };
};
function runtimeTile(tile: BuildingSurfaceTileArtifact): RuntimeTile {
  return { schemaVersion: tile.schemaVersion, baseSlotId: tile.baseSlotId, widthPx: tile.widthPx, heightPx: tile.heightPx,
    physicalSizeM: tile.physicalSizeM, channels: tile.channels, channelHashes: tile.channelHashes, pixelContentHash: tile.pixelContentHash,
    ...(tile.schemaVersion === "0.2.0" ? { baseAppearanceRef: tile.baseAppearanceRef } : {}) };
}
type PixelCacheState = { entries: Map<string, RuntimeTile | null>; bytes: number };
export type FamilySurfacePixelCache = object;
const familyPixelCaches = new WeakMap<FamilySurfacePixelCache, PixelCacheState>();
/** A private, bounded cache for one family preparation; it contains no semantic artifacts. */
export function createFamilySurfacePixelCache(): FamilySurfacePixelCache {
  const token = Object.freeze({}); familyPixelCaches.set(token, { entries: new Map(), bytes: 0 }); return token;
}
export function disposeFamilySurfacePixelCache(token: FamilySurfacePixelCache): void {
  familyPixelCaches.get(token)?.entries.clear(); familyPixelCaches.delete(token);
}
function literalBase(tile: RuntimeTile, atlas: PackedAtlas, appearance?: ConstantSurfaceBaseAppearance): boolean {
  const rect = atlas.manifest.slots.find(slot => slot.id === tile.baseSlotId)!.rectPx;
  const palette = appearance ? surfaceBaseRgba(appearance) : undefined;
  return names.every(name => {
    const data = tile.channels[name].data, source = atlas.channels[name].data;
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++)
      for (let component = 0; component < 4; component++)
        if (data[(y * rect.width + x) * 4 + component] !== (palette ? palette[name][component] : source[((rect.y + y) * atlas.manifest.widthPx + rect.x + x) * 4 + component])) return false;
    return true;
  });
}
/**
 * Prepare verified surface pixels before a synchronous scene swap. This object owns
 * only composite materials/textures; family atlas resources are borrowed through leases.
 */
export async function prepareBuildingSurfaceRuntime(input: unknown, familyCache?: FamilySurfacePixelCache): Promise<BuildingSurfaceRuntime> {
  const shared = familyCache === undefined ? undefined : familyPixelCaches.get(familyCache);
  if (familyCache !== undefined && !shared) fail("surfaceRuntime.invalidInput", "Family surface cache is unavailable.");
  const keys = Object.keys(record(input)).sort().join(",");
  if (!["atlas,composition,ir", "atlas,baseAppearances,composition,ir", "atlas,awningFabric,composition,ir", "atlas,awningFabric,baseAppearances,composition,ir"].includes(keys))
    fail("surfaceRuntime.invalidInput", "Expected composition, IR, atlas and optional base appearances or awning fabric.");
  const composition = BuildingSurfaceCompositionSchema.parse(field(input, "composition"));
  const ir = field(input, "ir") as RuntimeBuildingIR, context = contextKey(ir), atlas = ownAtlas(field(input, "atlas"));
  const fabric = keys.includes("awningFabric") ? structuredClone(ConstructionAwningFabricArtifactSchema.parse(field(input, "awningFabric"))) : undefined;
  const supplemental = ir.meshBatches.filter(batch => batch.materialSlotId === CONSTRUCTION_AWNING_FABRIC_SLOT);
  if (ir.instanceBatches.some(batch => batch.materialSlotId === CONSTRUCTION_AWNING_FABRIC_SLOT) || (!!fabric !== !!supplemental.length) ||
      (supplemental.length > 0 && atlas.manifest.slots.some(slot => slot.id === CONSTRUCTION_AWNING_FABRIC_SLOT)))
    fail("surfaceRuntime.invalidInput", "Supplemental awning material must match separate mesh batches and cannot alias an atlas slot.");
  const supplementalIds = new Set(supplemental.map(batch => batch.batchId));
  const supplementalEntries = ir.semanticIndex.filter(entry => supplementalIds.has(entry.batchId));
  if (supplemental.some(batch => !["awning.canopy", "awning.valance"].includes(batch.role) ||
      ir.meshBatches.filter(other => other.batchId === batch.batchId).length !== 1 || ir.instanceBatches.some(other => other.batchId === batch.batchId) ||
      supplementalEntries.filter(entry => entry.batchId === batch.batchId && entry.elementIndex === undefined && entry.stage === "openings" && entry.semanticPath.startsWith(`building/${ir.familyId}/`)).length !== 1 ||
      supplementalEntries.filter(entry => entry.batchId === batch.batchId).length !== 1) ||
      supplementalEntries.some(entry => ir.semanticIndex.filter(other => other.semanticPath === entry.semanticPath).length !== 1))
    fail("surfaceRuntime.invalidInput", "Supplemental awning batches require distinct semantic opening addresses.");
  const prefix = `building/${ir.familyId}/`;
  if (composition.layers.some(layer => layer.target.kind === "slot" ? layer.target.slotId === CONSTRUCTION_AWNING_FABRIC_SLOT :
    layer.target.kind === "element" && supplementalEntries.some(entry => entry.semanticPath.slice(prefix.length) === (layer.target as { relativePath: string }).relativePath)))
    fail("surfaceRuntime.invalidInput", "Surface layers cannot yet target supplemental awning fabric.");
  const atlasIr = supplemental.length ? { ...ir, meshBatches: ir.meshBatches.filter(batch => !supplementalIds.has(batch.batchId)),
    semanticIndex: ir.semanticIndex.filter(entry => !supplementalIds.has(entry.batchId)) } : ir;
  const rawBases = keys.includes("baseAppearances") ? array(field(input, "baseAppearances")) : [];
  if (rawBases.length > 32) fail("surfaceRuntime.invalidInput", "Too many surface base appearances.");
  const bases = new Map<string, ConstantSurfaceBaseAppearance>();
  for (const raw of rawBases) {
    const parsed = ConstantSurfaceBaseAppearanceSchema.safeParse(raw);
    if (!parsed.success) fail("surfaceRuntime.invalidInput", "Surface base appearance is invalid.");
    const base = parsed.data, slot = atlas.manifest.slots.find(slot => slot.id === base.slotId);
    if (!slot || slot.role !== base.role || bases.has(base.slotId))
      fail("surfaceRuntime.invalidInput", "Surface base appearances must identify distinct matching atlas roles.");
    bases.set(base.slotId, base);
  }
  // Own all metadata and atlas planes before validation yields.
  const pendingBindings = resolveBuildingSurfaceBindings({ composition, ir: atlasIr, atlas });
  void pendingBindings.catch(() => undefined);
  if (fabric) await readConstructionAwningFabric(fabric);
  for (const base of bases.values()) {
    try { await verifyConstantSurfaceBaseAppearance(base); }
    catch { fail("surfaceRuntime.invalidInput", "Surface base appearance does not match its content hash."); }
  }
  const bindings = await pendingBindings;
  if (!bindings.bindings.length) fail("surfaceRuntime.invalidInput", "No semantic bindings exist.");
  const manifestHash = shared ? await hashCanonicalJson(atlas.manifest) : "";
  const recipes = new Map<string, RuntimeTile | null>();
  const tilesByAddress = new Map<string, RuntimeTile>();
  let verified = false, evaluatedRecipes = 0;
  for (const binding of bindings.bindings) {
    if (!binding.layers.length) continue;
    const baseAppearance = bases.get(binding.baseSlot.slotId);
    const key = canonicalJson({ ...(shared ? { manifestHash, algorithm: baseAppearance ? SURFACE_TILE_ALGORITHM_CONSTANT_BASE_V2 : SURFACE_TILE_ALGORITHM_V1 } : {}), baseSlot: binding.baseSlot, layers: binding.layers,
      ...(baseAppearance ? { baseAppearanceHash: baseAppearance.contentHash } : {}) });
    if (!recipes.has(key)) {
      // Always execute one full compositor admission per member. It rechecks the
      // owned atlas bytes and this member's binding artifact before any cache hit.
      if (verified && shared?.entries.has(key)) recipes.set(key, shared.entries.get(key)!);
      else {
        const artifact = await composeBuildingSurfaceTile({ artifact: bindings, relativePath: binding.relativePath, atlas,
          ...(baseAppearance ? { baseAppearance } : {}) });
        verified = true; evaluatedRecipes++;
        const tile = runtimeTile(artifact), result = literalBase(tile, atlas, baseAppearance) ? null : tile;
        recipes.set(key, result);
        if (shared && !shared.entries.has(key) && shared.entries.size < 128) {
          const bytes = result ? names.reduce((total, name) => total + result.channels[name].data.byteLength, 0) : 0;
          if (shared.bytes + bytes <= 32 * 1024 * 1024) { shared.entries.set(key, result); shared.bytes += bytes; }
        }
      }
    }
    const tile = recipes.get(key);
    if (tile) tilesByAddress.set(address(binding.batchId, binding.kind === "instance" ? binding.elementIndex! : undefined), tile);
  }
  if (!verified) {
    const first = bindings.bindings[0], baseAppearance = bases.get(first.baseSlot.slotId);
    await composeBuildingSurfaceTile({ artifact: bindings, relativePath: first.relativePath, atlas,
      ...(baseAppearance ? { baseAppearance } : {}) });
    evaluatedRecipes++;
  }
  // Piece indices have no face ranges. Uniform shared results may cover a whole batch.
  const meshGroups = new Map<string, Set<string>>();
  for (const binding of bindings.bindings.filter(item => item.kind === "mesh")) {
    const values = meshGroups.get(binding.batchId) ?? new Set<string>();
    const recipe = canonicalJson({ baseSlot: binding.baseSlot, layers: binding.layers });
    values.add(recipe); meshGroups.set(binding.batchId, values);
  }
  if ([...meshGroups.values()].some(values => values.size !== 1))
    fail("surfaceRuntime.unsupportedMeshScope", "A mesh batch cannot use multiple surface materials without stable face ranges.");

  const materials = new Map<string, MeshStandardMaterial>(), textures: DataTexture[] = [], byAddress = new Map<string, MeshStandardMaterial>();
  const textureSets = new Map<string, Record<typeof names[number], DataTexture>>();
  try {
    for (const [target, tile] of tilesByAddress) {
      const slot = atlas.manifest.slots.find(value => value.id === tile.baseSlotId)!;
      const settings = materialSettings(tile.baseSlotId, tile.schemaVersion === "0.2.0"), key = canonicalJson({ pixelContentHash: tile.pixelContentHash, settings,
        slotId: slot.id, role: slot.role, uvMode: slot.uvMode, periodicity: slot.periodicity });
      let material = materials.get(key);
      if (!material) {
        let channelTextures = textureSets.get(tile.pixelContentHash);
        if (!channelTextures) {
          channelTextures = Object.fromEntries(names.map(name => {
          const texture = new DataTexture(new Uint8Array(tile.channels[name].data), tile.widthPx, tile.heightPx, RGBAFormat, UnsignedByteType);
          textures.push(texture);
          texture.name = "surface." + name + "." + tile.pixelContentHash;
          texture.colorSpace = name === "baseColor" ? SRGBColorSpace : NoColorSpace;
          texture.wrapS = ClampToEdgeWrapping; texture.wrapT = ClampToEdgeWrapping;
          if (tile.schemaVersion === "0.2.0") {
            texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter; texture.generateMipmaps = true;
          }
          texture.flipY = false; texture.needsUpdate = true;
          texture.userData = { rendererBoundary: "building-family", channel: name, channelHash: tile.channelHashes[name], pixelContentHash: tile.pixelContentHash };
          return [name, texture];
          })) as Record<typeof names[number], DataTexture>;
          textureSets.set(tile.pixelContentHash, channelTextures);
        }
        material = new MeshStandardMaterial({ color: "#ffffff", ...settings });
        materials.set(key, material);
        material.map = channelTextures.baseColor; material.normalMap = channelTextures.normal; material.normalScale = new Vector2(0.65, 0.65);
        material.roughnessMap = channelTextures.orm; material.metalnessMap = channelTextures.orm; material.alphaMap = channelTextures.opacity;
        material.name = "building-surface." + tile.pixelContentHash;
        material.userData = { rendererBoundary: "building-family", pixelContentHash: tile.pixelContentHash,
          ...(tile.schemaVersion === "0.2.0" ? { baseAppearanceRef: { ...tile.baseAppearanceRef } } : {}),
          channelHashes: { ...tile.channelHashes }, atlasContentHash: atlas.contentHash, atlasId: atlas.atlasId,
          atlasSlotId: tile.baseSlotId, atlasSlot: { slotId: slot.id, role: slot.role,
            rectPx: { x: 0, y: 0, width: tile.widthPx, height: tile.heightPx },
            physicalSizeM: { ...tile.physicalSizeM }, uvMode: slot.uvMode, periodicity: slot.periodicity,
            uvRect: { x: 0, y: 0, width: 1, height: 1 } } };
        material.needsUpdate = true;
      }
      byAddress.set(target, material);
    }
  } catch (error) {
    for (const material of materials.values()) material.dispose();
    for (const texture of textures) texture.dispose();
    throw error;
  }
  return createOwner({ context, atlasId: atlas.atlasId, atlasContentHash: atlas.contentHash,
    baseAppearances: [...bases.values()],
    slotIds: [...new Set(bindings.bindings.map(binding => binding.baseSlot.slotId))],
    evaluatedRecipes, materials, textures, byAddress, supplementalAwningFabricHash: fabric?.contentHash });
}
function createOwner(input: {
  context: string; atlasId: string; atlasContentHash: string; slotIds: string[];
  baseAppearances: ConstantSurfaceBaseAppearance[];
  evaluatedRecipes: number; materials: Map<string, MeshStandardMaterial>;
  textures: DataTexture[]; byAddress: Map<string, MeshStandardMaterial>; supplementalAwningFabricHash?: string;
}): BuildingSurfaceRuntime {
  const { context, atlasId, atlasContentHash, slotIds, evaluatedRecipes, materials, textures, byAddress } = input;
  let closed = false, freed = false, leases = 0;
  function free() {
    if (!closed || leases || freed) return;
    freed = true;
    for (const material of materials.values()) { material.dispose(); material.userData.disposed = true; }
    for (const texture of textures) { texture.dispose(); texture.userData.disposed = true; }
  }
  return {
    supplementalAwningFabricHash: input.supplementalAwningFabricHash,
    get metrics() { return { evaluatedRecipes, materialCount: freed ? 0 : materials.size, textureCount: freed ? 0 : textures.length, leases }; },
    get disposed() { return closed; },
    listMaterials: () => freed ? [] : [...materials.values()],
    listTextures: () => freed ? [] : [...textures],
    acquire(current, registry) {
      if (closed) fail("surfaceRuntime.disposed", "Surface runtime owner is closed.");
      if (contextKey(current) !== context) fail("surfaceRuntime.staleContext", "Surface context no longer matches current semantic IR.");
      // Check the actual borrowed family registry before the scene takes a lease.
      for (const slotId of slotIds) {
        const material = registry.getMaterial(slotId);
        if (material.userData.atlasContentHash !== atlasContentHash || material.userData.atlasId !== atlasId)
          fail("surfaceRuntime.staleContext", "Surface atlas no longer matches the family registry.");
      }
      for (const base of input.baseAppearances) {
        const material = registry.getMaterial(base.slotId), expectedColor = new Color().setRGB(base.colorSrgb[0] / 255, base.colorSrgb[1] / 255, base.colorSrgb[2] / 255, SRGBColorSpace);
        if (!material.color.equals(expectedColor) || material.roughness !== base.roughness || material.metalness !== base.metalness ||
            material.opacity !== 1 || material.transparent || !material.depthWrite || material.alphaTest !== 0 ||
            material.map || material.normalMap || material.roughnessMap || material.metalnessMap || material.alphaMap ||
            material.aoMap || material.bumpMap || material.displacementMap || material.lightMap || material.envMap || material.emissiveMap || material.emissive.getHex() !== 0)
          fail("surfaceRuntime.staleContext", "Surface base appearance no longer matches the borrowed flat material.");
      }
      leases++; let released = false;
      return {
        getMaterial(batchId, index) {
          if (released) fail("surfaceRuntime.disposed", "Surface scene lease was released.");
          return byAddress.get(address(batchId, index));
        },
        release() { if (!released) { released = true; leases--; free(); } }
      };
    },
    dispose() { closed = true; free(); }
  };
}

