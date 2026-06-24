# Wild Construct Dynamic Building Family MVP
## Codex implementation plan

**Status:** implementation-ready plan  
**Target:** a real browser vertical slice that resolves a Prompt Spaghetti graph, generates a semantic trim/material atlas, constructs modular architectural components, and assembles a controllable building in a WebGPU-first Three.js scene.  
**Delivery mode:** implement as a sequence of small, reviewable milestones. Do not attempt the entire system in one unreviewed change.

---

## 1. Implementation directive

Build a new **Dynamic Building Family** feature inside the existing Wild Construct application. Preserve the repository's current framework, package manager, state conventions, build tooling, and test tooling. The logical architecture in this document is mandatory; the exact physical paths must be adapted to the repository during Milestone 0.

The first complete vertical slice must support this real pipeline:

```text
User prompt + seed + controls
        ↓
Prompt Spaghetti evaluation
        ↓
Resolved BuildingIntent + evaluation trace
        ↓
HistoricalStylePack constraint resolution
        ↓
BuildingFamilySpec
        ├───────────────┐
        ↓               ↓
AtlasPlanner       BuildingGraphBuilder
        ↓               ↓
Material sources   Component recipes
        ↓               ↓
AtlasPacker        Building compiler worker
        ↓               ↓
Semantic atlas     RuntimeBuildingIR
        └───────┬───────┘
                ↓
          Three.js adapter
                ↓
      WebGPU-first browser scene
```

The system must never infer structural geometry from a finished raster atlas. The atlas and the component geometry are sibling outputs of the same typed specification. The atlas provides surface appearance; component recipes provide dimensions, anchors, profiles, repetition behavior, and assembly rules.

---

## 2. Fixed technical decisions

These decisions are not open for reinterpretation during the MVP unless the repository audit proves one is impossible.

1. **Keep the existing React + Three.js + Zustand direction.** Do not introduce Babylon.js, Unity, Blender runtime, or a second renderer.
2. **Use TypeScript for all deterministic client-side domain logic.** A server route may be added for remote image generation, but the building grammar remains client-executable.
3. **Keep the core compiler renderer-independent.** Core packages may not import React, Three.js, browser DOM APIs, or application stores.
4. **Use a Web Worker for graph evaluation and geometry compilation.** Transfer typed-array buffers back to the main thread.
5. **Use Three.js `WebGPURenderer` only in the renderer adapter when the installed Three.js version supports it.** Preserve a WebGL 2 fallback. Do not make direct WebGPU API calls in the MVP.
6. **Use instancing for repeated windows, doors, frames, pilasters, and similar components.** Do not clone complete meshes for every occurrence.
7. **Do not use `Math.random()`.** All structural choices use a stable semantic seed tree.
8. **Do not build a full Geometry Nodes editor.** Build a serializable building graph and evaluator first. A visual editor is a later product surface.
9. **Do not add general mesh booleans.** Openings are represented with façade cells, recess planes, frames, and layered components.
10. **Do not make an image model the structural source of truth.** Remote generation contributes material detail and ornament masks; style packs and component recipes control geometry.
11. **The first provider is procedural and deterministic.** A remote image provider is added only after the procedural end-to-end path passes all acceptance tests.
12. **Every artifact is inspectable.** The UI must display the actual resolved spec, atlas, component recipes, generated components, assembly stages, seeds, hashes, and provenance.
13. **Every public serialized artifact has `schemaVersion`.** Schema changes require explicit migrations.
14. **No preassembled building model may ship with the feature.** Primitive meshes, authored profile point sets, and icons are allowed. Complete building, façade, window, door, and cornice meshes are not.

---

## 3. MVP scope

### In scope

- One rectangular footprint building type.
- One curated demonstration style pack, initially named `late-19c-commercial-demo`.
- Two through eight floors.
- Three through ten front-façade bays.
- Front, rear, and two side façades, with the front façade receiving the richest grammar.
- Ground/body/cornice vertical zoning.
- Wall, roof, glass, frame, sill, lintel, belt course, pilaster, cornice, and shallow ornament roles.
- Flat roof with parapet plus one simple pitched-roof option.
- Generated base-color, normal, ORM, height, and opacity atlas channels where applicable.
- Procedural brick, stucco, painted metal, wood, glass, and roof material sources.
- Parametric window, door, trim, cornice, pilaster, wall-panel, and roof components.
- Stable seed-based randomization, local locks, and narrow invalidation.
- Four-room web demonstration: Prompt Lab, Atlas Lab, Component Forge, Assembly Hall.
- One-building mode plus a small family-variants stress view.
- Optional remote image detail provider behind server configuration and a feature flag.

### Explicitly out of scope

- Arbitrary footprints or parcel fitting.
- General constructive solid geometry.
- Arbitrary text-to-mesh generation.
- Deep sculptural ornament, statues, or fully volumetric capitals.
- Automatic historically authoritative claims.
- A complete architectural style database.
- A user-facing Geometry Nodes clone.
- Production multi-tenant job infrastructure.
- Multiplayer editing.
- Unreal or Blender integration.
- Automatic LOD generation beyond a simple high/low component switch.
- Final district-scale optimization beyond a demonstrable stress test.

The demonstration style pack must be labelled `draft` or `demo` in its curation metadata. Do not imply that placeholder proportions are academically validated until a subject-matter expert reviews them.

---

## 4. Product boundary with Prompt Spaghetti

Prompt Spaghetti remains the stochastic intent editor. The building feature consumes its evaluation output; it does not embed geometry operations into the PSG evaluator.

The existing PSG v2 format and node types must remain loadable. The integration should be backward-compatible.

### Required PSG evaluator addition

Add or expose a detailed evaluation API with this conceptual result:

```ts
export interface PsgEvaluationResult {
  outputs: Array<{
    nodeId: string;
    value: string;
  }>;
  variables: Record<string, string | number | boolean | null>;
  trace: Array<{
    nodeId: string;
    nodeType: string;
    semanticPath: string;
    inputValues: unknown[];
    outputValue: unknown;
    selectedChoiceIndex?: number;
    seed: string;
  }>;
}
```

Do not require a new PSG file version for the first vertical slice if the evaluator can expose this result internally. If a serialized output declaration is required, add an optional, backward-compatible `outputKind` field to the existing Output node rather than changing existing node behavior.

### Building intent mapping

Add a `BuildingIntentAdapter` that maps namespaced PSG variables into typed intent fields. Initial names:

```text
building.stylePack
building.floorCount
building.bayCount
building.wallMaterial
building.roofType
building.windowFamily
building.trimDensity
building.corniceFamily
building.weathering
building.symmetry
```

Unknown variables must be ignored with a diagnostic. Invalid known variables must produce a validation error with the variable name, received value, and allowed values.

### Natural-language prompt handling

Define a provider interface:

```ts
export interface PromptInterpreter {
  interpret(input: PromptInterpretationInput): Promise<PromptInterpretationResult>;
}
```

Implement `LocalRulePromptInterpreter` first. It only needs to recognize:

- explicit floor counts such as “four floors” or “4 stories”;
- explicit bay counts;
- known material terms;
- known style-pack aliases;
- roof keywords;
- trim-density terms such as restrained, moderate, and ornate.

The local interpreter supplies overrides. PSG and the selected style pack fill all unspecified fields. A remote structured-output interpreter is a later provider and must not block the MVP.

---

## 5. Domain contracts

Implement runtime validation with the schema library already used by the repository. If none exists, use Zod after documenting the dependency in Milestone 0.

All contracts below need TypeScript types, runtime schemas, JSON fixtures, and schema tests.

### 5.1 `BuildingIntent`

Represents user and PSG intent before historical constraints are applied.

Required fields:

```ts
interface BuildingIntent {
  schemaVersion: "0.1.0";
  prompt: string;
  stylePackId?: string;
  requested: {
    floorCount?: number;
    bayCount?: number;
    wallMaterial?: string;
    roofType?: string;
    windowFamily?: string;
    trimDensity?: "restrained" | "moderate" | "ornate";
    corniceFamily?: string;
    weathering?: number;
    symmetry?: number;
  };
  seeds: {
    family: string;
    building: string;
    material: string;
    trim: string;
  };
  locks: SemanticLock[];
  psg: {
    sourceDocumentId?: string;
    evaluatedVariables: Record<string, unknown>;
    traceId: string;
  };
}
```

### 5.2 `HistoricalStylePack`

A curated constraint and distribution document. It controls what may be generated, not merely how a prompt is worded.

Required groups:

- identity: id, label, region, date range, typologies;
- curation: status, author, reviewer, notes, references;
- massing ranges: floor counts, floor heights, width/depth ranges;
- façade grammar: base/body/cornice proportions, bay rhythm, symmetry range;
- component families: allowed windows, doors, trims, roofs, pilasters;
- compatibility matrix: allowed and forbidden combinations;
- material palette and weights;
- weighted distributions for optional features;
- material prompt vocabulary;
- component recipe parameter ranges;
- variation policy: family-level versus building-level properties.

Do not put generated images or Three.js objects inside a style pack.

### 5.3 `BuildingFamilySpec`

The normalized, constrained source of truth for one generated building family.

Required groups:

```ts
interface BuildingFamilySpec {
  schemaVersion: "0.1.0";
  familyId: string;
  sourceIntentHash: string;
  stylePackId: string;
  seeds: BuildingIntent["seeds"];
  massing: {
    widthM: number;
    depthM: number;
    floorCount: number;
    floorHeightsM: number[];
    parapetHeightM: number;
    roof: { type: "flat" | "gable"; pitchDegrees?: number };
  };
  facade: {
    frontBayCount: number;
    sideBaySpacingM: number;
    groundFloorRatio: number;
    corniceHeightM: number;
    symmetry: number;
  };
  selectedFamilies: {
    wall: string;
    roof: string;
    window: string;
    door: string;
    cornice: string;
    trim: string;
    pilaster?: string;
    ornament?: string;
  };
  materialParameters: Record<string, unknown>;
  componentParameters: Record<string, unknown>;
  variationPolicy: Record<string, "family" | "building" | "element">;
  locks: SemanticLock[];
  diagnostics: Diagnostic[];
}
```

Normalization must clamp requested values to style-pack constraints and emit diagnostics. It must never silently accept invalid combinations.

### 5.4 `AtlasManifest`

The semantic contract between material generation and geometry.

```ts
interface AtlasManifest {
  schemaVersion: "0.1.0";
  atlasId: string;
  widthPx: number;
  heightPx: number;
  paddingPx: number;
  channels: Array<"baseColor" | "normal" | "orm" | "height" | "opacity">;
  slots: AtlasSlot[];
}

interface AtlasSlot {
  id: string;
  role:
    | "wall"
    | "roof"
    | "glass"
    | "frame"
    | "door"
    | "horizontalTrim"
    | "verticalTrim"
    | "ornament";
  rectPx: { x: number; y: number; width: number; height: number };
  uvMode: "repeat" | "repeat-x" | "cap-repeat-cap" | "nine-slice" | "stretch";
  periodicity: "none" | "x" | "xy";
  physicalSizeM: { width: number; height: number };
  materialSourceId: string;
  profileRecipeId?: string;
  compatibilityTags: string[];
  generationPrompt: string;
  seedPath: string;
}
```

The initial atlas is 1024×1024 with at least 12 px of slot padding. Resolution must remain configurable. The packer must dilate slot edges into padding to reduce mip bleeding.

### 5.5 `ComponentRecipe`

Components are typed recipes over a small primitive vocabulary. They are not imported meshes.

Initial recipe kinds:

```text
boxAssembly
frame
recess
profileSweep
panel
flatRoof
gableRoof
```

Each recipe contains:

- normalized dimensions;
- allowed parameter ranges;
- anchor points and attachment plane;
- optional subcomponent references;
- atlas slot references;
- UV behavior;
- semantic role;
- family/building/element variation scope;
- low-detail fallback recipe.

A cornice recipe must refer to both a vector profile and a matching atlas slot. Never derive the profile from the atlas pixels.

### 5.6 `BuildingGraph`

Use a separate typed graph from PSG. It may reuse generic graph utilities but not PSG's text-value evaluator.

Initial node types:

```text
CreateRectFootprint
ExtrudeMassing
ForEachFacade
SplitFloors
SplitBays
EmitWallPanel
PlaceOpening
InstanceComponent
SweepProfile
EmitRoof
Group
OutputBuilding
```

Every node requires:

- stable id;
- type;
- typed parameters;
- upstream ids;
- semantic path template;
- assembly stage tag: `massing`, `facade`, `openings`, `trim`, or `roof`.

The graph must validate as acyclic before evaluation.

### 5.7 `RuntimeBuildingIR`

The compiler output. It must be serializable and transferable across a worker boundary.

```ts
interface RuntimeBuildingIR {
  schemaVersion: "0.1.0";
  buildingId: string;
  familyId: string;
  sourceGraphHash: string;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  meshBatches: MeshBatchIR[];
  instanceBatches: InstanceBatchIR[];
  semanticIndex: Array<{
    semanticPath: string;
    batchId: string;
    elementIndex?: number;
    stage: AssemblyStage;
  }>;
  metrics: {
    vertexCount: number;
    triangleCount: number;
    instanceCount: number;
  };
}
```

Typed arrays must use transferable `ArrayBuffer`s. Do not send large numeric arrays as JSON.

### 5.8 `GenerationRun`

Tracks actual work and powers the room progression.

Stages:

```text
idle
resolvingPrompt
evaluatingPsg
normalizingSpec
planningAtlas
generatingMaterialSources
compositingChannels
packingAtlas
buildingComponentCatalog
buildingGraph
compilingGeometry
uploadingGpuResources
complete
failed
cancelled
```

Each event records start/end time, inputs hash, output artifact id, provider, cache hit status, and error details. UI progress must be driven by these events, not by timers.

---

## 6. Determinism and semantic randomness

Implement a small deterministic seed library in the core package.

Required API:

```ts
interface SeedTree {
  readonly root: string;
  fork(path: string): SeedTree;
  uint32(path?: string): number;
  float01(path?: string): number;
  int(minInclusive: number, maxInclusive: number, path?: string): number;
  chooseWeighted<T>(items: Array<{ value: T; weight: number }>, path?: string): T;
}
```

Use a stable integer hash and PRNG whose behavior is identical in supported browsers and Node tests. Document the algorithm. Never depend on object property iteration order; sort keys before hashing.

Semantic paths use this form:

```text
building/{buildingId}/facade/{front|rear|left|right}/floor/{index}/bay/{index}/{role}/{subrole}
```

Examples:

```text
building/b-001/facade/front/floor/0/bay/2/door/frame
building/b-001/facade/front/floor/3/bay/4/window/lintel
building/b-001/facade/front/cornice/primary
```

Adding a top floor must not reroll existing lower-floor components. Changing a door lock must not reroll unrelated windows. Random choices are resolved by semantic path, not by sequential calls.

For remote image generation, exact model reproducibility must not be assumed. Persist the generated result in the artifact cache and record both `requestHash` and `contentHash`.

---

## 7. Material and atlas pipeline

### 7.1 Atlas planning

`AtlasPlanner` consumes `BuildingFamilySpec` and returns a deterministic `AtlasManifest` before any pixels are generated.

Initial slots:

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

The planner must fail if slots overlap, fall outside bounds, omit required padding, or reference an unknown material source/profile.

### 7.2 Material source abstraction

```ts
interface MaterialGenerationProvider {
  readonly id: string;
  generate(request: MaterialSourceRequest, signal: AbortSignal): Promise<MaterialSourceArtifact>;
}
```

Implement these providers in order:

1. `ProceduralMaterialProvider` — mandatory, deterministic, browser-capable.
2. `FixtureMaterialProvider` — test-only, returns tiny known images.
3. `OpenAIImageMaterialProvider` — optional production path, server-only, feature-flagged.

Do not return a complete atlas from a provider. Return named material-source images or masks. `AtlasPacker` owns slot placement.

### 7.3 Procedural provider

Generate actual texture data at runtime using `OffscreenCanvas` where available and a normal canvas fallback otherwise.

Required procedural sources:

- running-bond brick with mortar mask and height;
- stucco/plaster noise with cracks and weathering mask;
- painted metal with edge wear and patina mask;
- painted wood with grain and roughness variation;
- roof membrane or simple roof tile;
- glass tint/roughness;
- generic ornament alpha/height mask.

The provider returns source layers rather than only base color:

```ts
interface MaterialSourceArtifact {
  sourceId: string;
  widthPx: number;
  heightPx: number;
  layers: {
    baseColor: ImageBitmap | Blob;
    height?: ImageBitmap | Blob;
    roughness?: ImageBitmap | Blob;
    metalness?: ImageBitmap | Blob;
    opacity?: ImageBitmap | Blob;
  };
  requestHash: string;
  contentHash: string;
  provenance: ArtifactProvenance;
}
```

### 7.4 Hybrid remote generation

The remote provider adds style-specific color, patina, paint, and shallow ornament detail. It does not replace the procedural substrate.

Limit the initial remote generation to three or four source requests per family:

```text
masonry color/detail overlay
roof color/detail overlay
wood-or-metal trim color/detail overlay
optional shallow ornament mask
```

Composite remote detail over deterministic procedural height and material masks. Derive normals from the procedural height channel. This avoids channel misalignment and gives the atlas reliable tileability and scale.

Server requirements:

- API key is server-only.
- Provider model is configured through environment variables.
- Validate role, prompt length, image dimensions, output format, and request count.
- Return provenance, request hash, content hash, provider id, and revised prompt when available.
- Cache successful artifacts by request hash.
- Use a concurrency limit.
- Support cancellation at the orchestration level even when an upstream request cannot be stopped.
- Fall back to the procedural provider with a visible diagnostic when remote generation is unavailable.

### 7.5 Atlas compositing and packing

`AtlasPacker` creates the final channel images from sources and the manifest.

Required behavior:

- respect slot bounds and padding;
- apply x/xy periodic transforms based on `periodicity`;
- implement edge blending for periodic remote overlays;
- generate normal from height;
- pack occlusion/roughness/metalness into ORM;
- dilate slot borders;
- retain a source-to-slot provenance map;
- calculate a content hash for every channel;
- expose channel canvases or blobs for the Atlas Lab and renderer;
- provide exact atlas images to the renderer. The renderer may not regenerate or substitute them.

---

## 8. Component generation and building compiler

### 8.1 Primitive vocabulary

Implement only these geometry primitives for the MVP:

```text
quad
box
frame
extruded polygon
profile sweep
flat roof plane
gable roof prism
```

Provide deterministic builders that output typed arrays. Avoid relying on Three.js geometry generators in the core compiler.

### 8.2 Initial components

Implement parameterized recipe builders for:

- wall panel;
- recessed window opening;
- window frame and glass;
- door frame, panel, and transom option;
- sill;
- lintel;
- belt course;
- pilaster;
- primary cornice;
- parapet cap;
- flat roof;
- gable roof.

Repeated components use normalized geometry plus transform scaling where UV behavior permits it. Components with fixed caps and repeated centers may emit a small unique mesh batch.

### 8.3 Façade grammar

For a rectangular mass:

1. Create the footprint.
2. Extrude the mass to the sum of floor heights plus parapet.
3. Create four façade coordinate frames.
4. Split each façade into floors from ground upward.
5. Split front/rear floors into bays.
6. Emit wall cells.
7. Place doors only on valid ground-floor bays.
8. Place windows on eligible bays.
9. Emit sills, lintels, belt courses, pilasters, and cornice from style rules.
10. Emit roof and parapet.
11. Group results by component recipe, atlas slot, detail level, and material.
12. Produce semantic index and assembly-stage tags.

The building compiler must not contain historical style names. It consumes normalized recipes and dimensions.

### 8.4 Worker boundary

Create a dedicated compiler worker with messages equivalent to:

```ts
type CompilerWorkerRequest =
  | { type: "compile"; requestId: string; spec: BuildingFamilySpec; graph: BuildingGraph; catalog: ComponentCatalog }
  | { type: "cancel"; requestId: string };

type CompilerWorkerResponse =
  | { type: "progress"; requestId: string; stage: string; completed: number; total: number }
  | { type: "complete"; requestId: string; ir: RuntimeBuildingIR }
  | { type: "error"; requestId: string; error: SerializedError };
```

Transfer all typed-array buffers in the `complete` response. The worker must discard stale results after cancellation or a newer generation request.

---

## 9. Three.js renderer adapter

All Three.js imports live in the renderer adapter or UI layer.

Required responsibilities:

- convert `MeshBatchIR` into `BufferGeometry`;
- convert `InstanceBatchIR` into `InstancedMesh`;
- create and share atlas textures;
- implement atlas-aware UV sampling for `repeat`, `repeat-x`, `cap-repeat-cap`, and `nine-slice` behavior used by the MVP;
- select WebGPU-first rendering when supported by the installed version;
- maintain a WebGL 2 fallback;
- set `userData.semanticPath` or a lookup id for picking;
- compute bounds after instance transforms;
- dispose geometry, materials, textures, and instance buffers on replacement;
- expose stage groups for real assembly animation;
- expose renderer metrics such as draw calls, triangles, textures, and GPU backend.

Prefer Three.js node materials/TSL for the atlas material when the installed version supports them. If the repository is pinned to an older compatible version, isolate any shader fallback behind the same `BuildingAtlasMaterialFactory` interface. Do not scatter renderer-version checks across the feature.

### Runtime separation

Create two runtime objects:

```text
BuildingFamilyRuntime
  shared atlas textures
  shared component geometries
  shared materials
  component recipe/catalog lookup

BuildingInstanceRuntime
  unique massing meshes
  instance transforms
  semantic index
  assembly stage groups
```

This is required for generating many buildings from one family without duplicating family assets.

---

## 10. Application state and orchestration

Use the repository's existing Zustand conventions. If it uses slices, add these logical slices:

```text
buildingPromptSlice
buildingRunSlice
buildingArtifactSlice
buildingControlSlice
buildingSelectionSlice
buildingRendererSlice
```

Do not put `ImageBitmap`, Three.js objects, or large typed arrays into persisted state. Store artifact ids and keep heavyweight objects in an artifact/runtime registry.

### Required services

```text
BuildingRunController
PsgBuildingIntentAdapter
BuildingSpecNormalizer
AtlasPlanner
MaterialGenerationCoordinator
AtlasPacker
ComponentCatalogBuilder
BuildingGraphBuilder
BuildingCompilerClient
BuildingSceneAdapter
BuildingArtifactCache
```

`BuildingRunController` is the only UI-facing orchestrator. Components must not directly call providers or workers.

### Cancellation and stale work

Every new family generation creates a run id and `AbortController`. When the user starts a new run:

- cancel prior network work where possible;
- send cancellation to the compiler worker;
- ignore all prior run events and results;
- release unused bitmaps and blobs;
- retain cached completed artifacts.

---

## 11. Dependency invalidation

Implement and test `computeBuildingInvalidation(previous, next)`.

| Change | Re-evaluate PSG | Normalize spec | Atlas plan | Material sources | Pack atlas | Catalog | Graph | Geometry IR | GPU scene |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Prompt | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Style pack | no | yes | yes | yes | yes | yes | yes | yes | yes |
| Family seed | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Material seed | no | partial | no | yes | yes | no | no | no | material refresh |
| Trim seed | no | partial | partial | trim only | yes | trim only | yes | yes | yes |
| Floor count | no | partial | no | no | no | no | yes | yes | yes |
| Bay count | no | partial | no | no | no | no | yes | yes | yes |
| Building seed | no | partial | no | no | no | no | yes | yes | yes |
| Local component lock | no | partial | no | no | no | partial | branch | branch/full MVP | yes |
| Weathering | no | partial | no | affected sources | yes | no | no | no | material refresh |

For the MVP, a branch invalidation may recompile the full building IR as long as it never regenerates unaffected material sources. Preserve the API so branch-level compiler reuse can be added later.

---

## 12. Four-room demonstration

Implement one feature route or launchable tool surface with a persistent generation session and four views.

### Room 1 — Prompt Lab

Display:

- text prompt;
- PSG document/preset selector;
- family, building, material, and trim seeds;
- style-pack selection;
- explicit floor and bay controls;
- generate and cancel actions;
- resolved `BuildingIntent`;
- PSG selected choices and trace;
- style-pack diagnostics and clamped values.

The first preset should generate a late-19th-century commercial façade family. It may use placeholder historical data labelled `demo`.

### Room 2 — Atlas Lab

Display the actual `AtlasManifest` immediately, before source generation finishes.

Then fill slots as work completes. Include:

- base color, normal, ORM, height, and opacity tabs;
- slot outlines and semantic ids;
- physical scale and UV mode;
- provider and cache-hit status;
- source prompt and seed path;
- per-source progress/error/fallback;
- final channel content hashes.

The canvas or texture shown here must be the exact object/blob uploaded to the renderer.

### Room 3 — Component Forge

Display real generated components in an exploded grid:

- window;
- door;
- sill/lintel;
- pilaster;
- belt course;
- cornice;
- wall panel;
- roof.

Controls:

- component selector;
- wireframe;
- UV overlay;
- semantic anchors;
- recipe JSON;
- dimensions;
- atlas slot highlight.

No complete component mesh may be loaded from a GLB or OBJ.

### Room 4 — Assembly Hall

Display the assembled building and reveal actual scene groups in this order:

```text
massing → façade panels → openings → trim → roof
```

The reveal is driven by `RuntimeBuildingIR.stage` tags. It is not a prerecorded animation.

Controls:

- floors;
- bays;
- building seed;
- trim seed;
- material seed;
- roof type;
- trim density;
- new family;
- new building;
- lock/unlock selected element;
- show provenance;
- show semantic paths;
- show performance metrics.

Changing floors or bays must not trigger material generation. “New building” must reuse the family atlas and catalog. “New family” may regenerate both.

### Family variants stress view

Add a secondary view that generates at least 16 building instances from the same family with distinct building seeds. Share the family runtime. This is a correctness and architecture demonstration, not a district editor.

---

## 13. Artifact caching and provenance

Implement an artifact registry keyed by canonical input hashes.

Artifact types:

```text
psg-evaluation
building-intent
building-family-spec
atlas-manifest
material-source
atlas-channel
component-catalog
building-graph
runtime-building-ir
```

Every artifact records:

```ts
interface ArtifactProvenance {
  artifactId: string;
  artifactType: string;
  schemaVersion: string;
  requestHash: string;
  contentHash: string;
  createdAt: string;
  provider: string;
  sourceArtifactIds: string[];
  seedPaths: string[];
  diagnostics: Diagnostic[];
}
```

Milestone 1 may use an in-memory cache. Add IndexedDB persistence only after the end-to-end flow passes. Never persist API keys or provider secrets.

Use canonical JSON for request hashes. Binary content receives a separate SHA-256 content hash.

---

## 14. Logical module layout

Map these logical modules to existing repository conventions. Do not reorganize unrelated code.

```text
building-family/
  contracts/
    buildingIntent.ts
    historicalStylePack.ts
    buildingFamilySpec.ts
    atlasManifest.ts
    componentRecipe.ts
    buildingGraph.ts
    runtimeBuildingIR.ts
    generationRun.ts
    index.ts

  core/
    seedTree.ts
    canonicalJson.ts
    contentHash.ts
    diagnostics.ts
    specNormalizer.ts
    invalidation.ts
    semanticPaths.ts

  psg/
    psgBuildingIntentAdapter.ts
    localRulePromptInterpreter.ts
    fixtures/

  style-packs/
    late-19c-commercial-demo.json

  materials/
    atlasPlanner.ts
    atlasPacker.ts
    normalFromHeight.ts
    periodicBlend.ts
    providers/
      proceduralMaterialProvider.ts
      fixtureMaterialProvider.ts
      openAIImageMaterialProvider.server.ts

  components/
    componentCatalogBuilder.ts
    primitiveBuilders.ts
    frameBuilder.ts
    profileSweepBuilder.ts
    roofBuilder.ts
    profiles/

  compiler/
    buildingGraphBuilder.ts
    buildingCompiler.ts
    compiler.worker.ts
    compilerClient.ts

  renderer-three/
    buildingSceneAdapter.ts
    buildingAtlasMaterialFactory.ts
    familyRuntime.ts
    instanceRuntime.ts
    resourceDisposal.ts

  state/
    buildingStore.ts
    slices/

  ui/
    BuildingFamilyTool.tsx
    PromptLab.tsx
    AtlasLab.tsx
    ComponentForge.tsx
    AssemblyHall.tsx
    ArtifactTracePanel.tsx
    BuildingControls.tsx

  tests/
    fixtures/
    integration/
    performance/
```

If the repository is a monorepo, prefer separate packages for contracts/core/compiler and keep the UI adapter in the application package. If it is a single application, preserve the boundaries under `src/features/building-family`.

---

## 15. Milestone sequence

Each milestone should be a separate branch or PR-sized change. Codex must stop after completing and verifying one milestone unless explicitly instructed to continue.

### Milestone 0 — Repository reconnaissance and integration map

**Production code:** none.

Tasks:

1. Read root and nested `AGENTS.md` files.
2. Identify package manager, workspace layout, TypeScript configuration, app entry points, renderer initialization, state layout, worker patterns, server/API conventions, test commands, lint/typecheck commands, and asset handling.
3. Locate PSG schemas, evaluator, import/export code, variable semantics, graph fixtures, and tests.
4. Locate the installed Three.js version and determine whether `WebGPURenderer`, TSL, workers, and instancing can be used without upgrades.
5. Identify the nearest existing feature/tool shell where this should launch.
6. Write `docs/architecture/dynamic-building-family-integration.md` with actual paths, selected module locations, commands, dependency decisions, and conflicts with this plan.
7. Add or amend a concise repository `AGENTS.md` only when necessary; do not replace existing instructions.
8. Produce a proposed file list for Milestone 1.

Exit criteria:

- No production behavior changed.
- Actual build, lint, typecheck, and test commands are documented.
- Every conceptual module in this plan has an intended repository location.
- Any required dependency or version upgrade is listed but not yet performed.

### Milestone 1 — Contracts, seed tree, PSG adapter, and one style pack

Tasks:

1. Implement the runtime schemas and TypeScript contracts.
2. Implement canonical JSON and content/request hashing.
3. Implement `SeedTree` and semantic paths.
4. Expose detailed PSG evaluation without breaking existing PSG files.
5. Implement `PsgBuildingIntentAdapter`.
6. Implement `LocalRulePromptInterpreter`.
7. Implement `BuildingSpecNormalizer` and compatibility diagnostics.
8. Add the `late-19c-commercial-demo` style pack.
9. Add representative JSON/PSG fixtures.
10. Add unit tests and one integration test from PSG evaluation to normalized spec.

Required tests:

- same seed and input produce byte-equivalent canonical spec JSON;
- changing only building seed does not change family-scoped fields;
- adding a floor does not change semantic random choices for existing lower floors;
- invalid style-pack combinations are rejected or normalized with diagnostics;
- old PSG fixtures still load and evaluate;
- unknown namespaced variables generate diagnostics but do not crash.

Exit criteria:

- A test or small dev command resolves a fixture PSG and prompt into a validated `BuildingFamilySpec` plus trace.
- No Three.js or React imports appear in the contracts/core modules.

### Milestone 2 — Semantic atlas and procedural material generation

Tasks:

1. Implement `AtlasPlanner` and manifest validation.
2. Implement procedural source generators.
3. Implement normal-from-height, ORM packing, periodic blending, border dilation, and slot compositing.
4. Implement `AtlasPacker`.
5. Implement in-memory artifact cache and provenance.
6. Add a development-only atlas inspector component or route.
7. Add channel export to PNG for debugging.

Required tests:

- slot rectangles never overlap and remain within bounds;
- repeated runs produce identical manifest and procedural channel hashes;
- x-periodic slots match at left/right edges within a defined tolerance;
- xy-periodic slots match on both axes;
- normal and ORM dimensions match base color;
- border padding contains dilated source pixels;
- every atlas slot maps to an existing source and optional profile.

Exit criteria:

- A fixture spec produces a visible, generated multi-channel atlas with semantic slot overlays and provenance.

### Milestone 3 — Component catalog, building graph, and pure compiler

Tasks:

1. Implement primitive geometry builders.
2. Implement component recipe builders.
3. Implement `ComponentCatalogBuilder`.
4. Implement `BuildingGraphBuilder`.
5. Implement graph validation and compiler evaluation.
6. Emit mesh and instance batches plus semantic index.
7. Add compiler worker and transferable buffers.
8. Add geometry diagnostics and metrics.

Required tests:

- graph cycles and missing upstream nodes fail validation;
- compiler output is deterministic by logical hash;
- all indices are in range;
- normals and UV counts match vertex counts;
- bounds contain all mesh and instance transforms;
- repeated windows produce an instance batch rather than duplicated mesh data;
- every emitted element has a semantic path and assembly stage;
- cancellation prevents stale worker output from becoming active.

Exit criteria:

- A fixture spec compiles in a worker to `RuntimeBuildingIR` without any Three.js dependency.
- A component fixture gallery can be produced from IR data.

### Milestone 4 — Three.js adapter and rendered fixture

Tasks:

1. Implement IR-to-Three geometry conversion.
2. Implement shared family runtime and per-building runtime.
3. Implement atlas-aware material sampling.
4. Implement instanced batches.
5. Implement WebGPU-first renderer selection behind the existing renderer integration.
6. Implement selection lookup and stage groups.
7. Implement complete resource disposal.
8. Add a developer route rendering one fixture building and component gallery.

Required tests/checks:

- renderer uses the exact atlas channel artifacts shown by the atlas inspector;
- changing geometry IR disposes replaced resources;
- one shared family runtime can support at least 16 building runtimes;
- repeated components use `InstancedMesh`;
- WebGL 2 fallback renders when WebGPU is disabled;
- no complete building-model network request occurs.

Exit criteria:

- A deterministic fixture building renders with the generated atlas and generated components.
- Backend and draw-call metrics are visible.

### Milestone 5 — Four-room end-to-end demo and invalidation

Tasks:

1. Implement `BuildingRunController` and generation event stream.
2. Implement Zustand state slices and artifact registry integration.
3. Implement all four rooms.
4. Implement actual stage-driven assembly reveal.
5. Implement invalidation matrix.
6. Implement floor, bay, seed, roof, trim density, new family, and new building controls.
7. Implement element selection and lock/unlock for component variant.
8. Implement trace/provenance panel.
9. Implement cancellation and stale-run protection.
10. Implement 16-variant family stress view.

Required end-to-end tests:

- user can enter a prompt and reach a rendered building without fixture-only shortcuts;
- floor-count changes issue zero material-generation calls;
- new-building reuses atlas and component catalog artifact ids;
- new-family creates a new family artifact chain;
- the Atlas Lab channel hash equals the renderer texture source hash;
- component selection highlights its atlas slot and semantic recipe;
- cancel during generation leaves the prior completed scene valid;
- same prompt and seeds reproduce the same procedural run hashes;
- locked component persists across unrelated rerolls.

Exit criteria:

- The four-room flow is usable from the application shell.
- All stages display real artifacts and real task events.
- No prerecorded building assembly or preassembled mesh is used.

### Milestone 6 — Remote image detail provider

Tasks:

1. Add a server-only material-provider route following existing API conventions.
2. Implement `OpenAIImageMaterialProvider` behind `BUILDING_MATERIAL_PROVIDER=openai`.
3. Read model name from `OPENAI_IMAGE_MODEL`; do not hardcode it in browser code.
4. Generate only the approved material source roles.
5. Composite remote overlays over procedural substrates.
6. Add request caching, concurrency limit, timeout handling, retry policy, and fallback.
7. Surface provider, revised prompt, cache status, and errors in Atlas Lab.
8. Add mocked integration tests. Do not spend real API credits in automated tests.

Required tests:

- no API key is exposed to the client bundle;
- unsupported roles and oversized requests are rejected;
- provider failure falls back to procedural output and records a diagnostic;
- repeated request hash returns cached content;
- remote overlay changes atlas content without changing structural geometry;
- floor and bay controls never call the remote provider.

Exit criteria:

- With server configuration present, a real remote image request contributes visible material detail to the final atlas.
- Without configuration, the full demo continues to work procedurally.

### Milestone 7 — Persistence, export, and performance hardening

Tasks:

1. Add IndexedDB artifact persistence keyed by schema and request hash.
2. Add a small export bundle containing spec, style-pack reference, atlas manifest/channels, component catalog, graph, provenance, and optional glTF.
3. Add a benchmark scene for 100 building instances from one family.
4. Add simple high/low component detail switching.
5. Profile CPU compile time, worker transfer size, GPU memory, triangles, instances, draw calls, and frame time.
6. Fix resource leaks and major stalls.
7. Add compatibility diagnostics for unsupported browser/GPU features.

Performance targets, not hard CI gates:

- one 8-floor, 10-bay building compiles in the worker without a perceptible UI freeze;
- no single main-thread generation task exceeds 50 ms under normal demo conditions;
- one building remains below 150,000 triangles at high detail;
- repeated windows/doors/trims are instanced;
- a 16-building family view maintains interactive orbiting on a representative development machine;
- family assets are shared rather than copied per building.

Exit criteria:

- Reload can restore a cached completed family.
- Exported data can reproduce the procedural building and atlas.
- Benchmark results and known limitations are documented.

---

## 16. Acceptance criteria for the complete MVP

The feature is complete only when all of the following are true:

1. No preassembled building, façade, window, door, cornice, or roof mesh is shipped or fetched.
2. A user prompt, PSG evaluation, style pack, and seeds produce a validated spec with an inspectable trace.
3. The atlas layout exists before image generation and every slot has semantic metadata.
4. The atlas shown in Atlas Lab is exactly the atlas sampled by the final building.
5. Components shown in Component Forge are generated from the same recipes used in the final building.
6. Assembly Hall reveals actual generated scene groups, not a canned animation.
7. Same procedural inputs produce the same logical artifacts and content hashes.
8. Structural controls do not trigger material generation.
9. “New building” reuses the family atlas and component catalog.
10. Every rendered element can be traced to a semantic path, component recipe, atlas slot, and seed path.
11. Local component locks survive unrelated rerolls.
12. WebGPU-first rendering has a functioning WebGL 2 fallback.
13. Replaced runs release GPU and image resources.
14. Provider failure produces a visible diagnostic and a functional procedural fallback.
15. Automated tests cover determinism, validation, invalidation, atlas packing, geometry integrity, worker cancellation, and orchestration.
16. Build, lint, typecheck, unit tests, and relevant end-to-end tests pass.
17. The feature is accessible from the Wild Construct product shell as a launchable tool or document surface rather than a disconnected demo page.

---

## 17. Risk register and required mitigations

| Risk | Required mitigation |
|---|---|
| Generated images are not tileable | Generate material sources per role; edge-blend remote overlays; use procedural substrate for authoritative height and repetition. |
| Raster atlas cannot describe geometry | Keep component recipes and vector profiles as sibling artifacts; never infer structural dimensions from pixels. |
| WebGPU/Three.js API churn | Isolate all renderer-specific code; inspect installed version in Milestone 0; retain WebGL 2 fallback. |
| Changing one control rerolls everything | Semantic seed tree, explicit variation scopes, and invalidation tests. |
| Too many meshes and draw calls | Shared family runtime, instanced repeated components, grouped batches. |
| Geometry compiler blocks UI | Worker execution and transferable buffers. |
| Atlas mip bleeding | Slot padding, border dilation, atlas-aware sampling. |
| Historical style errors | Curated packs, compatibility rules, curation status, diagnostics, and no claim of authority for demo content. |
| Remote generation cost/latency | Three-to-four source requests per family, low/medium quality config, request cache, procedural fallback. |
| Stale async work overwrites current run | Run ids, AbortController, worker cancellation, stale-result rejection. |
| Memory leaks across rerolls | Central runtime registry and explicit disposal tests/checklists. |
| Scope expands into a full node editor | Keep `BuildingGraph` serializable but programmatically generated for MVP. |

---

## 18. Suggested repository `AGENTS.md` section

Merge this into the existing repository guidance only after Milestone 0 confirms the correct commands and paths.

```md
## Dynamic Building Family feature

- Read `docs/plans/dynamic-building-family.md` and the closest architecture decision record before changing this feature.
- Work one milestone at a time. Do not combine milestones without explicit instruction.
- Preserve the existing package manager, application framework, renderer integration, and state conventions.
- Core building contracts/compiler modules may not import React, Three.js, Zustand, or DOM APIs.
- Do not use `Math.random()`; use the semantic `SeedTree`.
- Do not add preassembled building or architectural component meshes.
- Do not place provider secrets in client code.
- Every serialized artifact must be schema-versioned and runtime-validated.
- Every emitted geometry element must have a semantic path and provenance.
- Structural-control changes must not regenerate material artifacts.
- Add or update tests for every behavior change.
- Before finishing, run the documented format, lint, typecheck, unit, integration, and relevant end-to-end commands.
- Review the final diff for unrelated changes, leaked resources, stale async updates, and accidental nondeterminism.
```

---

## 19. First prompt to give Codex

Paste this plan into `docs/plans/dynamic-building-family.md`, then start with this prompt:

```text
Read all active AGENTS.md instructions and docs/plans/dynamic-building-family.md.

Execute Milestone 0 only. Do not write production feature code yet.

Inspect the repository and produce docs/architecture/dynamic-building-family-integration.md containing:
1. the actual repository and package layout;
2. current build, dev, lint, typecheck, unit-test, and end-to-end commands;
3. exact paths for the PSG schema, evaluator, imports/exports, fixtures, and tests;
4. exact paths for the React app shell, Three.js renderer setup, Zustand state, worker patterns, server routes, and feature routing;
5. installed versions relevant to the plan, especially Three.js and schema/test libraries;
6. the concrete path mapping for every logical module in the implementation plan;
7. required dependencies or version changes, with justification;
8. conflicts, ambiguities, and recommended resolutions;
9. the proposed files for Milestone 1;
10. a concise verification report showing the commands you ran and their results.

Preserve all existing instructions. Do not reorganize unrelated code. Do not add dependencies. Do not begin Milestone 1. End with a diff review and a checklist against Milestone 0 exit criteria.
```

After Milestone 0 is reviewed, use this prompt pattern for each subsequent milestone:

```text
Read all active AGENTS.md instructions, docs/plans/dynamic-building-family.md, and docs/architecture/dynamic-building-family-integration.md.

Implement Milestone <N> only. Before editing, restate the milestone's file-level plan using actual repository paths. Then implement it, add the required tests, run all relevant checks, inspect the final diff, and report:
- files changed;
- architecture decisions made;
- tests and commands run with results;
- acceptance/exit criteria satisfied;
- remaining limitations that belong to later milestones.

Do not implement later milestones. Do not add a production dependency unless Milestone 0 approved it or you document why it is unavoidable.
```

---

## 20. Source alignment notes

- The current PSG asset guide identifies `.psg` as a JSON graph format at version `2.0.0`, with nodes including `TextBlock`, `WeightedChoice`, `Concat`, `Output`, `Include`, `SetVariable`, and `GetVariable`, and points to the core graph schema as the validation source. This plan preserves that format and adds a consumer-facing detailed evaluation result rather than replacing it.
- Existing Wild Construct planning treats Prompt Spaghetti as a possible launchable editor/document mode within a broader worldbuilding surface. This plan follows that boundary: PSG resolves intent; the Dynamic Building Family feature owns geometry/material compilation.
- Existing project planning uses React, Three.js, and Zustand for web authoring. This plan keeps that stack and adds an engine-independent compiler plus a narrow renderer adapter.

