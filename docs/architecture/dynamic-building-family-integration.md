# Dynamic Building Family Integration Map

**Status:** Milestone 6H remote material image bridge foundation
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
server/
  building-family/
    materialProviderRoute.ts
    materialProviderRoute.test.ts
    openAIImageMaterialProvider.ts
    openAIImageMaterialProvider.test.ts
    remoteMaterialArtifactCache.ts
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

The app currently contains a setup shell, the Milestone 1 deterministic domain foundation, the Milestone 2A semantic atlas planner foundation, the Milestone 2B procedural material-source layer, the Milestone 2C atlas channel packer, the Milestone 2D in-memory atlas artifact/debug-export foundation, the Milestone 2E visible Atlas Lab fixture, the Milestone 3A component catalog / graph planning foundation, the Milestone 3B pure compiler IR foundation, the Milestone 3C compiler worker boundary, the Milestone 3D component gallery data foundation, the Milestone 4A renderer adapter foundation, the Milestone 4B atlas texture/material sampling foundation, the Milestone 4C shared family runtime foundation, the Milestone 4D Assembly Hall rendered fixture foundation, the Milestone 4E renderer resource disposal foundation, the Milestone 4F Assembly Hall semantic selection foundation, the Milestone 4G WebGPU renderer activation foundation, the Milestone 5A run controller / Zustand state foundation, the Milestone 5B control invalidation foundation, the Milestone 5C committed rerun control/artifact-lineage foundation, the Milestone 5D cancellation UI/stale-run preservation foundation, the Milestone 5E Component Forge UI foundation, the Milestone 5F stage-driven Assembly Hall reveal foundation, the Milestone 5G artifact trace/provenance foundation, the Milestone 5H expanded prompt controls foundation, the Milestone 5I local component lock foundation, the Milestone 5J four-room navigation foundation, the Milestone 5K Prompt Lab trace foundation, the Milestone 5L 16-variant stress view foundation, the Milestone 5M hash-addressable room routing foundation, the Milestone 5N Atlas Lab provider diagnostics foundation, the Milestone 6A server material-provider route contract foundation, the Milestone 6B OpenAI image provider adapter foundation, the Milestone 6C server remote-material request cache foundation, the Milestone 6D remote material timeout fallback foundation, the Milestone 6E remote material concurrency limit foundation, the Milestone 6F remote material retry policy foundation, the Milestone 6G remote overlay compositing foundation, and the Milestone 6H remote material image bridge foundation. No route-level document ids, Atlas Lab revised-prompt trace, browser PNG decoder/app invocation, durable remote cache persistence, per-provider cancellation diagnostics, complete provider-aware four-room flow, or Milestone 7 interactive 16-building orbit benchmark has been implemented.

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

This is not the complete Milestone 5 four-room demo yet. Full Prompt Lab controls, complete Component Forge 3D preview/regeneration controls, lock-aware semantic reroll behavior, provider-level cancel/progress UI, and deeper per-provider trace diagnostics remain future Milestone 5 slices.

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

The root app now exposes committed `Run Current`, `New Building`, and `New Family` actions in the Control Invalidation panel. The timeline displays stage artifact ids plus cache-hit badges. This is still not the full Prompt Lab: there is no router, PSG selector, component-level regeneration/locking UI, or per-provider progress yet.

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

This is not the full Component Forge roadmap room yet. True isolated component 3D previews, lock/unlock controls, per-component regeneration, and timeline-linked stage animation remain future Milestone 5 slices.

## 6.19 Stage-Driven Assembly Hall Reveal Foundation

Actual Milestone 5F stage-reveal paths:

```text
src/features/building-family/ui/AssemblyHall.tsx
src/features/building-family/tests/AssemblyHall.test.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
```

`AssemblyHall` now exposes a real stage-driven reveal control backed by the renderer adapter's existing `buildingRuntime.stageGroups`. The `Reveal through stage` selector uses the canonical assembly stage order (`massing`, `facade`, `openings`, `trim`, `roof`) and sets each Three.js stage group visible only when it is at or before the selected stage.

The stage reveal panel also shows a real artifact summary for each stage: visible/hidden state, stage object count from the Three.js group, and semantic path count from `RuntimeBuildingIR.semanticIndex`. The renderer canvas records the active `data-reveal-through-stage` value after re-rendering, so the smoke path can verify that the browser scene received the selected stage state.

The focused React test changes the reveal selector to `facade` and verifies both the visible summary and the underlying stage-group visibility flags. The app-shell test verifies the control appears in the root flow, and the e2e smoke selects `facade` before the Assembly Hall canvas backend/pixel probe.

This is a manual stage reveal foundation, not an animated construction timeline. Tying stage reveal to generation events, adding timeline scrubbing, and preserving per-stage reveal state across reruns remain future Milestone 5 work.

## 6.20 Artifact Trace And Provenance Foundation

Actual Milestone 5G artifact trace/provenance paths:

```text
src/features/building-family/ui/ArtifactTracePanel.tsx
src/features/building-family/tests/ArtifactTracePanel.test.tsx
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

`ArtifactTracePanel` is a read-only inspection surface for the serializable artifact metadata already emitted by `BuildingRunController` and stored in Zustand. It shows the current run id, active artifact id, registered artifact count, event output artifact lineage, cache-hit/cache-miss state, event duration, artifact type, request hash, content hash, dependencies, and active fixture provenance.

The root app renders the panel directly after the Generation Run timeline, so Atlas Lab, Component Forge, and Assembly Hall are now preceded by the actual run and artifact trail that produced them. The panel does not read heavyweight runtime objects from `BuildingArtifactRegistry`; it uses metadata from `state.artifacts` and the current `GenerationRun` only.

The focused React test covers registered artifacts, event artifact lineage, cache labels, dependencies, and active-artifact provenance. The app-shell test and e2e smoke now require the Artifact Trace heading plus the `runtime-building-ir` and `packed-atlas:` lineage before continuing to atlas/component/assembly checks.

This is the provenance-panel foundation, not the final trace room. Provider-level diagnostics, lock-aware element lineage, artifact export, and timeline-linked reveal remain future roadmap slices.

## 6.21 Expanded Prompt Controls Foundation

Actual Milestone 5H control-surface paths:

```text
src/features/building-family/state/buildingStore.ts
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

`BuildingPromptControls` now exposes the full current prompt-control shape needed by the app shell: prompt text, floor count, bay count, roof type, trim density, and family/building/material/trim seeds. The roof type accepts the style-pack-backed `flat` and `gable` options, and trim density accepts `restrained`, `moderate`, and `ornate`.

The Control Invalidation panel now renders the expanded committed-control surface. Draft changes update the existing Zustand prompt state and invalidation preview; `Run Current` commits the edited prompt controls into the real generation path, while `New Building` and `New Family` remain dedicated seed-reroll actions.

The app-shell focused test verifies roof, trim-density, material-seed, and trim-seed edits report the expected invalidation feedback and can be committed through `Run Current`. The e2e smoke waits for the initial run, edits roof type, trim density, material seed, and trim seed, validates the invalidation preview, commits `Run Current`, and then continues through Artifact Trace, Atlas Lab, Component Forge, and Assembly Hall checks.

This is still a compact prompt control surface rather than the finished Prompt Lab. PSG preset selection, richer prompt interpretation diagnostics, provider progress, and full provider-aware run diagnostics remain future Milestone 5 slices.

## 6.22 Local Component Lock Foundation

Actual Milestone 5I lock-control paths:

```text
src/features/building-family/state/buildingStore.ts
src/features/building-family/psg/psgBuildingIntentAdapter.ts
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/ui/ComponentForge.tsx
src/features/building-family/tests/buildingState.test.ts
src/features/building-family/tests/assemblyHallFixture.test.ts
src/features/building-family/tests/ComponentForge.test.tsx
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

`BuildingPromptControls` now carries `lockedComponentKeys` as serializable prompt state. The existing invalidation matrix consumes those keys through `lockedComponentKeys` and reports `localComponentLock` with partial component-catalog impact, branch graph impact, and MVP branch/full runtime-IR impact.

`ComponentForge` now exposes a selected-recipe lock/unlock button and a component lock status readout. The root app wires this to prompt-control updates, so locking the selected generated recipe immediately updates the Control Invalidation preview and is preserved across committed reruns such as `New Building`.

The fixture pipeline maps locked component keys into building-scoped semantic locks on the generated `BuildingFamilySpec`. This records the lock in the inspected artifact without claiming the compiler can yet apply lock-aware variant regeneration.

Focused tests now cover store invalidation for local locks, Component Forge lock/unlock callbacks and readout, app-shell lock persistence through a new-building rerun, and generated spec lock metadata. The e2e smoke locks the Window frame recipe, verifies the invalidation preview, runs `New Building`, and verifies the lock remains visible before continuing through Assembly Hall.

This is the local lock foundation, not full lock-aware regeneration. The compiler does not yet preserve a locked component variant while rerolling all surrounding elements, and Assembly Hall semantic element locking remains future Milestone 5 work.

## 6.23 Four-Room Navigation Foundation

Actual Milestone 5J room-navigation paths:

```text
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

The root app now uses the existing Zustand `selection.room` state as the active four-room control surface. A tablist labelled `Building rooms` switches between Prompt Lab, Atlas Lab, Component Forge, and Assembly Hall without introducing a router dependency or a parallel local UI state.

Prompt Lab now owns the prompt controls, committed rerun actions, generation run timeline, and Artifact Trace provenance panel. Atlas Lab, Component Forge, and Assembly Hall mount only when their room tab is active, while all rooms continue to read the same active run, prompt controls, artifact metadata, and fixture artifact from the store/controller boundary.

The app-shell test now verifies the four-room workflow: Prompt Lab is the initial room, Atlas Lab is not visible until selected, room tabs expose the selected state, and the user can continue through Atlas Lab, Component Forge, and Assembly Hall from the same completed generation run. The e2e smoke now follows that room path, including returning to Prompt Lab after a Component Forge lock to inspect the invalidation preview and run `New Building`.

This is the store-backed room navigation foundation. Milestone 5M adds hash-addressable room links and browser-history synchronization; route-level document ids, richer Prompt Lab PSG diagnostics, and provider-level progress/cancellation diagnostics remain future roadmap slices.

## 6.24 Prompt Lab Trace Foundation

Actual Milestone 5K Prompt Lab trace paths:

```text
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/ui/PromptTracePanel.tsx
src/features/building-family/tests/assemblyHallFixture.test.ts
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

`AssemblyHallFixture` now includes a serializable `promptTrace` artifact assembled from the real PSG evaluation, local rule prompt interpreter, PSG-to-building-intent adapter, and normalized spec. It records the interpreter provider, PSG preset id, style pack id, adapter trace id, PSG outputs, evaluated PSG variables, interpreter overrides, committed Prompt Lab controls, PSG node trace entries, and diagnostics.

Prompt Lab now renders `PromptTracePanel` after Artifact Trace. The panel exposes the prompt/PSG chain as compact trace tables: requested controls, evaluated PSG variables, PSG evaluation trace, and interpreter overrides. This makes the prompt-to-spec path inspectable from the four-room app shell without adding provider or server behavior.

Focused tests cover serializable fixture trace contents from the actual `late19cCommercialDemo` preset and Prompt Lab rendering of the trace summary, evaluated variables, PSG node trace, and requested controls. The e2e smoke now verifies Prompt Trace in Prompt Lab before switching to Atlas Lab.

This is a local/procedural trace foundation. It does not add multiple PSG presets, URL routing, provider-level prompt revision diagnostics, or remote material provider diagnostics.

## 6.25 16-Variant Stress View Foundation

Actual Milestone 5L variant-stress paths:

```text
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/ui/AssemblyHall.tsx
src/features/building-family/tests/assemblyHallFixture.test.ts
src/features/building-family/tests/AssemblyHall.test.tsx
src/app/App.css
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

`AssemblyHallFixture` now includes a schema-versioned `variantStress` summary. It compiles the active building plus fifteen deterministic building-seed variants against the same normalized spec, component catalog, graph, packed atlas, and debug export. Each summary row records variant index, building seed, building id, shared source graph hash, draw-call count, instance count, triangle count, and semantic path count.

The stress summary records shared lineage separately: family id, atlas id, atlas content hash, component catalog id, and graph hash. This proves the current four-room artifact chain can describe a 16-building family set without duplicating material/catalog lineage or introducing a second renderer path.

Assembly Hall now renders the stress summary as a compact shared-family panel with aggregate metrics, shared lineage, and a scroll-contained 16-row table. Focused tests cover the fixture lineage and UI table. The e2e smoke now checks the stress panel before the Assembly Hall reveal/semantic-selection/canvas probes.

This is the Milestone 5 product-facing foundation for a 16-variant stress view. It is not the Milestone 7 interactive orbiting benchmark, does not mount sixteen rendered building canvases, and does not yet make building-scoped variation policies visibly alter geometry beyond unique building seeds and ids.

## 6.26 Hash-Addressable Room Routing Foundation

Actual Milestone 5M room-routing paths:

```text
src/app/App.tsx
src/app/App.test.tsx
src/features/building-family/state/buildingStore.ts
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

The root app now treats the existing four-room tab selection as a URL-addressable state. `#room=promptLab`, `#room=atlasLab`, `#room=componentForge`, and `#room=assemblyHall` hydrate the initial Zustand room selection when the app mounts. Clicking a room tab writes the matching hash, and `hashchange` / `popstate` events synchronize browser back/forward navigation back into the store.

`createBuildingStore` accepts an optional initial room so the app can construct the store in the correct room before the first render. This keeps routing at the app shell boundary and avoids adding a router dependency or moving room state out of the existing building store.

Focused tests cover hash hydration, tab-click hash writes, and browser-history back navigation. The e2e smoke now opens a direct `#room=assemblyHall` URL, verifies the Assembly Hall tab is selected, and waits for the stress panel before running the existing full four-room workflow.

This is hash-based room routing only. It does not add route-level document ids, saved-family ids, browser-history entries for nested selections, or a standalone route/router package.

## 6.27 Atlas Lab Provider Diagnostics Foundation

Actual Milestone 5N provider-diagnostics paths:

```text
src/features/building-family/materials/atlasDebugExport.ts
src/features/building-family/ui/AtlasLab.tsx
src/features/building-family/tests/atlasDebugExport.test.tsx
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

`createAtlasDebugExport` now emits a schema-versioned `providerDiagnostics` summary derived from packed atlas slot provenance. Each provider row records provider id, cache status baseline, unique source count, slot count, request hashes, content hashes, warning count, error count, and any provider-attributable atlas diagnostics. The export hash includes this provider summary, so provider/source provenance changes are part of the debug artifact identity.

`AtlasLab` now renders a dedicated `Provider Diagnostics` table ahead of the semantic slot table. The app shell passes the active generation run's `generatingMaterialSources` cache state into Atlas Lab, so fresh material generation shows `cache miss` while structural reruns that reuse family material artifacts show `cache hit`.

Focused tests cover deterministic provider diagnostics in the debug export, the Atlas Lab provider table, and the app-shell Atlas room surfacing the procedural provider cache state. The e2e smoke now checks the procedural provider diagnostics row before continuing through channel, component, and assembly assertions.

At the Milestone 5N boundary this was a local/procedural diagnostics foundation only. The later Milestone 6A/6B/6C/6D/6E/6F/6G slices added the server route contract, OpenAI image adapter foundation, in-memory remote artifact request cache foundation, timeout fallback foundation, remote provider concurrency limit foundation, retry policy foundation, and pure decoded-overlay compositing foundation, while Atlas Lab revised-prompt surfacing, provider-level cancellation progress, durable remote cache persistence, remote PNG decode, and app invocation remain Milestone 6 work.

## 6.28 Server Material-Provider Route Contract Foundation

Actual Milestone 6A server route paths:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
vitest.config.ts
tsconfig.node.json
eslint.config.js
docs/architecture/dynamic-building-family-integration.md
```

`server/building-family/materialProviderRoute.ts` introduces the first server-only material-provider route contract without adding OpenAI calls or client wiring. The handler is a Fetch-compatible POST route for `/api/building-material-provider` style hosting, accepts schema-versioned material-source batches, computes a stable route request hash, and returns JSON diagnostics. The route is intentionally server-owned so `BUILDING_MATERIAL_PROVIDER`, `OPENAI_API_KEY`, and `OPENAI_IMAGE_MODEL` remain outside browser code.

The 6A route validates the current Milestone 6 safety envelope before any provider execution:

```text
maximum 4 remote source requests per family
approved material source ids only
source role must match the approved remote source id
widthPx / heightPx must be <= 1024
outputFormat must be `rgba8-layer-set`
prompt vocabulary length must remain bounded
non-POST requests are rejected
```

Approved remote material sources currently cover masonry, roof, wood/metal trim, door/frame, cornice, and ornament detail overlays. `source.glass.primary` and `source.utility.mask` are intentionally not approved for remote detail generation in this route foundation.

When the remote provider is not configured, the route returns a procedural fallback diagnostic with `providerId: "procedural"` and `cacheStatus: "not-checked"`. Milestone 6B replaced the earlier `remoteMaterialProvider.openaiNotImplemented` placeholder with a server-only OpenAI image provider adapter. Milestone 6C adds the first in-memory request cache for successful remote artifacts. Milestone 6D adds timeout fallback for cache misses. Milestone 6E adds a bounded concurrency scheduler for uncached remote requests. Milestone 6F retries transient uncached provider failures before fallback. Milestone 6G adds pure overlay compositing, and Milestone 6H adds the client-safe remote image artifact bridge. Durable cache persistence, app invocation, and Atlas Lab revised-prompt surfacing remain later Milestone 6 slices.

Focused Node-environment Vitest coverage verifies procedural fallback diagnostics, unsupported source rejection, too-many-request rejection, oversized-dimension rejection, output-format rejection, non-POST rejection, and that configured server secrets are not echoed in route responses. `vitest.config.ts`, `tsconfig.node.json`, and `eslint.config.js` now include `server/**/*.ts` so this lane is part of normal validation.

## 6.29 OpenAI Image Provider Adapter Foundation

Actual Milestone 6B server provider paths:

```text
server/building-family/openAIImageMaterialProvider.ts
server/building-family/openAIImageMaterialProvider.test.ts
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`server/building-family/openAIImageMaterialProvider.ts` introduces a server-only `OpenAIImageMaterialProvider` adapter. It converts an approved material-source request into a single OpenAI Images API generation request, using `OPENAI_IMAGE_MODEL` from server configuration and the `/v1/images/generations` endpoint documented by OpenAI. The adapter requests one low-quality `1024x1024` PNG detail image, parses `b64_json` and optional `revised_prompt` from the response, and returns a schema-versioned remote material artifact with `providerId: "openai-image"`, `requestHash`, `contentHash`, image payload, revised prompt when available, and sanitized provenance.

The provider keeps `OPENAI_API_KEY` confined to the transport request header. Artifact JSON, route responses, request hashes, content hashes, and provenance do not include the API key. The default transport can use `fetch`, but all current tests inject mocked transports; no real OpenAI calls or credits are used by validation.

`server/building-family/materialProviderRoute.ts` now uses the OpenAI provider when `BUILDING_MATERIAL_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_IMAGE_MODEL` are present. Successful provider execution returns `status: "generated"`, `providerId: "openai-image"`, route-level request hash, accepted request count, `cacheStatus: "not-checked"`, generated artifacts, and an empty diagnostics array. Provider or transport failure falls back to `providerId: "procedural"` with a sanitized `remoteMaterialProvider.openaiFailed` warning; thrown transport messages are not echoed.

This slice is still adapter foundation, not complete remote-material integration. The later 6C/6D/6E/6F/6G/6H slices add in-memory cache lookup/store, timeout fallback, bounded cache-miss concurrency, transient-failure retry, pure decoded-overlay compositing, and a client-safe remote image artifact bridge, but there is still no live HTTP host/proxy, durable cache persistence, browser PNG decoder, app/UI invocation, or Atlas Lab revised-prompt diagnostics.

## 6.30 Server Remote-Material Request Cache Foundation

Actual Milestone 6C server cache paths:

```text
server/building-family/remoteMaterialArtifactCache.ts
server/building-family/openAIImageMaterialProvider.ts
server/building-family/openAIImageMaterialProvider.test.ts
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`server/building-family/openAIImageMaterialProvider.ts` now exposes `requestHashFor(request)` so server orchestration can compute the same source request hash before calling the remote transport. The hash uses the provider id, endpoint, model request body, prompt, and approved material-source request, and intentionally excludes the API key.

`server/building-family/remoteMaterialArtifactCache.ts` adds a small in-memory remote material artifact cache keyed by artifact `requestHash`. It clone-protects artifacts on read/write and exports a default process-local cache plus a factory for tests or future hosted route instances.

`server/building-family/materialProviderRoute.ts` now checks the remote material cache before transport execution when the OpenAI provider is configured. Cache hits return the cached artifact without calling the OpenAI transport. Cache misses call the provider, store only the successful artifact, and return generated artifacts with route-level `cacheStatus` of `hit`, `miss`, or `partial`.

Focused tests verify that `requestHashFor` matches generated artifact hashes and that repeated route requests reuse the cached artifact without making a second OpenAI transport call. This is still a process-memory cache foundation only; the later 6D/6E/6F slices add timeout fallback, bounded cache-miss concurrency, and transient-failure retry, but durable storage, TTL/eviction, in-flight request coalescing, app invocation, and Atlas Lab cache-status UI remain open.

## 6.31 Remote Material Timeout Fallback Foundation

Actual Milestone 6D server timeout paths:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`server/building-family/materialProviderRoute.ts` now wraps uncached OpenAI material-provider calls in a timeout-controlled orchestration boundary. The default timeout is 30 seconds, and hosted route callers/tests can override it with `remoteMaterialTimeoutMs`. When the timeout fires, the route aborts the provider signal, returns a procedural fallback response, and emits a sanitized `remoteMaterialProvider.openaiTimedOut` warning diagnostic.

Timed-out provider work is not cached. Even if a transport ignores the abort signal and resolves later, the route has already fallen back and does not write the late artifact into the remote material cache. Cache hits still bypass transport and do not run timeout logic.

Focused tests cover the timeout fallback diagnostic, upstream abort signal, secret non-echoing, and the no-cache-after-timeout invariant. The later 6E/6F/6G/6H slices add bounded cache-miss concurrency, transient-failure retry, pure decoded-overlay compositing, and the remote image artifact bridge; durable cache persistence, cancellation progress events, app invocation, Atlas Lab error surfacing, and browser PNG decoding remain open.

## 6.32 Remote Material Concurrency Limit Foundation

Actual Milestone 6E server concurrency paths:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`server/building-family/materialProviderRoute.ts` now separates cache hits from cache misses before invoking the OpenAI image provider. Cache hits are returned immediately from the in-memory cache, while cache misses run through a bounded worker scheduler. The default remote material concurrency limit is 2, and hosted route callers/tests can override it with `remoteMaterialConcurrencyLimit`.

The scheduler preserves response artifact order by writing each completed remote artifact back to its original request index. Successful cache misses are still stored by request hash, timeout wrapping still applies per uncached request, and generated responses continue to report `cacheStatus` as `hit`, `miss`, or `partial`.

Focused tests verify that three uncached approved source requests run with two active OpenAI transports at a time and still return artifacts in request order. The later 6F/6G/6H slices add transient-failure retry, pure remote overlay compositing, and the remote image artifact bridge; durable cache persistence, in-flight request coalescing, app invocation, and Atlas Lab provider-progress surfacing remain open.

## 6.33 Remote Material Retry Policy Foundation

Actual Milestone 6F server retry paths:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`server/building-family/materialProviderRoute.ts` now wraps uncached provider generation in a bounded retry loop after the timeout wrapper. The default retry count is 1, and hosted route callers/tests can override it with `remoteMaterialRetryCount`. Timeout errors still fall back immediately; transient non-timeout provider errors can retry before the route emits the existing sanitized `remoteMaterialProvider.openaiFailed` fallback diagnostic.

Successful retry attempts return normal generated artifacts, are stored in the remote material cache by request hash, and keep provider secrets out of route responses. Permanent failures still return procedural fallback without caching a failed artifact.

Focused tests verify that a first transport failure containing a test secret is retried once, succeeds on the second call, returns generated `openai-image` output, and does not echo the API key. This slice does not add exponential backoff, retry-after parsing, durable cache persistence, in-flight request coalescing, app invocation, Atlas Lab provider-progress surfacing, or remote overlay compositing. Milestone 6G adds the first pure compositing utility after this route-layer retry foundation.

## 6.34 Remote Overlay Compositing Foundation

Actual Milestone 6G material compositing paths:

```text
src/features/building-family/materials/remoteMaterialOverlay.ts
src/features/building-family/tests/remoteMaterialOverlay.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`src/features/building-family/materials/remoteMaterialOverlay.ts` introduces a renderer-independent material utility that alpha-composites an approved remote color/detail overlay over an existing procedural `MaterialSourceArtifact`. The composed artifact keeps procedural height, roughness, metalness, and opacity layers as the authoritative structure/mask channels, writes a new request hash and content hash, and records `providerId: "procedural+remote-overlay"` provenance for later Atlas Lab surfacing.

Invalid overlays do not replace the procedural source. The compositor returns diagnostics for source-id mismatches, artifact dimension mismatches, and overlay-layer dimension mismatches, while preserving the original procedural artifact so the atlas pipeline can continue with a functional fallback.

Focused tests cover direct alpha compositing, mismatch diagnostics, and the Milestone 6 invariant that a remote overlay changes packed atlas content without changing the compiled structural `RuntimeBuildingIR`. This slice does not decode PNGs from server `RemoteMaterialSourceArtifact` payloads, call the server route from the app, surface revised prompts in Atlas Lab, persist remote cache entries, or add provider-progress/cancellation UI.

## 6.35 Remote Material Image Bridge Foundation

Actual Milestone 6H material bridge paths:

```text
src/features/building-family/materials/remoteMaterialImageBridge.ts
src/features/building-family/tests/remoteMaterialImageBridge.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`src/features/building-family/materials/remoteMaterialImageBridge.ts` defines a client-safe schema for the serialized `openai-image` remote material image artifact shape returned by the route, without importing server modules into `src`. It validates schema version, provider id, PNG output format, image payload, hashes, revised prompt, and provenance before attempting to decode the image payload.

The bridge accepts an injected `PngLayerDecoder` rather than using DOM APIs inside the material layer. That keeps `materials/` renderer-independent while still giving later app/UI code a narrow place to plug in browser image decoding. Valid artifacts are converted to `RemoteMaterialOverlay` objects for the existing 6G compositor; invalid schema, source-id mismatch, decode failures, decoded-dimension mismatch, and RGBA byte-length mismatch return diagnostics without producing an overlay.

Focused tests cover bridge validation, decoder invocation with expected source dimensions, revised-prompt/provenance preservation, source/format rejection before decoding, decoded-dimension diagnostics, and integration with `compositeRemoteMaterialOverlay`. This slice does not add the browser decoder implementation, HTTP host/proxy, app route invocation, Atlas Lab revised-prompt display, or durable remote cache persistence.

## 7. App Shell, Renderer, State, Workers, And Routing

Actual React shell:

```text
src/app/main.tsx
src/app/App.tsx
src/app/App.css
src/features/building-family/ui/AtlasLab.tsx
src/features/building-family/ui/ArtifactTracePanel.tsx
src/features/building-family/ui/ComponentForge.tsx
src/features/building-family/ui/AssemblyHall.tsx
```

Actual feature routing: root route with hash-addressable room panels. No router dependency exists yet. The root app shell now exposes a store-backed `Building rooms` tablist synchronized with `#room=<roomId>` hashes and browser back/forward events. Prompt Lab contains the expanded Control Invalidation prompt-control surface, committed rerun buttons, a Cancel Run action, controller-backed Generation Run timeline with artifact cache-hit badges, Artifact Trace provenance tables, and Prompt Trace PSG/interpreter diagnostics. Atlas Lab exposes provider diagnostics plus channel/slot inspection, Component Forge exposes local recipe lock controls, and Assembly Hall exposes manual stage reveal plus the 16-variant stress summary; all room panels are backed by the same completed fixture artifact.

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

Actual server/API route foundation:

```text
server/building-family/materialProviderRoute.ts
server/building-family/openAIImageMaterialProvider.ts
server/building-family/remoteMaterialArtifactCache.ts
src/features/building-family/materials/remoteMaterialOverlay.ts
src/features/building-family/materials/remoteMaterialImageBridge.ts
```

The project has chosen a small Node/server lane under `server/` for Milestone 6 provider-secret work. No HTTP listener or Vite proxy is wired yet; the route is currently a tested Fetch-compatible handler that can be hosted by a later server entrypoint. When fully configured, the handler can invoke the server-only OpenAI image adapter through a default or injected transport and reuse successful generated artifacts through a process-local in-memory cache, but the current app shell still does not call it. The client-side material lane now has a pure compositor for decoded remote overlays plus a schema-validated bridge from remote image artifacts to overlays; browser PNG decode and route invocation still belong to later Milestone 6 work. A pure Vite client must still not own provider API keys.

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
| Existing server route convention | Small Node/server route lane now exists under `server/building-family/materialProviderRoute.ts` with `server/building-family/openAIImageMaterialProvider.ts` as the server-only OpenAI adapter, `server/building-family/remoteMaterialArtifactCache.ts` as the process-local cache foundation, `src/features/building-family/materials/remoteMaterialOverlay.ts` as the pure decoded-overlay compositor, and `src/features/building-family/materials/remoteMaterialImageBridge.ts` as the client-safe image artifact bridge. | Keep provider secrets in `server/`; add an HTTP host/proxy, browser PNG decoder, app invocation, and durable cache policy in later Milestone 6 slices. |
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
rg -n "Math\.random" src\features\building-family src\features\prompt-spaghetti server
rg -n "OPENAI_API_KEY|BUILDING_MATERIAL_PROVIDER|OPENAI_IMAGE_MODEL|sk-buildo" src dist
rg -n "server/building-family|materialProviderRoute|openAIImageMaterialProvider|remoteMaterialArtifactCache" src dist
```

Latest validation results:

```text
typecheck: passed
unit tests: passed, 120 tests across 34 files
lint: passed
build: passed
e2e smoke: passed, including four-room tab navigation, expanded prompt-control edits and committed Run Current rerun, Artifact Trace registered-artifact and run-lineage assertions in Prompt Lab, Prompt Trace PSG/interpreter diagnostics, Atlas Lab provider/channel/slot assertions, Component Forge selector/atlas-slot assertion, local component lock plus Prompt Lab invalidation and new-building lock persistence, Assembly Hall stage reveal selection, active renderer backend assertion, Assembly Hall semantic selection, and backend-specific canvas pixel probe
provider-secret client scan: passed, no `OPENAI_API_KEY`, `BUILDING_MATERIAL_PROVIDER`, `OPENAI_IMAGE_MODEL`, server route/provider/cache import, or test secret strings found in `src` or `dist`
OpenAI image provider/route/cache/timeout/concurrency/retry focused tests: passed, 16 tests across 2 server files with mocked transports and no real OpenAI calls
Building state/controller focused tests: passed
Assembly Hall fixture focused tests: passed
App committed-rerun/cancel focused test: passed
Expanded prompt controls focused test: passed
Local component lock focused tests: passed
Artifact Trace focused test: passed
Component Forge focused test: passed
Atlas Lab provider diagnostics focused tests: passed
Server material-provider route focused tests: passed
Assembly Hall stage reveal focused test: passed
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

Rendered QA for Milestone 5F:

```text
Playwright desktop screenshot: 1280x720 viewport, Assembly Hall reveal set to Facade, massing/facade visible, openings/trim/roof hidden, WebGPU canvas data-rendered=true with data-reveal-through-stage=facade, no console errors, screenshot C:\tmp\buildo-stage-reveal-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport, Assembly Hall reveal set to Facade in a single-column layout, stage visibility summary readable, WebGPU canvas data-rendered=true with data-reveal-through-stage=facade, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-stage-reveal-qa\mobile.png.
```

Rendered QA for Milestone 5G:

```text
Playwright desktop screenshot: 1280x720 viewport, Artifact Trace visible with run id, 8 registered artifacts, runtime-building-ir metadata, packed-atlas run lineage, active assembly-hall-fixture provenance, no console errors, screenshot C:\tmp\buildo-artifact-trace-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport, Artifact Trace visible in a single-column layout with scroll-contained artifact tables, active assembly-hall-fixture provenance readable, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-artifact-trace-qa\mobile.png.
```

Rendered QA for Milestone 5H:

```text
Playwright desktop screenshot: 1280x720 viewport, Control Invalidation panel visible with prompt, floors, bays, gable roof type, moderate trim density, material-seed and trim-seed edits, material-source/atlas/catalog refresh preview, no console errors, screenshot C:\tmp\buildo-expanded-controls-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport, expanded controls visible in a single-column layout with prompt, roof type, trim density, family/building/material/trim seed fields, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-expanded-controls-qa\mobile.png.
```

Rendered QA for Milestone 5I:

```text
Playwright desktop screenshot: 1280x720 viewport, Component Forge selected Window frame with Unlock selected component visible, recipe lock key shown, selected tile marked locked, invalidation preview contained localComponentLock and branchOrFullMvp, no console errors, screenshot C:\tmp\buildo-component-lock-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport, Component Forge lock controls visible in a single-column layout with the locked Window frame recipe key readable, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-component-lock-qa\mobile.png.
```

Rendered QA for Milestone 5J:

```text
Playwright desktop screenshot: 1280x720 viewport, switched through Prompt Lab, Atlas Lab, Component Forge, and Assembly Hall tabs, left Component Forge active with the selected tab and component selector visible, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-four-room-nav-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport, switched through all four tabs, left Assembly Hall active with the vertical room tablist and Assembly Hall heading visible, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-four-room-nav-qa\mobile.png.
```

Rendered QA for Milestone 5K:

```text
Playwright desktop screenshot: 1280x720 viewport, Prompt Trace visible in Prompt Lab with local-rule summary, late19cCommercialDemo preset, requested controls, and evaluated PSG variables, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-prompt-trace-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport, Prompt Trace summary stacked cleanly above scroll-contained trace tables, local-rule / preset / style-pack / trace id readable, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-prompt-trace-qa\mobile.png.
```

Rendered QA for Milestone 5L:

```text
Playwright desktop screenshot: 1280x720 viewport, Assembly Hall visible with 16-Variant Stress panel, shared atlas/catalog/graph lineage, scroll-contained variants table, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-variant-stress-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport, Assembly Hall visible in single-column layout with 16-Variant Stress panel and scroll-contained variants table, no console errors, no horizontal page overflow, screenshot C:\tmp\buildo-variant-stress-qa\mobile.png.
```

Rendered QA for Milestone 5M:

```text
Playwright desktop screenshot: 1280x720 viewport loaded directly at #room=assemblyHall, Assembly Hall tab selected, Assembly Hall surface and 16-Variant Stress panel visible, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-room-routing-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport loaded directly at #room=assemblyHall, Assembly Hall tab selected in the vertical tab layout, Assembly Hall surface and 16-Variant Stress panel visible, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-room-routing-qa\mobile.png.
```

Rendered QA for Milestone 5N:

```text
Playwright desktop screenshot: 1280x720 viewport loaded directly at #room=atlasLab, Atlas Lab tab selected, Provider Diagnostics table visible with procedural provider, cache miss, and zero warning/error counts, no console errors, no horizontal overflow, screenshot C:\tmp\buildo-provider-diagnostics-qa\desktop.png.
Playwright mobile screenshot: 390x844 viewport loaded directly at #room=atlasLab, Atlas Lab tab selected in the vertical tab layout, Provider Diagnostics table visible in the scroll-contained Atlas Lab surface, no console errors, no horizontal page overflow, screenshot C:\tmp\buildo-provider-diagnostics-qa\mobile.png.
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

Milestone 5F introduced:

```text
src/features/building-family/ui/AssemblyHall.tsx
src/features/building-family/tests/AssemblyHall.test.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

Milestone 5G introduced:

```text
src/features/building-family/ui/ArtifactTracePanel.tsx
src/features/building-family/tests/ArtifactTracePanel.test.tsx
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

Milestone 5H introduced:

```text
src/features/building-family/state/buildingStore.ts
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

Milestone 5I introduced:

```text
src/features/building-family/state/buildingStore.ts
src/features/building-family/psg/psgBuildingIntentAdapter.ts
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/ui/ComponentForge.tsx
src/features/building-family/tests/buildingState.test.ts
src/features/building-family/tests/assemblyHallFixture.test.ts
src/features/building-family/tests/ComponentForge.test.tsx
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

Milestone 5J introduced:

```text
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

Milestone 5K introduced:

```text
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/ui/PromptTracePanel.tsx
src/features/building-family/tests/assemblyHallFixture.test.ts
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

Milestone 5L introduced:

```text
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/ui/AssemblyHall.tsx
src/features/building-family/tests/assemblyHallFixture.test.ts
src/features/building-family/tests/AssemblyHall.test.tsx
src/app/App.css
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

Milestone 5M introduced:

```text
src/app/App.tsx
src/app/App.test.tsx
src/features/building-family/state/buildingStore.ts
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

Milestone 5N introduced:

```text
src/features/building-family/materials/atlasDebugExport.ts
src/features/building-family/ui/AtlasLab.tsx
src/features/building-family/tests/atlasDebugExport.test.tsx
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6A introduced:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
vitest.config.ts
tsconfig.node.json
eslint.config.js
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6B introduced:

```text
server/building-family/openAIImageMaterialProvider.ts
server/building-family/openAIImageMaterialProvider.test.ts
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6C introduced:

```text
server/building-family/remoteMaterialArtifactCache.ts
server/building-family/openAIImageMaterialProvider.ts
server/building-family/openAIImageMaterialProvider.test.ts
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6D introduced:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6E introduced:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6F introduced:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6G introduced:

```text
src/features/building-family/materials/remoteMaterialOverlay.ts
src/features/building-family/tests/remoteMaterialOverlay.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6H introduced:

```text
src/features/building-family/materials/remoteMaterialImageBridge.ts
src/features/building-family/tests/remoteMaterialImageBridge.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Generated and ignored directories:

```text
node_modules/
dist/
test-results/
```

No preassembled meshes, route-level document ids, browser PNG decoder/app invocation, per-provider cancellation diagnostics, complete provider-aware four-room flow, or Milestone 7 interactive 16-building orbit benchmark has been added yet. The current compiler emits generated primitive `RuntimeBuildingIR` buffers through the pure TypeScript compiler path, can deliver them across the compiler worker boundary with transferable buffers, can summarize catalog/IR component data for a Component Forge inspection surface, can convert that IR into Three.js scene objects under `renderer-three/*`, can convert packed atlas channels into texture-backed slot materials at the renderer boundary, can host multiple per-building scene runtimes against one shared family atlas/material runtime, can centralize idempotent renderer resource disposal across standalone and shared-family ownership modes, renders one deterministic fixture building in a WebGPU-first browser Assembly Hall canvas with WebGL fallback from those generated artifacts, surfaces semantic renderer lookup entries in a selectable Assembly Hall inspector, drives the root app through a Zustand-backed run controller with serializable run events plus an out-of-store runtime artifact registry, exposes a store-backed four-room tablist for Prompt Lab, Atlas Lab, Component Forge, and Assembly Hall that can be addressed with `#room=<roomId>` deep links and browser-history navigation, previews roadmap invalidation impacts for prompt, floor, bay, roof, trim-density, seed, and local component lock controls, can commit `Run Current`, `New Building`, and `New Family` reruns with cache-hit artifact lineage for structural vs family-chain changes, exposes `Cancel Run` while preserving the last completed scene during pending and cancelled runs, shows Atlas Lab provider diagnostics derived from packed slot provenance and current material-source cache status, owns a tested server-only material-provider route contract, OpenAI image provider adapter, in-memory request cache, timeout fallback, concurrency limit, retry policy, decoded-overlay compositor, and remote image artifact bridge for later remote-provider hosting, shows a dedicated Component Forge with real generated component entries, selector/toggles, dimensions, anchors, recipe JSON, selected atlas-slot highlighting, and selected-recipe lock/unlock controls, records locked component keys as semantic locks in the generated spec, drives Assembly Hall stage group visibility from a real stage reveal control backed by generated scene groups and semantic path counts, shows read-only Artifact Trace plus Prompt Trace panels with run lineage, registered artifact metadata, active fixture provenance, evaluated PSG variables, local interpreter overrides, requested controls, and PSG node trace entries in Prompt Lab, and exposes a 16-variant stress summary with shared atlas/catalog/graph lineage and per-variant compiler metrics.

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
