import { vi } from "vitest";
import { Box3, BoxGeometry, BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, Raycaster, Vector3 } from "three";
import { buildComponentCatalog } from "../components/componentCatalogBuilder";
import { buildComponentGallery } from "../compiler/componentGalleryBuilder";
import { compileBuilding } from "../compiler/buildingCompiler";
import { buildBuildingGraph } from "../compiler/buildingGraphBuilder";
import {
  createBuildingSceneRuntime,
  detectRendererBackendSupport,
  disposeBuildingSceneRuntime,
  resolveWindowSelectionFromIntersections,
  resolveWindowSelectionFromSemanticPath,
  type BuildingSceneRuntime
} from "../renderer-three/buildingSceneAdapter";
import { createAtlasMaterialRegistry } from "../renderer-three/buildingAtlasMaterialFactory";
import { createAtlasTextureSet, slotTextureWindow } from "../renderer-three/buildingAtlasTextureFactory";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { createAtlasDebugExport } from "../materials/atlasDebugExport";
import { packAtlas } from "../materials/atlasPacker";
import { planAtlas } from "../materials/atlasPlanner";
import { ProceduralMaterialProvider, type MaterialSourceRequest } from "../materials/providers/proceduralMaterialProvider";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { LocalRulePromptInterpreter } from "../psg/localRulePromptInterpreter";
import buildingFixture from "../psg/fixtures/late19cCommercialPrompt.psg.json";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { parsePsgDocument } from "../../prompt-spaghetti/io/importPsg";

async function fixtureRuntimeInputs() {
  const prompt = "four floors, 7 bays, brick, flat roof, ornate trim";
  const evaluation = evaluatePsg(parsePsgDocument(buildingFixture), { seed: "psg-seed" });
  const promptResult = await new LocalRulePromptInterpreter().interpret({ prompt });
  const adapted = adaptPsgEvaluationToBuildingIntent({
    prompt,
    seeds: {
      family: "family-seed",
      building: "building-seed",
      material: "material-seed",
      trim: "trim-seed"
    },
    evaluation,
    promptOverrides: promptResult.overrides
  });
  const spec = (await normalizeBuildingSpec(adapted.intent, stylePack)).spec;
  const atlasPlan = await planAtlas(spec, { widthPx: 128, heightPx: 128, paddingPx: 4 });
  const catalog = await buildComponentCatalog(spec, atlasPlan.manifest);
  const graph = await buildBuildingGraph(spec, catalog);
  const ir = await compileBuilding({ spec, catalog, graph });
  const materialRequests = atlasPlan.materialSources.map(
    (source): MaterialSourceRequest => ({
      ...source,
      widthPx: 32,
      heightPx: 32
    })
  );
  const provider = new ProceduralMaterialProvider();
  const materialSources = await Promise.all(
    materialRequests.map((request) => provider.generate(request, new AbortController().signal))
  );
  const packedAtlas = await packAtlas(atlasPlan, materialSources);
  const debugExport = await createAtlasDebugExport(packedAtlas);
  const componentGallery = await buildComponentGallery({ catalog, ir });
  return { catalog, ir, packedAtlas, debugExport, componentGallery };
}

describe("building scene adapter", () => {
  it("detects WebGPU support from the Three.js webgpu entrypoint while keeping WebGL fallback available", async () => {
    const support = await detectRendererBackendSupport();

    expect(support.threeRevision).toBe("184");
    expect(support.webgl.available).toBe(true);
    expect(support.webgl.importPath).toBe("three");
    expect(support.webgpu.available).toBe(true);
    expect(support.webgpu.importPath).toBe("three/webgpu");
    expect(support.preferredBackend).toBe("webgpu");
  });

  it("creates atlas-aware material registry entries keyed by atlas slots without uploading textures yet", async () => {
    const { packedAtlas, debugExport } = await fixtureRuntimeInputs();
    const registry = createAtlasMaterialRegistry({
      atlasId: packedAtlas.atlasId,
      atlasContentHash: packedAtlas.contentHash,
      debugExport
    });
    const wallMaterial = registry.getMaterial("wall.primary");
    const wallMaterialAgain = registry.getMaterial("wall.primary");

    expect(wallMaterial).toBe(wallMaterialAgain);
    expect(wallMaterial.userData).toMatchObject({
      atlasId: packedAtlas.atlasId,
      atlasContentHash: packedAtlas.contentHash,
      atlasSlotId: "wall.primary",
      rendererBoundary: "building-family"
    });
    expect(registry.listMaterialSlotIds()).toContain("wall.primary");
    expect(registry.listMaterialSlotIds()).toContain("glass.primary");

    registry.dispose();
    expect(wallMaterial.userData.disposed).toBe(true);
  });

  it("converts RuntimeBuildingIR mesh batches into BufferGeometry meshes grouped by assembly stage", async () => {
    const { catalog, ir, packedAtlas, debugExport } = await fixtureRuntimeInputs();
    const textureSet = createAtlasTextureSet({ packedAtlas, debugExport });
    const wallBatch = ir.meshBatches.find((batch) => batch.batchId === "mesh.wall-panels")!;
    const sourceUvs = Array.from(wallBatch.uvs!);
    const sourcePositions = Array.from(wallBatch.positions!);
    const sourceNormals = Array.from(wallBatch.normals!);
    const sourceIndices = Array.from(wallBatch.indices!);
    const sourceBounds = new Box3().setFromBufferAttribute(new BufferAttribute(wallBatch.positions!, 3));
    const runtime = createBuildingSceneRuntime({
      ir,
      catalog,
      materialRegistry: createAtlasMaterialRegistry({
        atlasId: packedAtlas.atlasId,
        atlasContentHash: packedAtlas.contentHash,
        debugExport,
        textureSet
      })
    });
    const wallObject = runtime.objectsByBatchId.get("mesh.wall-panels");
    const wallWindow = slotTextureWindow(textureSet, "wall.primary");
    const renderedUvs = Array.from(wallObject!.geometry.getAttribute("uv").array as ArrayLike<number>);
    const renderedU = renderedUvs.filter((_, index) => index % 2 === 0);
    const renderedV = renderedUvs.filter((_, index) => index % 2 === 1);

    expect(runtime.root.type).toBe("Group");
    expect(runtime.stageGroups.map((group) => group.stage)).toEqual(["massing", "facade", "openings", "trim", "roof"]);
    expect(wallObject?.type).toBe("Mesh");
    expect(wallObject?.userData).toMatchObject({
      batchId: "mesh.wall-panels",
      stage: "facade",
      materialSlotId: "wall.primary"
    });
    expect(wallObject?.parent?.userData.stage).toBe("facade");
    const positionCount = wallObject!.geometry.getAttribute("position").count;
    expect(positionCount).toBeGreaterThan(0);
    expect(wallObject?.geometry.getAttribute("normal").count).toBe(positionCount);
    expect(wallObject?.geometry.getAttribute("uv").count).toBe(positionCount);
    for (const axis of ["x", "y", "z"] as const) {
      expect(wallObject!.geometry.boundingBox!.min[axis]).toBeCloseTo(sourceBounds.min[axis], 5);
      expect(wallObject!.geometry.boundingBox!.max[axis]).toBeCloseTo(sourceBounds.max[axis], 5);
    }
    // V5: source UVs are meters along faces; remapped UVs stay inside the atlas slot.
    expect(Math.max(...sourceUvs)).toBeGreaterThan(1.05);
    expect(Math.min(...renderedU)).toBeGreaterThanOrEqual(wallWindow.uvRect.x - 1e-6);
    expect(Math.max(...renderedU)).toBeLessThanOrEqual(wallWindow.uvRect.x + wallWindow.uvRect.width + 1e-6);
    expect(Math.min(...renderedV)).toBeGreaterThanOrEqual(wallWindow.uvRect.y - 1e-6);
    expect(Math.max(...renderedV)).toBeLessThanOrEqual(wallWindow.uvRect.y + wallWindow.uvRect.height + 1e-6);
    expect(Array.from(wallBatch.uvs!)).toEqual(sourceUvs);
    expect(Array.from(wallBatch.positions!)).toEqual(sourcePositions);
    expect(Array.from(wallBatch.normals!)).toEqual(sourceNormals);
    expect(Array.from(wallBatch.indices!)).toEqual(sourceIndices);
    expect(wallObject?.geometry.userData.physicalTileSizeM).toEqual(wallWindow.physicalSizeM);
    expect((wallObject!.geometry.index?.count ?? positionCount) % 3).toBe(0);
    expect(runtime.metrics.meshCount).toBe(ir.meshBatches.length);

    disposeBuildingSceneRuntime(runtime);
  });

  it("uses InstancedMesh for repeated component batches and applies compiler transforms", async () => {
    const { catalog, ir, packedAtlas, debugExport } = await fixtureRuntimeInputs();
    const runtime = createBuildingSceneRuntime({
      ir,
      catalog,
      materialRegistry: createAtlasMaterialRegistry({
        atlasId: packedAtlas.atlasId,
        atlasContentHash: packedAtlas.contentHash,
        debugExport
      })
    });
    const windowObject = runtime.objectsByBatchId.get("instances.window");
    const windowBatch = ir.instanceBatches.find((batch) => batch.batchId === "instances.window")!;

    expect(windowObject?.isInstancedMesh).toBe(true);
    expect(windowObject?.instanceMatrix).toBeDefined();
    const matrixElements = Array.from(windowObject!.instanceMatrix!.array.slice(0, 16));
    expect(windowObject?.count).toBe(windowBatch.count);
    expect(matrixElements).toEqual(Array.from(windowBatch.transforms!.slice(0, 16)));
    expect(windowObject?.userData.recipeId).toBe("recipe.window.tall-arched.frame");
    expect(windowObject?.userData.materialSlotId).toBe("frame.primary");
    expect(runtime.metrics.instanceCount).toBe(ir.metrics.instanceCount);
    expect(runtime.objectsByBatchId.get("instances.window.glass")?.isInstancedMesh).toBe(true);
  });

  it("builds semantic lookup entries and links gallery entries to renderer objects", async () => {
    const { catalog, ir, packedAtlas, debugExport, componentGallery } = await fixtureRuntimeInputs();
    const runtime = createBuildingSceneRuntime({
      ir,
      catalog,
      componentGallery,
      materialRegistry: createAtlasMaterialRegistry({
        atlasId: packedAtlas.atlasId,
        atlasContentHash: packedAtlas.contentHash,
        debugExport
      })
    });
    const windowPath = ir.semanticIndex.find(
      (entry) => entry.batchId === "instances.window" && entry.elementIndex === 0
    )?.semanticPath;
    expect(windowPath).toBeDefined();
    const lookup = runtime.semanticLookup.get(windowPath!);
    const windowGallery = runtime.galleryObjects.get("recipe.window.tall-arched.frame");

    expect(lookup).toMatchObject({
      semanticPath: windowPath,
      batchId: "instances.window",
      stage: "openings",
      elementIndex: 0
    });
    expect(lookup?.object.isInstancedMesh).toBe(true);
    expect(windowGallery?.object.isInstancedMesh).toBe(true);
    expect(windowGallery?.entry.sampleSemanticPath).toBe(windowPath);
  });

  it("disposes geometries and materials owned by the scene runtime", async () => {
    const { catalog, ir, packedAtlas, debugExport } = await fixtureRuntimeInputs();
    const runtime = createBuildingSceneRuntime({
      ir,
      catalog,
      materialRegistry: createAtlasMaterialRegistry({
        atlasId: packedAtlas.atlasId,
        atlasContentHash: packedAtlas.contentHash,
        debugExport
      })
    });
    const geometryDisposers = runtime.renderables.map((object) => vi.spyOn(object.geometry, "dispose"));
    const materialDisposers = runtime.materialRegistry
      .listMaterials()
      .map((material) => vi.spyOn(material, "dispose"));
    const result = disposeBuildingSceneRuntime(runtime);

    expect(result.geometriesDisposed).toBe(runtime.renderables.length);
    expect(result.materialsDisposed).toBe(materialDisposers.length);
    expect(geometryDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(materialDisposers.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(runtime.root.children).toHaveLength(0);
    expect(runtime.disposed).toBe(true);
  });
});

describe("exact current window selection", () => {
  let input: Awaited<ReturnType<typeof fixtureRuntimeInputs>>;
  beforeAll(async () => { input = await fixtureRuntimeInputs(); });

  function runtimeForSelection() {
    return createBuildingSceneRuntime({
      ir: input.ir, catalog: input.catalog, componentGallery: input.componentGallery,
      materialRegistry: createAtlasMaterialRegistry({
        atlasId: input.packedAtlas.atlasId, atlasContentHash: input.packedAtlas.contentHash, debugExport: input.debugExport
      })
    });
  }

  const bytes = (view: ArrayBufferView | undefined) => view
    ? Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)) : null;
  function sourceBuffers() {
    return {
      meshes: input.ir.meshBatches.map(batch => [bytes(batch.positions), bytes(batch.normals), bytes(batch.uvs), bytes(batch.indices)]),
      instances: input.ir.instanceBatches.map(batch => bytes(batch.transforms)),
      semantics: JSON.stringify(input.ir.semanticIndex),
      materials: Object.values(input.packedAtlas.channels).map(channel => bytes(channel.data))
    };
  }
  function rendererBuffers(runtime: BuildingSceneRuntime) {
    return runtime.renderables.map(object => ({
      attributes: Object.entries(object.geometry.attributes).map(([name, attribute]) => [name, bytes(attribute.array)]),
      index: bytes(object.geometry.index?.array), instances: bytes(object.instanceMatrix?.array),
      material: {
        version: object.material.version, color: object.material.color.toArray(),
        emissive: object.material.emissive.toArray(), opacity: object.material.opacity,
        map: object.material.map, userData: JSON.stringify(object.material.userData)
      }
    }));
  }

  // Aim at a real triangle, rather than the empty centre of an opening frame.
  function rayAtInstance(object: InstancedMesh, instanceIndex: number) {
    object.updateWorldMatrix(true, false);
    const native = new Matrix4(); object.getMatrixAt(instanceIndex, native);
    const world = new Matrix4().multiplyMatrices(object.matrixWorld, native);
    const positions = object.geometry.getAttribute("position"), index = object.geometry.index;
    const count = index?.count ?? positions.count;
    for (let offset = 0; offset + 2 < count; offset += 3) {
      const vertices = [0, 1, 2].map(corner => new Vector3().fromBufferAttribute(positions, index ? index.getX(offset + corner) : offset + corner).applyMatrix4(world));
      const normal = new Vector3().subVectors(vertices[1]!, vertices[0]!).cross(new Vector3().subVectors(vertices[2]!, vertices[0]!));
      if (normal.lengthSq() < 1e-12) continue;
      normal.normalize();
      const centre = vertices[0]!.clone().add(vertices[1]!).add(vertices[2]!).multiplyScalar(1 / 3);
      const hits = new Raycaster(centre.addScaledVector(normal, 0.02), normal.negate(), 0, 0.1).intersectObject(object, false);
      if (hits[0]?.instanceId === instanceIndex) return hits;
    }
    throw new Error("Expected an actual ray intersection on the requested compiled instance");
  }

  it.each(["instances.window", "instances.window.glass"])("resolves an actual %s ray hit and keyboard path without changing shared buffers or materials", batchId => {
    const runtime = runtimeForSelection();
    try {
      const lookup = [...runtime.semanticLookup.values()].find(entry => entry.batchId === batchId && entry.elementIndex === 1);
      if (!lookup?.object.isInstancedMesh) throw new Error("Expected the compiled window instance");
      const object = lookup.object as InstancedMesh;
      const nativeIndex = lookup.instanceIndex ?? lookup.elementIndex!;
      const sourceBefore = sourceBuffers();
      const hits = rayAtInstance(object, nativeIndex);
      expect(hits[0]?.object).toBe(object);
      expect(hits[0]?.instanceId).toBe(nativeIndex);
      const rendererBefore = rendererBuffers(runtime), originalBounds = object.geometry.boundingBox;
      const selected = resolveWindowSelectionFromIntersections(runtime, input.catalog, hits);
      const keyboard = resolveWindowSelectionFromSemanticPath(runtime, input.catalog, lookup.semanticPath);
      expect(selected).toMatchObject({ semanticPath: lookup.semanticPath, object, instanceIndex: nativeIndex, elementIndex: 1 });
      expect(keyboard?.object).toBe(object);
      expect(keyboard?.bounds.equals(selected!.bounds)).toBe(true);
      expect(selected?.bounds.clone().expandByScalar(1e-7).containsPoint(hits[0]!.point)).toBe(true);
      const wholeBatch = new Box3().setFromObject(object);
      expect(selected!.bounds.getSize(new Vector3()).y).toBeLessThan(wholeBatch.getSize(new Vector3()).y);
      expect(object.geometry.boundingBox).toBe(originalBounds);
      expect(sourceBuffers()).toEqual(sourceBefore);
      expect(rendererBuffers(runtime)).toEqual(rendererBefore);
    } finally { disposeBuildingSceneRuntime(runtime); }
  });

  function chunkedWindowRuntime() {
    const runtime = createBuildingSceneRuntime({
      ir: { ...input.ir, meshBatches: [], instanceBatches: [], semanticIndex: [] },
      catalog: input.catalog,
      materialRegistry: createAtlasMaterialRegistry({
        atlasId: input.packedAtlas.atlasId, atlasContentHash: input.packedAtlas.contentHash, debugExport: input.debugExport
      })
    });
    const recipe = input.catalog.recipes.find(entry => entry.role === "window" && entry.kind === "frame");
    if (!recipe) throw new Error("Expected the actual frame recipe");
    const representative = new InstancedMesh(new BoxGeometry(2, 4, 0.5), runtime.materialRegistry.getMaterial("frame.primary"), 1);
    representative.userData.recipeId = recipe.id;
    representative.setMatrixAt(0, new Matrix4().makeTranslation(-20, 0, 0));
    const group = new Group();
    const chunk = new InstancedMesh(new BoxGeometry(2, 4, 0.5), representative.material, 2);
    chunk.userData = { recipeId: recipe.id, batchId: "instances.window" };
    chunk.position.x = 3;
    chunk.setMatrixAt(0, new Matrix4().makeTranslation(10, 4, 0));
    chunk.setMatrixAt(1, new Matrix4().makeScale(2, 1, 1).setPosition(20, 4, 0));
    runtime.root.position.x = 5;
    runtime.root.add(representative, group); group.add(chunk);
    runtime.renderables.push(representative, chunk);
    runtime.objectsByBatchId.set("instances.window", representative);
    for (const [elementIndex, instanceIndex] of [[1, 0], [3, 1]]) {
      const semanticPath = "selection-test/window/" + elementIndex;
      runtime.semanticLookup.set(semanticPath, { semanticPath, batchId: "instances.window", stage: "openings", object: chunk, elementIndex, instanceIndex });
    }
    runtime.root.updateMatrixWorld(true);
    return { runtime, chunk, group, path: "selection-test/window/3" };
  }

  it("maps source element 3 to native chunk instance 1 and computes that instance's world bounds", () => {
    const { runtime, chunk, path } = chunkedWindowRuntime();
    try {
      const hits = new Raycaster(new Vector3(28, 4, 5), new Vector3(0, 0, -1)).intersectObject(chunk, false);
      expect(hits[0]?.instanceId).toBe(1);
      const pointer = resolveWindowSelectionFromIntersections(runtime, input.catalog, hits);
      const keyboard = resolveWindowSelectionFromSemanticPath(runtime, input.catalog, path);
      expect(pointer?.object).toBe(chunk);
      expect(pointer?.object).not.toBe(runtime.objectsByBatchId.get("instances.window"));
      expect(pointer).toMatchObject({ semanticPath: path, instanceIndex: 1, elementIndex: 3 });
      expect(pointer?.bounds.min.toArray()).toEqual([26, 2, -0.25]);
      expect(pointer?.bounds.max.toArray()).toEqual([30, 6, 0.25]);
      expect(keyboard?.bounds.equals(pointer!.bounds)).toBe(true);
      expect(pointer?.bounds).not.toBe(keyboard?.bounds);
      expect(pointer!.bounds.getSize(new Vector3()).x).toBeLessThan(new Box3().setFromObject(chunk).getSize(new Vector3()).x);
    } finally { disposeBuildingSceneRuntime(runtime); }
  });

  it("keeps nearest merged or unknown occluders opaque to selection and respects hidden ancestors", () => {
    const { runtime, chunk, group, path } = chunkedWindowRuntime();
    const occluderGroup = new Group();
    const occluder = new Mesh(new BoxGeometry(4, 4, 0.5), runtime.materialRegistry.getMaterial("wall.primary"));
    occluder.position.set(23, 4, 2);
    occluder.userData.batchId = "mesh.wall-panels";
    runtime.root.add(occluderGroup); occluderGroup.add(occluder); runtime.renderables.push(occluder);
    for (const elementIndex of [0, 1]) {
      const semanticPath = "selection-test/merged-wall/" + elementIndex;
      runtime.semanticLookup.set(semanticPath, { semanticPath, batchId: "mesh.wall-panels", stage: "facade", elementIndex, object: occluder });
    }
    try {
      runtime.root.updateMatrixWorld(true);
      const ray = new Raycaster(new Vector3(28, 4, 5), new Vector3(0, 0, -1));
      const hits = ray.intersectObjects(runtime.renderables, false).reverse();
      const order = hits.map(hit => hit.object);
      expect(hits.some(hit => hit.object === chunk)).toBe(true);
      expect(hits.some(hit => hit.object === occluder)).toBe(true);
      expect(resolveWindowSelectionFromIntersections(runtime, input.catalog, hits)).toBeUndefined();
      expect(hits.map(hit => hit.object)).toEqual(order);
      runtime.semanticLookup.delete("selection-test/merged-wall/0");
      runtime.semanticLookup.delete("selection-test/merged-wall/1");
      expect(resolveWindowSelectionFromIntersections(runtime, input.catalog, hits)).toBeUndefined();
      occluderGroup.visible = false;
      expect(resolveWindowSelectionFromIntersections(runtime, input.catalog, hits)?.semanticPath).toBe(path);
      group.visible = false;
      expect(resolveWindowSelectionFromIntersections(runtime, input.catalog, hits)).toBeUndefined();
      expect(resolveWindowSelectionFromSemanticPath(runtime, input.catalog, path)).toBeUndefined();
      group.visible = true;
      runtime.root.remove(group);
      expect(resolveWindowSelectionFromSemanticPath(runtime, input.catalog, path)).toBeUndefined();
      expect(resolveWindowSelectionFromIntersections(runtime, input.catalog, hits)).toBeUndefined();
    } finally { disposeBuildingSceneRuntime(runtime); }
  });

  it("rejects nonwindow recipe instances, ambiguous native mappings and disposed runtimes", () => {
    const { runtime, chunk, path } = chunkedWindowRuntime();
    try {
      const hits = new Raycaster(new Vector3(28, 4, 5), new Vector3(0, 0, -1)).intersectObject(chunk, false);
      const frameRecipe = chunk.userData.recipeId;
      const roofRecipe = input.catalog.recipes.find(recipe => recipe.role === "roof");
      if (!roofRecipe) throw new Error("Expected an actual nonwindow recipe");
      chunk.userData.recipeId = roofRecipe.id;
      expect(resolveWindowSelectionFromSemanticPath(runtime, input.catalog, path)).toBeUndefined();
      expect(resolveWindowSelectionFromIntersections(runtime, input.catalog, hits)).toBeUndefined();
      chunk.userData.recipeId = frameRecipe;
      const lookup = runtime.semanticLookup.get(path)!;
      runtime.semanticLookup.set("selection-test/ambiguous", { ...lookup, semanticPath: "selection-test/ambiguous" });
      expect(resolveWindowSelectionFromIntersections(runtime, input.catalog, hits)).toBeUndefined();
      runtime.semanticLookup.delete("selection-test/ambiguous");
      expect(resolveWindowSelectionFromIntersections(runtime, input.catalog, hits)?.semanticPath).toBe(path);
      disposeBuildingSceneRuntime(runtime);
      expect(resolveWindowSelectionFromIntersections(runtime, input.catalog, hits)).toBeUndefined();
      expect(resolveWindowSelectionFromSemanticPath(runtime, input.catalog, path)).toBeUndefined();
    } finally { disposeBuildingSceneRuntime(runtime); }
  });
});
