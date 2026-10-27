import { BufferGeometry, InstancedMesh, Matrix4, Quaternion, Triangle, Vector2, Vector3 } from "three";
import { vi } from "vitest";
import { ComponentCatalogSchema } from "../components/componentCatalogBuilder";
import { buildComponentGallery, type ComponentGallery } from "../compiler/componentGalleryBuilder";
import { buildBoxPrimitive, combinePrimitiveGeometry } from "../compiler/primitiveGeometry";
import { AtlasManifestSchema, type AtlasSlot } from "../contracts/atlasManifest";
import { RuntimeBuildingIRSchema, type RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";
import type { PackedAtlas } from "../materials/atlasPacker";
import type { PixelLayer } from "../materials/providers/proceduralMaterialProvider";
import { createAtlasMaterialRegistry } from "../renderer-three/buildingAtlasMaterialFactory";
import { createAtlasTextureSet, slotTextureWindow } from "../renderer-three/buildingAtlasTextureFactory";
import { createBuildingSceneRuntime, disposeBuildingSceneRuntime, type BuildingRenderable } from "../renderer-three/buildingSceneAdapter";
import { createRecipeBufferGeometry } from "../renderer-three/recipeGeometryFactory";

const tileM = 0.96;
const lightBrick = [234, 72, 42, 255];
const darkBrick = [105, 32, 19, 255];
const depth = 0.06;

function layer(rgba: number[]): PixelLayer {
  const data = new Uint8ClampedArray(64 * 32 * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(rgba, offset);
  return { widthPx: 64, heightPx: 32, channels: "rgba8", data };
}

function atlas(uvMode: AtlasSlot["uvMode"] = "repeat", periodicity: AtlasSlot["periodicity"] = "xy"): PackedAtlas {
  const manifest = AtlasManifestSchema.parse({
    schemaVersion: "0.1.0", atlasId: "wall-regression-atlas", widthPx: 64, heightPx: 32, paddingPx: 4,
    channels: ["baseColor", "normal", "orm", "height", "opacity"],
    slots: [
      { id: "wall.primary", role: "wall", rectPx: { x: 4, y: 4, width: 16, height: 16 }, uvMode, periodicity,
        physicalSizeM: { width: tileM, height: tileM }, materialSourceId: "brick", compatibilityTags: [], generationPrompt: "brick", seedPath: "material/brick" },
      { id: "glass.primary", role: "glass", rectPx: { x: 28, y: 4, width: 16, height: 16 }, uvMode: "stretch", periodicity: "none",
        physicalSizeM: { width: 1, height: 1 }, materialSourceId: "glass", compatibilityTags: [], generationPrompt: "glass", seedPath: "material/glass" }
    ]
  });
  const baseColor = layer([250, 0, 250, 255]);
  // The production packer duplicates slot edge pixels into its four-pixel padding.
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      const wallX = Math.min(15, Math.max(0, x - 4));
      const wallY = Math.min(15, Math.max(0, y - 4));
      baseColor.data.set((Math.floor(wallX / 2) + Math.floor(wallY / 2)) % 2 ? darkBrick : lightBrick, (y * 64 + x) * 4);
    }
    for (let x = 24; x < 48; x += 1) baseColor.data.set([0, 255, 0, 255], (y * 64 + x) * 4);
  }
  return { schemaVersion: "0.1.0", atlasId: manifest.atlasId, manifest,
    channels: { baseColor, normal: layer([128, 128, 255, 255]), orm: layer([255, 200, 0, 255]), height: layer([128, 128, 128, 255]), opacity: layer([255, 255, 255, 255]) },
    slotProvenance: [], contentHash: "a".repeat(64), diagnostics: [] };
}

function swatchInputs(widths: number[], height = 1, scales: number[][] = []) {
  const meshBatches = widths.map((width, index) => {
    const geometry = combinePrimitiveGeometry([buildBoxPrimitive({ center: [width / 2, height / 2, 0], size: [width, height, depth] })]);
    return { batchId: `wall-${index}`, role: "wall", materialSlotId: "wall.primary", positions: geometry.positions, normals: geometry.normals, uvs: geometry.uvs, indices: geometry.indices };
  });
  const transforms = new Float32Array(scales.flatMap((scale, index) => new Matrix4().compose(new Vector3(index * 10, 0, 0), new Quaternion(), new Vector3(scale[0], scale[1], scale[2])).elements));
  const instanceBatches = scales.length ? [{ batchId: "wall-instances", recipeId: "wall-box", materialSlotId: "wall.primary", count: scales.length, transforms }] : [];
  const ir = RuntimeBuildingIRSchema.parse({
    schemaVersion: "0.1.0", buildingId: "wall-regression", familyId: "wall-family", sourceGraphHash: "b".repeat(64),
    bounds: { min: [0, 0, -depth / 2], max: [Math.max(1, ...widths, scales.length * 10), Math.max(height, 3), depth / 2] },
    meshBatches, instanceBatches,
    semanticIndex: [
      ...meshBatches.map((batch) => ({ batchId: batch.batchId, semanticPath: `facade/${batch.batchId}`, stage: "facade" })),
      ...scales.map((_, elementIndex) => ({ batchId: "wall-instances", semanticPath: `facade/instance-${elementIndex}`, stage: "facade", elementIndex }))
    ],
    metrics: { vertexCount: meshBatches.reduce((sum, batch) => sum + batch.positions.length / 3, 0), triangleCount: meshBatches.reduce((sum, batch) => sum + batch.indices.length / 3, 0), instanceCount: scales.length }
  });
  const catalog = ComponentCatalogSchema.parse({
    schemaVersion: "0.1.0", catalogId: "wall-regression-catalog", familyId: ir.familyId, atlasId: "wall-regression-atlas", diagnostics: [],
    recipes: [{ schemaVersion: "0.1.0", id: "wall-box", kind: "boxAssembly", role: "wall", dimensionsM: { width: 1, height: 1, depth },
      parameterRanges: {}, anchors: [], atlasSlotIds: ["wall.primary"], uvBehavior: "repeat", variationScope: "building", lowDetailRecipeId: "wall-box" }]
  });
  return { ir, catalog };
}

function createSwatches(input: ReturnType<typeof swatchInputs>, packedAtlas = atlas(), componentGallery?: ComponentGallery) {
  const textureSet = createAtlasTextureSet({ packedAtlas });
  const materialRegistry = createAtlasMaterialRegistry({ atlasId: packedAtlas.atlasId, atlasContentHash: packedAtlas.contentHash, textureSet });
  const runtime = createBuildingSceneRuntime({ ...input, materialRegistry, componentGallery });
  runtime.root.updateMatrixWorld(true);
  return { runtime, textureSet, packedAtlas };
}

// Interpolate the actual rendered triangle, independently of the adapter's repeat algorithm.
function uvAt(object: BuildingRenderable, point: Vector3, instanceIndex?: number): Vector2 {
  const geometry = object.geometry;
  const positions = geometry.getAttribute("position");
  const normals = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const indices = geometry.index;
  const matrix = object.matrixWorld.clone();
  if (object.isInstancedMesh) {
    const instance = new Matrix4();
    (object as InstancedMesh).getMatrixAt(instanceIndex ?? 0, instance);
    matrix.multiply(instance);
  }
  const count = indices?.count ?? positions.count;
  for (let index = 0; index < count; index += 3) {
    const vertices = [0, 1, 2].map((offset) => indices ? indices.getX(index + offset) : index + offset);
    if (vertices.some((vertex) => normals.getZ(vertex) < 0.99)) continue;
    const [a, b, c] = vertices.map((vertex) => new Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(matrix));
    if (Math.abs(point.z - a.z) > 1e-6) continue;
    const weights = new Triangle(a, b, c).getBarycoord(point, new Vector3());
    if (!weights || Math.min(weights.x, weights.y, weights.z) < -1e-6) continue;
    return new Vector2(
      weights.x * uv.getX(vertices[0]) + weights.y * uv.getX(vertices[1]) + weights.z * uv.getX(vertices[2]),
      weights.x * uv.getY(vertices[0]) + weights.y * uv.getY(vertices[1]) + weights.z * uv.getY(vertices[2])
    );
  }
  throw new Error(`No rendered front triangle contains ${point.toArray()}.`);
}

function slotPhase(uv: Vector2, textureSet: ReturnType<typeof createAtlasTextureSet>): number[] {
  const rect = slotTextureWindow(textureSet, "wall.primary").uvRect;
  return [(uv.x - rect.x) / rect.width, (uv.y - rect.y) / rect.height];
}

function sampledColor(uv: Vector2, packedAtlas: PackedAtlas): number[] {
  const { baseColor } = packedAtlas.channels;
  const offset = (Math.floor(uv.y * baseColor.heightPx) * baseColor.widthPx + Math.floor(uv.x * baseColor.widthPx)) * 4;
  return Array.from(baseColor.data.slice(offset, offset + 4));
}

function retainedArrays(ir: RuntimeBuildingIR) {
  return [...ir.meshBatches.flatMap((batch) => [batch.positions, batch.normals, batch.uvs, batch.indices].filter((array) => array !== undefined)),
    ...ir.instanceBatches.map((batch) => batch.transforms!).filter(Boolean)].map((array) => ({ array, before: Array.from(array) }));
}

function area(geometry: BufferGeometry): number {
  const positions = geometry.getAttribute("position");
  const indices = geometry.index;
  let result = 0;
  for (let offset = 0; offset < (indices?.count ?? positions.count); offset += 3) {
    const [a, b, c] = [0, 1, 2].map((index) => new Vector3().fromBufferAttribute(positions, indices ? indices.getX(offset + index) : offset + index));
    result += new Triangle(a, b, c).getArea();
  }
  return result;
}

describe("wall atlas physical sampling", () => {
  it("preserves interior repeat phases on separate one-, four- and sub-one-metre mesh batches", () => {
    const input = swatchInputs([1, 4, 0.6]);
    const copies = retainedArrays(input.ir);
    const { runtime, textureSet, packedAtlas } = createSwatches(input);
    try {
      for (const [index, width] of [1, 4, 0.6].entries()) {
        const object = runtime.objectsByBatchId.get(`wall-${index}`)!;
        const offsets = [0.15, 0.45, 0.95, 0.97, 1.11, 3.91].filter((value) => value < width);
        for (const x of offsets) {
          const y = 0.21;
          const uv = uvAt(object, new Vector3(x, y, depth / 2));
          const expected = [x / tileM % 1, y / tileM % 1];
          const phase = slotPhase(uv, textureSet);
          expect(phase[0]).toBeCloseTo(expected[0], 5);
          expect(phase[1]).toBeCloseTo(expected[1], 5);
          expect(sampledColor(uv, packedAtlas)).toEqual((Math.floor(expected[0] * 8) + Math.floor(expected[1] * 8)) % 2 ? darkBrick : lightBrick);
        }
        expect(object.material).toBe(runtime.materialRegistry.getMaterial("wall.primary"));
        expect(object.material.map).toBe(textureSet.textures.baseColor);
      }
      for (const { array, before } of copies) expect(Array.from(array)).toEqual(before);
    } finally { disposeBuildingSceneRuntime(runtime); }
  });

  it("does not interpolate across a repeat boundary or sample neighbouring slots", () => {
    const { runtime, textureSet, packedAtlas } = createSwatches(swatchInputs([4]));
    try {
      const object = runtime.objectsByBatchId.get("wall-0")!;
      for (const boundary of [tileM, tileM * 2, tileM * 3, tileM * 4]) {
        const before = uvAt(object, new Vector3(boundary - 0.0001, 0.21, depth / 2));
        const after = uvAt(object, new Vector3(boundary + 0.0001, 0.21, depth / 2));
        expect(slotPhase(before, textureSet)[0]).toBeGreaterThan(0.999);
        expect(slotPhase(after, textureSet)[0]).toBeLessThan(0.001);
        expect(sampledColor(before, packedAtlas)).toEqual(lightBrick);
        expect(sampledColor(after, packedAtlas)).toEqual(darkBrick);
      }
    } finally { disposeBuildingSceneRuntime(runtime); }
  });

  it("stretches V when only the U axis repeats", () => {
    const { runtime, textureSet } = createSwatches(swatchInputs([4], 2), atlas("repeat-x", "x"));
    try {
      const object = runtime.objectsByBatchId.get("wall-0")!;
      for (const y of [0.2, 1, 1.8]) {
        const phase = slotPhase(uvAt(object, new Vector3(1.11, y, depth / 2)), textureSet);
        expect(phase[0]).toBeCloseTo(1.11 / tileM % 1, 5);
        expect(phase[1]).toBeCloseTo(y / 2, 5);
      }
    } finally { disposeBuildingSceneRuntime(runtime); }
  });

  it.each([true, false])("stretches a connected metre UV chart consistently (indexed: %s)", (indexed) => {
    const input = swatchInputs([1], 4);
    const points = [[0, 0, depth / 2], [1, 0, depth / 2], [1, 4, depth / 2], [0, 4, depth / 2], [0.5, 2, depth / 2]];
    const corners = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4];
    const vertices = indexed ? points : corners.map((corner) => points[corner]);
    Object.assign(input.ir.meshBatches[0], {
      positions: new Float32Array(vertices.flat()), normals: new Float32Array(vertices.flatMap(() => [0, 0, 1])),
      uvs: new Float32Array(vertices.flatMap(([x, y]) => [x, y])),
      indices: indexed ? new Uint32Array(corners) : undefined
    });
    const { runtime, textureSet } = createSwatches(input, atlas("repeat-x", "x"));
    try {
      const object = runtime.objectsByBatchId.get("wall-0")!;
      for (const [x, y] of [[0.5, 2], [0.5, 2.2], [0.2, 0.5], [0.8, 3.5]]) {
        expect(slotPhase(uvAt(object, new Vector3(x, y, depth / 2)), textureSet)[1]).toBeCloseTo(y / 4, 5);
      }
      const positions = object.geometry.getAttribute("position");
      const uv = object.geometry.getAttribute("uv");
      for (let vertex = 0; vertex < positions.count; vertex += 1) {
        if (positions.getX(vertex) === 0.5 && positions.getY(vertex) === 2) {
          expect(slotPhase(new Vector2(uv.getX(vertex), uv.getY(vertex)), textureSet)[1]).toBeCloseTo(0.5, 5);
        }
      }
    } finally { disposeBuildingSceneRuntime(runtime); }
  });

  it.each(["window", "verticalTrim"] as const)("uses metre UVs for a %s assembly assigned a wall slot", (role) => {
    const input = swatchInputs([], 1, [[2, 3, 1]]);
    input.catalog.recipes[0].role = role;
    const source = createRecipeBufferGeometry(input.catalog.recipes[0]);
    const { runtime, textureSet } = createSwatches(input);
    try {
      expect(runtime.renderables[0].geometry.userData.wallAtlasSampling.uvSpace).toBe("meters");
      const positions = source.getAttribute("position");
      const normals = source.getAttribute("normal");
      const uv = source.getAttribute("uv");
      const indices = source.index!;
      const front = Array.from({ length: indices.count / 3 }, (_, index) => index * 3).find((index) =>
        [0, 1, 2].every((offset) => normals.getZ(indices.getX(index + offset)) > 0.99))!;
      const vertices = [0, 1, 2].map((offset) => indices.getX(front + offset));
      const point = vertices.reduce((sum, vertex) => sum.add(new Vector3().fromBufferAttribute(positions, vertex)), new Vector3()).divideScalar(3);
      const expected = vertices.reduce((sum, vertex) => sum.add(new Vector2(uv.getX(vertex), uv.getY(vertex))), new Vector2()).divideScalar(3);
      point.multiply(new Vector3(2, 3, 1));
      const actual = slotPhase(uvAt(runtime.renderables[0], point, 0), textureSet);
      expect(actual[0]).toBeCloseTo((expected.x * 2 / tileM) % 1, 5);
      expect(actual[1]).toBeCloseTo((expected.y * 3 / tileM) % 1, 5);
    } finally { source.dispose(); disposeBuildingSceneRuntime(runtime); }
  });

  it.each([true, false])("links gallery samples to the actual scale chunk (semantic path: %s)", async (withPath) => {
    const input = swatchInputs([], 1, [[1, 1, 1], [4, 1, 1], [2, 3, 1], [4, 1, 1]]);
    const gallery = await buildComponentGallery(input);
    const entry = gallery.entries.find((entry) => entry.recipeId === "wall-box")!;
    entry.sampleElementIndex = 3;
    entry.sampleSemanticPath = withPath ? "facade/instance-3" : undefined;
    const { runtime } = createSwatches(input, atlas(), gallery);
    try {
      const actual = runtime.semanticLookup.get("facade/instance-3")!;
      expect(runtime.galleryObjects.get("wall-box")?.object).toBe(actual.object);
      expect(actual.object).not.toBe(runtime.objectsByBatchId.get("wall-instances"));
      expect(actual.instanceIndex).toBe(1);
    } finally { disposeBuildingSceneRuntime(runtime); }
  });

  it("preserves negative metre-UV phase without mutating the compiler arrays", () => {
    const input = swatchInputs([1]);
    const uvs = input.ir.meshBatches[0].uvs!;
    for (let index = 0; index < uvs.length; index += 1) uvs[index] -= 0.24;
    const copies = retainedArrays(input.ir);
    const { runtime, textureSet } = createSwatches(input);
    try {
      const phase = slotPhase(uvAt(runtime.objectsByBatchId.get("wall-0")!, new Vector3(0.12, 0.12, depth / 2)), textureSet);
      expect(phase[0]).toBeCloseTo(0.875, 5);
      expect(phase[1]).toBeCloseTo(0.875, 5);
      for (const { array, before } of copies) expect(Array.from(array)).toEqual(before);
    } finally { disposeBuildingSceneRuntime(runtime); }
  });

  it("keeps physical density and source-to-native lookup for nonuniform instance scales", () => {
    const scales = [[1, 1, 1], [4, 1, 1], [2, 3, 1], [4, 1, 1]];
    const input = swatchInputs([], 1, scales);
    const copies = retainedArrays(input.ir);
    const { runtime, textureSet } = createSwatches(input);
    try {
      const objects = scales.map((scale, elementIndex) => {
        const lookup = runtime.semanticLookup.get(`facade/instance-${elementIndex}`)!;
        expect(lookup.elementIndex).toBe(elementIndex);
        expect(lookup.stage).toBe("facade");
        expect(lookup.object.parent?.userData.stage).toBe("facade");
        const nativeMatrix = new Matrix4();
        (lookup.object as InstancedMesh).getMatrixAt(lookup.instanceIndex!, nativeMatrix);
        expect(nativeMatrix.elements).toEqual(Array.from(input.ir.instanceBatches[0].transforms!.slice(elementIndex * 16, (elementIndex + 1) * 16)));
        for (const [x, y] of [[0.15, 0.21], [0.97, 0.72]]) {
          const phase = slotPhase(uvAt(lookup.object, new Vector3(elementIndex * 10 - scale[0] / 2 + x, -scale[1] / 2 + y, depth / 2), lookup.instanceIndex), textureSet);
          expect(phase[0]).toBeCloseTo(x / tileM % 1, 5);
          expect(phase[1]).toBeCloseTo(y / tileM % 1, 5);
        }
        expect(lookup.object.material).toBe(runtime.materialRegistry.getMaterial("wall.primary"));
        expect(lookup.object.material.map).toBe(textureSet.textures.baseColor);
        expect(lookup.object.material.normalMap).toBe(textureSet.textures.normal);
        expect(lookup.object.material.roughnessMap).toBe(textureSet.textures.orm);
        return lookup.object;
      });
      expect(objects[1]).toBe(objects[3]);
      expect(new Set(objects).size).toBe(3);
      expect(runtime.objectsByBatchId.get("wall-instances")).toBe(objects[0]);
      expect(runtime.renderables).toHaveLength(3);
      expect(runtime.metrics.instanceCount).toBe(4);
      for (const { array, before } of copies) expect(Array.from(array)).toEqual(before);
      const geometryDisposers = [...new Set(objects)].map((object) => vi.spyOn(object.geometry, "dispose"));
      const instanceDisposers = [...new Set(objects)].map((object) => vi.spyOn(object as InstancedMesh, "dispose"));
      const textureDisposers = Object.values(textureSet.textures).map((texture) => vi.spyOn(texture, "dispose"));
      const materialDisposer = vi.spyOn(objects[0].material, "dispose");
      expect(disposeBuildingSceneRuntime(runtime)).toMatchObject({ geometriesDisposed: 3, materialsDisposed: 1 });
      expect([...geometryDisposers, ...instanceDisposers, ...textureDisposers, materialDisposer].every((spy) => spy.mock.calls.length === 1)).toBe(true);
      expect(disposeBuildingSceneRuntime(runtime)).toEqual({ geometriesDisposed: 0, materialsDisposed: 0 });
      expect(instanceDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    } finally { disposeBuildingSceneRuntime(runtime); }
  });

  it("preserves the existing atlas mapping and topology for non-wall slots", () => {
    const input = swatchInputs([1]);
    input.ir.meshBatches[0].role = "glass";
    input.ir.meshBatches[0].materialSlotId = "glass.primary";
    const copies = retainedArrays(input.ir);
    const { runtime, textureSet, packedAtlas } = createSwatches(input);
    try {
      const object = runtime.objectsByBatchId.get("wall-0")!;
      const uv = uvAt(object, new Vector3(0.25, 0.75, depth / 2));
      const rect = slotTextureWindow(textureSet, "glass.primary").uvRect;
      expect(uv.x).toBeCloseTo(rect.x + rect.width * 0.25, 5);
      expect(uv.y).toBeCloseTo(rect.y + rect.height * 0.75, 5);
      expect(sampledColor(uv, packedAtlas)).toEqual([0, 255, 0, 255]);
      expect(object.geometry.getAttribute("position").count).toBe(input.ir.meshBatches[0].positions!.length / 3);
      expect(object.geometry.index?.count).toBe(input.ir.meshBatches[0].indices!.length);
      for (const { array, before } of copies) expect(Array.from(array)).toEqual(before);
    } finally { disposeBuildingSceneRuntime(runtime); }
  });

  it("preserves three-dimensional surface area when UV triangles are degenerate", () => {
    const input = swatchInputs([4]);
    input.ir.meshBatches[0].uvs!.fill(0);
    const { runtime } = createSwatches(input);
    try {
      expect(area(runtime.objectsByBatchId.get("wall-0")!.geometry)).toBeCloseTo(2 * (4 + 4 * depth + depth), 5);
    } finally { disposeBuildingSceneRuntime(runtime); }
  });

  it("rejects repeat geometry beyond the supported work budget explicitly", () => {
    const packedAtlas = atlas();
    const textureSet = createAtlasTextureSet({ packedAtlas });
    const materialRegistry = createAtlasMaterialRegistry({ atlasId: packedAtlas.atlasId, atlasContentHash: packedAtlas.contentHash, textureSet });
    try {
      expect(() => createBuildingSceneRuntime({ ...swatchInputs([200000]), materialRegistry })).toThrow(/limit|budget|too many/i);
    } finally { materialRegistry.dispose(); }
  });
});
