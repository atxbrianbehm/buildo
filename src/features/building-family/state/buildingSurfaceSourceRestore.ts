import { parseBuildingSurfaceSourceFile, type BuildingSurfaceSourceFile } from "./buildingSurfaceSourceFile";
import { createAssemblyHallFixture, type AssemblyHallFixture } from "../ui/assemblyHallFixture";
import { prepareBuildingSurfaceRuntime, type BuildingSurfaceRuntime } from "../renderer-three/surfaceMaterialRuntime";

export interface RestoredBuildingSurfaceSource {
  file: BuildingSurfaceSourceFile;
  fixture: AssemblyHallFixture;
  surfaceRuntime: BuildingSurfaceRuntime;
  dispose(): void;
}
/**
 * Rebuild from saved JSON and decoded atlas pixels only. The returned owner holds
 * both the fixture and its surface runtime; no store, controller or App is changed.
 */
export async function restoreBuildingSurfaceSourceFile(
  input: unknown, options: { signal?: AbortSignal } = {}
): Promise<RestoredBuildingSurfaceSource> {
  const signal = options.signal;
  signal?.throwIfAborted();
  // The codec captures input synchronously before its first await.
  const parsed = await parseBuildingSurfaceSourceFile(input);
  signal?.throwIfAborted();
  let fixture: AssemblyHallFixture | undefined, surfaceRuntime: BuildingSurfaceRuntime | undefined;
  try {
    fixture = await createAssemblyHallFixture({
      sourceSnapshot: parsed.sourceSnapshot, signal,
      reusableArtifacts: { packedAtlas: parsed.packedAtlas, debugExport: parsed.debugExport }
    });
    signal?.throwIfAborted();
    surfaceRuntime = await prepareBuildingSurfaceRuntime({
      composition: parsed.file.composition, ir: fixture.ir, atlas: fixture.packedAtlas
    });
    signal?.throwIfAborted();
    const buildingRuntime = fixture.familyRuntime.createOrReplaceBuilding({
      ir: fixture.ir, catalog: fixture.catalog, componentGallery: fixture.componentGallery, surfaceRuntime
    });
    fixture.buildingRuntime = buildingRuntime;
    fixture.metrics = { ...fixture.metrics, drawCallCount: fixture.familyRuntime.metrics.drawCallCount,
      textureCount: fixture.familyRuntime.metrics.textureCount };
    const ownedFixture = fixture, ownedSurface = surfaceRuntime;
    let disposed = false;
    return {
      file: parsed.file, fixture: ownedFixture, surfaceRuntime: ownedSurface,
      dispose() {
        if (disposed) return;
        disposed = true;
        // Always close composite ownership even if a host resource disposer rejects.
        try { ownedFixture.familyRuntime.dispose(); } finally { ownedSurface.dispose(); }
      }
    };
  } catch (error) {
    try { fixture?.familyRuntime.dispose(); } finally { surfaceRuntime?.dispose(); }
    throw error;
  }
}

