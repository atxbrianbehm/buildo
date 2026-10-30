import {
  ClampToEdgeWrapping, CubeTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType, type Texture
} from "three";
import type { BayConstructionResult } from "../compiler/evaluateBayConstruction";
import { constructionUsesOperator } from "../core/constructionSurfaceAuthoring";
import { buildingFlatAppearances, constructionFlatAppearances } from "../core/constructionAppearance";
import { createBuildingFamilyRuntime } from "../renderer-three/familyRuntime";
import { planAtlas } from "../materials/atlasPlanner";
import { packAtlas, type PackedAtlas } from "../materials/atlasPacker";
import { createAtlasDebugExport, type AtlasDebugExport } from "../materials/atlasDebugExport";
import { ProceduralMaterialProvider, type MaterialGenerationProvider } from "../materials/providers/proceduralMaterialProvider";
import { captureBuildingSourceSnapshot, createBuildingSourceFile, type BuildingSourceFile } from "../state/buildingSourceFile";
import type { AssemblyHallFixture } from "./assemblyHallFixture";
import { createConstructionSurfaceBases } from "../materials/surfaceBaseAppearance";
import { createFamilySurfacePixelCache, disposeFamilySurfacePixelCache, prepareBuildingSurfaceRuntime, type BuildingSurfaceRuntime, type FamilySurfacePixelCache } from "../renderer-three/surfaceMaterialRuntime";

import { generateConstructionReferenceAtlas } from "../materials/constructionReferenceMaterials";

export interface BayConstructionMaterials {
  packedAtlas: PackedAtlas;
  debugExport: AtlasDebugExport;
  file: BuildingSourceFile;
}
export type BayConstructionFixture = AssemblyHallFixture & { construction: BayConstructionResult };

function configureConstructionSurface(surface: BuildingSurfaceRuntime) {
  for (const material of surface.listMaterials()) {
    const slot = material.userData.atlasSlot;
    material.userData.isolatedMeterTile = { widthM: slot.physicalSizeM.width, heightM: slot.physicalSizeM.height };
    for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.alphaMap]) if (texture) {
      texture.wrapS = slot.periodicity === "x" || slot.periodicity === "xy" || slot.uvMode === "repeat" || slot.uvMode === "cap-repeat-cap" ? RepeatWrapping : ClampToEdgeWrapping;
      texture.wrapT = slot.periodicity === "xy" || slot.uvMode === "repeat" ? RepeatWrapping : ClampToEdgeWrapping; texture.needsUpdate = true;
    }
  }
}

/** Preparation owns resources until the caller can atomically publish the new view. */
export async function prepareBayConstructionFixture(base: AssemblyHallFixture, result: BayConstructionResult,
  materials: BayConstructionMaterials, signal?: AbortSignal, familyCache?: FamilySurfacePixelCache): Promise<BayConstructionFixture> {
  const fixture = createBayConstructionFixture(base, result, materials);
  let surface: BuildingSurfaceRuntime | undefined;
  const check = () => { if (signal?.aborted) throw new DOMException("Construction was cancelled.", "AbortError"); };
  try {
    check();
    if (result.surfaceComposition) {
      const baseAppearances = await createConstructionSurfaceBases(); check();
      surface = await prepareBuildingSurfaceRuntime({ composition: result.surfaceComposition, ir: result.ir, atlas: materials.packedAtlas, baseAppearances }, familyCache); check();
      if (constructionUsesOperator(result.graph, "Footprint", result.previewNodeId ?? result.graph.outputNodeId)) configureConstructionSurface(surface);
      const baseTextureCount = fixture.familyRuntime.metrics.textureCount;
      fixture.buildingRuntime = fixture.familyRuntime.createOrReplaceBuilding({ ir: result.ir, catalog: fixture.catalog,
        componentGallery: fixture.componentGallery, compiledInstanceGeometry: new Map(result.prototypes?.map(prototype => [prototype.batchId, prototype])), surfaceRuntime: surface });
      fixture.familyRuntime.metrics.textureCount = baseTextureCount + surface.metrics.textureCount;
      fixture.metrics.textureCount = fixture.familyRuntime.metrics.textureCount;
      fixture.metrics.drawCallCount = fixture.familyRuntime.metrics.drawCallCount;
      fixture.variantStress.aggregate.drawCallCount = fixture.familyRuntime.metrics.drawCallCount;
      const originalDispose = fixture.familyRuntime.dispose, owner = surface;
      fixture.familyRuntime.dispose = () => { try { return originalDispose(); } finally { owner.dispose(); } };
    }
    return fixture;
  } catch (error) { try { fixture.familyRuntime.dispose(); } finally { surface?.dispose(); } throw error; }
}

/** Prepare a temporary family view; every member shares one atlas and material registry. */
export async function prepareConstructionFamilyFixture(base: AssemblyHallFixture, results: BayConstructionResult[],
  materials: BayConstructionMaterials, signal?: AbortSignal): Promise<BayConstructionFixture> {
  if (results.length !== 6) throw new Error("A family preview requires six buildings.");
  const check = () => { if (signal?.aborted) throw new DOMException("Family preview was cancelled.", "AbortError"); };
  const cache = createFamilySurfacePixelCache();
  let fixture: BayConstructionFixture | undefined;
  const surfaces: BuildingSurfaceRuntime[] = [];
  try {
    fixture = await prepareBayConstructionFixture(base, results[0], materials, signal, cache);
    const extraTextureCount = fixture.familyRuntime.metrics.textureCount - Object.keys(fixture.familyRuntime.textureSet.textures).length
      - (fixture.buildingRuntime.surfaceRuntime?.listTextures().length ?? 0);
    const widths = results.map(result => result.ir.bounds.max[0] - result.ir.bounds.min[0]);
    const spacing = Math.max(...widths) + 3;
    fixture.buildingRuntime.root.position.x = -2.5 * spacing;
    const bases = await createConstructionSurfaceBases(); check();
    for (const [index, result] of results.slice(1).entries()) {
      check();
      let surface: BuildingSurfaceRuntime | undefined;
      if (result.surfaceComposition) {
        surface = await prepareBuildingSurfaceRuntime({ composition: result.surfaceComposition, ir: result.ir, atlas: materials.packedAtlas, baseAppearances: bases }, cache);
        surfaces.push(surface); check(); configureConstructionSurface(surface);
      }
      const runtime = fixture.familyRuntime.createOrReplaceBuilding({ ir: result.ir, catalog: fixture.catalog,
        compiledInstanceGeometry: new Map(result.prototypes?.map(prototype => [prototype.batchId, prototype])), surfaceRuntime: surface });
      runtime.root.position.x = (index - 1.5) * spacing;
    }
    check();
    fixture.familyRuntime.metrics.textureCount += extraTextureCount;
    const originalDispose = fixture.familyRuntime.dispose;
    fixture.familyRuntime.dispose = () => { try { return originalDispose(); } finally { for (const surface of surfaces) surface.dispose(); } };
    fixture.metrics = { ...fixture.metrics, ...fixture.familyRuntime.metrics };
    return fixture;
  } catch (error) { try { fixture?.familyRuntime.dispose(); } finally { for (const surface of surfaces) surface.dispose(); } throw error; }
  finally { disposeFamilySurfacePixelCache(cache); }
}

/** New-project initialization only. Graph edits reuse the resulting immutable artifacts. */
export async function createBayConstructionMaterials(
  base: AssemblyHallFixture, signal: AbortSignal, provider: MaterialGenerationProvider = new ProceduralMaterialProvider(), sourceQuality: "bay" | "building" = "bay"
): Promise<BayConstructionMaterials> {
  if (!base.sourceSnapshot) throw new Error("Run an editable building before starting a construction project.");
  const sourceSnapshot = captureBuildingSourceSnapshot(base.sourceSnapshot), spec = structuredClone(base.spec);
  const plan = await planAtlas(spec, { widthPx: 1024, heightPx: 1024, paddingPx: 8 });
  if (signal.aborted) throw new DOMException("Construction was cancelled.", "AbortError");
  const sourceSize = (source: typeof plan.materialSources[number]) => source.samplingProfile || sourceQuality === "building" &&
    ["frame","door","roof","horizontalTrim","verticalTrim"].includes(source.role) ? 256 : 64;
  const sources = await Promise.all(plan.materialSources.map(source => provider.generate({
    ...source, widthPx: sourceSize(source), heightPx: sourceSize(source)
  }, signal)));
  if (signal.aborted) throw new DOMException("Construction was cancelled.", "AbortError");
  const packedAtlas = await packAtlas(plan, sources);
  const debugExport = await createAtlasDebugExport(packedAtlas);
  if (signal.aborted) throw new DOMException("Construction was cancelled.", "AbortError");
  const file = await createBuildingSourceFile({ sourceSnapshot, packedAtlas, debugExport });
  return { packedAtlas, debugExport, file };
}

/** Opt-in reference materials; the legacy initializer above stays unchanged. */
export async function createReferenceConstructionMaterials(base: AssemblyHallFixture, source: unknown, signal: AbortSignal, templateSpec: unknown = base.spec) {
  if (!base.sourceSnapshot) throw new Error("An editable material template is required.");
  const sourceSnapshot = captureBuildingSourceSnapshot(base.sourceSnapshot);
  const { plan, packedAtlas } = await generateConstructionReferenceAtlas(templateSpec, source, signal);
  const debugExport = await createAtlasDebugExport(packedAtlas);
  if (signal.aborted) throw new Error("Reference material generation aborted.");
  const file = await createBuildingSourceFile({ sourceSnapshot, packedAtlas, debugExport });
  if (signal.aborted) throw new Error("Reference material generation aborted.");
  return { materials: { packedAtlas, debugExport, file }, plan };
}

function wallTexture(materials: BayConstructionMaterials, channel: "baseColor" | "normal" | "orm"): DataTexture {
  const source = materials.packedAtlas.channels[channel];
  const slot = materials.packedAtlas.manifest.slots.find(slot => slot.id === "wall.primary");
  if (!slot) throw new Error("Construction materials need a primary masonry slot.");
  const rect = slot.rectPx, data = new Uint8Array(rect.width * rect.height * 4);
  for (let row = 0; row < rect.height; row++) {
    const start = ((rect.y + row) * source.widthPx + rect.x) * 4;
    data.set(source.data.subarray(start, start + rect.width * 4), row * rect.width * 4);
  }
  if (channel === "baseColor") {
    // A named display-material preset: compress the demo brick/mortar contrast in
    // linear light. The owned atlas and its aligned physical channels stay intact.
    const linear = (byte: number) => { const v = byte / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const encoded = (v: number) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
    const substrate = [0.26, 0.14, 0.09];
    for (let i = 0; i < data.length; i += 4) {
      const rgb = [linear(data[i]), linear(data[i + 1]), linear(data[i + 2])];
      const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      for (let c = 0; c < 3; c++) data[i + c] = encoded((rgb[c] * 0.65 + luminance * 0.35) * 0.45 + substrate[c] * 0.55);
    }
  }
  const texture = new DataTexture(data, rect.width, rect.height, RGBAFormat, UnsignedByteType);
  texture.name = `construction.restrained-bay-v1.${channel}`;
  texture.colorSpace = channel === "baseColor" ? SRGBColorSpace : NoColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.flipY = false;
  // The existing adapter submits atlas UVs. Convert them into this isolated tile.
  // Its mip chain cannot blend unrelated atlas slots into distant masonry.
  texture.repeat.set(source.widthPx / rect.width, source.heightPx / rect.height);
  texture.offset.set(-rect.x / rect.width, -rect.y / rect.height);
  texture.needsUpdate = true;
  return texture;
}

/** Isolated roof planes keep metric UVs and a filtered mip chain out of unrelated slots. */
function roofTexture(materials: BayConstructionMaterials, channel: "baseColor" | "normal" | "orm"): DataTexture {
  const source=materials.packedAtlas.channels[channel],slot=materials.packedAtlas.manifest.slots.find(slot=>slot.id === "roof.primary");
  if(!slot)throw new Error("Construction materials need a roof slot.");
  const rect=slot.rectPx,data=new Uint8Array(rect.width*rect.height*4);
  for(let row=0;row<rect.height;row++){const start=((rect.y+row)*source.widthPx+rect.x)*4;data.set(source.data.subarray(start,start+rect.width*4),row*rect.width*4);}
  const texture=new DataTexture(data,rect.width,rect.height,RGBAFormat,UnsignedByteType);
  texture.name=`construction.restrained-building-v1.roof.${channel}`;texture.colorSpace=channel === "baseColor"?SRGBColorSpace:NoColorSpace;
  texture.wrapS=texture.wrapT=RepeatWrapping;texture.magFilter=LinearFilter;texture.minFilter=LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.flipY=false;texture.needsUpdate=true;return texture;
}

/** Small deterministic outdoor reflection field; no DOM, network or building image. */
function glazingEnvironment(): CubeTexture {
  const size = 32;
  const images = Array.from({ length: 6 }, (_, face) => {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1;
      const direction = [[1, -v, -u], [-1, -v, u], [u, 1, v], [u, -1, -v], [u, -v, 1], [-u, -v, -1]][face];
      const elevation = direction[1] / Math.hypot(...direction), blend = Math.sqrt(Math.abs(elevation));
      const horizon = [206, 215, 219], pole = elevation >= 0 ? [122, 157, 182] : [76, 73, 63];
      const offset = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) data[offset + c] = Math.round(horizon[c] * (1 - blend) + pole[c] * blend);
      data[offset + 3] = 255;
    }
    return new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  });
  const texture = new CubeTexture(images);
  texture.name = "construction.restrained-bay-v1.outdoor-reflections";
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

/** Projects only the new evaluated IR into the existing viewer; no fixed building compilation. */
export function createBayConstructionFixture(
  base: AssemblyHallFixture, construction: BayConstructionResult, materials: BayConstructionMaterials
): BayConstructionFixture {
  const { ir, graph } = construction;
  const wholeBuilding=constructionUsesOperator(graph,"Footprint",construction.previewNodeId ?? graph.outputNodeId);
  const familyRuntime = createBuildingFamilyRuntime({
    familyId: ir.familyId, packedAtlas: materials.packedAtlas, debugExport: materials.debugExport,
    backendSupport: base.backendSupport
  });
  const extras: Texture[] = [];
  const originalDispose = familyRuntime.dispose;
  let extraDisposed = false;
  familyRuntime.dispose = () => {
    const result = originalDispose();
    const extraCount = extraDisposed ? 0 : extras.length;
    if (!extraDisposed) { extraDisposed = true; for (const texture of extras) texture.dispose(); }
    return { ...result, texturesDisposed: result.texturesDisposed + extraCount };
  };
  try {
    const wall = familyRuntime.materialRegistry.getMaterial("wall.primary");
    const baseColor = wallTexture(materials, "baseColor"); extras.push(baseColor);
    const normal = wallTexture(materials, "normal"); extras.push(normal);
    const orm = wallTexture(materials, "orm"); extras.push(orm);
    wall.map = baseColor; wall.normalMap = normal; wall.roughnessMap = wall.metalnessMap = orm;
    wall.alphaMap = null; wall.normalScale.set(0.13, 0.13);
    wall.color.set("#f0e8df"); wall.roughness = 0.9; wall.metalness = 0;

    for (const appearance of constructionFlatAppearances) {
      const material = familyRuntime.materialRegistry.getMaterial(appearance.slotId);
      material.map = material.normalMap = material.roughnessMap = material.metalnessMap = material.alphaMap = null;
      material.color.set(appearance.color); material.roughness = appearance.roughness; material.metalness = appearance.metalness;
      material.transparent = false; material.opacity = 1; material.depthWrite = true; material.needsUpdate = true;
    }
    const environment = glazingEnvironment(); extras.push(environment);
    const glazing = familyRuntime.materialRegistry.getMaterial("glass.primary");
    glazing.envMap = environment; glazing.envMapIntensity = 1.4; glazing.needsUpdate = true;
    if(wholeBuilding) for(const appearance of constructionFlatAppearances) if(appearance.role !== "glass") {
      const slot=materials.packedAtlas.manifest.slots.find(slot=>slot.id === appearance.slotId)!;
      familyRuntime.materialRegistry.getMaterial(appearance.slotId).userData.isolatedMeterTile={widthM:slot.physicalSizeM.width,heightM:slot.physicalSizeM.height};
    }
    if (wholeBuilding) for (const appearance of buildingFlatAppearances) {
      const material = familyRuntime.materialRegistry.getMaterial(appearance.slotId);
      material.map = material.normalMap = material.roughnessMap = material.metalnessMap = material.alphaMap = null;
      material.color.set(appearance.color); material.roughness = appearance.roughness; material.metalness = appearance.metalness;
      material.transparent = false; material.opacity = 1; material.alphaTest = 0; material.depthWrite = true;
      if (appearance.metalness > 0) { material.envMap = environment; material.envMapIntensity = .65; }
      material.needsUpdate = true;
    }
    if(wholeBuilding) {
      const roof=familyRuntime.materialRegistry.getMaterial("roof.primary"),slot=materials.packedAtlas.manifest.slots.find(slot=>slot.id === "roof.primary")!;
      const color=roofTexture(materials,"baseColor");extras.push(color);const normal=roofTexture(materials,"normal");extras.push(normal);const orm=roofTexture(materials,"orm");extras.push(orm);
      roof.map=color;roof.normalMap=normal;roof.roughnessMap=roof.metalnessMap=orm;roof.alphaMap=null;
      roof.color.set("#888f89");roof.normalScale.set(.12,.12);roof.roughness=1;roof.metalness=1;
      roof.userData.isolatedMeterTile={widthM:slot.physicalSizeM.width,heightM:slot.physicalSizeM.height};roof.needsUpdate=true;
    }
    const catalog = { ...base.catalog, atlasId: materials.packedAtlas.atlasId };
    const componentGallery = {
      schemaVersion: "0.1.0" as const, galleryId: `construction.${graph.documentId}`,
      familyId: ir.familyId, buildingId: ir.buildingId, sourceGraphHash: ir.sourceGraphHash, entries: [], diagnostics: []
    };
    const buildingRuntime = familyRuntime.createOrReplaceBuilding({ ir, catalog, componentGallery,
      compiledInstanceGeometry: new Map(construction.prototypes?.map(prototype => [prototype.batchId, prototype])) });
    familyRuntime.metrics.textureCount += extras.length;
    const facade = construction.trace.find(entry => entry.type === "FacadeScope") ?? { bounds: ir.bounds };
    const width = facade.bounds.max[0] - facade.bounds.min[0], height = facade.bounds.max[1] - facade.bounds.min[1];
    const addresses = construction.trace.flatMap(entry => entry.scopeNames ?? []);
    const floorCount = Math.max(1, new Set(addresses.map(name => name.match(/floor\/(\d+)/)?.[1]).filter(Boolean)).size);
    const bayCount = Math.max(1, new Set(addresses.map(name => name.match(/bay\/(\d+)/)?.[1]).filter(Boolean)).size);
    return { ...base, construction, sourceSnapshot: undefined, prompt: "Authored facade bay", ir,
      // The legacy trace is a viewer compatibility field, never construction authority or saved graph source.
      catalog, componentGallery, familyRuntime, buildingRuntime,
      packedAtlas: materials.packedAtlas, debugExport: materials.debugExport,
      spec: { ...base.spec, familyId: ir.familyId,
        massing: { ...base.spec.massing, widthM: width, depthM: facade.bounds.max[2] - facade.bounds.min[2],
          floorCount, floorHeightsM: Array.from({ length: floorCount }, () => height / floorCount) },
        facade: { ...base.spec.facade, frontBayCount: bayCount } },
      variantStress: { ...base.variantStress, variantCount: 0, sharedFamilyId: ir.familyId,
        sharedAtlasId: materials.packedAtlas.atlasId, sharedAtlasContentHash: materials.packedAtlas.contentHash,
        sharedSourceGraphHash: ir.sourceGraphHash, variants: [],
        aggregate: { drawCallCount: familyRuntime.metrics.drawCallCount, instanceCount: ir.metrics.instanceCount,
          triangleCount: ir.metrics.triangleCount, semanticPathCount: ir.semanticIndex.length } },
      metrics: { ...base.metrics, activeBackend: "pending", atlasContentHash: materials.packedAtlas.contentHash,
        buildingCount: 1, componentCount: 0, drawCallCount: familyRuntime.metrics.drawCallCount,
        instanceCount: ir.metrics.instanceCount, triangleCount: ir.metrics.triangleCount, textureCount: familyRuntime.metrics.textureCount }
    };
  } catch (error) { familyRuntime.dispose(); throw error; }
}

