# Dynamic Building Family Integration Map

**Status:** Milestone 5E Component Forge UI foundation
**Plan source:** `docs/plans/dynamic-building-family.md`
**Workspace:** `C:\Users\behmb\Documents\Cascade Projects\buildo`
**Date:** 2026-06-24

## 1. Repository State

`buildo` is now an initialized Git repository with a Vite + React + TypeScript scaffold, npm lockfile, unit-test setup, lint setup, and a programmatic Playwright Chromium smoke check.

Current high-level layout:

```text
AGENTS.md
README.md
package.json
package-lock.json
index.html
vite.config.ts
vitest.config.ts
playwright.config.ts
eslint.config.js
tsconfig.json
tsconfig.app.json
tsconfig.node.json
scripts/
  dev-server.mjs
  e2e-smoke.mjs
src/
  app/
    App.css
    App.test.tsx
    App.tsx
    main.tsx
  test/
    setup.ts
  vite-env.d.ts
tests/
  e2e/
    smoke.spec.ts
docs/
  architecture/
    dynamic-building-family-integration.md
  plans/
    dynamic-building-family.md
```

The app currently contains a setup shell, the Milestone 1 deterministic domain foundation, the Milestone 2A semantic atlas planner foundation, the Milestone 2B procedural material-source layer, the Milestone 2C atlas channel packer, the Milestone 2D in-memory atlas artifact/debug-export foundation, the Milestone 2E visible Atlas Lab fixture, the Milestone 3A component catalog / graph planning foundation, the Milestone 3B pure compiler IR foundation, the Milestone 3C compiler worker boundary, the Milestone 3D component gallery data foundation, the Milestone 4A renderer adapter foundation, the Milestone 4B atlas texture/material sampling foundation, the Milestone 4C shared family runtime foundation, the Milestone 4D Assembly Hall rendered fixture foundation, the Milestone 4E renderer resource disposal foundation, the Milestone 4F Assembly Hall semantic selection foundation, the Milestone 4G WebGPU renderer activation foundation, the Milestone 5A run controller / Zustand state foundation, the Milestone 5B control invalidation foundation, the Milestone 5C committed rerun control/artifact-lineage foundation, the Milestone 5D cancellation UI/stale-run preservation foundation, and the Milestone 5E Component Forge UI foundation. No router, stage-driven reveal, lock/unlock controls, or complete four-room flow has been implemented.

## 2. Active Instructions

Repository instructions now live at `AGENTS.md`.

Key active project rules:

- read the plan and this integration map before feature changes;
- work in small milestones;
- preserve the React + Three.js + Zustand direction;
- keep contracts/core/compiler renderer-independent;
- do not use `Math.random()` for structural or material decisions once generation code exists;
- do not add preassembled building/component meshes;
- keep provider secrets out of client code;
- schema-version serialized artifacts and runtime-validate them;
- run relevant checks before finishing.

## 3. Package And Workspace Layout

Actual package manager: npm.

Actual scaffold: single Vite application with React and TypeScript.

Actual app entry:

```text
index.html
src/app/main.tsx
src/app/App.tsx
```

Recommended project shape remains a single application with strict feature boundaries under `src/features`. Split contracts/core/compiler into separate packages only after the first browser vertical slice proves package-level enforcement is worth the added workspace complexity.

## 4. Commands

Actual commands:

```text
npm install
npm run dev
npm run dev:server
npm run build
npm run typecheck
npm run test
npm run test:watch
npm run test:e2e
npm run lint
```

`npm run dev:server` starts Vite through the Vite JS API.

`npm run test:e2e` uses `scripts/e2e-smoke.mjs`, which starts Vite through the Vite JS API, launches Playwright Chromium, verifies the app shell, and closes resources explicitly. This avoids a Windows harness issue where `playwright test` with a managed web server passed the assertion but did not exit before the command timeout.

`playwright.config.ts` is present for future Playwright test-runner work. If using `npx playwright test` directly, start the dev server separately or set `PLAYWRIGHT_BASE_URL`.

## 5. Installed Versions

Resolved top-level package versions:

```text
@eslint/js@10.0.1
@playwright/test@1.61.1
@testing-library/jest-dom@6.9.1
@testing-library/react@16.3.2
@types/node@26.0.0
@types/react-dom@19.2.3
@types/react@19.2.17
@types/three@0.184.1
@vitejs/plugin-react@6.0.3
eslint-plugin-react-hooks@7.1.1
eslint-plugin-react-refresh@0.5.3
eslint@10.5.0
globals@17.7.0
jsdom@29.1.1
react-dom@19.2.7
react@19.2.7
three@0.184.0
typescript-eslint@8.62.0
typescript@6.0.3
vite@8.1.0
vitest@4.1.9
zod@4.4.3
zustand@5.0.14
```

Three.js API inspection for Milestone 4 found that `three@0.184.0` does not export `WebGPURenderer` from the main `three` entrypoint. It does expose `WebGPURenderer` from `three/webgpu`, while `WebGLRenderer`, `BufferGeometry`, `Mesh`, `InstancedMesh`, `DataTexture`, `MeshStandardMaterial`, `Group`, `Matrix4`, and `Box3` are available from `three`.

## 6. PSG Surface

Actual PSG schema, evaluator, import/export paths, fixtures, and tests:

```text
src/features/prompt-spaghetti/contracts/psgDocument.ts
src/features/prompt-spaghetti/core/evaluatePsg.ts
src/features/prompt-spaghetti/core/evaluationTrace.ts
src/features/prompt-spaghetti/io/importPsg.ts
src/features/prompt-spaghetti/io/exportPsg.ts
src/features/prompt-spaghetti/fixtures/legacy-v2.psg.json
src/features/prompt-spaghetti/tests/evaluatePsg.test.ts
src/features/prompt-spaghetti/tests/legacyV2Compatibility.test.ts
```

Actual building adapter paths:

```text
src/features/building-family/psg/psgBuildingIntentAdapter.ts
src/features/building-family/psg/localRulePromptInterpreter.ts
src/features/building-family/psg/fixtures/late19cCommercialPrompt.psg.json
```

The evaluator intentionally supports the first needed PSG v2 node subset: `TextBlock`, `WeightedChoice`, `Concat`, `Output`, `SetVariable`, and `GetVariable`. The Output node accepts optional `outputKind` without changing the PSG schema version.

## 6.1 Building Family Domain Foundation

Actual Milestone 1 contract and deterministic core paths:

```text
src/features/building-family/contracts/atlasManifest.ts
src/features/building-family/contracts/buildingFamilySpec.ts
src/features/building-family/contracts/buildingGraph.ts
src/features/building-family/contracts/buildingIntent.ts
src/features/building-family/contracts/componentRecipe.ts
src/features/building-family/contracts/generationRun.ts
src/features/building-family/contracts/historicalStylePack.ts
src/features/building-family/contracts/index.ts
src/features/building-family/contracts/runtimeBuildingIR.ts
src/features/building-family/contracts/shared.ts
src/features/building-family/core/canonicalJson.ts
src/features/building-family/core/contentHash.ts
src/features/building-family/core/diagnostics.ts
src/features/building-family/core/invalidation.ts
src/features/building-family/core/seedTree.ts
src/features/building-family/core/semanticPaths.ts
src/features/building-family/core/specNormalizer.ts
src/features/building-family/style-packs/late-19c-commercial-demo.json
```

The style pack is explicitly demo-curated and does not claim historical authority. The normalizer clamps floor and bay ranges, emits diagnostics for invalid selections and forbidden combinations, and returns a validated `BuildingFamilySpec`.

## 6.2 Semantic Atlas Planning And Procedural Sources

Actual Milestone 2 material planning and source-generation paths:

```text
src/features/building-family/materials/atlasPlanner.ts
src/features/building-family/materials/atlasPacker.ts
src/features/building-family/materials/artifactCache.ts
src/features/building-family/materials/atlasDebugExport.ts
src/features/building-family/materials/atlasLabFixture.ts
src/features/building-family/materials/normalFromHeight.ts
src/features/building-family/materials/periodicBlend.ts
src/features/building-family/materials/providers/fixtureMaterialProvider.ts
src/features/building-family/materials/providers/proceduralMaterialProvider.ts
src/features/building-family/ui/AtlasLab.tsx
src/features/building-family/tests/atlasArtifactCache.test.ts
src/features/building-family/tests/atlasDebugExport.test.tsx
src/features/building-family/tests/atlasLabFixture.test.ts
src/features/building-family/tests/atlasPlanner.test.ts
src/features/building-family/tests/atlasPacker.test.ts
src/features/building-family/tests/proceduralMaterialProvider.test.ts
```

`planAtlas` consumes a validated `BuildingFamilySpec` and produces an `AtlasPlan` containing:

```text
manifest: AtlasManifest
materialSources: planned material-source references
profileRecipeIds: planned vector profile references
diagnostics: validation diagnostics
```

The planner currently emits the required initial semantic slots and source requests:

```text
wall.primary
wall.secondary
roof.primary
glass.primary
frame.primary
door.primary
trim.horizontal.primary
trim.horizontal.secondary
trim.vertical.primary
cornice.primary
ornament.primary
utility.mask
```

The implementation keeps the `AtlasSlot.role` contract from the plan. Because `utility.mask` is required by the initial slot list but `utility` is not a serialized role, the slot uses role `ornament` with `utility` and `mask` compatibility tags.

Material source plans now include the selected source family, seed path, prompt vocabulary, periodicity, and physical size. That lets providers generate deterministic source artifacts without taking ownership of packed-atlas layout.

`validateAtlasPlan` checks:

```text
slot rectangles remain within atlas bounds
slots preserve atlas-edge padding
slots preserve inter-slot padding
slots do not overlap
slots reference known material sources
slots reference known profile recipes when profileRecipeId is present
```

`ProceduralMaterialProvider` returns named source artifacts, not a complete atlas. Each artifact carries:

```text
sourceId
providerId
widthPx / heightPx
baseColor RGBA layer
optional height / roughness / metalness / opacity RGBA layers
requestHash
contentHash
provenance
```

Implemented procedural source families cover the current demo atlas needs:

```text
running-bond brick
stucco / plaster with cracks and weathering
painted metal with edge wear
painted wood grain
roof membrane / tile patterning
glass tint and roughness
ornament / utility alpha and height masks
```

The provider uses seeded deterministic sampling through `SeedTree`; it does not use `Math.random()`. Periodic `x` and `xy` sources are edge-matched at the generated layer boundary so the later packer can repeat them.

`AtlasPacker` composites named material-source artifacts into full-manifest atlas channels. It owns slot placement and currently emits:

```text
baseColor
normal derived from height
ORM packed from occlusion / roughness / metalness
height
opacity
slot provenance
packed content hash
diagnostics
```

Packing uses fixture-backed tests, derives normals from source height, blends periodic source edges before scaling into slots, and dilates slot edges into padding to reduce mip bleeding. Missing source artifacts are reported as diagnostics instead of being silently ignored.

`InMemoryArtifactCache` stores schema-versioned artifacts by artifact type, request hash, content hash, dependency list, and artifact payload. It validates restored serialized entries before accepting them and exposes cache-hit metadata for generation orchestration.

`createAtlasDebugExport` converts each packed channel into a real PNG data URL without adding an image dependency. The debug export includes channel hashes, semantic slot overlays, source provenance, diagnostics, and a stable export hash.

`AtlasLab` is a development inspector component that renders the packed atlas identity, channel PNGs, and semantic slot overlays from the same `PackedAtlas` and debug export artifacts.

`createAtlasLabFixture` now drives the visible app-shell fixture from the real local pipeline:

```text
PSG fixture + prompt
BuildingIntent
BuildingFamilySpec
AtlasPlan
ProceduralMaterialProvider
PackedAtlas
AtlasDebugExport
AtlasLab
```

The root app shell renders this fixture as a development Atlas Lab with visible multi-channel PNGs, semantic slot overlays, and provenance counts. The smoke harness now waits for the visible Atlas Lab, base-color channel, and `wall.primary` slot.

Milestone 2 exit status: the fixture spec produces a visible generated multi-channel atlas with semantic slot overlays and provenance. The next roadmap slice should begin Milestone 3 component catalog, building graph, and pure compiler work.

## 6.3 Component Catalog And Building Graph Foundation

Actual Milestone 3A component and graph paths:

```text
src/features/building-family/components/componentCatalogBuilder.ts
src/features/building-family/components/primitiveBuilders.ts
src/features/building-family/components/frameBuilder.ts
src/features/building-family/components/profileSweepBuilder.ts
src/features/building-family/components/roofBuilder.ts
src/features/building-family/compiler/buildingGraphBuilder.ts
src/features/building-family/tests/componentCatalogBuilder.test.ts
src/features/building-family/tests/buildingGraphBuilder.test.ts
```

`buildComponentCatalog` consumes a normalized `BuildingFamilySpec` and `AtlasManifest` and emits a schema-versioned component catalog with deterministic recipe ids, atlas slot references, variation scopes, dimensions, anchors, and low-detail fallback ids.

The current catalog includes:

```text
wall panel
window frame
window opening recess
storefront door
horizontal trim
vertical trim
cornice profile sweep
roof
```

The cornice recipe now carries both `atlasSlotIds: ["cornice.primary"]` and `profileRecipeId: "profile.cornice.<family>.primary"` so vector profile identity remains separate from atlas pixels.

`buildBuildingGraph` consumes the normalized spec and component catalog and emits a deterministic serializable graph with the initial staged node sequence:

```text
CreateRectFootprint
ExtrudeMassing
ForEachFacade
SplitFloors
SplitBays
EmitWallPanel
PlaceOpening
InstanceComponent (windows)
InstanceComponent (vertical trim)
SweepProfile (cornice)
EmitRoof
OutputBuilding
```

`validateBuildingGraph` currently checks graph schema, duplicate node ids, missing output node, missing upstream node references, and upstream dependency cycles.

## 6.4 Pure Compiler IR Foundation

Actual Milestone 3B compiler paths:

```text
src/features/building-family/compiler/buildingCompiler.ts
src/features/building-family/compiler/primitiveGeometry.ts
src/features/building-family/tests/buildingCompiler.test.ts
```

`compileBuilding` consumes a normalized `BuildingFamilySpec`, schema-versioned component catalog, and validated building graph, then emits a schema-validated `RuntimeBuildingIR` with typed-array mesh and instance buffers.

The current pure compiler emits:

```text
mesh.wall-panels for front, rear, left, and right facade wall panels
mesh.cornice for the front cornice sweep placeholder primitive
mesh.roof for the roof/parapet primitive
instances.window for repeated front-facade windows
instances.door for the storefront door
instances.vertical-trim for repeated front-facade vertical trim
```

Compiler output includes a source graph hash, bounds, vertex / triangle / instance metrics, and a semantic index for emitted elements. Geometry helpers currently generate primitive box buffers only; no Three.js, React, Zustand, DOM, or renderer dependency is present.

## 6.5 Compiler Worker Boundary

Actual Milestone 3C worker paths:

```text
src/features/building-family/compiler/compilerClient.ts
src/features/building-family/compiler/compiler.worker.ts
src/features/building-family/compiler/compilerWorkerProtocol.ts
src/features/building-family/compiler/compilerWorkerRuntime.ts
src/features/building-family/tests/buildingCompilerWorker.test.ts
```

The worker boundary now has runtime-validated compile/cancel request messages and progress/complete/error response messages matching the implementation plan. `collectRuntimeIrTransferables` gathers every typed-array buffer from `RuntimeBuildingIR` mesh and instance batches so complete responses can transfer buffers instead of JSON-copying numeric arrays.

`createCompilerWorkerRuntime` accepts compile and cancel messages, delegates to the pure compiler, posts geometry compile progress, transfers buffers on completion, and discards cancelled or stale results when a newer request supersedes an older one.

`CompilerClient` wraps a structural endpoint interface so later UI/state orchestration can talk to a real worker without importing renderer or app-store code into the compiler layer. Starting a new compile request cancels the prior active request and ignores stale responses that arrive afterward.

## 6.6 Component Gallery Data Foundation

Actual Milestone 3D gallery paths:

```text
src/features/building-family/compiler/componentGalleryBuilder.ts
src/features/building-family/tests/componentGalleryBuilder.test.ts
```

`buildComponentGallery` consumes the schema-versioned component catalog and compiled `RuntimeBuildingIR`, then emits a schema-validated `ComponentGallery` artifact for later Component Forge UI work.

The gallery records one entry per component recipe, preserving recipe id, kind, role, dimensions, anchors, atlas slots, optional profile recipe id, assembly stage, stable grid coordinates, and a sample semantic path when the compiler emitted one. Emitted mesh and instance batches are summarized with vertex, triangle, instance, and semantic element counts without copying typed-array buffers into the gallery data.

Current compiler coverage leaves `opening` and `horizontalTrim` as recipe-only gallery entries. The gallery keeps those entries visible and emits warning diagnostics so Component Forge can distinguish implemented generated components from catalog recipes that still need compiler emission.

## 6.7 Renderer Adapter Foundation

Actual Milestone 4A renderer paths:

```text
src/features/building-family/renderer-three/buildingSceneAdapter.ts
src/features/building-family/renderer-three/buildingAtlasMaterialFactory.ts
src/features/building-family/tests/buildingSceneAdapter.test.ts
```

`detectRendererBackendSupport` reports WebGL fallback availability from the main `three` entrypoint and WebGPU availability from `three/webgpu`. It does not instantiate a browser renderer yet.

`createAtlasMaterialRegistry` creates slot-keyed `MeshStandardMaterial` instances with atlas id, atlas content hash, and slot metadata attached in `userData`. Its fallback path can still create deterministic color materials without texture uploads, which keeps the first renderer adapter tests independent of a canvas.

`createBuildingSceneRuntime` converts compiled `RuntimeBuildingIR` mesh batches into `BufferGeometry` + `Mesh` objects, converts instance batches into `InstancedMesh` objects using catalog recipe dimensions, applies compiler transforms, groups objects by assembly stage, builds semantic-path lookup entries, links component gallery entries to renderer objects, and exposes disposal for geometries and materials through the centralized renderer disposal helper.

## 6.8 Atlas Texture And Material Sampling Foundation

Actual Milestone 4B renderer paths:

```text
src/features/building-family/renderer-three/buildingAtlasTextureFactory.ts
src/features/building-family/renderer-three/buildingAtlasMaterialFactory.ts
src/features/building-family/tests/buildingAtlasTextureFactory.test.ts
```

`createAtlasTextureSet` converts the packed atlas channels into Three.js `DataTexture` objects for `baseColor`, `normal`, `orm`, `height`, and `opacity`. Each texture carries atlas id, atlas content hash, channel name, channel hash, and renderer boundary metadata, preserving the exact `PackedAtlas` / `AtlasDebugExport` identity at the renderer edge.

`slotTextureWindow` derives normalized UV windows from the atlas manifest for each semantic slot, including pixel rect, UV mode, periodicity, and physical size. It throws on unknown slots so bad material lookups fail near the renderer boundary instead of silently sampling the wrong atlas region.

When a texture set is provided, `createAtlasMaterialRegistry` now wires the packed atlas into `MeshStandardMaterial` instances: base color map, normal map, roughness/metalness maps from the ORM channel, opacity alpha map, transparent mode, slot UV metadata, and channel hashes. Registry disposal remains idempotent and now releases atlas channel textures through the texture set.

## 6.9 Shared Family Runtime Foundation

Actual Milestone 4C renderer paths:

```text
src/features/building-family/renderer-three/familyRuntime.ts
src/features/building-family/tests/buildingFamilyRuntime.test.ts
```

`createBuildingFamilyRuntime` owns the shared renderer-side resources for one generated family: atlas `DataTexture` channels, the texture-backed atlas material registry, a root Three.js `Group`, optional backend support metadata, and aggregate draw/resource metrics.

The family runtime can create or replace per-building scene runtimes from `RuntimeBuildingIR` while reusing the same atlas textures and slot materials. Replacing a building disposes the old building geometries and scene graph nodes through the shared disposal helper without disposing the shared atlas or materials, which keeps geometry invalidation separate from material-family invalidation.

The focused runtime and renderer adapter tests cover the current Milestone 4 requirements that can be verified without opening a browser canvas: one shared family runtime can support 16 building runtimes, repeated components remain instanced through the existing scene adapter, geometry replacement disposes old resources, and final family disposal releases building geometries plus shared atlas materials/textures exactly once.

## 6.10 Assembly Hall Rendered Fixture Foundation

Actual Milestone 4D renderer/UI paths:

```text
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/ui/AssemblyHall.tsx
src/features/building-family/tests/assemblyHallFixture.test.ts
src/features/building-family/tests/AssemblyHall.test.tsx
src/app/App.tsx
src/app/App.css
scripts/e2e-smoke.mjs
```

`createAssemblyHallFixture` composes the real fixture pipeline from PSG evaluation through normalized spec, atlas plan/packing/debug export, component catalog, building graph, compiler IR, component gallery, backend support detection, shared family runtime, and one per-building scene runtime. The same packed atlas artifacts feed both Atlas Lab and the rendered Assembly Hall fixture in the root app shell.

`AssemblyHall` mounts a Three.js canvas for the fixture building, using the shared family runtime root and atlas-backed slot materials. The surface now activates WebGPU first when the browser exposes `navigator.gpu` and the detected support prefers WebGPU, then falls back to WebGL when WebGPU is unavailable or initialization fails. The surface shows active/preferred backend, draw calls, instance count, triangle count, atlas content hash, texture count, and a compact component-gallery summary. In non-renderer unit-test environments it renders an accessible fallback while keeping the real browser path canvas-backed.

The e2e smoke now waits for the Assembly Hall canvas, verifies the canvas marked a rendered frame, verifies the active backend metric, and performs a backend-specific pixel probe so a blank canvas cannot satisfy the smoke. Browser/IAB verified the live WebGPU canvas DOM state and console cleanliness; Playwright captured desktop and mobile screenshots because the in-app browser screenshot path timed out on the WebGPU tab.

## 6.11 Renderer Resource Disposal Foundation

Actual Milestone 4E renderer paths:

```text
src/features/building-family/renderer-three/resourceDisposal.ts
src/features/building-family/renderer-three/buildingSceneAdapter.ts
src/features/building-family/renderer-three/familyRuntime.ts
src/features/building-family/tests/resourceDisposal.test.ts
```

`disposeBuildingSceneResources` centralizes renderer cleanup for a `BuildingSceneRuntime`: it disposes renderable geometries exactly once, clears the scene root and renderer lookup maps, marks the runtime disposed, and optionally disposes the attached material registry.

`disposeBuildingSceneRuntime` remains the standalone scene-owned API and now delegates to the helper with material disposal enabled. `createBuildingFamilyRuntime` uses the same helper with material disposal disabled for building replacement, building removal, and family teardown so shared atlas materials and textures stay alive until the family runtime itself is disposed.

The focused resource-disposal tests cover both ownership modes: standalone scene disposal releases geometries, materials, and atlas textures exactly once, while shared-family building disposal releases only per-building geometries and leaves atlas resources intact until final family disposal.

## 6.12 Assembly Hall Semantic Selection Foundation

Actual Milestone 4F UI paths:

```text
src/features/building-family/ui/AssemblyHall.tsx
src/features/building-family/tests/AssemblyHall.test.tsx
src/app/App.css
scripts/e2e-smoke.mjs
```

`AssemblyHall` now exposes the renderer semantic lookup as a selectable inspector. The selector is built from `buildingRuntime.semanticLookup`, and each selected entry shows its semantic path, assembly stage, runtime batch id, material slot id, Three.js object type, and component-gallery label/source where available.

The focused React test selects a real generated window semantic path and verifies it traces to `instances.window`, `openings`, `glass.primary`, `InstancedMesh`, and the Window frame gallery entry. The e2e smoke also selects the window entry in the browser before probing the canvas, so the visible Assembly Hall path covers both selection data and rendered output.

## 6.13 WebGPU Renderer Activation Foundation

Actual Milestone 4G renderer/UI paths:

```text
src/features/building-family/renderer-three/assemblyRendererFactory.ts
src/features/building-family/ui/AssemblyHall.tsx
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/tests/assemblyRendererFactory.test.ts
src/features/building-family/tests/AssemblyHall.test.tsx
scripts/e2e-smoke.mjs
```

`createAssemblyRenderer` is the Assembly Hall renderer activation boundary. It uses `three/webgpu` only through an async dynamic import, gates WebGPU construction on `navigator.gpu`, awaits `WebGPURenderer.init()`, and falls back to WebGL with an explicit fallback reason when WebGPU activation fails. `createWebGlAssemblyRenderer` preserves the WebGL `preserveDrawingBuffer` path used by direct canvas probes and fails early in non-WebGL environments instead of touching unsupported canvas APIs.

`AssemblyHall` now awaits renderer activation, writes `data-renderer-backend` to the canvas, updates the visible active backend metric from the activation result, and shows the fallback reason when WebGPU falls back to WebGL. Fixture metrics now start as `pending` until the UI activates a real backend.

The focused renderer-factory tests cover WebGPU-first activation, WebGPU-to-WebGL fallback, and direct WebGL selection when WebGPU is unavailable. The e2e smoke waits for the active backend attribute, checks the visible active-backend metric, keeps the direct WebGL `readPixels` probe for WebGL fallback, and uses a dependency-free screenshot PNG probe for WebGPU presentation because WebGPU canvas export/readback can be transparent even when the presented canvas draws correctly.

## 6.14 Run Controller And State Foundation

Actual Milestone 5A orchestration/UI paths:

```text
src/features/building-family/state/artifactRegistry.ts
src/features/building-family/state/buildingStore.ts
src/features/building-family/state/buildingRunController.ts
src/features/building-family/tests/buildingState.test.ts
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
```

`BuildingArtifactRegistry` is the runtime artifact registry for heavyweight objects that must not live in persisted or serializable state. It validates serializable artifact metadata with Zod, keeps the `AssemblyHallFixture` and future runtime objects outside Zustand, and owns disposer callbacks so stale or unmounted family runtimes can be released exactly once.

`createBuildingStore` creates a vanilla Zustand store with prompt controls, run state, artifact metadata, and selection state. The store keeps artifact ids and metadata only; it does not store `ImageBitmap`, Three.js objects, typed geometry buffers, or family runtime objects.

`BuildingRunController` is now the UI-facing orchestration boundary for the current demo pipeline. It creates run ids, starts a real generation run event stream using the existing fixture pipeline stages, registers the completed Assembly Hall fixture artifact, cancels prior runs, ignores stale completions, and disposes stale fixture runtimes. The root `App` now instantiates a per-app store/controller/registry bundle and renders a compact Generation Run timeline before the existing Atlas Lab and Assembly Hall surfaces.

This is not the complete Milestone 5 four-room demo yet. Full Prompt Lab controls, complete Component Forge 3D preview/regeneration controls, stage-driven reveal, lock/unlock, provenance panels, provider-level cancel/progress UI, and 16-variant stress view remain future Milestone 5 slices.

## 6.15 Control Invalidation Foundation

Actual Milestone 5B invalidation/UI paths:

```text
src/features/building-family/core/invalidation.ts
src/features/building-family/tests/invalidation.test.ts
src/features/building-family/state/buildingStore.ts
src/features/building-family/tests/buildingState.test.ts
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
```

`computeBuildingInvalidation(previous, next)` now implements the roadmap invalidation matrix as a pure core API. It reports changed controls, per-stage impacts, invalidated stages, whether material generation is required, and whether material sources, packed atlas, and component catalog artifacts can be reused. The focused tests lock the important Milestone 5 distinction: floor, bay, and building-seed changes reuse material sources, atlas, and component catalog, while family-seed changes invalidate the full family artifact chain.

`createBuildingStore` now includes a control slice with an invalidation preview and `updatePromptControls`. The action deep-merges seed patches, updates serializable prompt controls, and stores the matrix result without touching runtime artifacts or starting a regeneration run.

The root app now exposes a small Control Invalidation panel for floors, bays, and building seed. In Milestone 5B this was preview-only; Milestone 5C wires committed rerun actions that can launch a new build from those controls.

## 6.16 Committed Rerun Controls And Artifact Lineage

Actual Milestone 5C rerun/artifact paths:

```text
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/state/buildingRunController.ts
src/features/building-family/state/buildingStore.ts
src/features/building-family/tests/assemblyHallFixture.test.ts
src/features/building-family/tests/buildingState.test.ts
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
```

`createAssemblyHallFixture` now accepts committed prompt controls, explicit material-provider injection, an abort signal, and reusable packed-atlas/debug-export/component-catalog artifacts. Explicit controls override prompt-parser defaults, so floor, bay, roof, trim-density, and seed controls can drive the real spec/graph/compiler path. When structural reruns receive reusable family artifacts, the fixture path skips material-provider calls and reuses the packed atlas, debug export, and component catalog while compiling a fresh building IR.

`BuildingRunController` now compares each requested run to the last completed prompt controls, passes reusable artifacts into new-building or structural reruns, registers serializable stage artifact metadata, and appends cache-hit/cache-miss artifact ids to the generation timeline. New-building runs reuse material-source, packed-atlas, and component-catalog artifact ids while compiling a new runtime IR. New-family runs avoid reuse and emit regenerated family-chain artifact ids.

`createBuildingStore` now tracks a committed prompt baseline. Draft control edits preview invalidation against the last completed run, and successful controller completions commit the prompt controls back into the baseline.

The root app now exposes committed `Run Current`, `New Building`, and `New Family` actions in the Control Invalidation panel. The timeline displays stage artifact ids plus cache-hit badges. This is still not the full Prompt Lab: there is no router, PSG selector, component-level regeneration/locking UI, per-provider progress, or stage-driven assembly reveal yet.

## 6.17 Cancellation UI And Stale-Run Preservation

Actual Milestone 5D cancellation paths:

```text
src/features/building-family/state/buildingStore.ts
src/features/building-family/tests/buildingState.test.ts
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
```

`createBuildingStore.beginRun` now preserves the last completed fixture artifact id while a new run is pending. That keeps the prior Assembly Hall scene and Atlas Lab artifacts mounted during a rerun, which is required for cancel safety and makes the app less visually fragile while longer providers are added.

The controller-level cancellation test now covers the explicit stale-run contract: after a completed run, a pending rerun can be cancelled, the stale fixture is disposed when it resolves, no cancelled fixture artifact is registered, the store reports `cancelled`, and the prior completed fixture artifact remains active.

The root app now exposes a `Cancel Run` action beside the committed rerun controls. It is enabled only while a run is active and calls the existing controller cancellation path. This is the UI foundation for cancellation; it does not yet surface per-provider cancellation progress or compiler-worker cancellation diagnostics.

## 6.18 Component Forge UI Foundation

Actual Milestone 5E Component Forge paths:

```text
src/features/building-family/ui/ComponentForge.tsx
src/features/building-family/tests/ComponentForge.test.tsx
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
```

`ComponentForge` is now a dedicated inspection surface between Atlas Lab and Assembly Hall. It reads the real generated `componentGallery`, catalog recipes, and packed atlas manifest from the active `AssemblyHallFixture`; it does not introduce preassembled component meshes or a separate fixture model.

The surface provides the first roadmap Room 3 controls: generated component selector, wireframe / UV overlay / semantic-anchor mode toggles, an exploded-grid-style component list backed by gallery entries, selected component dimensions, recipe id/kind/role/source/stage, semantic anchors, recipe JSON, and atlas slot highlighting for the selected component. The selected atlas-slot table shows the same manifest slot ids, roles, UV modes, rectangles, and prompts used by the material atlas.

The focused React test selects the generated Window frame entry and verifies selector behavior, mode toggles, dimensions, recipe JSON, semantic anchors, and `glass.primary` / `frame.primary` atlas slot highlighting. The app-shell test verifies the Component Forge surface appears in the controller-backed root flow before Assembly Hall.

This is not the full Component Forge roadmap room yet. True isolated component 3D previews, lock/unlock controls, per-component regeneration, and stage-driven reveal remain future Milestone 5 slices.

## 7. App Shell, Renderer, State, Workers, And Routing

Actual React shell:

```text
src/app/main.tsx
src/app/App.tsx
src/app/App.css
src/features/building-family/ui/AtlasLab.tsx
src/features/building-family/ui/ComponentForge.tsx
src/features/building-family/ui/AssemblyHall.tsx
```

Actual feature routing: root route only. No router dependency exists yet. The root app shell currently shows the Control Invalidation preview, committed rerun buttons, a Cancel Run action, controller-backed Generation Run timeline with artifact cache-hit badges, Atlas Lab, Component Forge, and Assembly Hall fixture surfaces.

Actual Three.js renderer setup:

```text
src/features/building-family/renderer-three/buildingSceneAdapter.ts
src/features/building-family/renderer-three/buildingAtlasMaterialFactory.ts
src/features/building-family/renderer-three/buildingAtlasTextureFactory.ts
src/features/building-family/renderer-three/resourceDisposal.ts
src/features/building-family/renderer-three/assemblyRendererFactory.ts
src/features/building-family/renderer-three/familyRuntime.ts
src/features/building-family/ui/AssemblyHall.tsx
```

Recommended renderer paths:

```text
src/features/building-family/renderer-three/instanceRuntime.ts
```

Actual Zustand state:

```text
src/features/building-family/state/artifactRegistry.ts
src/features/building-family/state/buildingStore.ts
src/features/building-family/state/buildingRunController.ts
```

Recommended remaining state paths:

```text
src/features/building-family/state/slices/runSlice.ts
src/features/building-family/state/slices/artifactSlice.ts
src/features/building-family/state/slices/selectionSlice.ts
src/features/building-family/state/slices/controlSlice.ts
src/features/building-family/state/slices/rendererSlice.ts
```

Actual worker patterns:

```text
src/features/building-family/compiler/compiler.worker.ts
src/features/building-family/compiler/compilerClient.ts
src/features/building-family/compiler/compilerWorkerProtocol.ts
src/features/building-family/compiler/compilerWorkerRuntime.ts
```

Remaining worker/orchestration paths for later milestones:

```text
src/features/building-family/state/invalidationController.ts
src/features/building-family/state/variantStressController.ts
```

Actual server/API routes: not present.

Recommended resolution: keep Milestones 1-5 client/procedural. Before Milestone 6, choose a small Node server under `server/` or move to a framework with server routes. A pure Vite client cannot safely own provider API keys.

## 8. Logical Module Path Mapping

The implementation plan's logical modules map into the single-app feature boundary as follows:

```text
building-family/contracts/*      -> src/features/building-family/contracts/*
building-family/core/*           -> src/features/building-family/core/*
building-family/psg/*            -> src/features/building-family/psg/*
building-family/style-packs/*    -> src/features/building-family/style-packs/*
building-family/materials/*      -> src/features/building-family/materials/*
building-family/components/*     -> src/features/building-family/components/*
building-family/compiler/*       -> src/features/building-family/compiler/*
building-family/renderer-three/* -> src/features/building-family/renderer-three/*
building-family/state/*          -> src/features/building-family/state/*
building-family/ui/*             -> src/features/building-family/ui/*
building-family/tests/*          -> src/features/building-family/tests/*
```

Generic Prompt Spaghetti modules should live outside the building feature:

```text
src/features/prompt-spaghetti/contracts/*
src/features/prompt-spaghetti/core/*
src/features/prompt-spaghetti/io/*
src/features/prompt-spaghetti/fixtures/*
src/features/prompt-spaghetti/tests/*
```

Test placement:

```text
src/features/building-family/**/*.test.ts
src/features/prompt-spaghetti/**/*.test.ts
tests/e2e/*.spec.ts
```

## 9. Dependency Decisions

Installed runtime dependencies:

```text
react
react-dom
three
zustand
zod
```

Installed development dependencies:

```text
typescript
vite
@vitejs/plugin-react
vitest
jsdom
@testing-library/react
@testing-library/jest-dom
@playwright/test
eslint
@eslint/js
globals
typescript-eslint
eslint-plugin-react-hooks
eslint-plugin-react-refresh
@types/node
@types/react
@types/react-dom
@types/three
```

Justification:

- React, Three.js, and Zustand are fixed decisions in the implementation plan.
- Zod is the runtime schema library because no repository schema library existed.
- Vitest fits the Vite TypeScript scaffold and deterministic core testing needs.
- Playwright Chromium is installed for browser smoke checks.
- ESLint is installed with TypeScript, React hooks, and React refresh rules.
- `@types/three` is installed because the first renderer adapter imports Three.js types directly.

## 10. Conflicts, Ambiguities, And Resolutions

| Item | Finding | Resolution |
|---|---|---|
| Existing Wild Construct app | None existed in this workspace. | Treat `buildo` as the new Dynamic Building Family project. |
| Existing package manager | None existed. | npm selected and locked. |
| Existing PSG v2 implementation | None existed. | Minimal backward-compatible PSG v2 schema/evaluator implemented in Milestone 1. |
| Existing schema library | None existed. | Zod selected and installed. |
| Existing server route convention | None exists. | Defer provider-secret server choice until Milestone 6. |
| Three.js WebGPU support | `three@0.184.0` main entry lacks `WebGPURenderer`; `three/webgpu` exposes it. | Renderer capability detection uses `three/webgpu` for WebGPU and keeps WebGL fallback via the main `three` entrypoint. |
| Git branch requirement | Workspace was not a Git repository. | Git initialized and initial branch set to `main`; no commit created yet. |
| Playwright runner lifecycle | `playwright test` with a managed web server passed but did not exit before tool timeout. | Official `npm run test:e2e` uses an explicit Vite + Chromium smoke script that closes resources. |

## 11. Milestone 1 Files

Implemented Prompt Spaghetti files:

```text
src/features/prompt-spaghetti/contracts/psgDocument.ts
src/features/prompt-spaghetti/core/evaluatePsg.ts
src/features/prompt-spaghetti/core/evaluationTrace.ts
src/features/prompt-spaghetti/io/importPsg.ts
src/features/prompt-spaghetti/io/exportPsg.ts
src/features/prompt-spaghetti/fixtures/legacy-v2.psg.json
src/features/prompt-spaghetti/tests/evaluatePsg.test.ts
src/features/prompt-spaghetti/tests/legacyV2Compatibility.test.ts
```

Implemented Building Family contract and core files:

```text
src/features/building-family/contracts/buildingIntent.ts
src/features/building-family/contracts/historicalStylePack.ts
src/features/building-family/contracts/buildingFamilySpec.ts
src/features/building-family/contracts/atlasManifest.ts
src/features/building-family/contracts/componentRecipe.ts
src/features/building-family/contracts/buildingGraph.ts
src/features/building-family/contracts/runtimeBuildingIR.ts
src/features/building-family/contracts/generationRun.ts
src/features/building-family/contracts/index.ts
src/features/building-family/core/canonicalJson.ts
src/features/building-family/core/contentHash.ts
src/features/building-family/core/diagnostics.ts
src/features/building-family/core/seedTree.ts
src/features/building-family/core/semanticPaths.ts
src/features/building-family/core/specNormalizer.ts
src/features/building-family/core/invalidation.ts
```

Building Family PSG and style-pack files:

```text
src/features/building-family/psg/psgBuildingIntentAdapter.ts
src/features/building-family/psg/localRulePromptInterpreter.ts
src/features/building-family/psg/fixtures/late19cCommercialPrompt.psg.json
src/features/building-family/style-packs/late-19c-commercial-demo.json
```

Implemented Milestone 1 tests:

```text
src/features/building-family/tests/contracts.test.ts
src/features/building-family/tests/canonicalJson.test.ts
src/features/building-family/tests/seedTree.test.ts
src/features/building-family/tests/psgBuildingIntentAdapter.test.ts
src/features/building-family/tests/localRulePromptInterpreter.test.ts
src/features/building-family/tests/specNormalizer.test.ts
src/features/building-family/tests/psgToSpec.integration.test.ts
```

Milestone 2 should start with:

```text
src/features/building-family/materials/atlasPlanner.ts
src/features/building-family/tests/atlasPlanner.test.ts
```

Milestone 2B introduced:

```text
src/features/building-family/materials/providers/proceduralMaterialProvider.ts
src/features/building-family/tests/proceduralMaterialProvider.test.ts
```

Milestone 2C introduced:

```text
src/features/building-family/materials/atlasPacker.ts
src/features/building-family/materials/normalFromHeight.ts
src/features/building-family/materials/periodicBlend.ts
src/features/building-family/materials/providers/fixtureMaterialProvider.ts
src/features/building-family/tests/atlasPacker.test.ts
```

Milestone 2D introduced:

```text
src/features/building-family/materials/artifactCache.ts
src/features/building-family/materials/atlasDebugExport.ts
src/features/building-family/ui/AtlasLab.tsx
src/features/building-family/tests/atlasArtifactCache.test.ts
src/features/building-family/tests/atlasDebugExport.test.tsx
```

Milestone 2E wired:

```text
src/features/building-family/materials/atlasLabFixture.ts
src/features/building-family/ui/AtlasLab.tsx
src/app/App.tsx
src/app/App.test.tsx
tests/e2e/smoke.spec.ts
scripts/e2e-smoke.mjs
```

Milestone 3A introduced:

```text
src/features/building-family/components/componentCatalogBuilder.ts
src/features/building-family/components/primitiveBuilders.ts
src/features/building-family/components/frameBuilder.ts
src/features/building-family/components/profileSweepBuilder.ts
src/features/building-family/components/roofBuilder.ts
src/features/building-family/compiler/buildingGraphBuilder.ts
src/features/building-family/tests/componentCatalogBuilder.test.ts
src/features/building-family/tests/buildingGraphBuilder.test.ts
```

Milestone 3B introduced:

```text
src/features/building-family/compiler/buildingCompiler.ts
src/features/building-family/compiler/primitiveGeometry.ts
src/features/building-family/tests/buildingCompiler.test.ts
```

Milestone 3C introduced:

```text
src/features/building-family/compiler/compilerClient.ts
src/features/building-family/compiler/compiler.worker.ts
src/features/building-family/compiler/compilerWorkerProtocol.ts
src/features/building-family/compiler/compilerWorkerRuntime.ts
src/features/building-family/tests/buildingCompilerWorker.test.ts
```

Milestone 3D introduced:

```text
src/features/building-family/compiler/componentGalleryBuilder.ts
src/features/building-family/tests/componentGalleryBuilder.test.ts
```

Milestone 4A introduced:

```text
src/features/building-family/renderer-three/buildingAtlasMaterialFactory.ts
src/features/building-family/renderer-three/buildingSceneAdapter.ts
src/features/building-family/tests/buildingSceneAdapter.test.ts
```

Milestone 4B introduced:

```text
src/features/building-family/renderer-three/buildingAtlasTextureFactory.ts
src/features/building-family/renderer-three/buildingAtlasMaterialFactory.ts
src/features/building-family/tests/buildingAtlasTextureFactory.test.ts
```

Milestone 4C introduced:

```text
src/features/building-family/renderer-three/familyRuntime.ts
src/features/building-family/tests/buildingFamilyRuntime.test.ts
```

Milestone 4D introduced:

```text
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/ui/AssemblyHall.tsx
src/features/building-family/tests/assemblyHallFixture.test.ts
src/features/building-family/tests/AssemblyHall.test.tsx
src/app/App.tsx
src/app/App.css
scripts/e2e-smoke.mjs
```

Milestone 4E introduced:

```text
src/features/building-family/renderer-three/resourceDisposal.ts
src/features/building-family/tests/resourceDisposal.test.ts
```

Milestone 4F introduced:

```text
src/features/building-family/ui/AssemblyHall.tsx
src/features/building-family/tests/AssemblyHall.test.tsx
src/app/App.css
scripts/e2e-smoke.mjs
```

Milestone 4G introduced:

```text
src/features/building-family/renderer-three/assemblyRendererFactory.ts
src/features/building-family/tests/assemblyRendererFactory.test.ts
src/features/building-family/ui/AssemblyHall.tsx
src/features/building-family/ui/assemblyHallFixture.ts
scripts/e2e-smoke.mjs
```

## 12. Verification Report

Commands run during reconnaissance:

```text
rg --files -uu
Get-ChildItem -Force -Recurse
Get-ChildItem -Force -Filter AGENTS.md -Recurse
git status --short
```

Results: no files or `AGENTS.md` existed initially; `git status` failed because the workspace was not yet a Git repository.

Setup commands run:

```text
npm install react react-dom three zustand zod
npm install -D typescript vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/jest-dom @playwright/test eslint @eslint/js globals typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh @types/node @types/react @types/react-dom
npm install -D @types/three
git init
git symbolic-ref HEAD refs/heads/main
npx playwright install chromium
```

Final verification commands:

```text
npm run typecheck
npm run test
npm run lint
npm run build
npm run test:e2e
rg -n 'react|three|zustand' src\features\building-family\contracts src\features\building-family\core src\features\building-family\materials src\features\building-family\components src\features\building-family\compiler
rg -n "Math\.random" src\features\building-family src\features\prompt-spaghetti
```

Latest validation results:

```text
typecheck: passed
unit tests: passed, 93 tests across 31 files
lint: passed
build: passed
e2e smoke: passed, including controller-backed app shell, Component Forge selector/atlas-slot assertion, active renderer backend assertion, Assembly Hall semantic selection, and backend-specific canvas pixel probe
Building state/controller focused tests: passed
Assembly Hall fixture focused tests: passed
App committed-rerun/cancel focused test: passed
Component Forge focused test: passed
Cancellation stale-run focused test: passed
Control invalidation focused tests: passed
Assembly renderer factory focused tests: passed
Assembly Hall focused tests: passed
resource disposal focused tests: passed
contracts/core/materials/components/compiler renderer-import scan: no matches
Math.random scan: no matches
```

Rendered QA for Milestone 4D:

```text
Browser/IAB: attempted first; webview attach timed out, then no active tab was available on retry.
Playwright desktop viewport: 1366x900, Assembly Hall canvas visible, varied WebGL pixels sampled.
Playwright mobile viewport: 390x844, Assembly Hall canvas visible, varied WebGL pixels sampled.
Screenshots: C:\tmp\buildo-assembly-hall-desktop.png and C:\tmp\buildo-assembly-hall-mobile.png
Console: no app runtime errors; WebGL driver performance warnings came from/around readback diagnostics.
```

Rendered QA for Milestone 4F:

```text
Browser/IAB desktop viewport: app loaded at http://127.0.0.1:5173/, no framework overlay, no console errors, selected the Window frame semantic element, and verified instances.window / glass.primary / InstancedMesh / Window frame in the inspector.
Browser/IAB mobile viewport: 390x844, no framework overlay, no console errors, selected the same Window frame semantic element, and verified the semantic inspector stayed readable in the one-column layout.
E2E smoke: selected the Window frame semantic element before the Assembly Hall canvas pixel probe.
```

Rendered QA for Milestone 4G:

```text
Browser/IAB desktop DOM pass: app loaded at http://127.0.0.1:5173/, canvas data-rendered=true, data-renderer-backend=webgpu, visible metric webgpu active / webgpu preferred, semantic path present, and no console errors.
Playwright desktop screenshot: 1280x720 viewport, WebGPU Assembly Hall canvas visible, backend metric present, no console errors, screenshot C:\tmp\buildo-renderer-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport, WebGPU Assembly Hall canvas visible at 358x340, backend metric present, semantic selection present, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-renderer-qa\mobile.png.
E2E smoke: active backend assertion plus WebGPU screenshot PNG probe or WebGL readPixels fallback.
```

Rendered QA for Milestone 5A:

```text
Browser/IAB desktop DOM pass: app loaded at http://127.0.0.1:5173/, Generation Run reached complete with 12 events, artifact id began assembly-hall-fixture:, Atlas Lab and Assembly Hall remained present, canvas data-rendered=true, data-renderer-backend=webgpu, and no console errors.
Playwright desktop screenshot: 1280x720 viewport, Generation Run panel visible below the hero, complete status and timeline present, no console errors, screenshot C:\tmp\buildo-run-controller-qa\desktop.png.
Playwright mobile screenshots: 390x844 viewport, no horizontal overflow, run panel verified in scrolled view, no console errors, screenshots C:\tmp\buildo-run-controller-qa\mobile.png and C:\tmp\buildo-run-controller-qa\mobile-run-panel.png.
E2E smoke: controller-backed app shell still reaches the rendered Assembly Hall canvas and semantic selection path.
```

Rendered QA for Milestone 5B:

```text
Browser/IAB desktop DOM pass: app loaded at http://127.0.0.1:5173/, changed Floors from 4 to 5, preview reported floorCount, Material sources reusable, atlas reusable, catalog reusable, normalizedSpec partial, buildingGraph/runtimeBuildingIr/gpuScene full, canvas data-rendered=true, data-renderer-backend=webgpu, and no console errors.
Playwright desktop screenshot: 1280x720 viewport, Control Invalidation panel visible below the hero after floor change, no console errors, screenshot C:\tmp\buildo-invalidation-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport, scrolled Control Invalidation panel visible after floor change, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-invalidation-qa\mobile-control-panel.png.
E2E smoke: controller-backed app shell still reaches the rendered Assembly Hall canvas and semantic selection path.
```

Rendered QA for Milestone 5C:

```text
Playwright desktop screenshot: 1280x720 viewport, clicked New Building after the initial completed run; timeline showed packed-atlas and component-catalog artifact ids with cache-hit badges, WebGPU canvas data-rendered=true, no console errors, screenshot C:\tmp\buildo-rerun-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport, clicked New Building after the initial completed run; same cache-hit artifact lineage was visible, WebGPU canvas data-rendered=true, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-rerun-qa\mobile.png.
```

Rendered QA for Milestone 5D:

```text
Playwright desktop screenshot: 1280x720 viewport, Cancel Run visible and disabled after completion, Generation Run complete with 12 events, WebGPU canvas data-rendered=true, no console errors, screenshot C:\tmp\buildo-cancel-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport, Cancel Run visible and disabled after completion, WebGPU canvas data-rendered=true, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-cancel-qa\mobile.png.
```

Rendered QA for Milestone 5E:

```text
Playwright desktop screenshot: 1280x720 viewport, Component Forge selected Window frame, wireframe/UV/semantic-anchor modes on, glass.primary and frame.primary atlas slots highlighted, WebGPU canvas data-rendered=true, no console errors, screenshot C:\tmp\buildo-component-forge-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport, Component Forge single-column layout selected Window frame, atlas slot highlight and recipe JSON visible, WebGPU canvas data-rendered=true, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-component-forge-qa\mobile.png.
```

## 13. Current Implemented Surface

Foundation and Milestone 1 introduced:

```text
.gitignore
AGENTS.md
README.md
package.json
package-lock.json
index.html
tsconfig.json
tsconfig.app.json
tsconfig.node.json
vite.config.ts
vitest.config.ts
playwright.config.ts
eslint.config.js
scripts/e2e-smoke.mjs
scripts/dev-server.mjs
src/app/App.css
src/app/App.test.tsx
src/app/App.tsx
src/app/main.tsx
src/test/setup.ts
src/vite-env.d.ts
tests/e2e/smoke.spec.ts
docs/plans/dynamic-building-family.md
docs/architecture/dynamic-building-family-integration.md
src/features/prompt-spaghetti/*
src/features/building-family/contracts/*
src/features/building-family/core/*
src/features/building-family/psg/*
src/features/building-family/style-packs/late-19c-commercial-demo.json
```

Milestone 2A introduced:

```text
src/features/building-family/materials/atlasPlanner.ts
src/features/building-family/tests/atlasPlanner.test.ts
```

Milestone 2B introduced:

```text
src/features/building-family/materials/providers/proceduralMaterialProvider.ts
src/features/building-family/tests/proceduralMaterialProvider.test.ts
```

Milestone 2C introduced:

```text
src/features/building-family/materials/atlasPacker.ts
src/features/building-family/materials/normalFromHeight.ts
src/features/building-family/materials/periodicBlend.ts
src/features/building-family/materials/providers/fixtureMaterialProvider.ts
src/features/building-family/tests/atlasPacker.test.ts
```

Milestone 2D introduced:

```text
src/features/building-family/materials/artifactCache.ts
src/features/building-family/materials/atlasDebugExport.ts
src/features/building-family/ui/AtlasLab.tsx
src/features/building-family/tests/atlasArtifactCache.test.ts
src/features/building-family/tests/atlasDebugExport.test.tsx
```

Milestone 2E wired:

```text
src/features/building-family/materials/atlasLabFixture.ts
src/features/building-family/tests/atlasLabFixture.test.ts
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
tests/e2e/smoke.spec.ts
```

Milestone 3A introduced:

```text
src/features/building-family/components/componentCatalogBuilder.ts
src/features/building-family/components/primitiveBuilders.ts
src/features/building-family/components/frameBuilder.ts
src/features/building-family/components/profileSweepBuilder.ts
src/features/building-family/components/roofBuilder.ts
src/features/building-family/compiler/buildingGraphBuilder.ts
src/features/building-family/tests/componentCatalogBuilder.test.ts
src/features/building-family/tests/buildingGraphBuilder.test.ts
```

Milestone 3B introduced:

```text
src/features/building-family/compiler/buildingCompiler.ts
src/features/building-family/compiler/primitiveGeometry.ts
src/features/building-family/tests/buildingCompiler.test.ts
```

Milestone 3C introduced:

```text
src/features/building-family/compiler/compilerClient.ts
src/features/building-family/compiler/compiler.worker.ts
src/features/building-family/compiler/compilerWorkerProtocol.ts
src/features/building-family/compiler/compilerWorkerRuntime.ts
src/features/building-family/tests/buildingCompilerWorker.test.ts
```

Milestone 3D introduced:

```text
src/features/building-family/compiler/componentGalleryBuilder.ts
src/features/building-family/tests/componentGalleryBuilder.test.ts
```

Milestone 4A introduced:

```text
src/features/building-family/renderer-three/buildingAtlasMaterialFactory.ts
src/features/building-family/renderer-three/buildingSceneAdapter.ts
src/features/building-family/tests/buildingSceneAdapter.test.ts
```

Milestone 4B introduced:

```text
src/features/building-family/renderer-three/buildingAtlasTextureFactory.ts
src/features/building-family/renderer-three/buildingAtlasMaterialFactory.ts
src/features/building-family/tests/buildingAtlasTextureFactory.test.ts
```

Milestone 4C introduced:

```text
src/features/building-family/renderer-three/familyRuntime.ts
src/features/building-family/tests/buildingFamilyRuntime.test.ts
```

Milestone 4D introduced:

```text
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/ui/AssemblyHall.tsx
src/features/building-family/tests/assemblyHallFixture.test.ts
src/features/building-family/tests/AssemblyHall.test.tsx
src/app/App.tsx
src/app/App.css
scripts/e2e-smoke.mjs
```

Milestone 4E introduced:

```text
src/features/building-family/renderer-three/resourceDisposal.ts
src/features/building-family/tests/resourceDisposal.test.ts
```

Milestone 4F introduced:

```text
src/features/building-family/ui/AssemblyHall.tsx
src/features/building-family/tests/AssemblyHall.test.tsx
src/app/App.css
scripts/e2e-smoke.mjs
```

Milestone 4G introduced:

```text
src/features/building-family/renderer-three/assemblyRendererFactory.ts
src/features/building-family/tests/assemblyRendererFactory.test.ts
src/features/building-family/ui/AssemblyHall.tsx
src/features/building-family/ui/assemblyHallFixture.ts
scripts/e2e-smoke.mjs
```

Milestone 5A introduced:

```text
src/features/building-family/state/artifactRegistry.ts
src/features/building-family/state/buildingStore.ts
src/features/building-family/state/buildingRunController.ts
src/features/building-family/tests/buildingState.test.ts
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
```

Milestone 5B introduced:

```text
src/features/building-family/core/invalidation.ts
src/features/building-family/tests/invalidation.test.ts
src/features/building-family/state/buildingStore.ts
src/features/building-family/tests/buildingState.test.ts
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
```

Milestone 5C introduced:

```text
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/state/buildingRunController.ts
src/features/building-family/state/buildingStore.ts
src/features/building-family/tests/assemblyHallFixture.test.ts
src/features/building-family/tests/buildingState.test.ts
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
```

Milestone 5D introduced:

```text
src/features/building-family/state/buildingStore.ts
src/features/building-family/tests/buildingState.test.ts
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
```

Milestone 5E introduced:

```text
src/features/building-family/ui/ComponentForge.tsx
src/features/building-family/tests/ComponentForge.test.tsx
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
docs/architecture/dynamic-building-family-integration.md
```

Generated and ignored directories:

```text
node_modules/
dist/
test-results/
```

No preassembled meshes, provider routes, router-backed room navigation, lock/unlock controls, per-provider cancellation diagnostics, stage-driven assembly reveal, or complete four-room flow has been added yet. The current compiler emits generated primitive `RuntimeBuildingIR` buffers through the pure TypeScript compiler path, can deliver them across the compiler worker boundary with transferable buffers, can summarize catalog/IR component data for a Component Forge inspection surface, can convert that IR into Three.js scene objects under `renderer-three/*`, can convert packed atlas channels into texture-backed slot materials at the renderer boundary, can host multiple per-building scene runtimes against one shared family atlas/material runtime, can centralize idempotent renderer resource disposal across standalone and shared-family ownership modes, renders one deterministic fixture building in a WebGPU-first browser Assembly Hall canvas with WebGL fallback from those generated artifacts, surfaces semantic renderer lookup entries in a selectable Assembly Hall inspector, drives the root app through a Zustand-backed run controller with serializable run events plus an out-of-store runtime artifact registry, previews roadmap invalidation impacts for floor, bay, and building-seed controls, can commit `Run Current`, `New Building`, and `New Family` reruns with cache-hit artifact lineage for structural vs family-chain changes, exposes `Cancel Run` while preserving the last completed scene during pending and cancelled runs, and shows a dedicated Component Forge with real generated component entries, selector/toggles, dimensions, anchors, recipe JSON, and selected atlas-slot highlighting.

## 14. Milestone 0 And Setup Exit Criteria

- [x] Source plan preserved in `docs/plans/dynamic-building-family.md`.
- [x] Repository-specific integration map created and updated after setup.
- [x] Git repository initialized on `main`.
- [x] npm package and lockfile created.
- [x] React + Vite + TypeScript app shell created.
- [x] Runtime dependencies installed: React, Three.js, Zustand, Zod.
- [x] Unit, lint, build, and browser smoke tooling installed.
- [x] Actual commands documented.
- [x] Every conceptual module in the plan has an intended repository location.
- [x] PSG, renderer, state, worker, server, and routing surfaces are identified as absent or scaffold-only with concrete proposed paths.
- [x] Proposed Milestone 1 files are listed.
- [x] Final checks passed.
