# R1.S7 verified wall-band and panel-seam discriminator

**Result:** complete for diagnostics. Packet `2026-10-14-r1-s7` preserves **18 PNGs, three runtime-validated JSON artifacts and 21 verified durable copies**, actual WebGPU/WebGL and zero page errors. Geometry, source/material bytes, atlas, controls and camera/light state retain the accepted S6 baseline. No product source, palette, course, geometry, UV, normal, non-wall or persistence repair occurred. R1's human/worth-keeping/performance gates and R2's warm-cache/source-document blocker remain open.

## Evidence matrix

| Validated record | SHA-256 |
|---|---|
| [Wall-seam report](wall-seam-report.json) | `9a23646cf31969792196d1fe48dd4ef3c017f83938f976fd1bcb6e1cb3075669` |
| [Actual pixel/ray/source attribution](wall-seam-attribution.json) | `6b372998ffe4f0c9a7b4cdfa208680c108a818539591baa39698556809c565cd` |
| [Pre-treatment geometry checkpoint](frozen-geometry-checkpoint.json) | `548ca32d5c7223edc66073da24829e8ff33129e65db6059ce19e9739d6826aea` |

Each frozen preset uses production, normal-off, base-color-only, flat, flat-no-shadow and restored production in order. Normal-off detaches only the wall normal map; base-color-only also removes ORM maps with roughness 0.82/metalness 0; flat also removes color maps and uses linearized `#842d20`. Flat-no-shadow additionally disables wall `receiveShadow`; cast-shadow flags and protected non-wall state remain unchanged. Original resources remain intact.

| Actual backend / preset | Production | Normal-off | Base color only | Flat | Flat, no shadow | Restored | Submitted frames |
|---|---|---|---|---|---|---|---|
| WebGPU / rear / raking | [PNG](seams-webgpu-rear-raking-production.png) | [PNG](seams-webgpu-rear-raking-normal-off.png) | [PNG](seams-webgpu-rear-raking-base-color-only.png) | [PNG](seams-webgpu-rear-raking-flat.png) | [PNG](seams-webgpu-rear-raking-flat-no-shadow.png) | [PNG](seams-webgpu-rear-raking-restored-production.png) | 5–10 |
| WebGPU / right / raking | [PNG](seams-webgpu-right-raking-production.png) | [PNG](seams-webgpu-right-raking-normal-off.png) | [PNG](seams-webgpu-right-raking-base-color-only.png) | [PNG](seams-webgpu-right-raking-flat.png) | [PNG](seams-webgpu-right-raking-flat-no-shadow.png) | [PNG](seams-webgpu-right-raking-restored-production.png) | 12–17 |
| WebGL / three-quarter / ordinary | [PNG](seams-webgl-three-quarter-ordinary-production.png) | [PNG](seams-webgl-three-quarter-ordinary-normal-off.png) | [PNG](seams-webgl-three-quarter-ordinary-base-color-only.png) | [PNG](seams-webgl-three-quarter-ordinary-flat.png) | [PNG](seams-webgl-three-quarter-ordinary-flat-no-shadow.png) | [PNG](seams-webgl-three-quarter-ordinary-restored-production.png) | 5–10 |

All **six production/restored actual PNG byte arrays equal S6**. Counters measure successful render submissions, not GPU completion or FPS; strictly advancing counters and distinct flat pixels guard against stale treatments, while actual presented/restored bytes provide separate proof. The independent visual lane inspected all 18 new images and the four S6 views below; root inspected eight new treatments and four S6 views.

| S6 comparison / raking | Clay | Textured |
|---|---|---|
| Rear | [PNG](../2026-10-14-r1-s6-verified/building-webgpu-clay-rear-raking.png) | [PNG](../2026-10-14-r1-s6-verified/building-webgpu-textured-rear-raking.png) |
| Right | [PNG](../2026-10-14-r1-s6-verified/building-webgpu-clay-right-raking.png) | [PNG](../2026-10-14-r1-s6-verified/building-webgpu-textured-right-raking.png) |

## Measured causes and unresolved ownership

- **Periodic texture bands:** horizontal texture bands remain with normal maps disabled and with only base color, and disappear with flat color. Actual packed rows **35,36,0,1** sample source rows **30,31,0,0**, widening the duplicated endpoint joint. Nearest packing also duplicates interior source joint rows **6 and 12**. Source-to-atlas sampling is therefore a measured contributor; the packet does not establish correct full-building course density.
- **Panel UV phase:** at y = 590, rear pixels 697 → 698 cross IR primitives 19 → 24 with horizontal tile phase **0.315997 → 0.035654**, source texels **[9,6] → [0,6]**, and outward normal **+Z** on **z = 7.5 m**. Right pixels 742 → 743 cross primitives 38 → 36 with phase **0.882615 → 0.007534**, source texels **[27,12] → [0,12]**, normal **+X** on **x ≈ 14.508 m**. The primitive indices and texture coordinates are distinct. These phase resets on the same wall plane are outside the selected sampling repair.
- **Received-shadow strips:** broad bay strips largely disappear when walls stop receiving shadows. The responsible caster is not identified; retained cast-shadow flags do not establish caster ownership.
- **Residual bright lines:** even flat-no-shadow retains rear x697 RGB **[156,46,32]** between x696/x698 **[97,17,12]**, and right x743 **[130,31,23]** between x742/x744 **[97,16,12]** (all alpha 255, y = 590). The **171 opposing coincident source-face pairs** are geometric candidates, not proven shadow casters or raster owners. CPU nearest hits do not identify the fragment responsible for a displayed line.

For the two WebGPU rear/right presets, the sidecar contains **556 actual rendered-buffer rays and 36 measured pixel profiles**; the WebGL preset supplies the separate frozen treatment control. Rays use the recorded production camera matrices; hits within 10 micrometres of the nearest distance are retained. Primitive/semantic bounds and axis-aligned box metre UVs map the sampled surfaces to source/packed RGBA. This is CPU attribution, not a full shader/shadow/raster evaluation. The four findings above remain separate; no single cause is assigned to every band.

## Frozen inputs and actual reconstruction

Baselines are the [S6 card](../2026-10-14-r1-s6-verified/acceptance-card.json), [sampling report](../2026-10-14-r1-s6-verified/sampling-report.json) and [material delta](../2026-10-14-r1-s6-verified/material-baseline-delta.json), whose SHA is **`c365b4419ab23b0050b621ffff9ddf096a83b9e198a1eb942ff1774a42c5e9a4`**. The [preserved S6 source/copy checkpoint](../../../test-results/r1-s6-2026-10-14/final-01-proof/source-and-copy-checkpoint.json) remains SHA **`49cfb312f3b8034cb4da8a4dc1cf56cebfa324016c59fbef8180435aee251d37`**.

Before copying, the verifier independently rebuilds all **12 actual source requests/content/provenance/layers**, raw and encoded packed channels, IR/rendered geometry, and the complete attribution from the raw PNGs. Every field matches the captured sidecar exactly. Geometry remains **`4c884d88523c475649e86fb084073e13c7868d5bad568e26a2822121a8fb045e`** and atlas content **`1ad52cb4ac9efae1e2d66d6494858efc853a944adc29a9a43c1d4b4f70b86bfd`**. Graph/catalog/atlas ID/manifest, physical anchors, controls, layout and cameras/lights remain exact.

Construction counts stay **11,868 IR triangles, 61,508 rendered triangles, 3,444,336 unique geometry-buffer bytes (approximately 3.28 MiB), and 118 IR instances**, with 58 windows and one door. The suite retains **537 strict complete-scene aperture rays per detail**, five full-pane rectangle fixtures and the 2 mm crossing sentinel. Those aperture gates are distinct from S7's 556 attribution rays and do not confer human/performance acceptance.

## Checks and source/copy proof

| Required command / operation | Final result / log |
|---|---|
| `npm.cmd run test` | Exit 0; **609 tests / 87 files** ([log](../../../test-results/r1-s7-2026-10-14/test-final-01.log)) |
| `npm.cmd run lint` | Exit 0 ([log](../../../test-results/r1-s7-2026-10-14/lint-final-01.log)) |
| `npm.cmd run typecheck` | Exit 0 ([log](../../../test-results/r1-s7-2026-10-14/typecheck-final-01.log)) |
| `npm.cmd run build` | Exit 0; existing non-failing chunk advisory ([log](../../../test-results/r1-s7-2026-10-14/build-final-01.log)) |
| `npm.cmd run test:e2e` | Exit 0 ([log](../../../test-results/r1-s7-2026-10-14/e2e-final-01.log)) |
| Fresh actual capture | Exit 0; 18 PNGs, zero page errors ([log](../../../test-results/r1-s7-2026-10-14/capture-01.log)) |
| Fresh reconstruction / preservation | Exit 0; three schemas and 21 copies ([log](../../../test-results/r1-s7-2026-10-14/verification-final-01.log)) |

Each final check records one `CHECK_EXIT_CODE=0`, `CHECK_SOURCE_STABLE=true`, and matching before/after digests for all **230 src/server/scripts files**: **`08c8a31792676fbddded5a790904bd9ae3f80b6069646d5296f9a3245f1a38a6`**. The E2E log ends **`ALL_FIVE_CHECKS_PASSED_AND_SOURCE_STABLE`**. S6's historical wrapper marker remains correctly described as terminal stdout only. [Focused QA](../../../test-results/r1-s7-2026-10-14/qa-focused-01.log) passes 49 tests; [scoped lint](../../../test-results/r1-s7-2026-10-14/qa-lint-01.log) and [typecheck](../../../test-results/r1-s7-2026-10-14/qa-typecheck-01.log) pass. [Final runner syntax/lint checks](../../../test-results/r1-s7-2026-10-14/capture-parser-lint-02.log) are retained. The [earlier parser log](../../../test-results/r1-s7-2026-10-14/capture-parser-01.log) precedes an API export-name correction; there is no failed actual S7 capture preflight. Existing thresholds/assertions/timeouts are unchanged.

The [versioned source/copy checkpoint](../../../test-results/r1-s7-2026-10-14/final-01-proof/source-and-copy-checkpoint.json) hashes to **`f431bd621adff3c3c4d384e1a0e94d72fb5355265958b1a5c3aff326b67b83be`**. It verifies **21 current artifact pairs, 47 current source snapshots, 43 prior S6 snapshots and all 26 S6 artifact pairs**. The [47-source archive](../../../test-results/r1-s7-2026-10-14/final-01-proof/source-checkpoint/), [tracked patch](../../../test-results/r1-s7-2026-10-14/final-01-proof/source-checkpoint/tracked-working-tree.patch), [five check snapshots](../../../test-results/r1-s7-2026-10-14/final-01-proof/checks/) and [prior S6 proof/baselines](../../../test-results/r1-s7-2026-10-14/final-01-proof/prior-provenance/) are retained. Source commit is `4c0fedeacfc9b4bed0c0000096d7d1ea605d23b9` plus unchanged tracked-patch SHA **`7bb06ad04b1ca2d9f968261dd65df93358be63b5c85a5a7f5fce620c44596c2e`** and exact current fingerprints; this is a dirty-tree checkpoint, not commit-only evidence.

The [wrapper](../../../test-results/r1-s7-2026-10-14/run-final-checks.ps1) and [its snapshot](../../../test-results/r1-s7-2026-10-14/final-01-proof/run-final-checks.ps1.snapshot) share SHA **`752da14efc39d55c6153e042c701a82de38ad2ba10620d79cd4d11287eca8d70`**. The [verifier](../../../test-results/r1-s7-2026-10-14/verify-and-preserve-s7.mjs) and [its snapshot](../../../test-results/r1-s7-2026-10-14/final-01-proof/execution-helper.mjs.snapshot) share SHA **`8eed8215699a81c4beb3dd65d91c9fd3dca98066c942da052f70699a034da876`**. All validation precedes exclusive durable/proof writes; source/checkpoint/byte stability is rechecked afterward. Prior excluded S5/S6 attempts remain unchanged. No commit, push or remote-provider call was performed.

PNG helper checks passed in the observed terminal verification; no separate test-log path is confirmed. The [frozen helper source](../../../test-results/r1-s7-2026-10-14/final-01-proof/source-checkpoint/scripts/diagnostics/r1-wall-seam-attribution.mjs.snapshot) remains archived, and the preservation log independently decodes and verifies all 18 actual PNG hashes/dimensions. This terminal-only check is distinct from the preserved final runner syntax/lint log.

## One next packet: R1.S8

The [Ready Queue](../../plans/building-authoring-revival.md#ready-queue) selects only **primary-wall source-to-atlas periodic sampling preparation/repair**, after this closeout and an explicit pre-edit source/material-byte checkpoint. The current 0.96 m/90 mm/180 mm model cannot close a uniform running-bond repeat: 10⅔ courses and 5⅓ columns, with an even-course vertical-repeat requirement. Endpoint cropping or `%31` → `%32` alone does not resolve the partial course/parity and interior nearest-sampling duplication.

The declared next model keeps the **0.96 m tile** and uses **12 even courses/six columns**, intentionally changing current 90/180 mm cadence to **80 mm actual course/160 mm pitch**, retaining 2:1 aspect. The 75 mm anchor stays labelled nominal; neither the model nor the diagnostic evidence proves 75 mm actual density. Changing the tile to 0.90 m would alter physical anchors and rendered UV buffers, outside frozen geometry.

S8 will carry an optional validated/versioned plan/request profile and content-bound artifact raster descriptor, then evaluate the same half-open pixel-area field at **32 × 32 source and actual 27 × 37 ROI**. It will retain **14% mortar relative to course**, bypass legacy duplicate-endpoint blending only for that profile, and reuse unchanged cyclic normal generation on the sampled height. Analytic mortar coverage mean **20.02%** (area sums **205.0048 / 199.9998**) is an independent target, not a thresholded RGB fraction or completed proof. Legacy no-profile/S6-v1 bytes and grain seed, other eleven sources, palette, roughness/ORM, opacity, geometry, manifest/renderer, controls and physical anchors remain strict. No S8 implementation occurred in this packet. Panel UV phase, normal tuning, shadow/hairline, non-wall and R2 repairs remain outside S8; human/performance gates stay open.
