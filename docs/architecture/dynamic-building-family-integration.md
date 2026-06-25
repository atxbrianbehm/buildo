# Dynamic Building Family Integration Map

**Status:** Milestone 7K completed-family export import packet adapter
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
    viteMaterialProviderPlugin.ts
    viteMaterialProviderPlugin.test.ts
src/
  app/
    App.css
    App.test.tsx
    App.tsx
    main.tsx
    runEventSelectors.ts
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

The app currently contains the deterministic domain, atlas, component, compiler, renderer, state, four-room UI, remote-material, route document id, provider-aware smoke, and Milestone 7A-7K persistence/export foundations. Browser-side serialized artifact persistence now has a tested IndexedDB boundary, a schema-versioned completed-family packet/cache-entry adapter, a run-controller handoff to an injected completed-family persistence writer, default app wiring that writes completed-family records to IndexedDB when available, a controller read-restore seam that can select the latest cached completed family for a route document id, a packet-to-runtime fixture restore adapter that can inflate persisted packets into live Assembly Hall fixtures, app startup wiring that tries cached restore before fresh generation, a portable completed-family export bundle builder, an app download action that exports the active completed-family bundle as JSON, a pure export verifier that decodes bundle atlas PNGs and recompiles the exported building graph, and an import adapter that turns portable export JSON back into a runtime-restorable completed-family packet; app-facing import action, configured live-provider proof, and the Milestone 7 interactive 16-building orbit benchmark remain later work.

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

At this Milestone 5A boundary, this was not the complete four-room demo yet. Full Prompt Lab controls, complete Component Forge 3D preview/regeneration controls, lock-aware semantic reroll behavior, provider-aware four-room coverage, and deeper per-provider trace diagnostics remained future slices.

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

The root app now exposes committed `Run Current`, `New Building`, and `New Family` actions in the Control Invalidation panel. The timeline displays stage artifact ids plus cache-hit badges. At this Milestone 5C boundary, this was still not the full Prompt Lab: there was no router, PSG selector, complete component-level regeneration/locking UI, or provider-aware four-room coverage yet.

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

This is still a compact prompt control surface rather than the finished Prompt Lab. At this Milestone 5H boundary, PSG preset selection, richer prompt interpretation diagnostics, and full provider-aware run diagnostics remained future slices.

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

This is the store-backed room navigation foundation. Milestone 5M adds hash-addressable room links and browser-history synchronization; richer Prompt Lab PSG diagnostics and provider-aware run diagnostics remained future roadmap slices at this boundary. Milestone 6U later adds the first route-level document id parameter without saved-family persistence, and Milestone 6V later adds automated provider-aware four-room fallback e2e coverage.

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

The root app now treats the existing four-room tab selection as a URL-addressable state. `#room=promptLab`, `#room=atlasLab`, `#room=componentForge`, and `#room=assemblyHall` hydrate the initial Zustand room selection when the app mounts. Clicking a room tab writes the matching hash, and `hashchange` / `popstate` events synchronize browser back/forward navigation back into the store. Milestone 6U later extends this route shape with an optional `document=<documentId>` parameter.

`createBuildingStore` accepts an optional initial room so the app can construct the store in the correct room before the first render. This keeps routing at the app shell boundary and avoids adding a router dependency or moving room state out of the existing building store.

Focused tests cover hash hydration, tab-click hash writes, and browser-history back navigation. The e2e smoke now opens a direct `#room=assemblyHall` URL, verifies the Assembly Hall tab is selected, and waits for the stress panel before running the existing full four-room workflow.

This was hash-based room routing only at the Milestone 5M boundary. It did not add route-level document ids, saved-family ids, browser-history entries for nested selections, or a standalone route/router package. Milestone 6U later adds the route-level document id foundation; saved-family persistence, document lookup, nested selection history, and a standalone router remain later work.

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

At the Milestone 5N boundary this was a local/procedural diagnostics foundation only. The later Milestone 6A/6B/6C/6D/6E/6F/6G/6H/6I/6J/6K/6L/6M/6N/6O/6P/6Q/6R/6S/6T/6U/6V slices added the server route contract, OpenAI image adapter foundation, in-memory remote artifact request cache foundation, timeout fallback foundation, remote provider concurrency limit foundation, retry policy foundation, pure decoded-overlay compositing foundation, remote image artifact bridge, browser PNG layer decoder, schema-validated route client, Vite dev route host, remote material application coordinator, optional fixture-level remote material atlas integration, opt-in run-controller remote material handoff, Atlas Lab remote material detail surfacing, a guarded Prompt Lab remote-material feature flag, schema-validated durable remote cache persistence, provider cancellation diagnostics with app-side abort signal propagation, Prompt Lab provider progress timeline surfacing, in-flight remote request coalescing, route-level document id routing, and provider-aware four-room fallback e2e coverage. Configured live-provider proof and Milestone 7 persistence/export/performance hardening remain later work.

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

When the remote provider is not configured, the route returns a procedural fallback diagnostic with `providerId: "procedural"` and `cacheStatus: "not-checked"`. Milestone 6B replaced the earlier `remoteMaterialProvider.openaiNotImplemented` placeholder with a server-only OpenAI image provider adapter. Milestone 6C adds the first in-memory request cache for successful remote artifacts. Milestone 6D adds timeout fallback for cache misses. Milestone 6E adds a bounded concurrency scheduler for uncached remote requests. Milestone 6F retries transient uncached provider failures before fallback. Milestone 6G adds pure overlay compositing, Milestone 6H adds the client-safe remote image artifact bridge, Milestone 6I adds the browser PNG layer decoder, Milestone 6J adds the schema-validated route client, Milestone 6K hosts the route through Vite dev middleware, Milestone 6L applies generated remote artifacts over procedural sources through an injectable coordinator, Milestone 6M lets `createAssemblyHallFixture` feed that coordinator into the final packed atlas when explicitly injected, Milestone 6N lets `BuildingRunController` forward that injected lane for material-generating runs, Milestone 6O surfaces remote route/revised-prompt/diagnostic summaries in Atlas Lab, Milestone 6P exposes a default-off Prompt Lab feature flag that gates app invocation, Milestone 6Q adds schema-validated file-backed cache persistence when `BUILDING_REMOTE_MATERIAL_CACHE_FILE` is configured, Milestone 6R reports provider cancellation as a sanitized fallback diagnostic without retrying or caching aborted work, Milestone 6S surfaces remote-provider request/result progress in the Prompt Lab timeline, Milestone 6T coalesces concurrent matching uncached route requests into one in-flight provider request, Milestone 6U preserves route-level document ids across room navigation, and Milestone 6V exercises the provider-aware fallback path through the full four-room browser smoke.

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

This slice is still adapter foundation, not complete remote-material integration. The later 6C/6D/6E/6F/6G/6H/6I/6J/6K/6L/6M/6N/6O/6P/6Q slices add in-memory cache lookup/store, timeout fallback, bounded cache-miss concurrency, transient-failure retry, pure decoded-overlay compositing, a client-safe remote image artifact bridge, a browser PNG layer decoder, a schema-validated route client, a Vite dev route host, route-result application coordinator, optional fixture/controller handoff, Atlas Lab remote detail surfacing, a user-facing feature flag, and durable remote cache persistence.

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

Focused tests verify that `requestHashFor` matches generated artifact hashes and that repeated route requests reuse the cached artifact without making a second OpenAI transport call. This is still a process-memory cache foundation only; the later 6D/6E/6F/6G/6H/6I/6J/6K/6L/6M/6N/6O/6P/6Q/6T slices add timeout fallback, bounded cache-miss concurrency, transient-failure retry, pure overlay compositing, the image artifact bridge, browser PNG layer decoding, the route client, the Vite dev route host, coordinator/fixture integration, opt-in run-controller handoff, Atlas Lab remote detail surfacing, a user-facing feature flag, schema-validated durable storage, and in-flight request coalescing. TTL/eviction remains open.

## 6.31 Remote Material Timeout Fallback Foundation

Actual Milestone 6D server timeout paths:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`server/building-family/materialProviderRoute.ts` now wraps uncached OpenAI material-provider calls in a timeout-controlled orchestration boundary. The default timeout is 30 seconds, and hosted route callers/tests can override it with `remoteMaterialTimeoutMs`. When the timeout fires, the route aborts the provider signal, returns a procedural fallback response, and emits a sanitized `remoteMaterialProvider.openaiTimedOut` warning diagnostic.

Timed-out provider work is not cached. Even if a transport ignores the abort signal and resolves later, the route has already fallen back and does not write the late artifact into the remote material cache. Cache hits still bypass transport and do not run timeout logic.

Focused tests cover the timeout fallback diagnostic, upstream abort signal, secret non-echoing, and the no-cache-after-timeout invariant. The later 6E/6F/6G/6H/6I/6J/6K/6L/6M/6N/6O/6P/6Q/6R/6S/6T slices add bounded cache-miss concurrency, transient-failure retry, pure decoded-overlay compositing, the remote image artifact bridge, browser PNG layer decoding, the route client, the Vite dev route host, coordinator/fixture integration, opt-in run-controller handoff, Atlas Lab remote detail surfacing, a user-facing feature flag, durable cache persistence, cancellation diagnostics, provider progress timeline surfacing, and in-flight request coalescing.

## 6.32 Remote Material Concurrency Limit Foundation

Actual Milestone 6E server concurrency paths:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`server/building-family/materialProviderRoute.ts` now separates cache hits from cache misses before invoking the OpenAI image provider. Cache hits are returned immediately from the in-memory cache, while cache misses run through a bounded worker scheduler. The default remote material concurrency limit is 2, and hosted route callers/tests can override it with `remoteMaterialConcurrencyLimit`.

The scheduler preserves response artifact order by writing each completed remote artifact back to its original request index. Successful cache misses are still stored by request hash, timeout wrapping still applies per uncached request, and generated responses continue to report `cacheStatus` as `hit`, `miss`, or `partial`.

Focused tests verify that three uncached approved source requests run with two active OpenAI transports at a time and still return artifacts in request order. The later 6F/6G/6H/6I/6J/6K/6L/6M/6N/6O/6P/6Q/6S/6T slices add transient-failure retry, pure remote overlay compositing, the remote image artifact bridge, browser PNG layer decoding, the route client, the Vite dev route host, coordinator/fixture integration, opt-in run-controller handoff, Atlas Lab remote detail surfacing, a user-facing feature flag, durable cache persistence, provider-progress surfacing, and in-flight request coalescing.

## 6.33 Remote Material Retry Policy Foundation

Actual Milestone 6F server retry paths:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`server/building-family/materialProviderRoute.ts` now wraps uncached provider generation in a bounded retry loop after the timeout wrapper. The default retry count is 1, and hosted route callers/tests can override it with `remoteMaterialRetryCount`. Timeout errors still fall back immediately; transient non-timeout provider errors can retry before the route emits the existing sanitized `remoteMaterialProvider.openaiFailed` fallback diagnostic.

Successful retry attempts return normal generated artifacts, are stored in the remote material cache by request hash, and keep provider secrets out of route responses. Permanent failures still return procedural fallback without caching a failed artifact.

Focused tests verify that a first transport failure containing a test secret is retried once, succeeds on the second call, returns generated `openai-image` output, and does not echo the API key. This slice does not add exponential backoff, retry-after parsing, Atlas Lab provider-progress surfacing, or remote overlay compositing. Milestone 6G adds the first pure compositing utility after this route-layer retry foundation, Milestone 6Q later adds durable cache persistence, and Milestone 6T later adds in-flight request coalescing.

## 6.34 Remote Overlay Compositing Foundation

Actual Milestone 6G material compositing paths:

```text
src/features/building-family/materials/remoteMaterialOverlay.ts
src/features/building-family/tests/remoteMaterialOverlay.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`src/features/building-family/materials/remoteMaterialOverlay.ts` introduces a renderer-independent material utility that alpha-composites an approved remote color/detail overlay over an existing procedural `MaterialSourceArtifact`. The composed artifact keeps procedural height, roughness, metalness, and opacity layers as the authoritative structure/mask channels, writes a new request hash and content hash, and records `providerId: "procedural+remote-overlay"` provenance for later Atlas Lab surfacing.

Invalid overlays do not replace the procedural source. The compositor returns diagnostics for source-id mismatches, artifact dimension mismatches, and overlay-layer dimension mismatches, while preserving the original procedural artifact so the atlas pipeline can continue with a functional fallback.

Focused tests cover direct alpha compositing, mismatch diagnostics, and the Milestone 6 invariant that a remote overlay changes packed atlas content without changing the compiled structural `RuntimeBuildingIR`. This slice does not decode PNGs from server `RemoteMaterialSourceArtifact` payloads, call the server route from the app, persist remote cache entries, or add provider-progress/cancellation UI. Later 6O/6P work surfaces remote summaries in Atlas Lab and adds the guarded app invocation path.

## 6.35 Remote Material Image Bridge Foundation

Actual Milestone 6H material bridge paths:

```text
src/features/building-family/materials/remoteMaterialImageBridge.ts
src/features/building-family/tests/remoteMaterialImageBridge.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`src/features/building-family/materials/remoteMaterialImageBridge.ts` defines a client-safe schema for the serialized `openai-image` remote material image artifact shape returned by the route, without importing server modules into `src`. It validates schema version, provider id, PNG output format, image payload, hashes, revised prompt, and provenance before attempting to decode the image payload.

The bridge accepts an injected `PngLayerDecoder` rather than using DOM APIs inside the material layer. That keeps `materials/` renderer-independent while still giving later app/UI code a narrow place to plug in browser image decoding. Valid artifacts are converted to `RemoteMaterialOverlay` objects for the existing 6G compositor; invalid schema, source-id mismatch, decode failures, decoded-dimension mismatch, and RGBA byte-length mismatch return diagnostics without producing an overlay.

Focused tests cover bridge validation, decoder invocation with expected source dimensions, revised-prompt/provenance preservation, source/format rejection before decoding, decoded-dimension diagnostics, and integration with `compositeRemoteMaterialOverlay`. This slice does not add the browser decoder implementation, HTTP host/proxy, app route invocation, or durable remote cache persistence. Later 6O work surfaces revised prompts in Atlas Lab when a fixture carries a remote material summary, and Milestone 6Q later adds durable cache persistence.

## 6.36 Browser PNG Layer Decoder Foundation

Actual Milestone 6I browser decode paths:

```text
src/features/building-family/ui/browserPngLayerDecoder.ts
src/features/building-family/tests/browserPngLayerDecoder.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`src/features/building-family/ui/browserPngLayerDecoder.ts` implements the browser-side `PngLayerDecoder` adapter for remote material image artifacts. It converts base64 PNG payloads into bytes, wraps them in an `image/png` `Blob`, decodes with `createImageBitmap`, draws the bitmap into a target-sized 2D canvas, and returns a copied RGBA8 `PixelLayer` for the 6H image bridge and 6G compositor.

The decoder is intentionally under `ui/` because it uses browser image and canvas APIs. It exposes an injectable `BrowserPngDecodeRuntime` so tests can verify the decode flow without depending on jsdom canvas support, and it closes image bitmaps after reading. Missing browser primitives, missing canvas context, invalid dimensions, and non-RGBA canvas output throw `BrowserPngLayerDecodeError`, which the existing image bridge reports as a decode warning.

Focused tests cover base64/blob/image-bitmap/canvas invocation order, target-size drawing, RGBA8 copy semantics, bitmap cleanup, missing browser primitive errors, and non-RGBA output errors. This slice does not call the server route from the app, surface remote revised prompts in Atlas Lab, add a Vite/HTTP host, persist the remote cache, or wire remote material generation into the run controller.

## 6.37 Remote Material Route Client Foundation

Actual Milestone 6J route client paths:

```text
src/features/building-family/state/remoteMaterialRouteClient.ts
src/features/building-family/tests/remoteMaterialRouteClient.test.ts
src/features/building-family/materials/remoteMaterialImageBridge.ts
docs/architecture/dynamic-building-family-integration.md
```

`src/features/building-family/state/remoteMaterialRouteClient.ts` introduces the client-side boundary for invoking the server material-provider route without importing server modules into `src`. The client posts a schema-versioned `0.1.0` request batch to `/api/building-material-provider`, uses `outputFormat: "rgba8-layer-set"`, accepts an injectable `fetcher` for tests and later hosting, and runtime-validates the response union with Zod.

Generated responses preserve `openai-image` artifacts using the same exported `RemoteMaterialImageArtifactSchema` consumed by the 6H image bridge. Fallback responses preserve the route's procedural provider diagnostics, and rejected responses preserve validation diagnostics for invalid request batches. Transport failures and malformed responses return sanitized procedural fallback diagnostics without echoing arbitrary thrown errors or response details.

Focused tests cover the posted payload contract, generated artifact preservation, fallback diagnostics, rejected diagnostics, fetch failure sanitization, and invalid response sanitization. This slice does not wire the route client into `BuildingRunController`, decode or composite returned images in an app run, surface revised prompts in Atlas Lab, add a Vite/HTTP host, persist the remote cache, or add provider-level cancellation progress.

## 6.38 Vite Material-Provider Route Host Foundation

Actual Milestone 6K route host paths:

```text
server/building-family/viteMaterialProviderPlugin.ts
server/building-family/viteMaterialProviderPlugin.test.ts
vite.config.ts
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

`server/building-family/viteMaterialProviderPlugin.ts` hosts the existing Fetch-compatible material-provider route through Vite dev middleware at `/api/building-material-provider`. The middleware converts Node incoming request headers and body into a standard `Request`, delegates to `handleMaterialProviderRequest`, then streams the route status, headers, and body back through the Vite response. It accepts the same injectable `routeOptions` used by route tests, so automated coverage can exercise fallback or mocked provider paths without real API calls.

`vite.config.ts` now installs the plugin alongside React. That means both `npm run dev` through `scripts/dev-server.mjs` and the programmatic e2e smoke server can serve the material-provider endpoint while keeping provider keys in server-only process configuration. The e2e smoke now probes the endpoint before opening the UI and expects an unconfigured procedural fallback response, proving the actual Vite config hosts the route without requiring remote credentials.

Focused tests cover middleware registration, request forwarding, status/header/body propagation, and fallback diagnostics from the hosted route. This slice does not wire the app/run controller to call the route client, does not decode or composite returned images in an app run, does not surface revised prompts in Atlas Lab, and does not add durable remote cache persistence. Milestone 6Q later adds durable cache persistence behind the route's existing cache boundary.

## 6.39 Remote Material Application Coordinator Foundation

Actual Milestone 6L application coordinator paths:

```text
src/features/building-family/state/remoteMaterialApplicationCoordinator.ts
src/features/building-family/tests/remoteMaterialApplicationCoordinator.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`src/features/building-family/state/remoteMaterialApplicationCoordinator.ts` introduces the first app-side orchestration utility that can turn hosted/generated remote material images into usable material-source artifacts. It accepts a run id, approved material source requests, already-generated procedural artifacts, an injectable route requester, and an injectable PNG decoder. Generated route responses are bridged through the 6H image-artifact validator, decoded through the injected PNG decoder, and composited with the 6G overlay compositor so procedural height, roughness, metalness, and opacity remain authoritative.

Fallback and rejected route results keep the procedural artifacts and carry route diagnostics forward. Generated responses summarize provider id, cache status, route hash, accepted request count, and per-source revised prompts/content hashes for later Atlas Lab surfacing. If a generated route response omits a requested source artifact, the coordinator records a warning and preserves the procedural source instead of silently treating the remote lane as complete.

Focused tests cover generated remote overlay compositing over procedural sources, preservation of procedural height/roughness channels, route summary and revised-prompt summary capture, procedural fallback diagnostics, no decode attempt during fallback, and missing-generated-artifact diagnostics. This slice does not wire `BuildingRunController` to call the coordinator, does not add UI controls/feature flags, and does not persist remote cache entries. Later 6N/6O work adds the opt-in controller handoff and Atlas Lab remote detail surfacing.

## 6.40 Optional Fixture Remote Material Integration Foundation

Actual Milestone 6M fixture integration paths:

```text
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/tests/assemblyHallFixture.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`createAssemblyHallFixture` now accepts an optional `remoteMaterial` lane. When no reusable packed atlas is supplied and `remoteMaterial` is injected, the fixture still generates the procedural material sources first, selects remote-eligible material requests, calls the 6L application coordinator, and packs the returned artifacts into the final atlas. The default path remains procedural-only, and structural reruns that pass a reusable packed atlas continue to skip material-source regeneration entirely.

The optional lane records a schema-versioned `remoteMaterialApplication` summary on the fixture with route status/cache information, remote source hashes, revised prompts, and diagnostics. The packed atlas slot provenance now reflects `providerId: "procedural+remote-overlay"` for sources that received generated remote overlays, and the Atlas debug export provider diagnostics can see that provider through normal slot provenance.

Focused fixture coverage injects a mocked generated remote response for `source.wall.primary`, verifies that the route call receives only the selected remote source, decodes the returned artifact, changes the packed atlas content hash, preserves the compiled `RuntimeBuildingIR` graph hash and metrics, and captures the remote provider/revised-prompt summary. This slice does not turn remote material generation on from the default app shell. Later 6O/6P work surfaces the captured summary in Atlas Lab and adds the guarded app invocation path.

## 6.41 Opt-In Run Controller Remote Material Invocation Foundation

Actual Milestone 6N run-controller integration paths:

```text
src/features/building-family/state/buildingRunController.ts
src/features/building-family/tests/buildingState.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`BuildingRunController` now accepts an optional `remoteMaterial` lane matching the fixture-level integration contract. When the lane is supplied, material-generating runs forward it to `createAssemblyHallFixture`; structural-only reruns that reuse the last completed packed atlas omit the lane entirely so floor, bay, building-seed, and similar reuse paths do not call the remote material route.

The default app path remains procedural-only because the root shell does not supply the option yet. This slice establishes the controller boundary needed for a later UI/feature-flag slice without putting provider credentials or route-specific server modules into client code.

Focused controller coverage verifies the opt-in lane is forwarded on the baseline material-generating run and a new-family material-regenerating run, while a floor-count rerun receives the reusable packed atlas/debug export and no remote material lane.

## 6.42 Atlas Lab Remote Material Detail Surfacing Foundation

Actual Milestone 6O Atlas Lab surfacing paths:

```text
src/app/App.tsx
src/app/App.css
src/features/building-family/ui/AtlasLab.tsx
src/features/building-family/tests/atlasDebugExport.test.tsx
docs/architecture/dynamic-building-family-integration.md
```

`AtlasLab` now accepts the fixture's optional `remoteMaterialApplication` summary and renders a `Remote Material Details` section when that summary is present. The section surfaces route status, provider id, cache status, accepted request count, route request hash, per-source generated content hashes, revised prompts, and route/application diagnostics.

The root app passes `fixture.remoteMaterialApplication` through to Atlas Lab. Milestone 6P adds the default-off Prompt Lab feature flag that supplies the remote lane only when explicitly enabled.

Focused Atlas Lab coverage now renders a generated remote summary with an `openai-image` provider, route cache miss, revised masonry prompt, and warning diagnostic, then verifies those values are visible in the Atlas Lab remote detail tables.

## 6.43 User-Facing Remote Material Feature Flag Foundation

Actual Milestone 6P feature-flag paths:

```text
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
src/features/building-family/core/invalidation.ts
src/features/building-family/state/buildingStore.ts
src/features/building-family/state/buildingRunController.ts
src/features/building-family/tests/buildingState.test.ts
src/features/building-family/ui/assemblyHallFixture.ts
docs/architecture/dynamic-building-family-integration.md
```

`BuildingPromptControls` now includes `remoteMaterialEnabled`, defaulting to `false`. Toggling it is treated as a material-source invalidation: material sources and the packed atlas refresh, while the component catalog remains reusable because remote overlays do not change generated component recipes or structural graph semantics.

Prompt Lab now exposes a `Remote Detail Provider` checkbox. The root app wires `decodeBrowserPngLayer` into `BuildingRunController`, but the controller only forwards the remote material lane to `createAssemblyHallFixture` when the prompt flag is enabled and the run is not reusing an existing packed atlas. Default app startup and ordinary procedural runs remain local/procedural.

Focused coverage verifies the default-off prompt state, material-source invalidation preview, controller gating when a remote adapter is configured, and the Prompt Lab checkbox interaction. This is a feature-flag foundation; Milestone 6V later adds automated provider-aware four-room fallback e2e coverage.

## 6.44 Durable Remote Material Cache Persistence Foundation

Actual Milestone 6Q durable cache paths:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
server/building-family/remoteMaterialArtifactCache.ts
server/building-family/remoteMaterialArtifactCache.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`server/building-family/remoteMaterialArtifactCache.ts` now exposes `createDurableRemoteMaterialArtifactCache`, a file-backed cache adapter that preserves the existing synchronous `RemoteMaterialArtifactCache` contract. It reads a schema-versioned `0.1.0` JSON snapshot at construction, runtime-validates stored OpenAI image artifacts before accepting them, clone-protects restored artifacts, and rewrites a valid snapshot after successful `set` calls.

`handleMaterialProviderRequest` now chooses the durable adapter when the server environment includes `BUILDING_REMOTE_MATERIAL_CACHE_FILE`. Explicitly injected `remoteMaterialCache` instances still take precedence for tests or custom hosts, and the default remains process-memory-only when no file path is configured. This keeps persistence server-side and does not add provider secrets, cache files, or server route imports to the browser bundle.

Focused coverage verifies durable snapshot write/read behavior, invalid snapshot rejection with rewrite on the next valid set, and route-level reuse across handler invocations through a configured durable cache file without a second mocked OpenAI transport call. TTL/eviction, configured live-provider proof, and Milestone 7 persistence/export/performance hardening remain later work.

## 6.45 Provider Cancellation Diagnostic Foundation

Actual Milestone 6R cancellation paths:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
src/features/building-family/state/remoteMaterialRouteClient.ts
src/features/building-family/state/remoteMaterialApplicationCoordinator.ts
src/features/building-family/tests/remoteMaterialRouteClient.test.ts
src/features/building-family/tests/remoteMaterialApplicationCoordinator.test.ts
src/features/building-family/tests/assemblyHallFixture.test.ts
src/features/building-family/ui/assemblyHallFixture.ts
docs/architecture/dynamic-building-family-integration.md
```

`handleMaterialProviderRequest` now distinguishes route cancellation from provider failure and timeout. When the incoming request signal aborts during uncached provider work, the route aborts the provider signal, short-circuits retry, returns procedural fallback with a sanitized `remoteMaterialProvider.cancelled` warning, and leaves the remote material cache untouched.

The app-side remote material path now carries the run's existing `AbortSignal` through `createAssemblyHallFixture`, `applyRemoteMaterialRouteOverlays`, `requestRemoteMaterialImages`, and the hosted route fetch. This establishes the cancellation plumbing needed for real provider work without adding browser-owned provider secrets or changing structural/procedural reuse semantics.

Focused coverage verifies no retry after cancellation, no test-secret echoing, no cache write after cancellation, fresh generation after cancellation, route-client fetch signal forwarding, coordinator signal forwarding, and fixture-to-route signal forwarding. Milestone 6V later adds automated provider-aware four-room fallback e2e coverage.

## 6.46 Provider Progress UI Foundation

Actual Milestone 6S provider progress paths:

```text
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
src/features/building-family/state/buildingRunController.ts
src/features/building-family/tests/buildingState.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`BuildingRunController` now wraps the configured remote material requester for feature-flagged material-generating runs. The wrapper appends a `generatingMaterialSources` run event when the remote route request starts, then appends a provider outcome event after the route returns. Generated route results report the route provider and cache state, while fallback/rejected results preserve their sanitized diagnostic code in the run event error field. Structural reruns that reuse the packed atlas still skip the remote lane entirely.

Prompt Lab's `Generation Run` timeline now renders run-event provider labels and diagnostic codes alongside existing stage, artifact, and cache-hit/cache-miss metadata. This makes remote provider request/procedural fallback progress visible without adding browser-owned provider secrets or a separate fake status surface.

Focused coverage verifies controller-level remote provider progress events and Prompt Lab timeline surfacing when the local test environment falls back procedurally. Milestone 6V later extends this into the browser smoke; configured live-provider proof and Milestone 7 persistence/export/performance hardening remain later work.

## 6.47 In-Flight Remote Request Coalescing Foundation

Actual Milestone 6T coalescing paths:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`handleMaterialProviderRequest` now keeps a process-local in-flight remote-material request map keyed by the OpenAI material source request hash. When concurrent route calls miss the configured cache for the same source request, later callers await the existing provider promise instead of starting duplicate OpenAI transport work. Each route still writes the generated artifact through its configured cache boundary after the shared provider result resolves.

The coalescer preserves the existing route safety behavior: request cancellation rejects only that caller with the sanitized cancellation diagnostic, and the shared provider aborts when all active subscribers for an in-flight request have cancelled. Timeout, retry, concurrency-limit, cache-hit, and no-secret-echo behavior continue to use the existing route boundaries.

Focused coverage verifies two concurrent uncached matching route requests share one mocked OpenAI transport call, return the same generated artifact identity, and do not echo the test API key. Automated provider-aware fallback e2e coverage lands in Milestone 6V; TTL/eviction, configured live-provider proof, and Milestone 7 persistence/export/performance hardening remain later work.

## 6.48 Route-Level Document ID Foundation

Actual Milestone 6U route document paths:

```text
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
src/features/building-family/state/buildingStore.ts
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

The app shell now understands an optional `document=<documentId>` URL hash parameter alongside the existing `room=<roomId>` parameter. When a route includes a document id, the app hydrates that id into the existing Zustand selection state before the first render, shows it as route identity in the shell, and preserves it when room tabs push new hash entries. Room-only hashes remain supported for the existing demo route.

`createBuildingStore` now carries a lightweight `selection.documentId`, defaulting to `buildo-demo-family` when no route document id exists. This is a routing identity foundation only: it does not load, save, or validate persisted family documents, and it does not add a router package or nested selection history.

Focused coverage verifies a direct `#document=family-doc-alpha&room=assemblyHall` route selects Assembly Hall, surfaces the document id, and preserves that id when navigating to Atlas Lab. The e2e smoke now opens the app through `#document=e2e-family-doc&room=assemblyHall` before the full four-room workflow. Milestone 6V later enables the remote-provider flag inside that smoke; saved-family persistence, route document lookup, configured live-provider proof, and Milestone 7 persistence/export/performance hardening remain later work.

## 6.49 Provider-Aware Four-Room E2E Coverage Foundation

Actual Milestone 6V provider-aware e2e paths:

```text
src/app/App.tsx
src/app/App.test.tsx
src/app/runEventSelectors.ts
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

The e2e smoke now turns on the Prompt Lab `Remote Detail Provider` flag before committing the main smoke run. The run exercises the hosted Vite material-provider route in its no-provider-config fallback mode, verifies the Generation Run timeline reports `remote-material-route` plus the sanitized `remoteMaterialProvider.disabled` diagnostic, then enters Atlas Lab and verifies `Remote Material Details`, route status/provider/cache, and the remote diagnostics table before continuing through Component Forge and Assembly Hall on the same completed fixture.

The root app now derives Atlas Lab's material-source cache label from the latest concrete `generatingMaterialSources` run event. This preserves `cache miss` for provider-aware runs where an earlier remote-route progress event intentionally has no cache-hit state. Focused App coverage captures that selector behavior with remote progress followed by procedural material-source completion.

This closes the automated provider-aware four-room fallback path without spending real provider credits or moving provider secrets into the browser. A configured live OpenAI-provider proof, saved-family persistence/export hardening, TTL/eviction, and the Milestone 7 interactive 16-building orbit benchmark remain later work.

## 6.50 IndexedDB Artifact Persistence Foundation

Actual Milestone 7A IndexedDB persistence paths:

```text
src/features/building-family/materials/artifactCache.ts
src/features/building-family/materials/indexedDbArtifactPersistence.ts
src/features/building-family/tests/indexedDbArtifactPersistence.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`src/features/building-family/materials/indexedDbArtifactPersistence.ts` introduces the first browser-side durable artifact persistence boundary. It stores the existing schema-versioned `CachedArtifactEntry` shape in an IndexedDB object store and keys each record by `schemaVersion`, `artifactType`, and `requestHash`, matching the Milestone 7 requirement that persisted artifacts remain request-addressable and schema-aware.

The adapter accepts an injected `IDBFactory` for deterministic tests and defaults to `globalThis.indexedDB` in the browser. It creates the `cachedArtifacts` object store on first open, validates persisted records against the shared cached-artifact schema before returning them, and exposes async `put`, `get`, and `list` methods. `artifactCache.ts` now exports the cached-artifact schema parser so memory and IndexedDB restore paths share validation.

Focused coverage uses a small fake IndexedDB surface to verify the persistence key and round-trip storage/listing behavior without requiring browser globals in Node. This is the persistence adapter foundation only: the app does not yet write completed family records into IndexedDB during runs, reload a cached completed family, expose export bundles, or run the Milestone 7 benchmark/performance profiling pass.

## 6.51 Completed-Family Persistence Packet Foundation

Actual Milestone 7B completed-family persistence packet paths:

```text
src/features/building-family/state/completedFamilyPersistence.ts
src/features/building-family/tests/completedFamilyPersistence.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`src/features/building-family/state/completedFamilyPersistence.ts` introduces the first schema-versioned completed-family packet for cached-family restore and future export work. The packet captures the completed fixture's serializable data side: building spec, style-pack reference, atlas manifest/channels/content hash/slot provenance, component catalog, building graph, runtime IR, component gallery, atlas debug export, prompt trace, variant stress summary, optional remote-material application summary, and provenance entry count. It intentionally leaves out live renderer objects such as `familyRuntime` and `buildingRuntime`.

The module can build a packet from the current Assembly Hall fixture, runtime-validate it, parse structured-cloned restores, and adapt it into the shared `CachedArtifactEntry` shape using artifact type `completed-family`, the run request hash, the packet content hash, and lineage dependencies for family, atlas, catalog, graph, source-graph, and building ids.

Focused coverage verifies packet construction, runtime validation, structured-clone restore compatibility for typed-array atlas/IR payloads, exclusion of live runtime objects, and cache-entry dependency/key adaptation. This is the packet foundation only: route document ids do not yet restore cached records, default app IndexedDB wiring remains later work, and the JSON/file export bundle with portable channel encoding remains later work.

## 6.52 Completed-Family Persistence Handoff Foundation

Actual Milestone 7C completed-family persistence handoff paths:

```text
src/features/building-family/state/buildingRunController.ts
src/features/building-family/tests/buildingState.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`BuildingRunController` now accepts an optional completed-family persistence writer plus an overridable completed-family packet builder. After a run is confirmed current and before it is marked complete, the controller builds a completed-family packet using the active route document id, run id, request hash, and completed fixture, adapts it to a `completed-family` cache entry, and passes it to the injected writer. The optional persistence handoff is best-effort: a writer failure does not turn a successfully generated current run into a failed run.

Focused controller coverage verifies the successful-run handoff, including document id, run id, request hash, fixture, artifact type, packet content hash, cache-entry dependencies, and persistence-writer failure fallback. At the 7C boundary this did not install the IndexedDB writer into the default app controller, read cached records back from route document ids, or expose a portable export bundle.

## 6.53 App IndexedDB Completed-Family Write Foundation

Actual Milestone 7D app IndexedDB completed-family write paths:

```text
src/app/App.tsx
src/app/App.test.tsx
docs/architecture/dynamic-building-family-integration.md
```

The root app now creates the existing IndexedDB artifact persistence adapter when `globalThis.indexedDB` is available and injects it into `BuildingRunController` as the completed-family persistence writer. Browser runs can therefore write `completed-family` cache entries keyed by schema version, artifact type, and request hash without storing runtime objects in Zustand.

Focused App coverage installs a fake IndexedDB factory, starts the app through a route-level document id, waits for the initial completed run, and verifies the persisted record uses artifact type `completed-family`, includes the route document id, and has a schema/request-hash cache key. This is write-path wiring only: the app still does not query IndexedDB on startup, restore a route document id from cache, or expose export-bundle download.

## 6.54 Controller Completed-Family Read-Restore Foundation

Actual Milestone 7E controller completed-family read-restore paths:

```text
src/features/building-family/state/buildingRunController.ts
src/features/building-family/tests/buildingState.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`BuildingRunController.restoreLatestCompletedFamily()` now asks the injected completed-family persistence store for cached entries, filters to `completed-family` records for the active route document id, selects the newest packet by packet creation timestamp, restores a fixture through an injected packet-to-fixture function, registers the restored generated artifacts and runtime fixture, and marks the run complete without invoking fresh generation. Restores participate in the same active-run stale-result guard as fresh generation, so a restored fixture that resolves after a newer run has started is disposed and returned as stale.

Focused controller coverage seeds multiple persisted packets across two route document ids, verifies the newest packet for the active document is restored, verifies fresh generation is not called, verifies the restored fixture becomes the active registered artifact, and verifies a slow restore cannot replace a newer completed run. This is the controller read-restore seam only: the default app does not yet call it at startup.

## 6.55 Completed-Family Packet Runtime Restore Adapter

Actual Milestone 7F packet runtime restore paths:

```text
src/features/building-family/state/completedFamilyPersistence.ts
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/tests/completedFamilyPersistence.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`createCompletedFamilyPersistencePacket()` now writes the fixture prompt into new completed-family packets while the schema still accepts older prompt-less packets. `restoreAssemblyHallFixtureFromCompletedFamilyPacket()` validates a cloned persisted packet, reconstructs the `PackedAtlas` object from manifest, channels, slot provenance, and content hash, detects renderer backend support, creates a shared `BuildingFamilyRuntime`, creates the active `BuildingSceneRuntime`, and returns a live `AssemblyHallFixture` with restored prompt trace, component gallery, variant stress, metrics, and provenance.

Focused persistence coverage now clones a real completed-family packet as IndexedDB would, restores it through the packet-to-runtime adapter, and verifies the restored fixture owns live atlas textures, shared material registry, renderable wall geometry, component gallery data, runtime metrics, and prompt identity. Milestone 7G later wires this adapter into the root app startup path.

## 6.56 App Startup Completed-Family Restore Foundation

Actual Milestone 7G app startup restore paths:

```text
src/app/App.tsx
src/app/App.test.tsx
docs/architecture/dynamic-building-family-integration.md
```

The root app now injects `restoreAssemblyHallFixtureFromCompletedFamilyPacket()` into `BuildingRunController` alongside the existing IndexedDB completed-family persistence adapter. On startup, the app attempts `controller.restoreLatestCompletedFamily()` for the active route document id before starting fresh procedural generation. If no cached completed-family record exists, or if a persisted packet cannot be restored, startup falls back to the normal procedural run.

Focused App coverage seeds the fake IndexedDB store with a real completed-family packet for `#document=family-doc-alpha`, renders the app, and verifies startup restores `run-restored`, registers the restored Assembly Hall fixture artifact, surfaces the restored completion timeline, and shows the restored prompt trace rather than starting a fresh `building-run-*`.

## 6.57 Portable Completed-Family Export Bundle Foundation

Actual Milestone 7H export bundle paths:

```text
src/features/building-family/state/completedFamilyExportBundle.ts
src/features/building-family/tests/completedFamilyExportBundle.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`createCompletedFamilyExportBundle()` now derives a schema-versioned `completed-family-export` bundle from the validated completed-family persistence packet. The bundle carries the route document id, run/request/content ids, style-pack reference, normalized building spec, atlas manifest/content hash/slot provenance, PNG data URL atlas channels in manifest order, component catalog, building graph, provenance packet, and an optional glTF descriptor slot for later export work.

Focused coverage builds a real Assembly Hall fixture, persists it into a completed-family packet, creates the export bundle, round-trips it through JSON, parses it back through the bundle schema, and verifies the portable bundle excludes live renderer objects while preserving the data needed to reproduce the procedural building and atlas. At the 7H boundary this was the export data foundation only, with no download button, import path, or reproduction verifier yet.

## 6.58 App Completed-Family Export Download Surface

Actual Milestone 7I export download paths:

```text
src/app/App.tsx
src/app/App.test.tsx
docs/architecture/dynamic-building-family-integration.md
```

The Prompt Lab committed-run controls now expose a guarded `Download Export` action once an active completed fixture, current run, and fixture artifact metadata are present. The handler builds a completed-family persistence packet from the active Assembly Hall fixture, route document id, run id, and fixture request hash, derives the schema-versioned `completed-family-export` bundle, and downloads it as formatted JSON named from the route document id.

Focused App coverage stubs browser blob URL creation, clicks the download action after the initial completed run, reads the generated JSON blob, and verifies the bundle type, route document id, and portable PNG atlas-channel data URL. This is the app export surface only: importing the JSON and independently verifying procedural building/atlas reproduction remains a later Milestone 7 slice.

## 6.59 Completed-Family Export Reproduction Verifier

Actual Milestone 7J export verification paths:

```text
src/features/building-family/state/completedFamilyExportVerifier.ts
src/features/building-family/tests/completedFamilyExportBundle.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`verifyCompletedFamilyExportBundle()` now parses the schema-versioned `completed-family-export` JSON bundle and returns a schema-versioned `completed-family-export-reproduction` verification report. The verifier decodes the exported PNG data URL atlas channels without browser APIs, recomputes each channel hash, recomputes the packed atlas content hash from decoded channel bytes plus slot provenance, recompiles the exported spec/catalog/graph with the exported building id, and compares the resulting source graph hash and building metrics with the bundle's recorded variant-stress baseline.

Focused export coverage now builds a real fixture, exports it, round-trips the bundle through JSON, verifies the portable atlas bytes and compiled building metrics, and asserts the report records the reproduced family id, building id, atlas id/content hash, catalog id, graph id, source graph hash, channel count, triangle count, instance count, and semantic path count. This satisfies the data-level Milestone 7 reproduction proof; an app-facing import/restore flow remains a later slice.

## 6.60 Completed-Family Export Import Packet Adapter

Actual Milestone 7K export import paths:

```text
src/features/building-family/state/completedFamilyExportImport.ts
src/features/building-family/state/completedFamilyExportVerifier.ts
src/features/building-family/tests/completedFamilyExportBundle.test.ts
docs/architecture/dynamic-building-family-integration.md
```

`importCompletedFamilyExportBundleToPacket()` now parses and verifies a portable `completed-family-export` JSON bundle, decodes the bundle's PNG atlas channels into typed RGBA atlas layers, recompiles the exported spec/catalog/graph into a runtime IR, rebuilds the component gallery, reconstructs a valid imported atlas debug export shell from bundle channel hashes and slot provenance, and emits a validated completed-family persistence packet. The adapter preserves the exported document/run/request/content ids and produces the same packet shape consumed by `restoreAssemblyHallFixtureFromCompletedFamilyPacket()`.

Focused export coverage now imports a JSON-round-tripped bundle into a completed-family packet, confirms the decoded atlas channel data is typed, verifies the imported packet reproduces atlas content hash, runtime IR identity/metrics, and component-gallery id, and then restores a live Assembly Hall fixture from that imported packet. This is the data adapter for app import, not the final app-facing file picker or import action.

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

Actual feature routing: root route with hash-addressable room panels plus an optional route-level document id. No router dependency exists yet. The root app shell now exposes a store-backed `Building rooms` tablist synchronized with `#room=<roomId>` hashes and preserves `#document=<documentId>&room=<roomId>` when a document id is present. Browser back/forward events synchronize route state back into the store. Prompt Lab contains the expanded Control Invalidation prompt-control surface, committed rerun buttons, a Cancel Run action, controller-backed Generation Run timeline with artifact cache-hit badges plus remote provider labels/diagnostic codes, Artifact Trace provenance tables, and Prompt Trace PSG/interpreter diagnostics. Atlas Lab exposes provider diagnostics plus channel/slot inspection, Component Forge exposes local recipe lock controls, and Assembly Hall exposes manual stage reveal plus the 16-variant stress summary; all room panels are backed by the same completed fixture artifact.

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
src/features/building-family/state/completedFamilyPersistence.ts
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
server/building-family/viteMaterialProviderPlugin.ts
src/features/building-family/materials/remoteMaterialOverlay.ts
src/features/building-family/materials/remoteMaterialImageBridge.ts
src/features/building-family/ui/browserPngLayerDecoder.ts
src/features/building-family/state/remoteMaterialRouteClient.ts
src/features/building-family/state/remoteMaterialApplicationCoordinator.ts
src/features/building-family/ui/assemblyHallFixture.ts
```

The project has chosen a small Node/server lane under `server/` for Milestone 6 provider-secret work. The route is a tested Fetch-compatible handler and is now hosted in development by a Vite middleware plugin at `/api/building-material-provider`. When fully configured, the handler can invoke the server-only OpenAI image adapter through a default or injected transport and reuse successful generated artifacts through a process-local in-memory cache. The client-side lane now has a pure compositor for decoded remote overlays, a schema-validated bridge from remote image artifacts to overlays, a browser PNG-to-RGBA decoder adapter, a schema-validated route client that can post material request batches to the hosted endpoint, a route-result application coordinator that can apply generated overlays over procedural sources, optional fixture-level wiring that can feed those composed sources into the final packed atlas, opt-in run-controller forwarding for material-generating runs, Atlas Lab route/revised-prompt/diagnostic surfacing for fixtures that include remote material summaries, and a default-off Prompt Lab feature flag that gates app invocation. A pure Vite client must still not own provider API keys.

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
| Existing server route convention | Small Node/server route lane now exists under `server/building-family/materialProviderRoute.ts` with `server/building-family/openAIImageMaterialProvider.ts` as the server-only OpenAI adapter, `server/building-family/remoteMaterialArtifactCache.ts` as the process-local and optional file-backed cache foundation, `server/building-family/viteMaterialProviderPlugin.ts` as the Vite dev host, `src/features/building-family/materials/remoteMaterialOverlay.ts` as the pure decoded-overlay compositor, `src/features/building-family/materials/remoteMaterialImageBridge.ts` as the client-safe image artifact bridge, `src/features/building-family/ui/browserPngLayerDecoder.ts` as the browser PNG-to-RGBA adapter, `src/features/building-family/state/remoteMaterialRouteClient.ts` as the schema-validated app-side route client with abort-signal forwarding, `src/features/building-family/state/remoteMaterialApplicationCoordinator.ts` as the route-result application coordinator with abort-signal forwarding, `src/features/building-family/ui/assemblyHallFixture.ts` as the optional fixture-level atlas integration point, `src/features/building-family/state/buildingRunController.ts` as the opt-in controller handoff/progress event point, `src/features/building-family/ui/AtlasLab.tsx` as the remote route/revised-prompt surfacing point, `src/app/App.tsx` as the default-off feature-flagged app invocation and provider-progress timeline point, and `scripts/e2e-smoke.mjs` as the automated provider-aware fallback four-room proof. | Keep provider secrets in `server/`; configured live-provider proof remains manual/later. |
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
rg -n "OPENAI_API_KEY|BUILDING_MATERIAL_PROVIDER|OPENAI_IMAGE_MODEL|BUILDING_REMOTE_MATERIAL_CACHE_FILE|sk-buildo" src dist
rg -n "server/building-family|materialProviderRoute|openAIImageMaterialProvider|remoteMaterialArtifactCache" src dist
```

Latest validation results:

```text
typecheck: passed
unit tests: passed, 172 tests across 44 files
lint: passed
build: passed
e2e smoke: passed, including Vite material-provider route fallback probe, route document id plus Assembly Hall deep link, four-room tab navigation, expanded prompt-control edits, Remote Detail Provider opt-in, committed Run Current provider-aware fallback rerun, Prompt Lab provider timeline and sanitized route diagnostic assertions, Artifact Trace registered-artifact and run-lineage assertions in Prompt Lab, Prompt Trace PSG/interpreter diagnostics, Atlas Lab provider/channel/slot assertions plus Remote Material Details summary/diagnostics assertions, Component Forge selector/atlas-slot assertion, local component lock plus Prompt Lab invalidation and new-building lock persistence, Assembly Hall stage reveal selection, active renderer backend assertion, Assembly Hall semantic selection, and backend-specific canvas pixel probe
provider-secret/server-cache client scan: passed, no `OPENAI_API_KEY`, `BUILDING_MATERIAL_PROVIDER`, `OPENAI_IMAGE_MODEL`, `BUILDING_REMOTE_MATERIAL_CACHE_FILE`, server route/provider/cache import, or test secret strings found in `src` or `dist`
OpenAI image provider/route/cache/timeout/concurrency/retry/durable-cache/cancellation/coalescing focused tests: passed, 21 tests across 3 server files with mocked transports and no real OpenAI calls
Provider cancellation/signal focused tests: passed, 33 tests across 4 files
Assembly fixture remote-material integration focused test stack: passed, 23 tests across 5 files
Remote application coordinator/client/bridge/compositor focused tests: passed, 16 tests across 4 files
Remote route client/bridge/decoder focused tests: passed, 12 tests across 3 files
Vite material-provider route host focused test: passed
Building state/controller and app remote-progress focused tests: passed, 21 tests across 2 files
Building state/controller, app remote-toggle, and fixture focused tests: passed, 27 tests across 3 files
Building state/controller completed-family persistence handoff and read-restore focused tests: passed, 19 tests in 1 file
Assembly Hall fixture focused tests: passed
App routing/document-id/IndexedDB-write/reload-restore/export-download/committed-rerun/cancel/remote-toggle/cache-selector focused tests: passed, 12 tests in 1 file
IndexedDB artifact persistence focused tests: passed, 2 tests in 1 file
Completed-family persistence packet and runtime-restore focused tests: passed, 3 tests in 1 file
Completed-family export bundle, reproduction verifier, and import packet adapter focused tests: passed, 3 tests in 1 file
Expanded prompt controls focused test: passed
Local component lock focused tests: passed
Artifact Trace focused test: passed
Component Forge focused test: passed
Atlas Lab provider/remote-detail focused tests: passed, 4 tests in 1 file
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

Milestone 6I introduced:

```text
src/features/building-family/ui/browserPngLayerDecoder.ts
src/features/building-family/tests/browserPngLayerDecoder.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6J introduced:

```text
src/features/building-family/state/remoteMaterialRouteClient.ts
src/features/building-family/tests/remoteMaterialRouteClient.test.ts
src/features/building-family/materials/remoteMaterialImageBridge.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6K introduced:

```text
server/building-family/viteMaterialProviderPlugin.ts
server/building-family/viteMaterialProviderPlugin.test.ts
vite.config.ts
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6L introduced:

```text
src/features/building-family/state/remoteMaterialApplicationCoordinator.ts
src/features/building-family/tests/remoteMaterialApplicationCoordinator.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6M introduced:

```text
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/tests/assemblyHallFixture.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6N introduced:

```text
src/features/building-family/state/buildingRunController.ts
src/features/building-family/tests/buildingState.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6O introduced:

```text
src/app/App.tsx
src/app/App.css
src/features/building-family/ui/AtlasLab.tsx
src/features/building-family/tests/atlasDebugExport.test.tsx
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6P introduced:

```text
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
src/features/building-family/core/invalidation.ts
src/features/building-family/state/buildingStore.ts
src/features/building-family/state/buildingRunController.ts
src/features/building-family/tests/buildingState.test.ts
src/features/building-family/ui/assemblyHallFixture.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6Q introduced:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
server/building-family/remoteMaterialArtifactCache.ts
server/building-family/remoteMaterialArtifactCache.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6R introduced:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
src/features/building-family/state/remoteMaterialRouteClient.ts
src/features/building-family/state/remoteMaterialApplicationCoordinator.ts
src/features/building-family/tests/remoteMaterialRouteClient.test.ts
src/features/building-family/tests/remoteMaterialApplicationCoordinator.test.ts
src/features/building-family/tests/assemblyHallFixture.test.ts
src/features/building-family/ui/assemblyHallFixture.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6S introduced:

```text
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
src/features/building-family/state/buildingRunController.ts
src/features/building-family/tests/buildingState.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6T introduced:

```text
server/building-family/materialProviderRoute.ts
server/building-family/materialProviderRoute.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6U introduced:

```text
src/app/App.tsx
src/app/App.css
src/app/App.test.tsx
src/features/building-family/state/buildingStore.ts
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

Milestone 6V introduced:

```text
src/app/App.tsx
src/app/App.test.tsx
src/app/runEventSelectors.ts
scripts/e2e-smoke.mjs
docs/architecture/dynamic-building-family-integration.md
```

Milestone 7A introduced:

```text
src/features/building-family/materials/artifactCache.ts
src/features/building-family/materials/indexedDbArtifactPersistence.ts
src/features/building-family/tests/indexedDbArtifactPersistence.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 7B introduced:

```text
src/features/building-family/state/completedFamilyPersistence.ts
src/features/building-family/tests/completedFamilyPersistence.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 7C introduced:

```text
src/features/building-family/state/buildingRunController.ts
src/features/building-family/tests/buildingState.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 7D introduced:

```text
src/app/App.tsx
src/app/App.test.tsx
docs/architecture/dynamic-building-family-integration.md
```

Milestone 7E introduced:

```text
src/features/building-family/state/buildingRunController.ts
src/features/building-family/tests/buildingState.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 7F introduced:

```text
src/features/building-family/state/completedFamilyPersistence.ts
src/features/building-family/ui/assemblyHallFixture.ts
src/features/building-family/tests/completedFamilyPersistence.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 7G introduced:

```text
src/app/App.tsx
src/app/App.test.tsx
docs/architecture/dynamic-building-family-integration.md
```

Milestone 7H introduced:

```text
src/features/building-family/state/completedFamilyExportBundle.ts
src/features/building-family/tests/completedFamilyExportBundle.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 7I introduced:

```text
src/app/App.tsx
src/app/App.test.tsx
docs/architecture/dynamic-building-family-integration.md
```

Milestone 7J introduced:

```text
src/features/building-family/state/completedFamilyExportVerifier.ts
src/features/building-family/tests/completedFamilyExportBundle.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Milestone 7K introduced:

```text
src/features/building-family/state/completedFamilyExportImport.ts
src/features/building-family/state/completedFamilyExportVerifier.ts
src/features/building-family/tests/completedFamilyExportBundle.test.ts
docs/architecture/dynamic-building-family-integration.md
```

Generated and ignored directories:

```text
node_modules/
dist/
test-results/
```

No preassembled meshes, configured live-provider proof, app-facing export import action, or Milestone 7 interactive 16-building orbit benchmark has been added yet. The current app can generate the browser vertical slice, inspect artifacts across the four rooms, write completed-family packets into IndexedDB, rebuild live Assembly Hall runtime fixtures from those packets, attempt route-document cached restore at startup before falling back to fresh procedural generation, create a JSON-portable completed-family export bundle from a validated completed-family packet, download that bundle from the active Prompt Lab completed run, verify from exported JSON that the portable atlas bytes plus exported graph reproduce the recorded procedural building and atlas identities, and convert that exported JSON back into a runtime-restorable completed-family packet. Remaining Milestone 7 work is app-facing import action/restore wiring, benchmark/performance documentation, detail-level switching, and compatibility/performance hardening.

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
