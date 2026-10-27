# R1.S6 verified primary-wall mortar coverage

**Result:** complete for bounded primary authored-wall subpixel mortar coverage. The accepted packet `2026-10-14-r1-s6`, captured and verified 2026-10-14, contains **22 PNGs and four runtime-validated JSON artifacts**: 18 building views and four sampling images, actual WebGPU/WebGL, zero page errors, six density gates and **26 verified durable artifact copies**. The primary material has an explicit new baseline. R1's six human criteria, worth-keeping judgment and representative-machine/family-performance gates remain pending; R2's restore/regeneration and warm-cache ownership blocker is unchanged.

## Accepted records and before/after views

| Runtime-validated record | SHA-256 |
|---|---|
| [Acceptance card](acceptance-card.json) | `7a9b28fb747e06431c16437ade61639eb43fe326c1c0c66e68a3cd638b035f0f` |
| [Material baseline/delta](material-baseline-delta.json) | `c365b4419ab23b0050b621ffff9ddf096a83b9e198a1eb942ff1774a42c5e9a4` |
| [Sampling report](sampling-report.json) | `3cfbb91aca772e6962e5feee1a6555d493e6386331a6b53c21ab5989956f2838` |
| [Wall sampling comparison](wall-sampling-comparison.json) | `224ff5d68af958dc02ffe86b18150465a6d384462013282c5de4f43c801e16bf` |

The delta pins the original [S4 acceptance card](../2026-10-14-r1-s4/acceptance-card.json) and [sampling report](../2026-10-14-r1-s4/sampling-report.json), the [accepted S5 discriminator](../2026-10-14-r1-s5-verified/README.md), and the pre-edit producer checkpoint. S4/S5 images and metadata remain immutable; the new material is not rebadged as the old image baseline.

| WebGPU textured view | S4 before | S6 after |
|---|---|---|
| Three-quarter / ordinary | [PNG](../2026-10-14-r1-s4/building-webgpu-textured-three-quarter-ordinary.png) | [PNG](building-webgpu-textured-three-quarter-ordinary.png) |
| Three-quarter / raking | [PNG](../2026-10-14-r1-s4/building-webgpu-textured-three-quarter-raking.png) | [PNG](building-webgpu-textured-three-quarter-raking.png) |
| Rear / ordinary | [PNG](../2026-10-14-r1-s4/building-webgpu-textured-rear-ordinary.png) | [PNG](building-webgpu-textured-rear-ordinary.png) |
| Rear / raking | [PNG](../2026-10-14-r1-s4/building-webgpu-textured-rear-raking.png) | [PNG](building-webgpu-textured-rear-raking.png) |
| Right / raking | [PNG](../2026-10-14-r1-s4/building-webgpu-textured-right-raking.png) | [PNG](building-webgpu-textured-right-raking.png) |

All frozen captures are linked below. Camera, key/fill light, canvas, controls/spec, geometry, graph/catalog, atlas ID/manifest and physical anchors retain the S4/S6 freeze. Only the approved selected material content changes.

| Actual backend / pose | Ordinary clay | Ordinary textured | Raking clay | Raking textured |
|---|---|---|---|---|
| WebGPU / front | [PNG](building-webgpu-clay-front-ordinary.png) | [PNG](building-webgpu-textured-front-ordinary.png) | [PNG](building-webgpu-clay-front-raking.png) | [PNG](building-webgpu-textured-front-raking.png) |
| WebGPU / three-quarter | [PNG](building-webgpu-clay-three-quarter-ordinary.png) | [PNG](building-webgpu-textured-three-quarter-ordinary.png) | [PNG](building-webgpu-clay-three-quarter-raking.png) | [PNG](building-webgpu-textured-three-quarter-raking.png) |
| WebGPU / right | [PNG](building-webgpu-clay-right-ordinary.png) | [PNG](building-webgpu-textured-right-ordinary.png) | [PNG](building-webgpu-clay-right-raking.png) | [PNG](building-webgpu-textured-right-raking.png) |
| WebGPU / rear | [PNG](building-webgpu-clay-rear-ordinary.png) | [PNG](building-webgpu-textured-rear-ordinary.png) | [PNG](building-webgpu-clay-rear-raking.png) | [PNG](building-webgpu-textured-rear-raking.png) |
| WebGL / three-quarter | [PNG](building-webgl-clay-three-quarter-ordinary.png) | [PNG](building-webgl-textured-three-quarter-ordinary.png) | — | — |

| Sampling backend | Current procedural | Frozen controlled checker |
|---|---|---|
| WebGPU | [PNG](sampling-webgpu-procedural.png) | [PNG](sampling-webgpu-controlled.png) |
| WebGL | [PNG](sampling-webgl-procedural.png) | [PNG](sampling-webgl-controlled.png) |

## Selected-only source and byte proof

The [pre-edit source checkpoint](../../../test-results/r1-s6-2026-10-14/before-source/producer-source-checkpoint.json) archives [the original producer](../../../test-results/r1-s6-2026-10-14/before-source/proceduralMaterialProvider.ts.snapshot): **13,391 bytes**, SHA-256 **`51cc87c0f78f2d9cc77d0ffb734288fc248195955dde4f2547cd4dfb9361d620`**. The [freeze log](../../../test-results/r1-s6-2026-10-14/freeze-producer-source.log) exits 0; saved/live bytes matched before edits. This explicitly closes the producer-code snapshot gap recorded in S5's inherited 28-file list.

The metadata predicate selects exactly `source.wall.primary` among 12 real default requests: wall role, brick art-kit role and running-bond procedural source. Coverage profile **`primary-authored-wall-mortar-area-v1`** versions that artifact's request and provenance independently of the unchanged legacy stochastic seed hash **`de21bfc55069aaba85b6af1e1b37a1d391f03ca26731fcb7ef3fd1dea4cb5c31`**.

| Selected identity | Before | After |
|---|---|---|
| Primary request hash | `de21bfc55069aaba85b6af1e1b37a1d391f03ca26731fcb7ef3fd1dea4cb5c31` | `fe3c0040dee939d9713031bbaa6e8edbb84cbb7ccbd29f97c0b136f732a5c57a` |
| Primary content hash | `c0dfd0513b820a27095e9357ffc42013def2d1f100fba253217b8a9edd7e4bc2` | `ab206b69ff261d393ca5c1d325a9a919f374ac3f69365e824990054070098a18` |
| Aggregate atlas content hash | `70f83ce0f5ecebf970cb26b014e446212f522e81d2dc99e33c2afbf18680853e` | `1ad52cb4ac9efae1e2d66d6494858efc853a944adc29a9a43c1d4b4f70b86bfd` |

Only the primary source's minimum-one-pixel binary mortar becomes exact subpixel pixel-area coverage of **14% of the existing course**, shared by base color and height. The **6 × 3 grid**, odd-row shift, **90 mm effective course/180 mm pitch**, duplicated endpoints, **32 × 32 source**, **128 × 128 atlas and 27 × 37 wall ROI**, **0.96 m anchor**, palette, legacy noise, roughness, normal scale, packing and filters remain fixed. Color uses area blending in linear sRGB between the retained clamped endpoints; height uses the same coverage and retained noisy brick/mortar endpoints.

| Independently reconstructed coverage field | Legacy binary mean | Subpixel mean |
|---|---|---|
| Source, 1,024 samples | 49.21875% | 22.432265625% |
| Nearest-packed ROI, 999 samples | 50.3503503504% | 22.7321321321% |

These means are reconstructed continuous coverage-field averages, not thresholded observed RGB fractions, counts of fully mortar-colored pixels, or measurements of full-building course density. The actual default source/packed coordinates produce these values within floating arithmetic. Every actual selected RGB/height pixel matches an independent pixel-local rectangle-clipping and legacy-noise/palette oracle **exactly**. The half-byte regression at `(21,4)` pins RGB **[154,116,101,255]** and height **[126,126,126,255]**; no arbitrary byte tolerance is allowed.

Actual old/current fixtures are rebuilt independently from the archived/live producer, without reusable material artifacts. Source request/content hashes, provenance, raw layers, actual repacking and encoded channel output are checked. The other **11 sources retain exact request/content/provenance and layer bytes**, including their packed ROIs and padding. Selected roughness remains exact; the entire packed **ORM and opacity channels remain exact**. Only primary base-color/height, derived normal ROI/padding and their content identities change; pixels outside that allowed region remain exact. Raw RGBA channel hashes and the older name/dimension-prefixed encoded channel hashes are separately verified.

Controlled checker generation receives all **12 complete legacy origins** so the primary procedural version cannot silently change checker provenance. Both controlled PNGs and all nine clay PNGs remain byte-identical to S4. Actual procedural → controlled → restored pixels and source identities match their declared states. This is fresh-fixture evidence; saved-document and warm-cache ownership are outside S6.

## Geometry, review and remaining defect

Geometry SHA-256 remains **`4c884d88523c475649e86fb084073e13c7868d5bad568e26a2822121a8fb045e`**, covering actual IR/rendered buffers and instance transforms/matrices. Graph identity remains **`graph-5beee63f8fadfb4d`**, source graph hash **`0806e42894bbb764ef7f9dc880cb00bb14615e6fe7015a83c30cbe49e43a9d7f`**, catalog **`catalog-bf60d45e1b7db640`** and atlas ID **`atlas-1d48a26ed6a65eb6`**. Atlas content changes only through the versioned material delta above; graph/layout/geometry are unchanged.

Construction counts remain **11,868 compiler IR triangles**, **61,508 rendered triangles**, **3,444,336 unique geometry-buffer bytes (approximately 3.28 MiB)** and **118 IR instances**, with 58 windows and one door. The full suite retains **537 strict complete-scene rays per high/low detail**, five full-pane rectangle fixtures and the 2 mm crossing sentinel, with no batch exceptions or loosened thresholds. These counts and tests are not representative-machine timing or family-performance evidence.

Root and an independent visual lane reviewed the actual images; the independent lane paired all 22 new images with all 22 S4 images. Mortar is softer and red wall areas fuller at the same cadence. No geometry, camera/light, opening or crown drift was observed. The rear/raking vertical boundary near **x ≈ 697**, window-row bands/horizontal lines around **y ≈ 540/570/620**, and corresponding right-view bands remain; clay retains segmentation/shading. The blocky crown and busy non-wall textures remain. These observations do not assign every band to the same cause or establish human aesthetic acceptance.

## Required checks and preserved proof

| Required command / operation | Final result / terminal log |
|---|---|
| `npm.cmd run test` | Exit 0; **560 tests across 86 files** ([log](../../../test-results/r1-s6-2026-10-14/test-final-01.log)) |
| `npm.cmd run lint` | Exit 0 ([log](../../../test-results/r1-s6-2026-10-14/lint-final-01.log)) |
| `npm.cmd run typecheck` | Exit 0 ([log](../../../test-results/r1-s6-2026-10-14/typecheck-final-01.log)) |
| `npm.cmd run build` | Exit 0; existing non-failing chunk-size advisory ([log](../../../test-results/r1-s6-2026-10-14/build-final-01.log)) |
| `npm.cmd run test:e2e` | Exit 0 ([log](../../../test-results/r1-s6-2026-10-14/e2e-final-01.log)) |
| Explicit old/current material-baseline proof | Exit 0 ([log](../../../test-results/r1-s6-2026-10-14/material-baseline-final-01.log)) |
| Frozen 22-image capture | Exit 0; zero page errors, six density gates ([log](../../../test-results/r1-s6-2026-10-14/capture-final-01.log)) |
| Verification and preservation | Exit 0 ([log](../../../test-results/r1-s6-2026-10-14/verification-final-02.log)) |

Each final repository log has `CHECK_EXIT_CODE=0`; the wrapper reports `ALL_FIVE_CHECKS_PASSED_AND_SOURCE_STABLE` on terminal stdout. The [50-case coverage QA](../../../test-results/r1-s6-2026-10-14/masonry-qa-focused-final.log) and [29-case provider behavior](../../../test-results/r1-s6-2026-10-14/provider-focused-tests-final.log) checks pass, with [QA scoped lint](../../../test-results/r1-s6-2026-10-14/masonry-qa-lint-final.log) and [provider scoped lint](../../../test-results/r1-s6-2026-10-14/provider-focused-lint-final.log) passing. Independent literals/goldens and adversaries cover unaffected bytes, outside-ROI mutations, alpha/roughness drift, reseeding, duplicate/swapped sources/slots, changed graph/manifest/geometry and falsely rebadged origins. Existing assertions, timeouts and quality thresholds remain intact.

The [source/copy checkpoint](../../../test-results/r1-s6-2026-10-14/final-01-proof/source-and-copy-checkpoint.json) has SHA-256 **`49cfb312f3b8034cb4da8a4dc1cf56cebfa324016c59fbef8180435aee251d37`**. It verifies all **26 artifact copies**, **43 current source snapshots**, the [tracked patch](../../../test-results/r1-s6-2026-10-14/final-01-proof/source-checkpoint/tracked-working-tree.patch), **28 prior S5 source snapshots**, **30 accepted S5 PNGs** and **110 ancestor PNGs**. The [current source checkpoint directory](../../../test-results/r1-s6-2026-10-14/final-01-proof/source-checkpoint/) and [prior-provenance archive](../../../test-results/r1-s6-2026-10-14/final-01-proof/prior-provenance/) retain the exact captured source/baseline records. Source commit is `4c0fedeacfc9b4bed0c0000096d7d1ea605d23b9`; the archived tracked patch SHA is **`7bb06ad04b1ca2d9f968261dd65df93358be63b5c85a5a7f5fce620c44596c2e`**. The unchanged base commit alone does not describe this dirty-tree checkpoint.

The [accepted execution helper](../../../test-results/r1-s6-2026-10-14/verify-and-preserve-s6.mjs) and its [archived snapshot](../../../test-results/r1-s6-2026-10-14/final-01-proof/execution-helper.mjs.snapshot) both hash to **`8467edc3a03a7fb9b5f63ece3dd9b006c400af2c886f309af4a31a1cf36f1d67`**. Final SSR verification retains a **non-blocking HMR warning that port 24678 is in use**; its terminal log ends `EXIT_CODE=0`. This warning is separate from the empty browser page-error arrays. No commit, push or remote-provider call was performed.

## Excluded preflights

All failed preflights remain preserved. [Capture-seam probe 01](../../../test-results/r1-s6-2026-10-14/capture-seam-proof-probe-01.log) failed on optional-`undefined` manifest fields omitted by JSON; canonical comparison fixes that serialization boundary. [Probe 02](../../../test-results/r1-s6-2026-10-14/capture-seam-proof-probe-02.log) failed on floating cancellation in the independent height oracle at a mathematically exact half-byte tie. Translating rectangles into pixel-local coordinates fixes the oracle; the producer and exact byte assertions are unchanged. [Probe 03](../../../test-results/r1-s6-2026-10-14/capture-seam-proof-probe-03.log) passes the full actual source/pixel/ROI/padding/provenance/geometry proof.

[Final verification 01](../../../test-results/r1-s6-2026-10-14/verification-final-01.log) rejected the helper's false assumption that clay material atlas hashes were non-null, before durable writes. The accepted helper compares labels pairwise, preserves null/undefined and normalizes only verified old non-null atlas content to the approved new content. [Final verification 02](../../../test-results/r1-s6-2026-10-14/verification-final-02.log) passes. Earlier focused failures and the [excluded S5 attempts](../2026-10-14-r1-s5/README.md) remain retained; none supplies acceptance for this packet.

## Separate next packet: R1.S7

The [revival plan](../../plans/building-authoring-revival.md#ready-queue) queues **Rear/right band and panel-seam discriminator**, diagnostic-only. Freeze this accepted S6 material, graph, geometry, source and camera/light baseline. Use the current owned-clone/frozen-draw path for rear/right raking production, normal-off, base-color-only, flat, flat-no-shadow and restored production; protect original resources and require advancing submissions plus actual presented/restored pixels.

Map the actual bands to source UVs and rendered triangle/semantic bounds before selecting any repair. Discriminate periodic source endpoints, normal contribution, geometry boundaries and received shadows without assigning all bands one cause. Preserve and review the diagnostic evidence, then select at most one repair as a new separate implementation packet. S7 makes no product, palette, topology or non-wall change. All human/performance gates and R2's warm-cache/source-persistence blocker remain open.
