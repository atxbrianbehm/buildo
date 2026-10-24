# R1.S8 — primary-wall periodic sampling

The bounded sampling repair is complete. All five repository checks and the actual material/capture/preservation gates pass. Human visual acceptance, worth-keeping judgment, representative-machine/family performance and R2 remain open.

The selected primary wall now evaluates one periodic area field at both its 32×32 source and actual 27×37 atlas ROI. The declared tile is 0.96 m, with twelve even courses and six columns: 80 mm course and 160 mm pitch. This intentionally replaces S6's quantized 90/180 mm cadence. The unchanged 75 mm anchor remains nominal. The sampler is renderer-independent, deterministic and versioned; selected artifact content/provenance bind its descriptor. No-profile requests replay the exact legacy material bytes.

The primary source's base color and height change, with normal derived from the sampled ROI through the unchanged cyclic normal function. The other eleven sources, roughness/ORM, opacity, palette, seed, manifest/atlas ID, geometry, openings, controls and camera/light anchors remain frozen. The independent oracle matches 51,000 bytes across four dimensions; actual provider/packed/legacy reconstruction also passes. Analytic coverage is 20.02%, with source/ROI area sums 205.0048/199.9998. This does not establish rendered seam closure or measured whole-building course density.

## Rendered evidence

The new packet contains 18 building views and four swatches, with actual WebGPU/WebGL, no page errors and six passing controlled density gates. All nine textured building PNGs and both procedural swatches change from their actual hash-verified S6 counterparts. All nine clay and both checker PNGs remain byte-identical; procedural restoration also recovers exact bytes.

Root inspected all nine textured views, three swatches, one clay view and three S6 counterparts. The independent visual lane inspected all 22 new images and all eleven changed S6 counterparts. Coarse bright repeat stripes are much less prominent, especially on blank rear/right walls and the four-metre/scaled swatches. Cross-piece course/brightness transitions remain. Clay still exposes broad panel shading and thin bright boundaries; these cannot all be assigned to source sampling or UV phase. Busy non-wall textures and human aesthetic judgment remain outside this repair.

Representative actual renders:

- [Rear ordinary](building-webgpu-textured-rear-ordinary.png), [rear raking](building-webgpu-textured-rear-raking.png), [rear clay](building-webgpu-clay-rear-raking.png)
- [Right ordinary](building-webgpu-textured-right-ordinary.png), [right raking](building-webgpu-textured-right-raking.png)
- [Front ordinary](building-webgpu-textured-front-ordinary.png), [three-quarter WebGPU](building-webgpu-textured-three-quarter-ordinary.png), [three-quarter WebGL](building-webgl-textured-three-quarter-ordinary.png)
- [Procedural WebGPU](sampling-webgpu-procedural.png), [procedural WebGL](sampling-webgl-procedural.png), [controlled WebGPU](sampling-webgpu-controlled.png), [controlled WebGL](sampling-webgl-controlled.png)

## Verification and provenance

| Gate | Final result |
|---|---|
| Tests | 746 pass across 90 files; exit 0 |
| Lint, typecheck, build, E2E | Each exits 0 |
| Actual material preparation | Exit 0; source/packed/legacy/geometry rebuilt |
| Fresh capture | Exit 0; 22 PNGs, actual backends, six density gates |
| Independent preservation | Exit 0; four schemas, 22 decoded PNGs, 26 exact durable copies, 55 source snapshots |

All 238 src/server/scripts files retain aggregate SHA-256 **14d47fb6ddbbb4b7a486a5b5a49466f37d90f43bca3346d6b11c3f6acfc2fd70** before/after every final check and preservation. All old S7/S6 source archives and artifact pairs are rechecked. The preserver binds complete protected capture state, actual checker probes/packed rows, replay ancestry, backend identity and final-log markers, then freshly rebuilds the material delta before exclusive copies.

Artifacts:

- [Acceptance card](acceptance-card.json), [sampling report](sampling-report.json), [six density gates](wall-sampling-comparison.json), [periodic material delta](periodic-material-baseline-delta.json)
- [Pre-edit actual bytes](../../../test-results/r1-s8-2026-10-14/before-source/material-byte-checkpoint.json), SHA **59342dc99d9c119e953c88cda5fda955a54f19c3d7a4362791f28bda710a8e43**
- [Source/copy checkpoint](../../../test-results/r1-s8-2026-10-14/final-02-proof/source-and-copy-checkpoint.json), SHA **c71ae3c508bf640682c316789f1cf8b7bb09ea50ab64f8987464a1fa4c6eda4c**
- [Tests](../../../test-results/r1-s8-2026-10-14/test-final-02.log), [lint](../../../test-results/r1-s8-2026-10-14/lint-final-02.log), [typecheck](../../../test-results/r1-s8-2026-10-14/typecheck-final-02.log), [build](../../../test-results/r1-s8-2026-10-14/build-final-02.log), [E2E](../../../test-results/r1-s8-2026-10-14/e2e-final-02.log)
- [Actual material preparation](../../../test-results/r1-s8-2026-10-14/material-proof-final-01.log), [capture](../../../test-results/r1-s8-2026-10-14/capture-01.log), [preservation](../../../test-results/r1-s8-2026-10-14/verification-final-02-retry-02.log)
- [Raster tests](../../../test-results/r1-s8-2026-10-14/raster-focused-02.log), [integration tests](../../../test-results/r1-s8-2026-10-14/integration-focused-03.log), [periodic QA](../../../test-results/r1-s8-2026-10-14/periodic-qa-focused-03.log), [independent oracle](../../../test-results/r1-s8-2026-10-14/oracle-comparison-01.log)

Frozen identities: source commit **4c0fedeacfc9b4bed0c0000096d7d1ea605d23b9**; geometry **4c884d88523c475649e86fb084073e13c7868d5bad568e26a2822121a8fb045e**; atlas ID **atlas-1d48a26ed6a65eb6**. New atlas content is **91bcbed07bf019b3494a49d572c6405aca07cfd053661bcdc5698eb35db52e81**. The selected primary request/content hashes are **2165139dc83df3600b74655ac8b3bd880c7a7419058acc1df9ac14a26ff6dde1** / **94a80b2e23996459be463e868ed41580799f51024bab5150add7af1f49034859**. Geometry cost remains 11,868 IR triangles, 61,508 rendered triangles, 3,444,336 unique buffer bytes and 118 IR instances.

Earlier failed runs remain retained. The first full five-check attempt passed tests/lint/E2E but failed typecheck/build on two nullable slot accesses; the final correction preserves the existing rejection and ROI guard. The first preservation failed before copies because native Node loading reached TSX; the ignored helper now uses Vite SSR inside the cleanup boundary. No thresholds, assertions or timeouts were relaxed. Build retains its existing chunk-size advisory. Successful preservation emitted a non-failing WebSocket-port advisory; both SSR servers retain their finally cleanup. No commit, push, publication or remote-provider call was performed.

Next: the separate R1.S9 shared-facade UV phase discriminator in the [revival plan](../../plans/building-authoring-revival.md#ready-queue), using this frozen baseline. Its output must distinguish phase continuity from shadow/hairline contributions and measure counterfactual tessellation/sharing costs before a production repair is selected.
