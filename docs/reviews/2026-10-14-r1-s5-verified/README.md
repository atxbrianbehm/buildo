# R1.S5 verified masonry appearance discriminator

**Result:** complete for diagnostics and selection of a separate bounded repair. The accepted packet is `2026-10-14-r1-s5-retry-02`, captured and verified 2026-10-14. It contains **30 PNGs and two runtime-validated JSON artifacts**, with actual WebGPU/WebGL, zero page errors and **32 verified durable artifact copies**. No product geometry, renderer, material-source, state or UI repair occurred. R1's six human criteria, worth-keeping judgment and representative-machine/family-performance gates remain pending.

The [masonry appearance report](masonry-appearance-report.json) has SHA-256 **`c1e522e2655c55a456cc5b5351e22073fe8fbce87c327a7447131bdcf6149d30`**. Its [pre-treatment geometry checkpoint](frozen-geometry-checkpoint.json) has SHA-256 **`a67d4fa4b048d0aaaf2a2d8cc4703832794e3849b16f88ca55198d41530d8513`**. Baselines are the [S4 acceptance card](../2026-10-14-r1-s4/acceptance-card.json), SHA `41c4bbe2be5ce5956752c23c836b6bc06175a05342663921485d1adb1621c810`, and [S4 sampling report](../2026-10-14-r1-s4/sampling-report.json), SHA `6105e46e2163ecf555acfe98342bd2a22bcf2183f84bb53a489e14381e995519`.

## Controlled matrix and observed output

Each preset captures the six conditions in this order. Camera, key/fill light, canvas, controls/spec, graph/catalog/atlas identities and stable material labels match the corresponding S4 snapshot exactly.

| Condition | Declared wall-only intervention |
|---|---|
| Production | Original wall material and shadow state |
| Normal-off | Detach normal map only |
| Base-color-only | Also detach roughness/metalness maps; roughness 0.82, metalness 0 |
| Flat | Also detach base-color map; source brick `#842d20` converted to linear RGB |
| Flat-no-shadow | Flat material plus `receiveShadow = false`; cast-shadow flags retained |
| Restored-production | Reattach unchanged original material and shadow state |

| Actual backend / pose / lighting | Production | Normal-off | Base-color-only | Flat | Flat-no-shadow | Restored | Submission counts |
|---|---|---|---|---|---|---|---|
| WebGPU / front / ordinary | [PNG](masonry-webgpu-front-ordinary-production.png) | [PNG](masonry-webgpu-front-ordinary-normal-off.png) | [PNG](masonry-webgpu-front-ordinary-base-color-only.png) | [PNG](masonry-webgpu-front-ordinary-flat.png) | [PNG](masonry-webgpu-front-ordinary-flat-no-shadow.png) | [PNG](masonry-webgpu-front-ordinary-restored-production.png) | 5, 6, 7, 8, 9, 10 |
| WebGPU / three-quarter / ordinary | [PNG](masonry-webgpu-three-quarter-ordinary-production.png) | [PNG](masonry-webgpu-three-quarter-ordinary-normal-off.png) | [PNG](masonry-webgpu-three-quarter-ordinary-base-color-only.png) | [PNG](masonry-webgpu-three-quarter-ordinary-flat.png) | [PNG](masonry-webgpu-three-quarter-ordinary-flat-no-shadow.png) | [PNG](masonry-webgpu-three-quarter-ordinary-restored-production.png) | 12, 13, 14, 15, 16, 17 |
| WebGPU / right / ordinary | [PNG](masonry-webgpu-right-ordinary-production.png) | [PNG](masonry-webgpu-right-ordinary-normal-off.png) | [PNG](masonry-webgpu-right-ordinary-base-color-only.png) | [PNG](masonry-webgpu-right-ordinary-flat.png) | [PNG](masonry-webgpu-right-ordinary-flat-no-shadow.png) | [PNG](masonry-webgpu-right-ordinary-restored-production.png) | 19, 20, 21, 22, 23, 24 |
| WebGPU / three-quarter / raking | [PNG](masonry-webgpu-three-quarter-raking-production.png) | [PNG](masonry-webgpu-three-quarter-raking-normal-off.png) | [PNG](masonry-webgpu-three-quarter-raking-base-color-only.png) | [PNG](masonry-webgpu-three-quarter-raking-flat.png) | [PNG](masonry-webgpu-three-quarter-raking-flat-no-shadow.png) | [PNG](masonry-webgpu-three-quarter-raking-restored-production.png) | 26, 27, 28, 29, 30, 31 |
| WebGL / three-quarter / ordinary | [PNG](masonry-webgl-three-quarter-ordinary-production.png) | [PNG](masonry-webgl-three-quarter-ordinary-normal-off.png) | [PNG](masonry-webgl-three-quarter-ordinary-base-color-only.png) | [PNG](masonry-webgl-three-quarter-ordinary-flat.png) | [PNG](masonry-webgl-three-quarter-ordinary-flat-no-shadow.png) | [PNG](masonry-webgl-three-quarter-ordinary-restored-production.png) | 5, 6, 7, 8, 9, 10 |

The diagnostic setter synchronously submits a frozen draw. `snapshot.frameCount` counts successful render **submissions**, not GPU completions or measured FPS. Strict counter advancement guards against stale submission evidence; actual captured pixels prove the presented output separately. For every preset, flat PNG hashes differ from both production and base-color-only, and all **ten production/restored actual PNG byte arrays equal S4**. Normal-off, ORM removal and shadow removal are not required to produce a distinct PNG in every preset.

Independent review of all 30 images finds the coarse grid on both backends with the normal map disabled and with only base color attached; the grid disappears with flat wall color. The normal contribution is local and ORM changes are minor. Disabling received shadows brightens walls and removes some bands/edge shading, while fine front row/panel seams and side transitions remain. The dominant coarse-grid contribution is therefore source color. This supports the separately queued primary-wall mortar-coverage repair; it does not assign all residual seams or sampling defects to that cause or clear human aesthetic acceptance.

## Source measurement and protected state

The retained procedural artifact `source.wall.primary` is **32 × 32 pixels**, physically **0.96 × 0.96 m**, with an existing **6 × 3 pixel grid**, odd-row shift and minimum one-pixel binary mortar. Its request/content hashes match S4. Actual source RGBA has **504/1024 mortar pixels (49.21875%)**; the frozen **27 × 37** nearest-packed ROI has **503/999 (50.35035%)**. The quantized model yields a 90 mm effective course and 30 mm mortar versus the nominal 75 mm course anchor. These values describe source and packed pixels; they are not a measured full-building course-density result.

The checkpoint was frozen before any treatment from actual compiler/rendered buffers, geometry attributes/indices and instance transforms/matrices. Every capture retains geometry hash **`4c884d88523c475649e86fb084073e13c7868d5bad568e26a2822121a8fb045e`**, **11,868 IR triangles, 61,508 rendered triangles, 3,444,336 unique geometry-buffer bytes (approximately 3.28 MiB) and 118 IR instances**. The compiler still has 58 windows and one door. These construction counts make no timing or representative-machine claim.

Actual non-wall material maps/properties and renderable flags remain invariant, as do protected wall opacity, normal scale, other material/sampling properties and cast-shadow flags. Map hashes cover actual raw RGBA bytes. The old S4 encoded channel-hash protocol additionally prefixes the channel name/dimensions; independent fresh-fixture verification checks both identities rather than treating them as interchangeable. All 12 source request/content records, graph/catalog, atlas ID/content and physical anchors remain unchanged during S5.

Fresh diagnostic wall-material clones are configured before first use. The originals remain untouched; restore reattaches them and disposes owned clones. [Probe 04](../../../test-results/r1-s5-2026-10-14/render-submit-probe-04/probe.log) verifies actual WebGPU/WebGL production → flat → restoration, exact S4 pixels, geometry/non-wall protection, **14 created clones disposed exactly once**, no original/texture/geometry disposals, partial allocation/configuration/attachment failures and idempotent teardown. It is a bounded harness/resource proof; the accepted matrix above supplies the full causal evidence.

## Checks and preservation

| Required command | Final result / terminal log |
|---|---|
| `npm.cmd run test` | Exit 0; **483 tests, 85 files** ([log](../../../test-results/r1-s5-2026-10-14/test-retry-02.log)) |
| `npm.cmd run lint` | Exit 0 ([log](../../../test-results/r1-s5-2026-10-14/lint-retry-02.log)) |
| `npm.cmd run typecheck` | Exit 0 ([log](../../../test-results/r1-s5-2026-10-14/typecheck-retry-02.log)) |
| `npm.cmd run build` | Exit 0; existing non-failing chunk advisory ([log](../../../test-results/r1-s5-2026-10-14/build-retry-02.log)) |
| `npm.cmd run test:e2e` | Exit 0 ([log](../../../test-results/r1-s5-2026-10-14/e2e-retry-02.log)) |
| Fresh capture | Exit 0 ([log](../../../test-results/r1-s5-2026-10-14/capture-retry-02.log)) |
| Verification and preservation | Exit 0 ([log](../../../test-results/r1-s5-2026-10-14/verification-retry-02.log)) |

The 55-case QA suite rejects stale counters and unchanged flat pixels as well as source/state/camera/hash drift. The real excluded retry 01 fails with **25 frame-progression and five flat-pixel errors**. Existing assertions, timeouts and quality thresholds are retained.

Preservation verifies both JSON schemas, all 30 current PNGs, all 32 artifact copies, **110 ancestor PNGs**, the validated S4 placement edge, **28 source-file hashes** and tracked patch. The [source checkpoint](../../../test-results/r1-s5-2026-10-14/retry-02-proof/source-checkpoint/) and [independent SSR cost/source/model proof](../../../test-results/r1-s5-2026-10-14/retry-02-proof/renderer-cost-final.log) retain the 28 captured files. Of S4's 25 old fingerprints, only the named diagnostic browser/capture harness files change; the new runner and QA/test files are added. Covered production source fingerprints remain unchanged. No commit, push or remote-provider call was performed.

**Provenance limit:** the inherited 28-file list omits `proceduralMaterialProvider.ts`; that producer is not among these source snapshots. S5 independently rebuilt and hash-verified its actual request/content, base-color and raw/encoded atlas outputs and retained source commit/patch. S6 must explicitly snapshot/hash the producer before editing; verified output identity is not a claim of complete runtime-source snapshot coverage.

## Excluded attempts

The [earlier directory](../2026-10-14-r1-s5/README.md) preserves retry 01's 30 stale PNGs, two JSON artifacts and 32 artifact copies. All six images within every preset were identical; counters stayed constant at WebGPU 4/5/6/7 by preset and WebGL 4. Its integrity/state checks passed, but property changes never reached a submitted draw. Those images supply no causal acceptance. The original zero-PNG optional-undefined serialization failure, its checkpoint and earlier check logs also remain retained.

Render-submit probes 01–03 remain excluded. Mutating cached original material maps exposed an installed WebGPU shadow `TextureNode` null-matrix error; the final owned-clone strategy preserves originals. Probe 04 is the successful bounded preflight; retry 02 is the accepted complete matrix. Neither the excluded source pixel measurements nor preflight success replaces the fresh 30-case review.

## Separate next packet: R1.S6

The [revival plan](../../plans/building-authoring-revival.md#ready-queue) queues **primary authored-wall subpixel mortar coverage** as its first unblocked packet. Change only the `>= 1 px` binary mortar coverage to exact subpixel coverage of **14% of the existing course**, shared by color and height. Retain the canonical 6 × 3 grid, odd-row shift, 90 mm effective course/180 mm pitch, duplicated endpoints, 32-pixel source, 128-pixel atlas/27 × 37 ROI, 0.96 m anchor, palette, legacy noise, roughness, normal scale, packing and filters. Modeled mean coverage is **22.4323% source / 22.7321% packed**; these are predictions awaiting implementation and measurement.

A selected metadata predicate must prove only the primary source among 12 is affected. Snapshot/hash the producer before editing, version the selected request/provenance identity independently of the unchanged legacy stochastic seed, and record an explicit new material baseline. Only selected base-color/height, derived normal ROI/padding and their derived content identities may change. ORM/opacity, all other 11 source bytes/ROIs, graph/catalog/atlas ID, geometry/openings/controls/cameras remain strict. No S6 product change has begun.

Course topology, tile endpoint seams, remaining geometry/shadow bands, non-wall UV/routing, normal tuning and R2's restore/regeneration/warm-cache ownership remain separate. All human and performance gates remain open.
