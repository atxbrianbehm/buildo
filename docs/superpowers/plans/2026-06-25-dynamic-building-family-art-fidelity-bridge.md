# Dynamic Building Family Art Fidelity Bridge Plan

## Goal

Move the Dynamic Building Family from a readable procedural proof of concept toward a stylized modular apartment-kit level of fidelity while preserving the core Buildo rules:

- geometry remains generated from typed component and building contracts;
- no complete building, facade, window, door, or cornice mesh is imported as the source of truth;
- structural and material variation stays deterministic from semantic seeds;
- core contracts, graph building, component generation, and compilation stay renderer-independent;
- Three.js remains the browser adapter, with WebGL/WebGPU compatibility preserved.

The target is not to copy a marketplace asset pack. The target is to learn the production standard: modular pieces, grid alignment, profiled trims, material maps, believable openings, facade rhythm, and presentation modes that make the generated buildings legible as buildings rather than block stacks.

## Research Baseline

### Reference product expectation

The Superhive "Stylized Modular Apartment Kit" reference establishes what users are comparing against:

- a modular kit, not only a single generated building;
- dozens of reusable pieces;
- several preassembled building examples;
- brick, plaster, roof, door, window, and accessory material groups;
- multiple texture resolutions;
- PBR channels including base color, roughness, normal, metallic, and ORM-style packing;
- a 1 meter grid snapping assumption;
- low-poly stylized geometry with high readability from material, trim, and opening detail.

Buildo currently has the procedural side of that pipeline, but not the art-kit contract layer that makes the output read as a composed modular asset set.

### Format and material expectations

glTF 2.0 is a useful reference point even if Buildo does not export glTF in the first pass. It formalizes the standard shape of runtime materials: geometry, instancing, textures, base color, metallic-roughness, normals, occlusion, and texture coordinate use.

For Buildo this means the plan should define material slots and atlas layers in terms that can later map cleanly to glTF-style PBR:

- base color;
- normal;
- ORM or equivalent occlusion, roughness, metallic packing;
- opacity where needed;
- height or mask data for procedural normal generation and trim weathering.

### Modular assembly expectations

Unity's grid, vertex, and surface snapping documentation is a useful general reference for modular authoring. Buildo should not become a Unity-style scene editor, but its component contracts need equivalent concepts:

- unit scale;
- module bounds;
- pivot;
- facade anchor points;
- sockets;
- grid increments;
- allowed facade zones;
- repeat behavior;
- collision or overlap diagnostics.

## Current State

Buildo already has the foundation that an art-fidelity pass should build on:

- `src/features/building-family/contracts/*` for typed, runtime-validated building contracts;
- `src/features/building-family/components/*` for procedural component recipes and primitive/profile builders;
- `src/features/building-family/compiler/*` for renderer-independent graph and geometry compilation;
- `src/features/building-family/materials/*` for atlas planning, packing, procedural materials, and remote material proof packets;
- `src/features/building-family/renderer-three/*` for the browser runtime adapter;
- `src/features/building-family/ui/*` for Prompt Lab, Atlas Lab, Component Forge, Assembly Hall, and Sample Gallery;
- persistence, export/import, benchmark, low-detail, provider proof, and sample-gallery evidence already landed.

The fidelity gap is mostly not architecture. It is missing art-kit vocabulary, richer profile geometry, material-scale discipline, facade module QA, and a presentation surface that demonstrates the generated result in clay, wireframe, and textured modes.

## Fidelity Target

The first visual target is:

> A stylized late-19th-century modular apartment/commercial building kit generated procedurally from Buildo contracts, readable from the default Assembly Hall camera as a kit-quality facade with layered trim, believable windows and doors, brick/plaster/roof material scale, side/rear facade treatment, and optional clay/wireframe inspection.

Acceptance is based on visual qualities, not pixel matching:

- the silhouette has roof caps, parapets, cornices, and corner treatment;
- floors and bays read cleanly from the camera;
- windows and doors have inset depth, frames, sills, lintels, mullions, and arch variants;
- trim profiles are layered, not only flat rectangular bands;
- brick or plaster scale is consistent across wall modules;
- side and rear facades are simpler than the front but not blank slabs;
- material roles map to coherent PBR-like channels;
- modules can be inspected as reusable kit pieces;
- generated family variants share a style while still varying proportion and detail.

## Non-Goals

- Do not import the Superhive assets or any copyrighted marketplace geometry or textures.
- Do not replace procedural generation with complete authored mesh placement.
- Do not add Blender, Unity, Babylon.js, or a second renderer.
- Do not build a full DCC editor.
- Do not add general mesh booleans.
- Do not claim historical accuracy beyond the existing `demo` or `draft` style-pack labeling.
- Do not block on live remote texture generation; procedural materials remain the first acceptance path.

## Architecture Addition

Add an art-kit contract layer between the style pack/component catalog and the building graph/compiler.

```text
BuildingFamilySpec
  -> Style pack constraints
  -> ArtKitManifest
  -> ModuleCatalog
  -> BuildingGraph modules
  -> ComponentRecipe instances
  -> RuntimeBuildingIR
  -> Three.js adapter
```

This layer does not own rendering. It describes which kit modules are available, how they snap, what material roles they use, and how they decompose into existing or new procedural component recipes.

## Proposed File Layout

```text
src/features/building-family/art-kit/
  artKitContracts.ts
  artKitCatalog.ts
  late19cApartmentKit.ts
  facadeModulePlanner.ts
  moduleSnapGrid.ts
  moduleQualityReport.ts

src/features/building-family/components/
  artKitComponentBuilder.ts
  archedOpeningBuilder.ts
  profiledTrimBuilder.ts
  quoinBuilder.ts

src/features/building-family/materials/
  artKitMaterialSet.ts
  proceduralBrickSet.ts
  proceduralPlasterSet.ts
  proceduralRoofSet.ts

src/features/building-family/ui/
  ArtKitLab.tsx
  ArtKitPresentationPanel.tsx

src/features/building-family/tests/
  artKitContracts.test.ts
  moduleSnapGrid.test.ts
  artKitComponentBuilder.test.ts
  facadeModulePlanner.test.ts
  artKitMaterialSet.test.ts
  ArtKitLab.test.tsx
```

Existing files should be extended where that keeps the surface smaller:

- `contracts/componentRecipe.ts` may receive new recipe kinds only after contract tests exist.
- `compiler/buildingGraphBuilder.ts` may call `facadeModulePlanner.ts`.
- `compiler/buildingCompiler.ts` may consume new recipe kinds but should not import Three.js.
- `renderer-three/buildingAtlasMaterialFactory.ts` should be the main place where new material channels reach Three.js.
- `ui/AssemblyHall.tsx` should keep the runtime demo route; `ArtKitLab.tsx` is for inspecting the kit surface.

## Contract Sketch

The first implementation slice should land a minimal but expandable schema.

```ts
export interface ArtKitManifest {
  schemaVersion: "0.1.0";
  id: string;
  label: string;
  unitMeters: 1;
  stylePackIds: string[];
  materials: ArtKitMaterialRole[];
  modules: ArtKitModule[];
  quality: {
    target: "stylized-apartment-kit";
    notes: string[];
  };
}

export interface ArtKitModule {
  id: string;
  kind:
    | "wall-panel"
    | "opening"
    | "door"
    | "storefront"
    | "trim-run"
    | "cornice"
    | "parapet"
    | "roof-cap"
    | "corner-quoin"
    | "balcony"
    | "accessory";
  boundsMeters: { width: number; height: number; depth: number };
  pivot: "bottom-left-back" | "bottom-center-back" | "center";
  facadeZones: Array<"ground" | "body" | "cornice" | "roof" | "side" | "rear">;
  sockets: ArtKitSocket[];
  materialRoles: Record<string, string>;
  recipe: ArtKitRecipeRef;
  lod: {
    high: boolean;
    lowFallbackModuleId?: string;
  };
  tags: string[];
}

export interface ArtKitSocket {
  id: string;
  kind: "grid" | "edge" | "opening" | "trim" | "roof";
  positionMeters: [number, number, number];
  normal: [number, number, number];
  accepts: string[];
}
```

The schema should validate units, positive bounds, unique module ids, valid material roles, and socket compatibility. It should also provide diagnostics when a module cannot fit into a facade bay/floor cell.

## Implementation Slices

### Slice 1: Art-Kit Contract And Fixture

Status: implemented on 2026-06-25. The initial contract layer now includes manifest/module/material/socket schemas, semantic validation diagnostics, and a representative `late19cApartmentKit` fixture.

Create the `art-kit` folder with `ArtKitManifest`, `ArtKitModule`, sockets, material roles, and quality-report schemas.

Acceptance criteria:

- fixture manifest `late19cApartmentKit` validates at runtime;
- duplicate ids and invalid sockets fail with specific diagnostics;
- no Three.js imports enter `art-kit` or `contracts`;
- all module dimensions use meter units.

Validation commands:

```powershell
npm.cmd run test -- artKitContracts moduleSnapGrid
npm.cmd run typecheck
```

### Slice 2: Snap Grid And Facade Module Planner

Implementation plan: `docs/superpowers/plans/2026-06-25-art-kit-snap-grid-facade-planner.md`.

Implement `moduleSnapGrid.ts` and `facadeModulePlanner.ts` so a building graph can place modules using:

- 1 meter grid increments;
- floor and bay cells;
- facade zone constraints;
- front, side, and rear facade rules;
- deterministic seeded variant selection;
- overlap diagnostics.

Acceptance criteria:

- planner output is stable for the same semantic seed;
- module placements align to grid increments;
- invalid modules produce diagnostics instead of silent clipping;
- planner can generate a simple front facade plus side/rear treatment.

Validation commands:

```powershell
npm.cmd run test -- moduleSnapGrid facadeModulePlanner buildingGraphBuilder
npm.cmd run typecheck
```

### Slice 3: Profiled Trim And Cornice Geometry

Upgrade component generation with reusable profile geometry:

- profiled belt courses;
- layered cornices;
- parapet caps;
- roof-cap edges;
- corner quoins;
- shallow pilasters;
- trim end caps.

Prefer profile-sweep data and existing primitive builders over ad hoc mesh code. Keep geometry output in typed arrays and keep compiler code renderer-independent.

Acceptance criteria:

- high-detail output includes visible multi-layer trims;
- low-detail mode can omit or simplify trims without breaking bounds;
- generated normals are coherent enough for clay lighting;
- repeated trim modules can be instanced or batched.

Validation commands:

```powershell
npm.cmd run test -- profiledTrimBuilder quoinBuilder buildingCompiler familyBenchmarkScene
npm.cmd run typecheck
```

### Slice 4: High-Fidelity Openings

Add procedural window and door modules that match the reference qualities:

- rectangular sash windows;
- arched windows;
- recessed opening pockets;
- lintel and sill variants;
- mullion grids;
- transom doors;
- optional storefront/industrial entrance modules;
- simple balcony rail insert.

Acceptance criteria:

- opening modules have depth, not only flat frame outlines;
- arched and rectangular variants share material roles;
- generated modules expose bounds and anchor diagnostics;
- Component Forge can inspect each module family.

Validation commands:

```powershell
npm.cmd run test -- archedOpeningBuilder artKitComponentBuilder ComponentForge
npm.cmd run typecheck
```

### Slice 5: Art-Kit Material Set

Define material sets at kit level, then map them into the existing atlas planner and Three adapter.

Initial material roles:

- brick;
- plaster;
- roof;
- trim stone;
- painted metal;
- painted wood;
- glass;
- grime/weathering mask.

Each role should describe the available channels and scale:

```ts
export interface ArtKitMaterialRole {
  id: string;
  label: string;
  channels: Array<"baseColor" | "normal" | "orm" | "height" | "opacity">;
  metersPerTile: number;
  atlasSlotHint?: string;
  proceduralSource: string;
}
```

Acceptance criteria:

- brick coursing scale remains stable across facade modules;
- plaster and roof materials have distinct procedural sources;
- material roles can produce or reference PBR-like channels;
- atlas manifests expose enough metadata for a future glTF export mapping.

Validation commands:

```powershell
npm.cmd run test -- artKitMaterialSet atlasPlanner atlasPacker buildingAtlasMaterialFactory
npm.cmd run typecheck
```

### Slice 6: Art Fidelity Mode In Runtime

Add a feature option such as:

```ts
type ArtFidelityMode = "proof" | "kit";
```

The existing demo remains available as `proof`. The new `kit` mode routes through the art-kit manifest and module planner.

Acceptance criteria:

- Assembly Hall can render the same prompt in proof and kit modes;
- persistence/export packets include the selected fidelity mode with schema-versioned validation;
- imported/exported kit-mode buildings restore correctly;
- performance benchmark reports include fidelity mode.

Validation commands:

```powershell
npm.cmd run test -- buildingFamilyRuntime completedFamilyExportBundle completedFamilyExportVerifier familyBenchmarkProfilePacket
npm.cmd run typecheck
```

### Slice 7: Art Kit Lab And Sample Gallery Upgrade

Add an inspection route for the kit and upgrade the gallery so it communicates fidelity honestly.

Required UI surfaces:

- module catalog view;
- clay preview;
- wireframe/edge preview;
- textured preview;
- generated building variants using the kit mode;
- quality report panel listing module count, material roles, diagnostics, and benchmark profile.

Acceptance criteria:

- `#room=artKitLab` shows modules and their dimensions/material roles;
- `#room=sampleGallery` includes kit-mode examples once the mode is ready;
- gallery labels clearly distinguish proof-mode and kit-mode examples;
- no explanatory marketing page replaces the usable tools.

Validation commands:

```powershell
npm.cmd run test -- ArtKitLab SampleBuildingGallery AssemblyHall
npm.cmd run test:e2e
npm.cmd run typecheck
```

### Slice 8: Visual QA And Representative Evidence

Define a visual QA packet so fidelity does not drift into subjective hand-waving.

The packet should include:

- screenshot target route;
- seed and prompt;
- fidelity mode;
- style pack id;
- module manifest hash;
- atlas manifest hash;
- benchmark profile id;
- visual checklist results;
- known gaps.

Checklist categories:

- silhouette;
- facade rhythm;
- opening depth;
- trim layering;
- material scale;
- side/rear facade treatment;
- roof edge treatment;
- clay readability;
- wireframe inspection;
- textured readability;
- performance budget.

Acceptance criteria:

- a representative machine can export a visual QA packet from the app;
- the packet is schema-versioned and runtime-validated;
- docs identify measured, estimated, and not-captured fields;
- known visual gaps are listed beside the evidence.

Validation commands:

```powershell
npm.cmd run test -- moduleQualityReport familyBenchmarkDocumentation
npm.cmd run test:e2e
npm.cmd run typecheck
```

## Slice Order Recommendation

The safest next code slice is Slice 1. It is small, tests the contract surface, and prevents later visual work from becoming a pile of untyped special cases.

Recommended commit sequence:

1. `Add art kit contract and fixture`
2. `Add facade module snap planner`
3. `Add profiled trim geometry`
4. `Add high fidelity opening modules`
5. `Add art kit material set`
6. `Add kit fidelity runtime mode`
7. `Add art kit lab and gallery upgrade`
8. `Add visual QA packet`

Each commit should pass its slice validation commands before push.

## Documentation Updates Per Slice

Every slice should update the relevant doc surface:

- `docs/architecture/dynamic-building-family-integration.md` for current state and new file ownership;
- this plan for checked-off slice status and any scope changes;
- `docs/plans/dynamic-building-family.md` only when the long-range roadmap changes, not for routine implementation notes.

## Open Product Decisions

These decisions should be made before or during Slice 1:

- whether the first kit style should remain `late-19c-commercial-demo` or become a sibling `late-19c-apartment-kit-demo`;
- whether kit mode should default on in Sample Gallery once it exists;
- whether the first presentation target should be clay/wireframe first or textured first;
- whether to add eventual glTF export as a later milestone after the material contract stabilizes.

## Final Acceptance For The Fidelity Bridge

The bridge is complete when:

- the app can show at least one generated kit-mode building in Assembly Hall;
- Art Kit Lab exposes reusable modules and material roles;
- Sample Gallery shows multiple kit-mode variants;
- exported packets can restore kit-mode buildings;
- visual QA packets capture the seed, hashes, route, screenshots, benchmark, and known gaps;
- the default generated building reads closer to a stylized modular apartment kit than to a block-only prototype.
