import { Color, DirectionalLight, HemisphereLight, OrthographicCamera, Scene, Vector3 } from "three";
import { createAssemblyHallFixture } from "../../src/features/building-family/ui/assemblyHallFixture.ts";
import { ComponentCatalogSchema } from "../../src/features/building-family/components/componentCatalogBuilder.ts";
import { ComponentRecipeSchema } from "../../src/features/building-family/contracts/componentRecipe.ts";
import { RuntimeBuildingIRSchema } from "../../src/features/building-family/contracts/runtimeBuildingIR.ts";
import { AtlasManifestSchema } from "../../src/features/building-family/contracts/atlasManifest.ts";
import { buildBoxPrimitive, combinePrimitiveGeometry } from "../../src/features/building-family/compiler/primitiveGeometry.ts";
import { openingGlazingCenterZ, scaleTranslateMatrix } from "../../src/features/building-family/compiler/openingSlotBinding.ts";
import { hashCanonicalJson, sha256Hex } from "../../src/features/building-family/core/contentHash.ts";
import { canonicalJson } from "../../src/features/building-family/core/canonicalJson.ts";
import { ProceduralMaterialProvider } from "../../src/features/building-family/materials/providers/proceduralMaterialProvider.ts";
import { planAtlas } from "../../src/features/building-family/materials/atlasPlanner.ts";
import { packAtlas } from "../../src/features/building-family/materials/atlasPacker.ts";
import { createAtlasDebugExport } from "../../src/features/building-family/materials/atlasDebugExport.ts";
import { createAtlasTextureSet, slotTextureWindow } from "../../src/features/building-family/renderer-three/buildingAtlasTextureFactory.ts";
import { createAtlasMaterialRegistry } from "../../src/features/building-family/renderer-three/buildingAtlasMaterialFactory.ts";
import { createBuildingSceneRuntime } from "../../src/features/building-family/renderer-three/buildingSceneAdapter.ts";
import { createRecipeBufferGeometry } from "../../src/features/building-family/renderer-three/recipeGeometryFactory.ts";
import { createAssemblyRenderer } from "../../src/features/building-family/renderer-three/assemblyRendererFactory.ts";
import { disposeBuildingSceneResources } from "../../src/features/building-family/renderer-three/resourceDisposal.ts";
import { verifyR1MasonryCoverageDelta } from "../../src/features/building-family/qa/r1MasonryCoverage.ts";
import { verifyR1PeriodicSamplingDelta } from "../../src/features/building-family/qa/r1PeriodicSampling.ts";

const channelNames = ["baseColor", "normal", "orm", "height", "opacity"];
const cloneJson = (value) => JSON.parse(JSON.stringify(value));

function solidLayer(widthPx, heightPx, value) {
  const data = new Uint8ClampedArray(widthPx * heightPx * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set([value, value, value, 255], offset);
  return { widthPx, heightPx, channels: "rgba8", data };
}

// Typed pixels, including the U/V glyphs, avoid browser-font-dependent sources.
function checkerLayer(widthPx, heightPx, roleIndex) {
  const layer = solidLayer(widthPx, heightPx, 255);
  const colors = [[234, 72, 42], [40, 131, 236], [64, 184, 92], [244, 209, 59]];
  function pixel(x, y, color) {
    if (x >= 0 && x < widthPx && y >= 0 && y < heightPx) layer.data.set([...color, 255], (y * widthPx + x) * 4);
  }
  for (let y = 0; y < heightPx; y += 1) {
    for (let x = 0; x < widthPx; x += 1) {
      const quadrant = (x >= widthPx / 2 ? 1 : 0) + (y >= heightPx / 2 ? 2 : 0);
      const factor = (Math.floor(x * 8 / widthPx) + Math.floor(y * 8 / heightPx)) % 2 ? 0.45 : 1;
      pixel(x, y, colors[(quadrant + roleIndex) % colors.length].map((value) => Math.round(value * factor)));
    }
  }
  const glyphs = { U: ["101", "101", "101", "101", "111"], V: ["101", "101", "101", "101", "010"] };
  for (const [index, letter] of ["U", "V"].entries()) {
    const originX = index ? Math.max(2, widthPx - 6) : 2;
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 3; x += 1) pixel(originX + x, 2 + y, glyphs[letter][y][x] === "1" ? [255, 255, 255] : [0, 0, 0]);
    }
  }
  const arrowY = heightPx - 4;
  for (let x = 2; x < widthPx - 2; x += 1) pixel(x, arrowY, [255, 255, 255]);
  pixel(widthPx - 4, arrowY - 1, [255, 255, 255]);
  pixel(widthPx - 4, arrowY + 1, [255, 255, 255]);
  return layer;
}

function layerBytes(layers) {
  const chunks = Object.entries(layers).sort(([first], [second]) => first.localeCompare(second)).map(([name, layer]) => {
    const header = new TextEncoder().encode(`${name}:${layer.widthPx}x${layer.heightPx}:`);
    const chunk = new Uint8Array(header.length + layer.data.length);
    chunk.set(header);
    chunk.set(layer.data, header.length);
    return chunk;
  });
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

async function controlledSources(sources, frozenOrigins) {
  if (frozenOrigins && (frozenOrigins.length !== 12 || sources.length !== 12 || new Set(frozenOrigins.map((row) => row.sourceId)).size !== 12)) {
    throw new Error("Selected-material controlled swatches require exactly 12 validated frozen origins.");
  }
  return Promise.all(sources.map(async (source, index) => {
    const origin = frozenOrigins ? frozenOrigins.find((row) => row.sourceId === source.sourceId) : source;
    if (!origin || origin.providerId !== source.providerId || origin.widthPx !== source.widthPx || origin.heightPx !== source.heightPx) {
      throw new Error("Frozen controlled origin differs from the actual source role/dimensions.");
    }
    const { widthPx, heightPx } = source;
    const layers = {
      baseColor: checkerLayer(widthPx, heightPx, index),
      height: solidLayer(widthPx, heightPx, 128),
      roughness: solidLayer(widthPx, heightPx, 255),
      metalness: solidLayer(widthPx, heightPx, 0),
      opacity: solidLayer(widthPx, heightPx, 255)
    };
    const providerId = "r1-controlled-checker";
    const requestHash = await hashCanonicalJson({ providerId, originalRequestHash: origin.requestHash, widthPx, heightPx, index });
    return {
      ...origin, providerId, layers, requestHash,
      contentHash: await sha256Hex(layerBytes(layers)),
      provenance: { ...origin.provenance, providerId, algorithm: "r1-asymmetric-eight-cell-checker-uv-glyphs-v1" }
    };
  }));
}

function uvPairs(attribute) {
  return Array.from({ length: attribute.count }, (_, index) => [attribute.getX(index), attribute.getY(index)]);
}

function expectedExtents(slot, size) {
  const repeatU = slot.periodicity !== "none" || ["repeat", "repeat-x", "cap-repeat-cap"].includes(slot.uvMode);
  const repeatV = slot.periodicity === "xy" || slot.uvMode === "repeat";
  return [repeatU ? size[0] / slot.physicalSizeM.width : 1, repeatV ? size[1] / slot.physicalSizeM.height : 1];
}

function buildSwatches(fixture) {
  const boxRecipe = ComponentRecipeSchema.parse({
    schemaVersion: "0.1.0", id: "recipe.r1.normalized-wall-box", kind: "boxAssembly", role: "diagnosticWall",
    dimensionsM: { width: 1, height: 1, depth: 0.06 }, parameterRanges: {}, anchors: [],
    atlasSlotIds: ["wall.primary"], uvBehavior: "repeat", variationScope: "building", lowDetailRecipeId: "recipe.r1.normalized-wall-box"
  });
  const catalog = ComponentCatalogSchema.parse({ ...fixture.catalog, catalogId: `${fixture.catalog.catalogId}:r1-swatch`, recipes: [...fixture.catalog.recipes, boxRecipe] });
  const definitions = [
    { id: "mesh.wall-1m", label: "1 x 1 m wall / metre UVs", worldSizeM: [1, 1, 0.06], center: [-3.2, 1.35, 0], slotId: "wall.primary" },
    { id: "mesh.wall-4m", label: "4 x 1 m wall / metre UVs", worldSizeM: [4, 1, 0.06], center: [-0.1, 1.35, 0], slotId: "wall.primary" },
    { id: "instances.wall-scaled", label: "1 m normalized recipe / 4x instance scale", worldSizeM: [4, 1, 0.06], center: [-1.2, -1.3, 0], slotId: "wall.primary", recipe: boxRecipe, instanceScale: [4, 1, 1] }
  ];
  const frame = catalog.recipes.find((recipe) => recipe.role === "window");
  const glass = catalog.recipes.find((recipe) => recipe.role === "windowGlass");
  if (frame && glass) {
    for (const recipe of [frame, glass]) definitions.push({
      id: `instances.${recipe.role}`, label: recipe.role === "windowGlass"
        ? "Actual windowGlass recipe / unit scale, frame-derived recess"
        : `Actual ${recipe.role} recipe / positive unit transform`,
      worldSizeM: [recipe.dimensionsM.width, recipe.dimensionsM.height, recipe.dimensionsM.depth],
      // Standalone glass owns pane thickness; the paired frame owns its recess.
      center: [3.15, -0.2, recipe.role === "windowGlass" ? openingGlazingCenterZ(frame.dimensionsM.depth) : 0],
      slotId: recipe.atlasSlotIds.find((id) => recipe.role === "windowGlass" ? id.includes("glass") : !id.includes("glass")),
      recipe, instanceScale: [1, 1, 1]
    });
  }
  const meshBatches = [];
  const instanceBatches = [];
  for (const definition of definitions) {
    let geometry;
    if (definition.recipe) {
      geometry = createRecipeBufferGeometry(definition.recipe);
      instanceBatches.push({ batchId: definition.id, recipeId: definition.recipe.id, materialSlotId: definition.slotId, transforms: new Float32Array(scaleTranslateMatrix(definition.instanceScale, definition.center)), count: 1 });
    } else {
      const buffers = combinePrimitiveGeometry([buildBoxPrimitive({ center: definition.center, size: definition.worldSizeM })]);
      meshBatches.push({ batchId: definition.id, role: "wall", materialSlotId: definition.slotId, positions: buffers.positions, normals: buffers.normals, uvs: buffers.uvs, indices: buffers.indices });
      // Input inspection uses the same primitive UVs; the adapter still creates the rendered geometry.
      definition.inputUv = Array.from({ length: buffers.uvs.length / 2 }, (_, index) => [buffers.uvs[index * 2], buffers.uvs[index * 2 + 1]]);
      definition.frontVertexIndices = Array.from({ length: buffers.normals.length / 3 }, (_, index) => index).filter((index) => buffers.normals[index * 3 + 2] > 0.99);
    }
    if (geometry) {
      definition.inputUv = uvPairs(geometry.getAttribute("uv"));
      const normals = geometry.getAttribute("normal");
      definition.frontVertexIndices = Array.from({ length: normals.count }, (_, index) => index).filter((index) => normals.getZ(index) > 0.99);
      definition.surfaceNormalsZ = [...new Set(Array.from({ length: normals.count }, (_, index) => normals.getZ(index)))].sort((first, second) => first - second);
      geometry.dispose();
    }
    definition.surfaceNormalsZ ??= [...new Set(Array.from({ length: meshBatches.at(-1).normals.length / 3 }, (_, index) => meshBatches.at(-1).normals[index * 3 + 2]))].sort((first, second) => first - second);
  }
  const ir = RuntimeBuildingIRSchema.parse({
    schemaVersion: "0.1.0", buildingId: "r1-material-swatches", familyId: fixture.spec.familyId, sourceGraphHash: fixture.ir.sourceGraphHash,
    bounds: { min: [-4.4, -2.75, -1], max: [4.4, 2.75, 1] }, meshBatches, instanceBatches,
    semanticIndex: definitions.map((definition) => ({ semanticPath: `diagnostic/${definition.id}`, batchId: definition.id, elementIndex: 0, stage: "facade" })),
    metrics: { vertexCount: meshBatches.reduce((total, batch) => total + batch.positions.length / 3, 0), triangleCount: meshBatches.reduce((total, batch) => total + batch.indices.length / 3, 0), instanceCount: instanceBatches.length }
  });
  return { definitions, catalog, ir };
}

function unchanged(records) {
  return records.every(({ bytes, before }) => bytes.length === before.length && bytes.every((value, index) => value === before[index]));
}

function retainedBytes(array) {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  return { bytes, before: bytes.slice() };
}

function presentedFrame() {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      globalThis.cancelAnimationFrame(frame);
      reject(new Error("Material sampling presentation did not receive a frame within 10 seconds."));
    }, 10000);
    const frame = globalThis.requestAnimationFrame(() => {
      globalThis.clearTimeout(timeout);
      resolve();
    });
  });
}

/** Browser-only diagnostic through the production atlas factories and scene adapter. */
export async function mountMaterialSampling({ controls, backend = "webgpu", width = 1280, height = 800, primaryWallMaterialDelta, periodicWallMaterialDelta } = {}) {
  if (!["webgpu", "webgl"].includes(backend)) throw new Error(`Unsupported sampling backend: ${backend}`);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 200) throw new Error("Sampling canvas dimensions must be integer pixels, at least 320 x 200.");
  if (primaryWallMaterialDelta && periodicWallMaterialDelta) throw new Error("Material replay allowances are mutually exclusive.");
  const materialDelta = periodicWallMaterialDelta ? verifyR1PeriodicSamplingDelta(periodicWallMaterialDelta)
    : primaryWallMaterialDelta ? verifyR1MasonryCoverageDelta(primaryWallMaterialDelta) : null;
  const provider = new ProceduralMaterialProvider();
  const sources = [];
  let fixture;
  let renderer;
  let disposed = false;
  const states = new Map();
  const scene = new Scene();
  scene.background = new Color("#e8ece8");
  scene.add(new HemisphereLight("#ffffff", "#b3b8ad", 2.3));
  const key = new DirectionalLight("#ffffff", 2.5);
  key.position.set(-3, 5, 8);
  scene.add(key);
  const worldHeight = 5.5;
  const worldWidth = worldHeight * width / height;
  const camera = new OrthographicCamera(-worldWidth / 2, worldWidth / 2, worldHeight / 2, -worldHeight / 2, 0.1, 50);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  let activeSource = "procedural";
  let active;
  let activation;
  let records = [];
  let swatches;

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const state of states.values()) {
      scene.remove(state.runtime.root);
      disposeBuildingSceneResources(state.runtime, { disposeMaterials: false });
      state.registry.dispose();
    }
    states.clear();
    renderer?.dispose();
    fixture?.familyRuntime.dispose();
    renderer?.domElement.remove();
    scene.clear();
  }

  function snapshot() {
    if (disposed) throw new Error("Material sampling has been disposed.");
    const textures = active.textureSet.textures;
    return {
      backendRequested: backend, backendActual: activation.activeBackend, fallbackReason: activation.fallbackReason ?? null,
      source: activeSource, canvasSizePx: [width, height], pixelsPerMeter: height / worldHeight,
      atlasId: active.packedAtlas.atlasId, atlasContentHash: active.packedAtlas.contentHash,
      sourceHashes: active.sources.map(({ sourceId, providerId, requestHash, contentHash }) => ({ sourceId, providerId, requestHash, contentHash })),
      channelHashes: { ...active.textureSet.channelHashes }, sourceBytesUnchanged: unchanged(records),
      textureSettings: Object.fromEntries(channelNames.map((name) => {
        const texture = textures[name];
        return [name, { wrapS: texture.wrapS, wrapT: texture.wrapT, colorSpace: texture.colorSpace, flipY: texture.flipY, minFilter: texture.minFilter, magFilter: texture.magFilter, generateMipmaps: texture.generateMipmaps }];
      })),
      swatches: swatches.definitions.map((definition) => {
        const object = active.runtime.objectsByBatchId.get(definition.id);
        const adaptedUv = uvPairs(object.geometry.getAttribute("uv"));
        const window = slotTextureWindow(active.textureSet, definition.slotId);
        const slot = active.packedAtlas.manifest.slots.find((entry) => entry.id === definition.slotId);
        const renderedNormals = object.geometry.getAttribute("normal");
        const frontVertexIndices = Array.from({ length: renderedNormals.count }, (_, index) => index)
          .filter((index) => renderedNormals.getZ(index) > 0.99);
        const front = frontVertexIndices.map((index) => adaptedUv[index]);
        const observedSlotUvSpan = front.length ? [0, 1].map((axis) => (Math.max(...front.map((uv) => uv[axis])) - Math.min(...front.map((uv) => uv[axis]))) / (axis ? window.uvRect.height : window.uvRect.width)) : [0, 0];
        const topLeft = new Vector3(definition.center[0] - definition.worldSizeM[0] / 2, definition.center[1] + definition.worldSizeM[1] / 2, 0).project(camera);
        const screenRectPx = { x: (topLeft.x + 1) * width / 2, y: (1 - topLeft.y) * height / 2,
          width: definition.worldSizeM[0] * height / worldHeight, height: definition.worldSizeM[1] * height / worldHeight };
        const packedCheckerRows = activeSource === "controlled" && slot.role === "wall" ? [0.30, 0.45, 0.60].map((rowFraction) => {
          const fixedPx = Math.round(screenRectPx.y + screenRectPx.height * rowFraction);
          const localHeightM = (screenRectPx.y + screenRectPx.height - fixedPx - 0.5) / (height / worldHeight);
          const tileV = localHeightM / slot.physicalSizeM.height;
          const rowInSlot = Math.floor((tileV - Math.floor(tileV)) * slot.rectPx.height);
          const atlasY = slot.rectPx.y + rowInSlot;
          const layer = active.packedAtlas.channels.baseColor;
          const rgba = Array.from({ length: slot.rectPx.width }, (_, column) => {
            const offset = (atlasY * layer.widthPx + slot.rectPx.x + column) * 4;
            return Array.from(layer.data.slice(offset, offset + 4));
          });
          return { rowFraction, fixedPx, atlasY, rgba };
        }) : undefined;
        const material = object.material;
        return {
          id: definition.id, label: definition.label, worldSizeM: [...definition.worldSizeM], instanceScale: definition.instanceScale ?? [1, 1, 1],
          slot: { id: slot.id, role: slot.role, physicalSizeM: { ...slot.physicalSizeM }, rectPx: { ...slot.rectPx }, uvMode: slot.uvMode, periodicity: slot.periodicity },
          inputUv: definition.inputUv, adaptedUv, sourceFrontVertexIndices: [...definition.frontVertexIndices], frontVertexIndices,
          ...(object.geometry.userData.wallAtlasSampling ? { wallAtlasSampling: cloneJson(object.geometry.userData.wallAtlasSampling) } : {}),
          frontFacing: front.length > 0, surfaceNormalsZ: [...definition.surfaceNormalsZ],
          expectedTileExtents: expectedExtents(slot, definition.worldSizeM), observedSlotUvSpan,
          screenRectPx,
          ...(packedCheckerRows ? { packedCheckerRows } : {}),
          material: { slotId: definition.slotId, color: material.color.toArray(), roughness: material.roughness, metalness: material.metalness, normalScale: material.normalScale.toArray(), opacity: material.opacity, transparent: material.transparent, alphaTest: material.alphaTest, depthWrite: material.depthWrite, side: material.side, maps: { baseColor: material.map === textures.baseColor, normal: material.normalMap === textures.normal, roughness: material.roughnessMap === textures.orm, metalness: material.metalnessMap === textures.orm, opacity: material.alphaMap === textures.opacity } }
        };
      })
    };
  }

  async function setSource(name) {
    if (disposed) throw new Error("Material sampling has been disposed.");
    const next = states.get(name);
    if (!next) throw new Error(`Unknown material sampling source: ${name}`);
    if (active) scene.remove(active.runtime.root);
    active = next;
    activeSource = name;
    scene.add(active.runtime.root);
    renderer.domElement.dataset.samplingSource = name;
    for (let frame = 0; frame < 2; frame += 1) {
      if (disposed) throw new Error("Material sampling was disposed before presentation.");
      renderer.render(scene, camera);
      await presentedFrame();
    }
    return snapshot();
  }

  try {
    fixture = await createAssemblyHallFixture({
      ...(controls ? { promptControls: controls } : {}),
      materialProvider: { id: provider.id, async generate(request, signal) { const artifact = await provider.generate(request, signal); sources.push(artifact); return artifact; } }
    });
    sources.sort((first, second) => first.sourceId.localeCompare(second.sourceId));
    if (materialDelta) {
      const actual = sources.map(({ sourceId, providerId, requestHash, contentHash }) => ({ sourceId, providerId, requestHash, contentHash }));
      if (canonicalJson(actual) !== canonicalJson(materialDelta.after.sourceHashes) || fixture.packedAtlas.contentHash !== materialDelta.after.atlasContentHash) {
        throw new Error("Actual production swatches differ from the validated selected-material baseline.");
      }
    }
    const manifest = AtlasManifestSchema.parse(cloneJson(fixture.packedAtlas.manifest));
    const plan = await planAtlas(fixture.spec, { widthPx: manifest.widthPx, heightPx: manifest.heightPx, paddingPx: manifest.paddingPx });
    const controlled = await controlledSources(sources, materialDelta?.controlledOrigins);
    const controlledAtlas = await packAtlas({ ...plan, manifest }, controlled);
    if (controlledAtlas.diagnostics.some((diagnostic) => diagnostic.severity === "error")) throw new Error("Controlled atlas failed existing atlas validation.");
    swatches = buildSwatches(fixture);
    records = [
      ...[...sources, ...controlled].flatMap((source) => Object.values(source.layers).map((layer) => retainedBytes(layer.data))),
      ...[fixture.packedAtlas, controlledAtlas].flatMap((atlas) => channelNames.map((name) => retainedBytes(atlas.channels[name].data))),
      ...swatches.ir.meshBatches.flatMap((batch) => [batch.positions, batch.normals, batch.uvs, batch.indices].filter(Boolean).map(retainedBytes)),
      ...swatches.ir.instanceBatches.map((batch) => retainedBytes(batch.transforms))
    ];
    for (const [name, packedAtlas, debugExport, materialSources] of [
      ["procedural", fixture.packedAtlas, fixture.debugExport, sources],
      ["controlled", controlledAtlas, await createAtlasDebugExport(controlledAtlas), controlled]
    ]) {
      const textureSet = createAtlasTextureSet({ packedAtlas, debugExport });
      const registry = createAtlasMaterialRegistry({ atlasId: packedAtlas.atlasId, atlasContentHash: packedAtlas.contentHash, textureSet, debugExport });
      try {
        const runtime = createBuildingSceneRuntime({ ir: swatches.ir, catalog: swatches.catalog, materialRegistry: registry });
        states.set(name, { packedAtlas, textureSet, registry, runtime, sources: materialSources });
      } catch (error) { registry.dispose(); throw error; }
    }
    activation = await createAssemblyRenderer({ backendSupport: { ...fixture.backendSupport, preferredBackend: backend } });
    renderer = activation.renderer;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.domElement.style.width = `${width}px`;
    renderer.domElement.style.height = `${height}px`;
    renderer.domElement.dataset.actualBackend = activation.activeBackend;
    renderer.domElement.setAttribute("aria-label", "R1 material sampling canvas");
    renderer.domElement.title = "Metre-space wall swatches, a scaled normalized instance, and actual window frame/glass recipes";
    globalThis.document.body.append(renderer.domElement);
    await setSource("procedural");
    return { canvas: renderer.domElement, actualBackend: activation.activeBackend, fallbackReason: activation.fallbackReason ?? null, fixture, setSource, snapshot, dispose };
  } catch (error) { dispose(); throw error; }
}
