import { DataTexture, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Matrix4, Vector3, RepeatWrapping } from "three";
import { vi } from "vitest";
import { createBayConstructionGraph, createBuildingConstructionGraph, repeatBayAsFacade } from "../contracts/bayConstructionGraph";
import type { BuildingSurfaceComposition, BuildingSurfaceLayer } from "../contracts/surfaceComposition";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { createConstantSurfaceBaseAppearance, createConstructionSurfaceBases } from "../materials/surfaceBaseAppearance";
import { composeBuildingSurfaceTile } from "../materials/composeSurfaceTile";
import { resolveBuildingSurfaceBindings } from "../materials/resolveSurfaceBindings";
import { sha256Hex } from "../core/contentHash";
import { ProceduralMaterialProvider } from "../materials/providers/proceduralMaterialProvider";
import { createFamilySurfacePixelCache, disposeFamilySurfacePixelCache, prepareBuildingSurfaceRuntime } from "../renderer-three/surfaceMaterialRuntime";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { prepareBayConstructionFixture, createBayConstructionFixture, createBayConstructionMaterials } from "../ui/bayConstructionFixture";
import { resolveConstructionFrameFromPath, resolveConstructionFrameFromIntersections } from "../renderer-three/constructionFrameSelection";
import { setConstructionSurface } from "../core/constructionSurfaceAuthoring";
import { createBayConstructionProject, readBayConstructionProject } from "../state/bayConstructionProject";
import { defaultBuildingPromptControls } from "../state/buildingStore";

const generate = vi.spyOn(ProceduralMaterialProvider.prototype, "generate");
let base: Awaited<ReturnType<typeof createAssemblyHallFixture>>, materials: Awaited<ReturnType<typeof createBayConstructionMaterials>>;
let result: Awaited<ReturnType<typeof evaluateConstruction>>, bases: Awaited<ReturnType<typeof createConstructionSurfaceBases>>;
let bindings: Awaited<ReturnType<typeof resolveBuildingSurfaceBindings>>, originalChannels: string[], sourceCalls: number;
const channels = ["baseColor", "normal", "orm", "height", "opacity"] as const;
const channelHashes = () => Promise.all(channels.map(name => sha256Hex(new Uint8Array(materials.packedAtlas.channels[name].data))));
function composition(layers: BuildingSurfaceLayer[] = []): BuildingSurfaceComposition {
  return { schemaVersion: "0.1.0", documentId: result.graph.documentId, revision: 0,
    sources: [{ id: "wood", slotId: "frame.primary", atlasContentHash: materials.packedAtlas.contentHash }], layers };
}
const firstFrame = () => bindings.bindings.find(binding => binding.role === "frame" && binding.kind === "instance")!;
const fullPath = (relative: string) => result.ir.semanticIndex.find(entry => entry.semanticPath.endsWith("/" + relative))!.semanticPath;
function wood(opacity: number, shared = false): BuildingSurfaceLayer {
  const frame = firstFrame(), slot = materials.packedAtlas.manifest.slots.find(slot => slot.id === frame.baseSlot.slotId)!;
  return { id: "wood", sourceId: "wood", target: shared ? { kind: "role", role: "frame" } : { kind: "element", relativePath: frame.relativePath, expectedRole: "frame" },
    mask: { kind: "constant", value: 1 }, opacity, blend: "replace", physicalSizeM: { ...slot.physicalSizeM }, channels: ["baseColor", "normal", "orm"] };
}
function fixture() { return createBayConstructionFixture(base, result, materials); }
function scene(target: ReturnType<typeof fixture>, surfaceRuntime?: Awaited<ReturnType<typeof prepareBuildingSurfaceRuntime>>) {
  return target.familyRuntime.createOrReplaceBuilding({ ir: result.ir, catalog: target.catalog, componentGallery: target.componentGallery,
    compiledInstanceGeometry: new Map(result.prototypes!.map(prototype => [prototype.batchId, prototype])), surfaceRuntime });
}
const irBytes = () => JSON.stringify({ ir: result.ir, prototypes: result.prototypes }, (_key, value) => ArrayBuffer.isView(value)
  ? { type: value.constructor.name, bytes: [...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)] } : value);
beforeAll(async () => {
  base = await createAssemblyHallFixture({ promptControls: structuredClone(defaultBuildingPromptControls) });
  materials = await createBayConstructionMaterials(base, new AbortController().signal);
  result = await evaluateConstruction(repeatBayAsFacade(createBayConstructionGraph())); bases = await createConstructionSurfaceBases();
  bindings = await resolveBuildingSurfaceBindings({ composition: composition(), ir: result.ir, atlas: materials.packedAtlas });
  originalChannels = await channelHashes(); sourceCalls = generate.mock.calls.length;
}, 120000);
afterAll(async () => {
  try { if (materials) expect(await channelHashes()).toEqual(originalChannels); expect(generate).toHaveBeenCalledTimes(sourceCalls); }
  finally { base?.familyRuntime.dispose(); generate.mockRestore(); }
});

it.each(["empty", "zero"])("retains every accepted material pointer for %s composition on actual construction instances", async kind => {
  const target = fixture(), original = target.buildingRuntime;
  const pointers = new Map([...original.semanticLookup].map(([path, lookup]) => [path, lookup.object.material]));
  const frame = target.familyRuntime.materialRegistry.getMaterial("frame.primary");
  expect(frame.color.getHexString()).toBe("ddd7c8"); expect(frame.roughness).toBe(0.58); expect(frame.map).toBeNull();
  const source = irBytes(), surface = await prepareBuildingSurfaceRuntime({ composition: composition(kind === "zero" ? [wood(0)] : []),
    ir: result.ir, atlas: materials.packedAtlas, baseAppearances: bases });
  try {
    expect(surface.metrics.materialCount).toBe(0); expect(surface.metrics.textureCount).toBe(0);
    const runtime = scene(target, surface); for (const [path, lookup] of runtime.semanticLookup) expect(lookup.object.material).toBe(pointers.get(path));
    expect(irBytes()).toBe(source); expect(generate).toHaveBeenCalledTimes(sourceCalls);
  } finally { surface.dispose(); target.familyRuntime.dispose(); }
});

it("uses accepted paint as the local layer base, partitions exact instances and retains all other bindings and source bytes", async () => {
  const target = fixture(), before = target.buildingRuntime, source = irBytes();
  const pointers = new Map([...before.semanticLookup].map(([path, lookup]) => [path, lookup.object.material]));
  const edited = composition([wood(0.25)]), artifact = await resolveBuildingSurfaceBindings({ composition: edited, ir: result.ir, atlas: materials.packedAtlas });
  const expected = await composeBuildingSurfaceTile({ artifact, relativePath: firstFrame().relativePath, atlas: materials.packedAtlas, baseAppearance: bases[0] });
  const surface = await prepareBuildingSurfaceRuntime({ composition: edited, ir: result.ir, atlas: materials.packedAtlas, baseAppearances: bases });
  try {
    const runtime = scene(target, surface), path = fullPath(firstFrame().relativePath), selected = runtime.semanticLookup.get(path)!;
    expect(selected.object.material).not.toBe(pointers.get(path)); expect(selected.object.material.userData.pixelContentHash).toBe(expected.pixelContentHash);
    expect(selected.object.material.userData.baseAppearanceRef.contentHash).toBe(bases[0].contentHash);
    expect(selected.object.material.roughness).toBe(1); expect(selected.object.material.metalness).toBe(1);
    for (const [other, lookup] of runtime.semanticLookup) if (other !== path) expect(lookup.object.material).toBe(pointers.get(other));
    const textures = { baseColor: selected.object.material.map, normal: selected.object.material.normalMap, orm: selected.object.material.roughnessMap,
      opacity: selected.object.material.alphaMap };
    for (const [name, value] of Object.entries(textures)) {
      const texture = value as DataTexture; expect([...(texture.image.data as Uint8Array)]).toEqual([...expected.channels[name as keyof typeof expected.channels].data]);
      expect(texture.magFilter).toBe(LinearFilter); expect(texture.minFilter).toBe(LinearMipmapLinearFilter); expect(texture.generateMipmaps).toBe(true);
    }
    for (const binding of bindings.bindings.filter(binding => binding.kind === "instance")) {
      const lookup = runtime.semanticLookup.get(fullPath(binding.relativePath))!, native = lookup.object as InstancedMesh, matrix = new Matrix4();
      native.getMatrixAt(lookup.instanceIndex!, matrix);
      const batch = result.ir.instanceBatches.find(batch => batch.batchId === binding.batchId)!, index = binding.elementIndex!;
      expect(matrix.toArray()).toEqual([...batch.transforms!.subarray(index * 16, (index + 1) * 16)]);
      const prototype = result.prototypes!.find(prototype => prototype.batchId === batch.recipeId)!;
      expect([...native.geometry.getAttribute("position").array]).toEqual([...prototype.positions!]);
      expect([...native.geometry.getAttribute("normal").array]).toEqual([...prototype.normals!]);
      expect([...native.geometry.index!.array]).toEqual([...prototype.indices!]);
    }
    expect(irBytes()).toBe(source); expect(surface.metrics.materialCount).toBe(1); expect(surface.metrics.textureCount).toBe(5);
  } finally { surface.dispose(); target.familyRuntime.dispose(); }
});

it("reuses family pixel work only after validating each member and preserves separate resources", async () => {
  const other = await evaluateConstruction(repeatBayAsFacade(createBayConstructionGraph("other-member")));
  const layers = [wood(0.25, true), { ...wood(0.35, true), id: "wall-finish", target: { kind: "role" as const, role: "wall" as const } }];
  const firstInput = { composition: composition(layers), ir: result.ir, atlas: materials.packedAtlas, baseAppearances: bases };
  const otherInput = { ...firstInput, composition: { ...composition(layers), documentId: other.graph.documentId }, ir: other.ir };
  const cache = createFamilySurfacePixelCache();
  const first = await prepareBuildingSurfaceRuntime(firstInput, cache);
  const second = await prepareBuildingSurfaceRuntime(otherInput, cache);
  const independent = await prepareBuildingSurfaceRuntime(otherInput);
  try {
    expect(first.metrics.evaluatedRecipes).toBe(2);
    expect(second.metrics.evaluatedRecipes).toBe(1);
    expect(independent.metrics.evaluatedRecipes).toBe(2);
    const hashes = (value: typeof second) => value.listMaterials().map(material => material.userData.pixelContentHash).sort();
    expect(hashes(second)).toEqual(hashes(independent));
    expect(second.listTextures()[0]).not.toBe(first.listTextures()[0]);
    const textureHashes = async (value: typeof second) => (await Promise.all(value.listTextures().map(async texture => ({
      name: texture.name, hash: await sha256Hex(new Uint8Array(texture.image.data!)) })))).sort((a, b) => a.name.localeCompare(b.name));
    expect(await textureHashes(second)).toEqual(await textureHashes(independent));
    const target = createBayConstructionFixture(base, other, materials);
    try {
      const lease = second.acquire(other.ir, target.familyRuntime.materialRegistry); lease.release();
      expect(() => second.acquire(result.ir, target.familyRuntime.materialRegistry)).toThrow();
    } finally { target.familyRuntime.dispose(); }
    const different = { ...otherInput, composition: { ...otherInput.composition, layers: [wood(0.55, true), layers[1]] } };
    const changed = await prepareBuildingSurfaceRuntime(different, cache);
    try { expect(hashes(changed)).not.toEqual(hashes(second)); } finally { changed.dispose(); }
    const corrupt = structuredClone(materials.packedAtlas); corrupt.channels.baseColor.data[0] ^= 1;
    await expect(prepareBuildingSurfaceRuntime({ ...otherInput, atlas: corrupt }, cache)).rejects.toMatchObject({ code: "surfaceTile.sourceHashMismatch" });
    const missing = { ...otherInput, composition: { ...otherInput.composition, layers: [{ ...layers[0],
      target: { kind: "element" as const, relativePath: "node/missing/frame", expectedRole: "frame" as const } }, layers[1]] } };
    await expect(prepareBuildingSurfaceRuntime(missing, cache)).rejects.toMatchObject({ code: "surface.missingTarget" });
    const changedManifest = structuredClone(materials.packedAtlas);
    changedManifest.manifest.slots.find(slot => slot.id === "frame.primary")!.physicalSizeM.width *= 1.1;
    const differentManifest = await prepareBuildingSurfaceRuntime({ ...otherInput, atlas: changedManifest }, cache);
    try { expect(differentManifest.metrics.evaluatedRecipes).toBe(2); } finally { differentManifest.dispose(); }
    disposeFamilySurfacePixelCache(cache);
    expect(second.listMaterials().length).toBeGreaterThan(0);
    first.dispose(); expect(second.listTextures().every(texture => !texture.userData.disposed)).toBe(true);
    await expect(prepareBuildingSurfaceRuntime(otherInput, cache)).rejects.toMatchObject({ code: "surfaceRuntime.invalidInput" });
  } finally { first.dispose(); second.dispose(); independent.dispose(); disposeFamilySurfacePixelCache(cache); }
}, 120000);

it("admits same-slot wood color/ORM as a finish instead of treating raw wood as the accepted painted base", async () => {
  const sameSlot = wood(1, true); sameSlot.channels = ["baseColor", "orm"];
  const target = fixture(), edited = composition([sameSlot]);
  const legacy = await prepareBuildingSurfaceRuntime({ composition: edited, ir: result.ir, atlas: materials.packedAtlas });
  const surface = await prepareBuildingSurfaceRuntime({ composition: edited, ir: result.ir, atlas: materials.packedAtlas, baseAppearances: bases });
  try {
    expect(legacy.metrics.materialCount).toBe(0); expect(surface.metrics.materialCount).toBe(1);
    const runtime = scene(target, surface), material = runtime.semanticLookup.get(fullPath(firstFrame().relativePath))!.object.material;
    for (const binding of bindings.bindings.filter(binding => binding.role === "frame")) expect(runtime.semanticLookup.get(fullPath(binding.relativePath))!.object.material).toBe(material);
  } finally { legacy.dispose(); surface.dispose(); target.familyRuntime.dispose(); }
});

it("rejects unverified or ambiguous base authority before replacing the accepted scene and defers disposal through the scene lease", async () => {
  const target = fixture(), original = target.buildingRuntime;
  try {
    for (const invalid of [[...bases, bases[0]], [{ ...bases[0], contentHash: "0".repeat(64) }]])
      await expect(prepareBuildingSurfaceRuntime({ composition: composition([wood(0.25)]), ir: result.ir, atlas: materials.packedAtlas, baseAppearances: invalid })).rejects.toThrow();
    expect(original.disposed).toBe(false); expect(target.buildingRuntime).toBe(original);
    const mutable = structuredClone(bases), pending = prepareBuildingSurfaceRuntime({ composition: composition([wood(0.25)]), ir: result.ir, atlas: materials.packedAtlas, baseAppearances: mutable });
    mutable[0].colorSrgb[0] = 0; const surface = await pending;
    scene(target, surface); const disposers = [...surface.listMaterials(), ...surface.listTextures()].map(value => vi.spyOn(value, "dispose"));
    surface.dispose(); expect(surface.metrics.leases).toBe(1); expect(surface.metrics.materialCount).toBe(1);
    target.familyRuntime.dispose(); surface.dispose();
    expect(surface.metrics.leases).toBe(0); expect(surface.metrics.materialCount).toBe(0);
    for (const dispose of disposers) expect(dispose).toHaveBeenCalledTimes(1);
  } finally { target.familyRuntime.dispose(); }
});

it("captures IR metadata before asynchronous base verification yields", async () => {
  const target = fixture(), mutableIR = structuredClone(result.ir);
  const pending = prepareBuildingSurfaceRuntime({ composition: composition([wood(0.25)]), ir: mutableIR, atlas: materials.packedAtlas, baseAppearances: bases });
  mutableIR.semanticIndex.find(entry => entry.semanticPath === fullPath(firstFrame().relativePath))!.semanticPath += "/stale";
  const surface = await pending;
  try {
    const lease = surface.acquire(result.ir, target.familyRuntime.materialRegistry);
    expect(lease.getMaterial(firstFrame().batchId, firstFrame().elementIndex!)).toBeDefined(); lease.release();
    expect(target.buildingRuntime.disposed).toBe(false);
  } finally { surface.dispose(); target.familyRuntime.dispose(); }
});

it("rejects a validly hashed base that disagrees with the accepted material, retaining the original scene", async () => {
  const target = fixture(), original = target.buildingRuntime;
  const foreign = await createConstantSurfaceBaseAppearance({ schemaVersion: "0.1.0", kind: "constant-opaque-pbr-base", slotId: "frame.primary", role: "frame",
    colorSrgb: [255, 0, 0], roughness: 0.58, metalness: 0 });
  try {
    for (const layers of [[], [wood(0.25)]]) {
      const surface = await prepareBuildingSurfaceRuntime({ composition: composition(layers), ir: result.ir, atlas: materials.packedAtlas, baseAppearances: [foreign] });
      try { expect(() => scene(target, surface)).toThrow("base appearance"); expect(original.disposed).toBe(false); }
      finally { surface.dispose(); }
    }
  } finally { target.familyRuntime.dispose(); }
});

it("restores a v3 graph finish through portable source into actual prepared scene ownership", async () => {
  const edited = composition([wood(0.35)]), graph = setConstructionSurface(result.graph, edited);
  const project = await createBayConstructionProject(graph, materials.file);
  const read = await readBayConstructionProject(JSON.parse(JSON.stringify(project)));
  expect(read.project.schemaVersion).toBe("0.3.0"); expect(read.project.graph).toEqual(graph); expect(read.project.materialSource).toEqual(materials.file);
  const target = await prepareBayConstructionFixture(base, await evaluateConstruction(read.project.graph), materials);
  const surface = target.buildingRuntime.surfaceRuntime!;
  try { expect(surface).toBeDefined(); expect(surface.metrics.materialCount).toBe(1); expect(target.buildingRuntime.semanticLookup.get(fullPath(firstFrame().relativePath))!.object.material.map).not.toBeNull(); }
  finally { target.familyRuntime.dispose(); target.familyRuntime.dispose(); }
  expect(surface.disposed).toBe(true);
}, 30000);
it("maps actual glass source element five to frame native index zero after local material partitioning", async () => {
  const frame = bindings.bindings.filter(binding => binding.role === "frame")[5];
  const layer = wood(0.5); layer.target = { kind: "element", relativePath: frame.relativePath, expectedRole: "frame" };
  const target = await prepareBayConstructionFixture(base, await evaluateConstruction(setConstructionSurface(result.graph, composition([layer]))), materials);
  try {
    const runtime = target.buildingRuntime, framePath = fullPath(frame.relativePath), glassPath = framePath.replace(/\/frame$/, "/glass"), glass = runtime.semanticLookup.get(glassPath)!;
    const priorBounds = runtime.semanticLookup.get(framePath)!.object.geometry.boundingBox?.clone();
    const selected = resolveConstructionFrameFromPath(runtime, glassPath)!;
    expect(selected.semanticPath).toBe(framePath); expect(selected.elementIndex).toBe(5); expect(selected.instanceIndex).toBe(0);
    expect(target.familyRuntime.metrics.textureCount).toBe(9 + target.buildingRuntime.surfaceRuntime!.metrics.textureCount);
    expect(target.metrics.drawCallCount).toBe(runtime.renderables.length);
    expect(target.metrics.textureCount).toBe(target.familyRuntime.metrics.textureCount);
    expect(selected.bounds.isEmpty()).toBe(false); expect(selected.object.geometry.boundingBox).toEqual(priorBounds);
    const hit = { object: glass.object, instanceId: glass.instanceIndex ?? glass.elementIndex, distance: 1, point: new Vector3() } as import("three").Intersection;
    expect(resolveConstructionFrameFromIntersections(runtime, [hit])?.semanticPath).toBe(framePath);
    expect(resolveConstructionFrameFromIntersections(runtime, [{ ...hit, instanceId: 999 }])).toBeUndefined();
    const wall = runtime.renderables.find(object => object.userData.role === "wall")!;
    expect(resolveConstructionFrameFromIntersections(runtime, [{ object: wall, distance: 0.5, point: new Vector3() } as import("three").Intersection, hit])).toBeUndefined();
    const material = selected.object.material; material.visible = false;
    expect(resolveConstructionFrameFromPath(runtime, glassPath)).toBeUndefined(); material.visible = true;
    const parent = selected.object.parent!; parent.remove(selected.object);
    expect(resolveConstructionFrameFromPath(runtime, glassPath)).toBeUndefined(); parent.add(selected.object);
    runtime.root.visible = false; expect(resolveConstructionFrameFromPath(runtime, framePath)).toBeUndefined(); runtime.root.visible = true;
  } finally { target.familyRuntime.dispose(); }
  expect(resolveConstructionFrameFromPath(target.buildingRuntime, fullPath(frame.relativePath))).toBeUndefined();
}, 30000);
it("selects the original C1 frame mesh through glass and rejects foreign geometry", async () => {
  const target = createBayConstructionFixture(base, await evaluateConstruction(createBayConstructionGraph()), materials);
  try {
    const runtime = target.buildingRuntime, glass = [...runtime.semanticLookup.values()].find(entry => entry.semanticPath.endsWith("/glass"))!;
    const selected = resolveConstructionFrameFromPath(runtime, glass.semanticPath)!;
    expect(selected.object.isInstancedMesh).not.toBe(true); expect(selected.instanceIndex).toBeUndefined(); expect(selected.semanticPath.endsWith("/frame")).toBe(true);
    expect(resolveConstructionFrameFromIntersections(runtime, [{ object: glass.object, distance: 1, point: new Vector3() } as import("three").Intersection])?.semanticPath).toBe(selected.semanticPath);
    const foreign = glass.object.clone(); expect(resolveConstructionFrameFromIntersections(runtime, [{ object: foreign, distance: 0.5, point: new Vector3() } as import("three").Intersection, { object: glass.object, distance: 1, point: new Vector3() } as import("three").Intersection])).toBeUndefined();
  } finally { target.familyRuntime.dispose(); }
});
it("closes all candidate resources when finish preparation is cancelled or fails", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(prepareBayConstructionFixture(base, result, materials, controller.signal)).rejects.toThrow("cancelled");
  const layer = wood(1); layer.target = { kind: "element", relativePath: "node/window/missing/frame", expectedRole: "frame" };
  const evaluated = await evaluateConstruction(setConstructionSurface(result.graph, composition([layer])));
  await expect(prepareBayConstructionFixture(base, evaluated, materials)).rejects.toThrow();
});

it("round-trips the explicit building appearance and submits unwrapped metre UVs with isolated aligned roof channels",async()=>{
  const graph=createBuildingConstructionGraph(),evaluated=await evaluateConstruction(graph),target=await prepareBayConstructionFixture(base,evaluated,materials);
  try {
    const project=await createBayConstructionProject(graph,materials.file);expect(project.appearancePreset).toBe('restrained-building-v1');expect((await readBayConstructionProject(project)).project).toEqual(project);
    const batch=evaluated.ir.meshBatches.find(batch=>batch.batchId.endsWith('/node/roof/building/roof'))!,object=target.buildingRuntime.objectsByBatchId.get(batch.batchId)!,slot=materials.packedAtlas.manifest.slots.find(slot=>slot.id==='roof.primary')!;
    const expected=new Float32Array([...batch.uvs!].map((v,i)=>v/(i%2?slot.physicalSizeM.height:slot.physicalSizeM.width)));
    expect([...object.geometry.getAttribute('uv').array]).toEqual([...expected]);
    expect([...object.geometry.getAttribute('position').array]).toEqual([...batch.positions!]);
    for(const [channel,texture] of [['baseColor',object.material.map],['normal',object.material.normalMap],['orm',object.material.roughnessMap]] as const){
      const pixels=(texture as DataTexture).image.data as Uint8Array,source=materials.packedAtlas.channels[channel],rect=slot.rectPx;
      expect(texture!.generateMipmaps).toBe(true);expect(texture!.minFilter).toBe(LinearMipmapLinearFilter);
      for(let row=0;row<rect.height;row++){const start=((rect.y+row)*source.widthPx+rect.x)*4;expect([...pixels.subarray(row*rect.width*4,(row+1)*rect.width*4)]).toEqual([...source.data.subarray(start,start+rect.width*4)]);}
    }
    expect(target.familyRuntime.materialRegistry.getMaterial('door.primary').color.getHexString()).toBe('28433d');
    expect(target.familyRuntime.materialRegistry.getMaterial('ornament.primary').metalness).toBe(.8);
    expect(target.metrics.textureCount).toBe(12);expect(target.metrics.drawCallCount).toBe(target.buildingRuntime.renderables.length);
  } finally {target.familyRuntime.dispose();}
},30000);

it("keeps frame UV buffers unchanged across a local finish and samples physical timber coordinates instead of one texel",async()=>{
  const graph=createBuildingConstructionGraph(),original=await evaluateConstruction(graph),empty=await prepareBayConstructionFixture(base,original,materials);
  const path=original.ir.semanticIndex.find(entry=>entry.semanticPath.endsWith('/facade/floor/1/bay/1/frame'))!.semanticPath;
  const layer=wood(.3);layer.target={kind:'element',relativePath:path.slice(('building/'+graph.documentId+'/').length),expectedRole:'frame'};
  const comp={...composition([layer]),documentId:graph.documentId};const painted=await prepareBayConstructionFixture(base,await evaluateConstruction(setConstructionSurface(graph,comp)),materials);
  try{
    const before=empty.buildingRuntime.semanticLookup.get(path)!.object,after=painted.buildingRuntime.semanticLookup.get(path)!.object;
    expect([...after.geometry.getAttribute('uv').array]).toEqual([...before.geometry.getAttribute('uv').array]);
    const prototype=original.prototypes!.find(prototype=>prototype.role==='frame')!,slot=materials.packedAtlas.manifest.slots.find(slot=>slot.id==='frame.primary')!;
    expect([...after.geometry.getAttribute('uv').array]).toEqual([...new Float32Array([...prototype.uvs!].map((v,i)=>v/(i%2?slot.physicalSizeM.height:slot.physicalSizeM.width)))]);
    expect(prototype.uvs!.some(value=>value>1)).toBe(true);
    expect(after.material.userData.isolatedMeterTile).toBeDefined();expect(after.material.map!.wrapS).toBe(RepeatWrapping);
  }finally{empty.familyRuntime.dispose();painted.familyRuntime.dispose();}
});

it("retains an old composed facade's actual UV and sampler data when a building node is not connected",async()=>{
  const graph=setConstructionSurface(result.graph,composition([wood(.3)])),original=await prepareBayConstructionFixture(base,await evaluateConstruction(graph),materials);
  const upgraded={...graph,schemaVersion:'0.4.0',nodes:[...graph.nodes,{id:'unused',type:'Footprint',parameters:{widthM:10,depthM:8,wallDepthM:.36}}]};
  const candidate=await prepareBayConstructionFixture(base,await evaluateConstruction(upgraded),materials);
  try{const path=fullPath(firstFrame().relativePath),a=original.buildingRuntime.semanticLookup.get(path)!.object,b=candidate.buildingRuntime.semanticLookup.get(path)!.object;
    expect([...b.geometry.getAttribute('uv').array]).toEqual([...a.geometry.getAttribute('uv').array]);expect(b.material.map!.wrapS).toBe(a.material.map!.wrapS);
    expect(b.material.userData.pixelContentHash).toBe(a.material.userData.pixelContentHash);expect(b.material.userData.isolatedMeterTile).toBeUndefined();
  }finally{original.familyRuntime.dispose();candidate.familyRuntime.dispose();}
});
