# R1.S4 — Opening rhythm and distribution

**Result:** complete for the bounded opening-distribution repair. All five repository checks pass, including **428 tests across 84 files**. In the canonical building, the formerly blank second-from-top front row now has six openings, and each body storey on both sides has at least two. Seeded gaps remain. R1's six human criteria, whole-building worth-keeping judgment and representative-machine acceptance remain pending.

This packet changes front-body and side opening presence under the frozen S3 intent/spec. Ground doors/storefront, rear openings, wall cells, massing, floors/bays, retained opening module choices/transforms, recipes/catalog and materials are preserved. New placements use the same authored cell/module derivation. Recompilation rebuilds the geometry around the accepted opening set. Global `SeedTree` is unchanged. No commit, push or remote-provider call belongs to this packet. The preceding [S3](../2026-10-14-r1-s3/README.md), [S2](../2026-10-14-r1-s2/README.md), [S1](../2026-10-14-r1-s1/README.md) and [original baseline](../2026-10-13-r1-baseline/README.md) remain preserved.

## Evidence

The preserved packet contains **28 evidence artifacts: six JSON files and 22 PNGs**.

- [Acceptance card](acceptance-card.json): frozen controls/spec, references, source hashes, cameras/lights, current identities and 18 building captures.
- [Sampling report](sampling-report.json) and [wall comparison](wall-sampling-comparison.json): actual WebGPU/WebGL sampling, source/channel identities and six passing physical-density gates.
- [Before graph](opening-layout-before-graph.json), [after graph](opening-layout-after-graph.json) and [opening comparison](opening-layout-comparison.json): full validated graphs and the narrowly permitted derivative transition.
- [Textured front](building-webgpu-textured-front-ordinary.png), [clay three-quarter](building-webgpu-clay-three-quarter-ordinary.png) and [textured right](building-webgpu-textured-right-ordinary.png): the recovered row and side distribution, alongside the remaining material-appearance defects.

The final card was created at **2026-10-14T17:55:39.473Z**. Building captures comprise 16 WebGPU views (four views × two light rigs × textured/clay) and two WebGL three-quarter views. Four procedural/controlled sampler images complete the set. Images use 1280 × 800/DPR 1; actual backends match the requested backends and page errors are empty.

[Verification](../../../test-results/r1-s4-2026-10-14/verification-final.log) exited 0 and checked six schemas, all 22 PNG hashes, all 28 durable copies, 88 ancestor PNGs, 25 source hashes and the tracked patch. The [source checkpoint](../../../test-results/r1-s4-2026-10-14/source-checkpoint/) contains those source snapshots and `tracked-working-tree.patch`. Snapshot paths retain the recorded repository path with a final `.snapshot` suffix, for example `source-checkpoint/scripts/capture-r1-baseline.mjs.snapshot`; restore them to the recorded path without that suffix. The recorded source commit is `4c0fedeacfc9b4bed0c0000096d7d1ea605d23b9`; tracked-diff SHA256 is `2e23ef414a6136b63f7e21214f963aa3eb29d9b395b12074142afba27ca8191c`.

## What changed

The planner now mixes only the front/side body-cell occupancy scores before applying its existing density thresholds. This removes the correlated adjacent-cell scores that produced an entirely empty front storey and empty lower-right rows. Each front body row has a minimum of `ceil(bays × 0.70)` openings; each side body row has a minimum of `ceil(bays × 0.50)`. If a row falls short, the lowest-score absent cells fill it, with bay index as the deterministic tie-breaker. Probability still allows density variation above the minimum.

Module selection, door selection, placement size/centering and semantic paths retain their existing seed authority. The public pure candidate helper separates authored placement derivation from occupancy. It is reused by the planner and QA; independent frozen-coordinate/module-choice goldens guard against a coupled change silently blessing new transforms or module choices.

The canonical body rows changed as follows. Floor indices 1–3 are above the ground floor; front rows contain seven cells and side rows four.

| Body floor index | Front, before → after | Left, before → after | Right, before → after |
|---|---:|---:|---:|
| 1 | 7 → 5 | 4 → 2 | 0 → 2 |
| 2 | 0 → 6 | 0 → 3 | 0 → 2 |
| 3 | 7 → 7 | 4 → 2 | 4 → 2 |

The stored comparison records **13 added, eight removed and 18 retained eligible placements**: a net gain of five openings. Total openings change **54 → 59** (53 → 58 windows, one door retained); eligible front/side body openings change **26 → 31**; total facade placements change **156 → 161**. Frame/glass batches contain 58 window pairs and one door pair.

## Explicit graph provenance

Before planner edits, the actual SSR-built S3 graph was schema-validated and frozen. Its graph ID and full canonical hash matched the durable S3 card; the preserved before-graph file remains byte-identical to that freeze, SHA256 `0def293cbca98386199d2e9db98d2e4d63b233c41f9bf0d1b05ccfab1b05659b`.

| Identity | Before | After |
|---|---|---|
| Graph ID | `graph-d4ac6fe906835696` | `graph-5beee63f8fadfb4d` |
| Full source graph SHA256 | `16ce1c905df3290fd4a9c51926c2aab8f9109f0624aa831026610a5a11d71e53` | `0806e42894bbb764ef7f9dc880cb00bb14615e6fe7015a83c30cbe49e43a9d7f` |
| Component catalog ID | `catalog-bf60d45e1b7db640` | unchanged |
| Atlas ID | `atlas-1d48a26ed6a65eb6` | unchanged |
| Atlas content SHA256 | `70f83ce0f5ecebf970cb26b014e446212f522e81d2dc99e33c2afbf18680853e` | unchanged |

The versioned comparison recomputes graph IDs using the established graph-ID-omitted canonical hash and computes full graph hashes separately. The permitted changes are the resulting `graphId`, `node.art-kit-facade-plan.parameters.placements` and its accurate `placementCount`, exclusively through front-body or left/right body opening additions/removals. Shared placement IDs retain their full payloads and relative order. Every other graph/node field and protected placement remains exact. Candidates must match an unchanged wall cell and its authored module derivation; arbitrary coordinates, sizes, module IDs, duplicate IDs/paths, invalid counts and fabricated paired wall plans fail closed. Inputs are isolated before asynchronous work so caller mutations cannot change the evidence.

The capture harness invokes this comparison for every actual building and sampling mount on both backends, pinning the before identity to S3 and the after identity to the mounted fixture. Controls/spec/materials, family/building/catalog/atlas identities, source/channel hashes, camera/light freeze and backend agreement remain strict. The wall report records the actual new graph hash. Default replay without the explicit frozen graph argument still requires exact identity. The comparison proves this derivative scope; it does not establish visual quality or human acceptance.

## Verification and reproduction

| Required check | Final result and log |
|---|---|
| `npm.cmd run typecheck` | Pass, exit 0; [typecheck-final.log](../../../test-results/r1-s4-2026-10-14/typecheck-final.log) |
| `npm.cmd run lint` | Pass, exit 0; [lint-final.log](../../../test-results/r1-s4-2026-10-14/lint-final.log) |
| `npm.cmd run test` | Pass, exit 0; 428 tests / 84 files; [test-final.log](../../../test-results/r1-s4-2026-10-14/test-final.log) |
| `npm.cmd run build` | Pass, exit 0; existing non-failing chunk-size advisory; [build-final.log](../../../test-results/r1-s4-2026-10-14/build-final.log) |
| `npm.cmd run test:e2e` | Pass, exit 0; [e2e-final.log](../../../test-results/r1-s4-2026-10-14/e2e-final.log) |
| Frozen capture | Pass, exit 0; 18 building + four sampling images, zero page errors; [capture-final.log](../../../test-results/r1-s4-2026-10-14/capture-final.log) |
| Preservation/provenance | Pass, exit 0; six schemas, 28 copies, 88 ancestor PNGs, 25 source hashes + tracked patch; [verification-final.log](../../../test-results/r1-s4-2026-10-14/verification-final.log) |

Focused verification passed 22 planner/snap-grid/seed tests across three files (exit 0 in tool stdout; the durable full-suite log above includes them), [27 comparison tests](../../../test-results/r1-s4-2026-10-14/qa-focused-tests.log) and [15 aperture tests](../../../test-results/r1-s4-2026-10-14/opening-aperture-focused.log). Scoped lint passed. Exact focused commands are:

```powershell
npm test -- src/features/building-family/tests/facadeModulePlanner.test.ts src/features/building-family/tests/moduleSnapGrid.test.ts src/features/building-family/tests/seedTree.test.ts
npm exec vitest -- run src/features/building-family/tests/openingLayoutComparison.test.ts
npm run test -- src/features/building-family/tests/openingApertureVisibility.test.ts --silent=false
```

The canonical geometry tests retain **537 strict rays per high/low detail level**: 522 window-pane points, nine transom points and six lower-leaf points. All four facades retain pane-first ordering, exterior winding, rear backing/depth separation and the intended visible lower leaf. Complete-scene candidates include every trim batch with no cornice exclusion. Continuous triangle projection against complete pane rectangles remains intact across the canonical fixture and layered/restrained crowns at legal short/tall floor endpoints. The 2 mm crossing sentinel still demonstrates a defect that sparse rays would miss.

The recorded capture command was:

```powershell
node scripts/capture-r1-baseline.mjs test-results/r1-s4-2026-10-14/2026-10-14-r1-s4 docs/reviews/2026-10-14-r1-s3/acceptance-card.json test-results/r1-s4-2026-10-14/frozen-source-graph.json
```

For a fresh replay using the durable frozen graph, run from the repository root with the S4 source checkpoint in place:

```powershell
node scripts/capture-r1-baseline.mjs test-results/r1-s4-replay-2026-10-14/2026-10-14-r1-s4 docs/reviews/2026-10-14-r1-s3/acceptance-card.json docs/reviews/2026-10-14-r1-s4/opening-layout-before-graph.json
node test-results/r1-s4-2026-10-14/verify-and-preserve.mjs test-results/r1-s4-replay-2026-10-14/2026-10-14-r1-s4 test-results/r1-s4-replay-preserved-2026-10-14/2026-10-14-r1-s4
```

The last capture argument (`process.argv[4]`) supplies the frozen before graph and enables only the scoped comparison. The scripts refuse existing evidence outputs. The original preservation command was `node test-results/r1-s4-2026-10-14/verify-and-preserve.mjs test-results/r1-s4-2026-10-14/2026-10-14-r1-s4 docs/reviews/2026-10-14-r1-s4`.

All six wall-density gates pass. Independent SHA256 checks confirm all four S4 sampler PNGs are byte-identical to S3 and S2.

| Sampler PNG | Shared S2/S3/S4 SHA256 |
|---|---|
| WebGPU procedural | `59a550493a31ad279e02ac273271de0bc8937d939a59e9809dbb0d8ae41d1a15` |
| WebGPU controlled | `15714ef64fee00845f22364b9be73088461f6a585224588f7006874e0860829d` |
| WebGL procedural | `f4831f82f7a41a7831951963e3ef05fdf62d7186382e2b80eca49347b88d3a6e` |
| WebGL controlled | `c5c58122d190c8e0fa0338c239f34ef30abfb81947d80afdafa00bfc052c6a26` |

**Bounded renderer cost:** 11,868 compiler IR triangles, 61,508 rendered triangles, 118 IR instances and 3,444,336 bytes of unique geometry buffers (about 3.285 MiB). [renderer-cost-final.log](../../../test-results/r1-s4-2026-10-14/renderer-cost-final.log) records the canonical SSR counts and source hashes. These counts do not establish representative-machine frame time, memory or family-performance acceptance.

## Visual review and next packet

Paired review of all 18 building views confirmed the recovered front row and improved lower-side presence, with no obvious new clipping or framing drift. The front and clay three-quarter views independently show the populated middle row. This is inspection evidence; all six human criteria—massing/base, facade rhythm, opening depth/glazing, trim restraint, material scale/roles and side/rear coherence—remain pending, as does the user's whole-building worth-keeping judgment.

The dominant remaining textured defect is the busy red/white brick grid and wall bands. The packet uses the default local procedural fixture, with a 128px atlas and 32px sources; remote overlay paths are outside this evidence. S5 will be a separate masonry-appearance discriminator: inspect that procedural source and frozen renders with channels and shadows isolated to distinguish source quantization, UV sampling and geometry shadows before selecting one bounded repair. Confirmed mixed non-wall UV domains and vertex-only wrapping remain a later candidate; their existence alone does not select the next repair. No S5 repair is implemented here.

The restored-IR/identical-input regeneration identity collision remains an R2 requirement. This legitimate new graph hash does not repair saved-packet migration, controller replacement or registry ownership. R1's human gate and later milestone dependencies remain open.
