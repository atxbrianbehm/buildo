# R1.S2 — Clear apertures and establish frame/glass depth

**Result:** complete for the bounded opening-source repair. All five final repository checks pass, including 359 tests across 82 files. R1's six human criteria and whole-building worth-keeping judgment remain pending.

This packet repairs generated opening geometry while preserving the frozen controls, opening layout, recipe/catalog/graph identities and material artifacts. Work is local on main, base commit 4c0fedeacfc9b4bed0c0000096d7d1ea605d23b9; no commit, push or remote-provider call is part of this packet. The [R1 baseline](../2026-10-13-r1-baseline/README.md) and [R1.S1 density packet](../2026-10-14-r1-s1/README.md) are preserved.

## Evidence and reproduction

- [Acceptance card](acceptance-card.json): frozen controls, resolved spec, references, identities, cameras/lights, source/diff hashes, 18 building-image hashes and pending human criteria.
- [Sampling report](sampling-report.json): procedural/controlled swatches on actual WebGPU/WebGL, source/channel hashes, geometry metadata and presented-PNG measurements.
- [Wall comparison](wall-sampling-comparison.json): all three physical wall paths on both actual backends, compared with the recorded replay source.
- [Textured three-quarter view](building-webgpu-textured-three-quarter-ordinary.png) and [clay raking view](building-webgpu-clay-three-quarter-raking.png): visible aperture depth and the retained crown obstruction.

Replay the recorded card into a fresh directory:

```powershell
node scripts/capture-r1-baseline.mjs <fresh-output-directory> docs/reviews/2026-10-14-r1-s1/acceptance-card.json
```

The final matrix must contain front/three-quarter/right/rear, clay/textured and ordinary/raking WebGPU views, ordinary three-quarter clay/textured WebGL comparisons, and four sampling images: 22 PNGs at 1280 × 800, DPR 1. Backend fallback cannot count as evidence. Source files now include the four aperture compiler modules and renderer texture/disposal modules. Image/JSON writes refuse overwrites.

**Final capture and preservation:** the second capture was generated under test-results/r1-s2-2026-10-14/2026-10-14-r1-s2/ on 2026-10-14 at 16:21:59 UTC. All three JSON schemas, 22 PNG hashes, 15 diagnostic source hashes and the tracked-diff hash were verified. All 25 captured files were copied here with matching SHA-256; the 22 S1 images and 22 original baseline images were also verified unchanged. The local source-checkpoint retains tracked-working-tree.patch and all 15 source .snapshot files. Attempt-1 predates the final lower-leaf correction and remains preserved as intermediate evidence; the first full-check failure logs are preserved too. Final command logs use the *-final.log suffix.

## What changed

Facade subdivision no longer emits full-aperture masonry slabs labelled as reveals. Existing full-depth piers, sill/head walls and storefront bands provide masonry returns. The opening-pockets batch emits peripheral returns/lips with an empty center and a thin backing behind the pane's rear face. Frame recess and backing derive from the existing FacadeSplitPlan binding; no parallel opening placement system was added.

Standalone glass geometry owns its actual recipe thickness, including a legal zero-thickness plane. Its paired transform derives recess from frame depth, preserves pane depth in metres independently of frame scale, and faces outward using proper rotations on all four facades. Negative/non-finite pane thickness is rejected. Window frame construction retains surrounds, returns, sash and mullions without a central opaque recess slab. The isolated sampling frame/glass pair uses the same frame-derived recess convention.

Door glazing occupies the clear transom band between separator and top sash. The opaque lower leaf remains below it in both detail modes; its inset is bounded so its exterior face stays ahead of the backing. Parameterized coverage includes legal thin/thicker panes and deep requested leaf insets.

The frozen fixture retains 53 windows and one door, with matching frame/pane counts and semantic indices. Catalog and high-detail graph identities match the preceding card. Core/compiler construction remains deterministic and renderer-independent. Final frozen replay verifies unchanged source material bytes, atlas/channel hashes, semantic slots and physical wall tiles. S1's sampling algorithm is retained, and all six wall-density gates pass on actual WebGPU and WebGL.

## Geometric coverage and unresolved crown

The frozen fixture is traced through actual emitted mesh triangles and transformed recipe geometry in both high and low detail. Per detail, 492 strict rays comprise 477 window-pane rays, nine door-transom rays and six lower-leaf rays. Coverage requires outward winding, pane-first intersections, nearby opaque backing strictly behind the pane rear, and the intended leaf before backing.

The window-aperture check explicitly excludes only mesh.cornice. A separate complete high-detail scene diagnostic records crown-first hits on top-front glazing; its passing result proves the obstruction still exists. It does not establish complete-scene clearance. R1.S3 must remove that exception and replace the unresolved diagnostic with zero full-scene blockers, while addressing intermediate trim crossing glazing. The blank middle-front row and sparse side rhythm remain separate planner defects.

## Verification and cost

| Required check | Final result |
|---|---|
| npm.cmd run typecheck | Pass, exit 0 |
| npm.cmd run lint | Pass, exit 0 |
| npm.cmd run test | Pass, exit 0; 359 tests across 82 files |
| npm.cmd run build | Pass, exit 0; existing non-failing chunk-size advisory |
| npm.cmd run test:e2e | Pass, exit 0 |
| Final frozen replay | Pass; 18 building + four sampling images, six wall-density gates, zero page errors |
| Source/evidence/copy verification | Pass; three schemas, 22 PNGs, 15 source hashes + tracked diff, 44 preceding images and 25 durable copies |

The bounded Node/Vite SSR canonical fixture has 11,424 compiler IR triangles, 58,476 actual rendered triangles and 3,326,224 bytes (3.17 MiB) of unique geometry buffers. Counts and source hashes are recorded in renderer-cost-final.log. These are fixture costs; representative-machine memory/frame-time and family-performance acceptance remain pending. Local command logs and source checkpoints are under test-results/r1-s2-2026-10-14/.

## Restore/regenerate limitation

A bounded synthetic in-memory saved-IR probe confirms that restore uses recorded IR unchanged. Regeneration with the same graph/building/atlas identities then fails with Building artifact already registered. The restored fixture/IR remain active, no persistence write occurs and export is disabled for the failed run. No user data was changed by the probe. Old saved output therefore does not automatically acquire this compiler repair; artifact revision/compiler invalidation and reliable authored restore/regeneration remain an R2 limitation.

The bounded aperture repair leaves crown/trim clearance, complete visual acceptance and authored-document recovery open. No S3 or R2 implementation belongs to this packet.
