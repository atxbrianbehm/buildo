/* global window */
import { canonicalJson } from "/src/features/building-family/core/canonicalJson.ts";
import { BRICK_COURSE_HEIGHT_M } from "/src/features/building-family/materials/providers/proceduralMaterialProvider.ts";
import { mountBuildingCapture, fingerprintBuildingGeometry } from "./r1-building-capture.mjs";

const bytes = array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
const arrayCopy = array => array ? { type: array.constructor.name, byteLength: array.byteLength, bytes: bytes(array).slice() } : null;
const hash = async input => [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", typeof input === "string" ? new TextEncoder().encode(input) : input))].map(value => value.toString(16).padStart(2, "0")).join("");
async function hashCopy(value) {
  const detach = async input => input instanceof Uint8Array ? await hash(input) : Array.isArray(input) ? await Promise.all(input.map(detach))
    : input && typeof input === "object" ? Object.fromEntries(await Promise.all(Object.entries(input).map(async ([key, child]) => [key, await detach(child)]))) : input;
  return await hash(JSON.stringify(await detach(value)));
}
function geometryCopy(geometry) {
  return Object.fromEntries([...Object.entries(geometry.attributes), ["index", geometry.index]].filter(([, attribute]) => attribute).map(([name, attribute]) => {
    if (attribute.isInterleavedBufferAttribute) throw new Error("Production wall proof requires ordinary captured attributes.");
    return [name, { itemSize: attribute.itemSize, count: attribute.count, normalized: attribute.normalized, array: arrayCopy(attribute.array) }];
  }));
}

/** Measure actual default production buffers; this never creates a phase controller. */
export async function measureWallPhaseProductionFixture(fixture) {
  const runtime = fixture.buildingRuntime, selected = runtime.renderables.find(object => object.name === "mesh.wall-panels");
  if (!selected?.isMesh || selected.isInstancedMesh) throw new Error("Production proof requires the ordinary wall mesh.");
  const ir = fixture.ir, originalIr = { meshBatches: ir.meshBatches.map(batch => ({ batchId: batch.batchId, positions: arrayCopy(batch.positions), normals: arrayCopy(batch.normals), uvs: arrayCopy(batch.uvs), indices: arrayCopy(batch.indices) })),
    instanceBatches: ir.instanceBatches.map(batch => ({ batchId: batch.batchId, count: batch.count, transforms: arrayCopy(batch.transforms) })) };
  const metadata = { ...ir, meshBatches: ir.meshBatches.map(batch => Object.fromEntries(Object.entries(batch).filter(([key]) => !["positions", "normals", "uvs", "indices"].includes(key)))),
    instanceBatches: ir.instanceBatches.map(batch => Object.fromEntries(Object.entries(batch).filter(([key]) => key !== "transforms"))) };
  const protectedGeometry = runtime.renderables.filter(object => object !== selected).map(object => ({ batchId: object.name, geometry: geometryCopy(object.geometry), matrix: object.matrix.toArray(), matrixWorld: object.matrixWorld.toArray(), instanceMatrix: object.isInstancedMesh ? arrayCopy(object.instanceMatrix.array) : null }));
  const transformState = { root: runtime.root.matrix.toArray(), rootWorld: runtime.root.matrixWorld.toArray(), stages: runtime.stageGroups.map(({ stage, group }) => ({ stage, matrix: group.matrix.toArray(), matrixWorld: group.matrixWorld.toArray() })), selectedMatrix: selected.matrix.toArray(), selectedWorld: selected.matrixWorld.toArray() };
  const [productionIrHash, irMetadataHash, selectedGeometryHash, geometryHash, protectedGeometryHash, instanceTransformsHash] = await Promise.all([
    hashCopy(originalIr), hash(canonicalJson(metadata)), hashCopy(geometryCopy(selected.geometry)), fingerprintBuildingGeometry(fixture),
    hashCopy({ protectedGeometry, transformState }), hashCopy({ source: originalIr.instanceBatches, submitted: protectedGeometry.filter(row => row.instanceMatrix).map(({ batchId, instanceMatrix, matrix, matrixWorld }) => ({ batchId, instanceMatrix, matrix, matrixWorld })) })
  ]);
  return { productionIrHash, irMetadataHash, selectedGeometryHash, geometryHash, protectedGeometryHash, instanceTransformsHash };
}

function remember(fixture) {
  const originalIrObject = fixture.ir, originalMeshBatches = [...fixture.ir.meshBatches], originalInstanceBatches = [...fixture.ir.instanceBatches];
  const originals = fixture.buildingRuntime.renderables.map(object => ({ object, geometry: object.geometry, matrix: object.matrix.toArray(), matrixWorld: object.matrixWorld.toArray(),
    attributes: [...Object.entries(object.geometry.attributes), ["index", object.geometry.index], ...(object.isInstancedMesh ? [["instanceMatrix", object.instanceMatrix]] : [])].filter(([, attribute]) => attribute)
      .map(([name, attribute]) => ({ name, attribute, array: attribute.array, buffer: attribute.array.buffer, bytes: bytes(attribute.array).slice() })) }));
  const originalIr = [...fixture.ir.meshBatches.flatMap(batch => ["positions", "normals", "uvs", "indices"].filter(key => batch[key]).map(key => ({ batch, key, array: batch[key], bytes: bytes(batch[key]).slice() }))),
    ...fixture.ir.instanceBatches.map(batch => ({ batch, key: "transforms", array: batch.transforms, bytes: bytes(batch.transforms).slice() }))];
  const originalMaterials = fixture.buildingRuntime.renderables.map(object => ({ object, material: object.material }));
  return { originalIrObject, originalMeshBatches, originalInstanceBatches, originals, originalIr, originalMaterials };
}
function assertIntact(owner) {
  const { mounted, guard: { originalIrObject, originalMeshBatches, originalInstanceBatches, originals, originalIr } } = owner;
  if (mounted.fixture.ir !== originalIrObject || mounted.fixture.ir.meshBatches.length !== originalMeshBatches.length || mounted.fixture.ir.instanceBatches.length !== originalInstanceBatches.length ||
      mounted.fixture.ir.meshBatches.some((batch, index) => batch !== originalMeshBatches[index]) || mounted.fixture.ir.instanceBatches.some((batch, index) => batch !== originalInstanceBatches[index])) throw new Error("Production IR batch ownership changed.");
  const sameBytes = (array, saved) => bytes(array).length === saved.length && bytes(array).every((value, index) => value === saved[index]);
  for (const row of originals) {
    if (row.object.geometry !== row.geometry || !row.matrix.every((value, index) => Object.is(value, row.object.matrix.elements[index])) || !row.matrixWorld.every((value, index) => Object.is(value, row.object.matrixWorld.elements[index]))) throw new Error("Production geometry reference/placement changed during material capture.");
    for (const saved of row.attributes) {
      const current = saved.name === "instanceMatrix" ? row.object.instanceMatrix : saved.name === "index" ? row.geometry.index : row.geometry.attributes[saved.name];
      if (current !== saved.attribute || current.array !== saved.array || current.array.buffer !== saved.buffer || !sameBytes(current.array, saved.bytes)) throw new Error("Production geometry/instance buffer changed during material capture.");
    }
  }
  for (const row of originalIr) if (row.batch[row.key] !== row.array || !sameBytes(row.array, row.bytes)) throw new Error("Production IR changed during material capture.");
}

/** Injectable only for the render-free ownership smoke; defaults use the production mount. */
export function createWallPhaseProductionHarness({ mount = mountBuildingCapture, measure = measureWallPhaseProductionFixture } = {}) {
  let current, epoch = 0;
  const stale = () => new Error("Production capture operation lost its mounted owner.");
  function assertCurrent(owner, operation) {
    if (current !== owner || epoch !== owner.epoch || (operation !== undefined && operation !== owner.operation)) throw stale();
  }
  function disposeOwner(owner, verify = true) {
    if (!owner.disposal) owner.disposal = owner.tail.then(async () => {
      try { if (verify && owner.guard) assertIntact(owner); } finally { await owner.mounted.dispose(); }
    });
    return owner.disposal;
  }
  function enqueue(work) {
    const owner = current;
    if (!owner) return Promise.reject(new Error("Production capture is not mounted."));
    const operation = ++owner.operation;
    // The frozen material helper may restore on rejection. Settle it before a newer mutation.
    const result = owner.tail.then(async () => {
      assertCurrent(owner, operation); assertIntact(owner);
      const value = await work(owner);
      assertCurrent(owner, operation); assertIntact(owner);
      return value;
    });
    owner.tail = result.catch(() => {});
    return result;
  }
  return {
    async mount({ controls, backend, freeze }) {
      const mountEpoch = ++epoch, previous = current;
      current = undefined;
      if (previous) await disposeOwner(previous);
      if (epoch !== mountEpoch) throw stale();
      // Omission of wallPhaseDiagnostic deliberately uses the default production path.
      const mounted = await mount({ controls, backend, freeze });
      const owner = { mounted, epoch: mountEpoch, operation: 0, tail: Promise.resolve() };
      try {
        if (epoch !== mountEpoch) throw stale();
        owner.guard = remember(mounted.fixture);
        const fixture = mounted.fixture;
        const info = { actualBackend: mounted.actualBackend, fallbackReason: mounted.fallbackReason ?? null, freeze: mounted.freeze, controls, resolvedSpec: fixture.spec,
          identity: { familyId: fixture.spec.familyId, buildingId: fixture.ir.buildingId, graphId: fixture.graph.graphId, sourceGraphHash: fixture.ir.sourceGraphHash, catalogId: fixture.catalog.catalogId, atlasId: fixture.packedAtlas.atlasId, atlasContentHash: fixture.packedAtlas.contentHash },
          materialAnchors: { brickCourseHeightM: BRICK_COURSE_HEIGHT_M, atlasManifest: fixture.packedAtlas.manifest } };
        current = owner;
        return info;
      } catch (error) {
        try { await disposeOwner(owner, false); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "Production mount and captured-owner cleanup failed.", { cause: cleanupError }); }
        throw error;
      }
    },
    setCapture(input) { return enqueue(owner => owner.mounted.setCapture(input)); },
    setWallDiagnostic(condition) {
      return enqueue(async owner => {
        const result = await owner.mounted.setWallDiagnostic(condition);
        assertCurrent(owner); assertIntact(owner);
        if ((condition === "production" || condition === "restored-production") && owner.guard.originalMaterials.some(row => row.object.material !== row.material)) throw new Error("Production materials did not restore their original references.");
        return result;
      });
    },
    snapshot() { return enqueue(owner => owner.mounted.snapshot()); },
    wallDiagnosticSnapshot() { return enqueue(owner => owner.mounted.wallDiagnosticSnapshot()); },
    productionSnapshot() { return enqueue(owner => measure(owner.mounted.fixture)); },
    async dispose() {
      ++epoch;
      const owner = current;
      current = undefined;
      if (owner) await disposeOwner(owner);
    }
  };
}

if (typeof window !== "undefined") window.r1WallPhaseProductionHarness = createWallPhaseProductionHarness();
