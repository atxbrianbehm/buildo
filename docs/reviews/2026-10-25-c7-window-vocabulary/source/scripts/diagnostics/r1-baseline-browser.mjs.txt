/* global window */
import { defaultBuildingPromptControls } from "/src/features/building-family/state/buildingStore.ts";
import { BRICK_COURSE_HEIGHT_M } from "/src/features/building-family/materials/providers/proceduralMaterialProvider.ts";
import { mountBuildingCapture } from "./r1-building-capture.mjs";
import { mountMaterialSampling } from "./r1-material-sampling.mjs";

let mounted;
window.r1Harness = {
  async mount({ kind, backend, width = 1280, height = 800, controls: suppliedControls, freeze, primaryWallMaterialDelta, periodicWallMaterialDelta, wallPhaseDiagnostic = false }) {
    if (typeof wallPhaseDiagnostic !== "boolean") throw new Error("Wall phase diagnostic opt-in must be boolean.");
    if (wallPhaseDiagnostic && kind !== "building") throw new Error("Wall phase diagnostics require building mode.");
    await mounted?.dispose();
    mounted = undefined;
    const controls = structuredClone(suppliedControls ?? defaultBuildingPromptControls);
    if (primaryWallMaterialDelta && periodicWallMaterialDelta) throw new Error("Material replay allowances are mutually exclusive.");
    if (primaryWallMaterialDelta && kind !== "sampling") throw new Error("Frozen controlled origins require the selected-material sampling mode.");
    if (periodicWallMaterialDelta && kind !== "sampling") throw new Error("Periodic controlled origins require sampling mode.");
    mounted = await (kind === "building" ? mountBuildingCapture : mountMaterialSampling)({ controls, backend, width, height, freeze,
      ...(wallPhaseDiagnostic ? { wallPhaseDiagnostic: true } : {}),
      ...(primaryWallMaterialDelta ? { primaryWallMaterialDelta } : {}),
      ...(periodicWallMaterialDelta ? { periodicWallMaterialDelta } : {}) });
    return {
      controls, actualBackend: mounted.actualBackend, fallbackReason: mounted.fallbackReason ?? null,
      freeze: mounted.freeze,
      resolvedSpec: mounted.fixture.spec,
      materialAnchors: { brickCourseHeightM: BRICK_COURSE_HEIGHT_M, atlasManifest: mounted.fixture.packedAtlas.manifest },
      identity: {
        familyId: mounted.fixture.spec.familyId, buildingId: mounted.fixture.ir.buildingId,
        graphId: mounted.fixture.graph.graphId, sourceGraphHash: mounted.fixture.ir.sourceGraphHash,
        catalogId: mounted.fixture.catalog.catalogId, atlasId: mounted.fixture.packedAtlas.atlasId,
        atlasContentHash: mounted.fixture.packedAtlas.contentHash
      }
    };
  },
  async setCapture(input) { await mounted.setCapture(input); },
  async setSource(name) { await mounted.setSource(name); },
  setWallDiagnostic(condition) {
    if (!mounted?.setWallDiagnostic) throw new Error("Wall diagnostics require a mounted building capture.");
    return mounted.setWallDiagnostic(condition);
  },
  async wallDiagnosticSnapshot() {
    if (!mounted?.wallDiagnosticSnapshot) throw new Error("Wall diagnostics require a mounted building capture.");
    return await mounted.wallDiagnosticSnapshot();
  },
  async setWallPhaseDiagnostic(condition) {
    if (!mounted?.setWallPhaseDiagnostic) throw new Error("Wall phase diagnostics require a mounted building capture.");
    return await mounted.setWallPhaseDiagnostic(condition);
  },
  async wallPhaseDiagnosticSnapshot() {
    if (!mounted?.wallPhaseDiagnosticSnapshot) throw new Error("Wall phase diagnostics require a mounted building capture.");
    return await mounted.wallPhaseDiagnosticSnapshot();
  },
  async openingLayoutInputs() {
    if (!mounted) throw new Error("Opening layout validation requires a mounted fixture.");
    return structuredClone({ graph: mounted.fixture.graph, spec: mounted.fixture.spec, catalog: mounted.fixture.catalog });
  },
  async snapshot() { return await mounted.snapshot(); },
  async dispose() { await mounted?.dispose(); mounted = undefined; }
};
