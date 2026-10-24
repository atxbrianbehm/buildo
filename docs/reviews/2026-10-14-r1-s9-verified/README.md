# R1.S9 — Shared-facade UV phase discriminator

Engineering discriminator complete, 2026-10-14. This packet proves a placed-phase contribution to cross-piece brick-course transitions. It adds an opt-in diagnostic counterfactual; it does not implement the production phase repair or clear human visual acceptance.

All five repository checks pass. The packet preserves **18 actual WebGPU/WebGL PNGs, two runtime-validated JSON artifacts and 20 literal verified copies**. Six production/restored PNGs are byte-identical to the actual [accepted S8 captures](../2026-10-14-r1-s8-verified/README.md). There are zero page errors or backend fallbacks.

## Result and selected follow-up

Shared phase visibly aligns courses across selected wall pieces in rear, right and three-quarter views. Two linked pixels change their actual packed source and presented RGB while their flat-control RGB remains exactly equal. This supports a bounded production change to the owned exterior source UVs of `mesh.wall-panels` before atlas clipping.

Broad lower-wall bands, dense mortar, busy trim and thin flat-control boundaries remain. Fine flat-control raster detail also changes with retessellation, so whole-image differences are not blanket texture-only evidence. Shadow/hairline ownership, normal tuning, non-wall materials and R2 remain separate.

All six human criteria, worth-keeping judgment, measured whole-building course density and representative-machine/family performance remain open. The declared **0.96 m / 12-course / six-column** field gives analytic **80 mm course / 160 mm pitch**; the existing **75 mm anchor remains nominal**. This packet does not measure rendered building course density.

## Actual image matrix

Each row uses one frozen S8 camera/light/canvas preset. Conditions run in the displayed order. Files below are actual captured bytes, not relabelled prior images.

| Preset | Production | Local base | Shared base | Local flat/no-shadow | Shared flat/no-shadow | Restored |
|---|---|---|---|---|---|---|
| WebGPU rear / ordinary | [PNG](r1-s9-webgpu-rear-ordinary-production.png) | [PNG](r1-s9-webgpu-rear-ordinary-local-base-color-only.png) | [PNG](r1-s9-webgpu-rear-ordinary-shared-base-color-only.png) | [PNG](r1-s9-webgpu-rear-ordinary-local-flat-no-shadow.png) | [PNG](r1-s9-webgpu-rear-ordinary-shared-flat-no-shadow.png) | [PNG](r1-s9-webgpu-rear-ordinary-restored-production.png) |
| WebGPU right / ordinary | [PNG](r1-s9-webgpu-right-ordinary-production.png) | [PNG](r1-s9-webgpu-right-ordinary-local-base-color-only.png) | [PNG](r1-s9-webgpu-right-ordinary-shared-base-color-only.png) | [PNG](r1-s9-webgpu-right-ordinary-local-flat-no-shadow.png) | [PNG](r1-s9-webgpu-right-ordinary-shared-flat-no-shadow.png) | [PNG](r1-s9-webgpu-right-ordinary-restored-production.png) |
| WebGL three-quarter / ordinary | [PNG](r1-s9-webgl-three-quarter-ordinary-production.png) | [PNG](r1-s9-webgl-three-quarter-ordinary-local-base-color-only.png) | [PNG](r1-s9-webgl-three-quarter-ordinary-shared-base-color-only.png) | [PNG](r1-s9-webgl-three-quarter-ordinary-local-flat-no-shadow.png) | [PNG](r1-s9-webgl-three-quarter-ordinary-shared-flat-no-shadow.png) | [PNG](r1-s9-webgl-three-quarter-ordinary-restored-production.png) |

Root inspected the 12 local/shared base and flat images at original size. An independent review inspected all 18 images and the three accepted S8 counterparts, then separately verified all PNG hashes and six literal baseline equalities. Shared phase changes course alignment; rear bands around y≈528/590/610 and thin boundaries near x≈697/812 remain. These observations do not supply human approval.

## Source and geometry scope

Only the ordinary `mesh.wall-panels` mesh is treated: **265 source boxes, 6,360 source vertices and 3,180 source triangles**. Authoritative compiler scope expansion byte-matches the original source arrays before assigning facade ownership. Exactly **265 owned exterior faces** receive placed UVs; **1,325 cap/reveal/interior faces** keep their original UV bytes. `mesh.opening-pockets`, `mesh.spandrels`, all other geometry and all 118 instance transforms remain protected. Live instanced-wall treatment is rejected.

Phase is in **building-local metres**, after source placement and before atlas clipping. Rear uses `u=x−xMin`, front `u=xMax−x`, right `u=zMax−z`, left `u=z−zMin`; all use `v=y−groundY`. Original root/object matrices are protected. Mathematical tests cover root/instance composition; this does not claim live wall-instance support or fixed world density under arbitrary root scale. Negative wrapping is a synthetic unit golden, not fabricated canonical runtime evidence.

Per-source-face clipping reconstruction matches every actual submitted position, normal, UV and rebased index in source order. Source order disambiguates overlapping cap candidates. Same-point witnesses use actual distinct pieces and submitted triangles; tile wraps use separate clipped charts rather than vertex-only fractional UVs.

All 12 material source identities, requests, provenance and layer bytes, plus raw packed-atlas channel bytes and declared channel hashes, match S8 exactly. The legacy channel hash identifies the channel name, dimensions and raw RGBA bytes; S9 does not independently decode the encoded PNG data URLs. Graph/catalog/controls/spec, original IR, source positions/normals/indices, atlas ID/manifest, cameras/lights and protected state remain fixed. This is a fresh-fixture proof; saved-state/warm-cache ownership remains R2 work.

## Linked pixel evidence

Coordinates use the actual 1280 × 800 captured canvas. Source values are direct packed-ROI RGBA at the transformed submitted UV, not a full filtered shader reconstruction. Presented values come from the decoded PNGs. Flat values are observations; no flat-difference threshold was invented.

| Actual pixel | Packed ROI local → shared | Source RGBA local → shared | Presented RGBA local → shared | Flat RGBA, both |
|---|---|---|---|---|
| Rear `[352,590]` | `[0,7]` → `[8,7]` | `[143,98,85,255]` → `[141,48,34,255]` | `[167,105,78,255]` → `[165,76,53,255]` | `[150,39,28,255]` |
| Right `[493,590]` | `[0,14]` → `[25,14]` | `[148,103,89,255]` → `[136,46,33,255]` | `[163,108,81,255]` → `[146,36,26,255]` | `[143,37,26,255]` |

Historical rear boundary rays at `[697,590]` / `[698,590]` identify pieces 19/24, face 0; right `[742,590]` / `[743,590]` identify pieces 38/36, face 2. Both pairs have selected owners on each side. Each nearest-ray query reports one owner with no differing-chart tie. These are ray witnesses; they do not prove a GPU raster winner. Required mapped pixels exclude ambiguous source/chart ties, and all 18 full-width profiles bind actual PNG bytes.

## Measured construction costs

| Metric | Local | Shared |
|---|---:|---:|
| Selected rendered vertices | 43,052 | 47,912 |
| Selected rendered triangles | 19,936 | 22,366 |
| Whole-scene rendered triangles | 61,508 | 63,938 |
| Selected geometry bytes | 1,616,896 | 1,801,576 |
| Scene geometry bytes | 3,444,336 | 3,629,016 |
| Instance matrix bytes | 7,552 | 7,552 |
| Active unique buffer bytes | 3,451,888 | 3,636,568 |
| Peak diagnostic union bytes | 8,374,784 | 10,176,360 |

The diagnostic retains **1,616,896 original selected bytes**, **4,681,216 guard snapshot bytes**, and measures **241,680 temporary source bytes**. Peak unions deduplicate actual backing buffers and exclude report transport, JavaScript objects and GPU allocations. Construction samples are **30.2–54.2 ms**, with preparation samples **61.4/69.3 ms**. These are local diagnostic observations, not performance acceptance or a production-memory budget.

Whole wall-panel surface area is **3,402.0858014698206 → 3,402.085801469824 m²**; bounds and normal-area distribution remain equivalent within floating-point precision. Both phases contain zero zero-area triangles, and minimum winding/normal dot is `0.9999999999999999`. All raw triangles remain charged to counts. Restored capture resources balance creation/disposal: rear 2/2, right 4/4 and WebGL 2/2, with no replacement or temporary geometry live.

## Verification and provenance

| Gate | Final evidence |
|---|---|
| Tests | [final-02](../../../test-results/r1-s9-2026-10-14/test-final-02.log), exit 0, **844 tests / 91 files** |
| Lint | [final-02](../../../test-results/r1-s9-2026-10-14/lint-final-02.log), exit 0 |
| Typecheck | [final-02](../../../test-results/r1-s9-2026-10-14/typecheck-final-02.log), exit 0 |
| Build | [final-02](../../../test-results/r1-s9-2026-10-14/build-final-02.log), exit 0; existing chunk advisory |
| E2E | [final-02](../../../test-results/r1-s9-2026-10-14/e2e-final-02.log), exit 0; persisted all-five marker |
| Focused QA | [focused-03](../../../test-results/r1-s9-2026-10-14/wall-phase-focused-03.log), **98 tests**, plus scoped lint/typecheck |
| Actual runtime failure/resource proof | [smoke-03](../../../test-results/r1-s9-2026-10-14/browser-controller-smoke-03.log), exit 0, hash-bound helper/wrapper/source |
| Render-free source/submitted-buffer preparation | [preparation-01](../../../test-results/r1-s9-2026-10-14/runner-preparation-01.log), exit 0 |
| Actual browser capture | [capture-final-01](../../../test-results/r1-s9-2026-10-14/capture-final-01.log), exit 0, 18 PNGs, zero page errors |
| Independent reconstruction and preservation | [final-02 retry-02](../../../test-results/r1-s9-2026-10-14/verification-final-02-retry-02.log), exit 0, 20 verified copies |

All 243 `src/server/scripts` files retain aggregate **`6b34c405378a9729d9c69fea394238fc35bff943b4f76225e145abf331ad6717`** before/after every final check, runtime smoke, capture and preservation. The [pre-edit ledger](../../../test-results/r1-s9-2026-10-14/before-source/source-baseline.json) pins all 238 prior files. Its own SHA is **`6bcab4595019b871e999ce4515b309cc2a232af40d6ba485760b54ed2947834b`**. The only old-file changes are the default-off building/browser diagnostic hooks; five named new files bring the source set to 243. Production compiler/material/renderer files and historical S7/S8 validators are unchanged.

The independent [source/copy checkpoint](../../../test-results/r1-s9-2026-10-14/final-02-proof/source-and-copy-checkpoint.json), SHA **`75f75af083925ab058c37368dcbae3d437d7ad59ef6c14b1d4d4d782fbd12f32`**, preserves 60 source snapshots, the tracked patch, five final logs, bound runtime/capture helpers and logs, prior provenance and all 20 raw/durable hash pairs. It validates the exact two-old-plus-five-new source delta across all 243 files, not just the 60 diagnostic fingerprints.

Fresh independent reconstruction checks original IR containers/arrays/backing buffers and bytes, geometry/material/instance references, actual unique buffer categories and local → shared → local disposal. It rebuilds **12 triangle witnesses, two continuity pairs, two wrap witnesses, two historical boundary selections, two linked pixel mappings and 18 PNG profiles** from fresh submitted geometry, compiler ownership, cameras, material bytes and actual PNGs. Every attribution field matches except **`captureCosts`**, whose browser allocation lifetime histories differ from fresh SSR construction. Those original 18 histories remain separately bound to report ledgers and the archived runtime proof; no other attribution field is exempted. The fresh cycle observes one temporary and one replacement disposed once, zero original geometry disposals, and exact original references restored. The bound adversarial runtime smoke separately observes ten temporaries and ten replacements disposed once, current-failure restoration and stale-failure isolation.

- [Acceptance card](acceptance-card.json): **`19e255e86618f45db2b8a75b5d2dac47679622acc9e44190b27aedf8245bb189`**.
- [Attribution](wall-phase-attribution.json): **`dc0681e8b4158d7c149c0dc57baeecb825c061fb2a4d60d362aac5d0504d2ba1`**.
- [Accepted preservation helper snapshot](../../../test-results/r1-s9-2026-10-14/final-02-proof/verify-and-preserve-s9.mjs.snapshot): **`176482ba1612687ed1eab8b02cf8a3d083a274a0a4ef9b2f51b87e058d3ec507`**.
- Source commit **`4c0fedeacfc9b4bed0c0000096d7d1ea605d23b9`**, with captured dirty-tree patch SHA **`d19244a7dfd8eede9f5450b174f120a756ed731dc91be6b6cb49366e6c1acbfa`**. No commit or push was performed.

Excluded attempts remain retained. The first full run used Windows PowerShell 5, which treated Vite's existing stderr advisory as a terminating shell error after the build completed; it did not finish the full gate. Final-02 used the installed PowerShell 7 without changing the check wrapper or quality thresholds. The first preservation attempt stopped before copying on the helper's incorrect numeric channel-format assertion; the accepted helper requires the actual `rgba8` tag and exact four-byte pixel layout. No source, test assertion, timeout, sampling filter or quality threshold was relaxed. Smoke 02 passed behavior but lacked embedded source/helper hash binding; only smoke 03 supplies that bound proof.

The [revival plan](../../plans/building-authoring-revival.md) remains authoritative for the next bounded packet and open human/performance gates.
