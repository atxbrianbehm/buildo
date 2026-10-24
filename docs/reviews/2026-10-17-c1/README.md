# C1 — executable facade bay

Status: implementation and all five engineering checks pass on the final revision. Human appearance accepted by the user ("Accepted"), 2026-10-17. Acceptance clears C2 repetition and the node workspace; whole-building acceptance remains later. [Verified results and reviewed image hashes](verification.json).

## What changed

The live Assembly Hall now offers **Construct a bay**. Five strict, connected operators execute through a dedicated worker: facade scope, opening placement, wall emission, window assembly and output join. Parameters and input connections own geometry. The old descriptive building graph and legacy workflow remain available separately.

The workbench exposes the executed operator's parameters and scope input beside the viewport. Removing the window contribution leaves a real opening; connecting wall emission to the original scope closes that opening. Conflicting wall/window layouts fail without replacing the last valid scene. Versioned construction Save/Open retains the graph and validated material source, rather than serializing a renderer.

The bay uses real wall reveals, closed chamfered timber members, two offset sash rings and panes, and extruded sill/lintel profiles. Materials initialize once at 1024-square atlas resolution, with isolated, filtered masonry mipmaps and continuous metre-space phase. Structural edits and reopening reuse material artifacts. A front-facing bay light and tighter shadow projection make recesses visible in clay.

One final material pass compresses masonry contrast and saturation in linear light and supplies glazing with a deterministic sky/ground reflection field. These are renderer material inputs under the named appearance preset, not changes to source atlas bytes or geometry. Glazing remains opaque: there is no transparent interior, refraction or reflection of surrounding buildings in this slice.

The renderer now checks the actual Three.js backend after initialization. Three's silent WebGL fallback previously reported WebGPU. Full installed Chromium can activate WebGPU; the default headless shell in this environment falls back. Evidence must identify the real API.

## Automated verification

| Check on final material revision | Result | Raw log under `test-results/c1-2026-10-17/` |
|---|---|---|
| `npm.cmd run typecheck` | Pass, exit 0 | `typecheck-08.log` |
| `npm.cmd run lint` | Pass, exit 0; no warnings | `lint-final-02.log` |
| `npm.cmd run test -- --maxWorkers=2` | Pass, exit 0; **1,550 tests / 107 files** | `unit-final-02.log` |
| `npm.cmd run build` | Pass, exit 0 | `lint-build-final-02.log` |
| `npm.cmd run test:e2e` | Pass, exit 0; all eight existing authoring/recovery proof sections | `e2e-final-02.log` |

The final seven-test workbench file passes. It covers graph/source and all five raw material channel ownership, material response/alignment, exact IR bytes, texture disposal, live apply, rejected preparation, input correction and front-facing lighting. The graph tests include actual parameter/connection effects, wall-hole agreement, stepped pane depths, outward bevel winding and failure diagnostics. Worker tests cover out-of-order replies and terminal cleanup. Earlier failed type annotations and cross-realm comparison attempts are retained in raw logs; their corrected runs pass.

Actual App runs on **both real WebGPU and forced WebGL** pass with 11 captures each, no page/runtime errors, real construction-worker activation and no material regeneration after initialization. Width, opening size and recess change the visible construction. Removing the window leaves a hole; rewiring wall emission closes it. A conflicting layout preserves both accepted source and exact pixels. Save/Open reproduces the authored canvas byte-for-byte. [WebGPU receipt](webgpu-receipt.json) and [WebGL receipt](webgl-receipt.json) pin the runtime sources and PNG hashes. All 22 raw hashes and all copied review images were independently verified against disk.

Final raw browser runs are `app-05-webgpu` and `app-05-webgl`, driven by `capture-app-05.mjs`. The harness explicitly serves the optional favicon request to avoid an unrelated 404. `app-01`'s old WebGPU label actually covered Three's internal GL fallback; it is excluded from GPU evidence. `app-02-webgpu` correctly rejected that fallback. `app-03-webgpu` used real GPU but failed on the missing favicon. `app-04` passed before the final material pass; it is superseded for current appearance evidence.

The source-scope check retains **265/270** prior files byte-for-byte. The five changed existing files are App, its CSS, Assembly Hall, the renderer factory and its test; twelve new files implement the bounded bay slice and regression coverage. The diff check passes. Core/contracts/compiler scans find no new React/Three/Zustand/DOM imports or structural randomness. Resource/stale-result review covered worker shutdown, candidate discard, viewer leases, extra textures and download URLs. The interface detector reports eight inherited accent-border warnings in existing CSS; the C1 additions introduce none of those rules. Production build retains its large-chunk advisory; GL retains Three's existing PCF shadow deprecation warning.

The first 1k source file is approximately 28 MB because the existing PNG writer stores uncompressed pixel data; a shared material library is saved once per construction project, not regenerated per bay.

## Appearance review

Default workbench view: [WebGPU](images/webgpu-desktop-initial.png), [WebGL](images/webgl-desktop-initial.png). Default scope is 2.8 × 3.8 m with a 1.22 × 2.12 m window and 0.14 m recess. Authored close/distance comparisons use a 3.2 m scope, 1.55 × 2.3 m window and 0.22 m recess, under the same ordinary bay light.

[Capture context](capture-context.json) records the dirty base commit, graph, material seeds, mode/stage, 42-degree perspective/default-fit camera recipe, close-view wheel action and ordinary bay lighting. Runtime source hashes are in the API receipts. This is reproducible driver/source provenance, not a captured camera-matrix measurement.

| Actual API | Clay close | Textured close |
|---|---|---|
| WebGPU | [Clay](images/webgpu-clay-close.png) | [Textured](images/webgpu-textured-close.png) |
| WebGL | [Clay](images/webgl-clay-close.png) | [Textured](images/webgl-textured-close.png) |

Matching authored facade-distance views: WebGPU [clay](images/webgpu-clay-authored.png) / [textured](images/webgpu-textured-restored.png); WebGL [clay](images/webgl-clay-authored.png) / [textured](images/webgl-textured-restored.png).

The directly inspected images show an aperture with real returns, separate recessed sash depth and projecting stone profiles. The material pass reduces the previous strong red/mortar contrast. The user accepted this bay on 2026-10-17, clearing repetition in C2. Whole-building appearance remains a later review.

## Scope and next gate

This slice does not add a node canvas, floor repetition, undo or automatic recovery. Those remain C2/C3. The user accepted this bay after review. That closes C1 and clears C2; it does not accept a whole building or later milestones. No commits, pushes, publication, provider spending, installation or release occurred. The local review server is at `http://127.0.0.1:5173/#room=assemblyHall`; choose **Construct a bay**. The browser panel was queued for this thread, not confirmed visible.
