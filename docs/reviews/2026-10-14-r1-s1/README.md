# R1.S1 — Physical wall-atlas sampling

**Result:** the three measured wall paths pass on actual WebGPU and WebGL. All five repository checks pass, including 329 unit tests across 81 files. R1's six human criteria and whole-building worth-keeping judgment remain pending.

Captured 2026-10-14 on local `main`, base commit `4c0fedeacfc9b4bed0c0000096d7d1ea605d23b9`, plus the recorded R0, preparation and R1.S1 working-tree changes. No commit or push was performed. The frozen [baseline](../2026-10-13-r1-baseline/README.md) remains unchanged.

## Evidence and reproduction

- [Acceptance card](acceptance-card.json): exact controls, resolved specification, references, identities, source/diff hashes, frozen cameras/lights, 18 building-image hashes and pending human criteria.
- [Sampling report](sampling-report.json): four procedural/controlled swatches, retained source/channel hashes, renderer identity, adapted geometry metadata, packed checker rows and presented-PNG scans.
- [Wall comparison](wall-sampling-comparison.json): validated before/after measurements and gates for all three wall paths on both actual backends.

The final capture was generated under `test-results/r1-s1-2026-10-14/2026-10-14-r1-s1/`. All 25 captured files were copied here with matching SHA-256. The original 22 baseline image hashes, both baseline JSON hashes and the final diagnostic source hashes were verified before copying. Owned browser, Vite server, fixture and renderer resources were closed.

Replay the same card into a fresh directory:

```powershell
node scripts/capture-r1-baseline.mjs <fresh-output-directory> docs/reviews/2026-10-13-r1-baseline/acceptance-card.json
```

The harness validates matching controls, resolved spec, graph/catalog/atlas identities, material anchors and frozen capture poses. Swatch atlas/source/channel hashes, canvas dimensions and pixels per metre must match the baseline. A requested backend fallback cannot count as evidence. Only the primary perspective camera is frozen; native shadow cameras remain under Three.js control.

The building matrix contains front, three-quarter, right and rear views, textured/clay and ordinary/raking light on WebGPU, plus ordinary three-quarter textured/clay comparisons on WebGL. The four sampling images use both source types on both backends. All captures are 1280 × 800 at DPR 1, with zero page errors.

## What changed

The renderer now clips continuous wall UV triangles at physical tile boundaries before atlas interpolation. Each clipped polygon stays inside the existing semantic wall slot and shares vertices within its triangle fan. Adjacent tiles retain separate UV edges. No whole-atlas repeating or shader/backend replacement is involved; all five existing texture channels continue to use the same adapted UVs.

Compiler meshes explicitly use metre UVs. Recipe boxes explicitly use normalized face UVs, converted using their dimensions and transform scale. Opening and pilaster assemblies retain their metre UV domain even when assigned a wall material. Repeat-x stretches its other axis across a connected UV chart, including non-indexed geometry. Other material roles retain their existing mapping.

Equal-scale wall instances share a native instance group; differing scales receive compatible derived geometry groups. Source `elementIndex` stays the original IR index, while `instanceIndex` identifies the native group index. Semantic and gallery samples point to their actual group. The existing batch map remains a representative-object API. Building disposal releases native instance buffers and geometry once, while respecting shared family material/texture ownership. Failed construction cleans up previously created scene resources.

Structural IR arrays, graph identity, material source bytes and atlas channel bytes remain unchanged. The current piece-local UV phase is preserved; this packet does not establish continuous brick-course phase between separate architectural pieces. Per-batch source/rendered geometry is bounded at 100,000 triangles with a 400,000-cell clipping-work limit; unsupported spans fail explicitly.

## Measured result

The controlled source has eight nominal checker cells. The existing periodic edge blend and nearest packing produce **nine chromatic transitions per actual 27-pixel packed period**, including the wrap and seam bridge. Expectations therefore come from the retained packed RGBA rows: 9 / 0.96 = **9.375 transitions/m**, with median source spacing **0.106667 m**. The gate retains its finite-window tolerance of two edges and raster-spacing tolerance of two pixels; it does not widen the nominal expectation to bless the output.

All three horizontal scan rows produce the same results on both backends:

| Wall path | Before density / m | After density / m | After median spacing | Ratio to 1 m wall | Gate |
|---|---:|---:|---:|---:|---|
| 1 × 1 m mesh | 8.3715 | 9.4179 | 0.1100 m | 1.0000 | Pass |
| 4 × 1 m mesh | 0.5059 | 9.3597 | 0.1100 m | 0.9938 | Pass |
| Recipe scaled to 4 × 1 m | 2.0237 | 9.3597 | 0.1100 m | 0.9938 | Pass |

The controlled and procedural swatches visibly retain equal material scale across the mesh and scaled-instance paths. Regression coverage independently interpolates actual rendered triangles at interior points and repeat boundaries, checks neighbouring-slot isolation, negative phases, connected charts, heterogeneous scales, original matrices/semantic indices, gallery samples, source arrays, surface area and resource disposal. Six comparison-contract tests reject incomplete coverage, false pass flags and expectations inconsistent with packed pixels.

The final 22 images are byte-identical to the preceding successful comparison after the polygon indexing/allocation optimization. The first attempt is excluded: it used a nominal eight-cell expectation and failed the wide-swatches' density gate. Its images and report remain under `test-results/r1-s1-2026-10-14/attempt-1/`; no frozen baseline or failed record was overwritten.

## Cost and limits

The canonical fixture's compiler estimate remains **9,984 triangles**. The actual renderer count is **58,472 triangles** after adaptation, exposed as `renderedTriangleCount`. Wall batches account for 34,736 rendered triangles from 4,908 source triangles. Unique geometry buffers total **3,232,416 bytes (3.08 MiB)**, including **2,796,992 bytes (2.67 MiB)** for walls. The bounded SSR measurement and source hashes are in `test-results/r1-s1-2026-10-14/renderer-cost.log`.

The 100-building benchmark repeats geometry derivation and owns independent geometry buffers; only family materials/textures are shared. An isolated pre-optimization 100-building behavior test passed in 15.01 seconds with a diagnostic 30-second timeout. The two tests that intentionally construct 100 scenes now have an explicit 45-second timeout; their existing count, sharing and supplied-clock assertions remain intact. The global five-second timeout and the short yield/abort tests are unchanged. The full final suite passes with no skipped tests. This is not representative-machine frame-time, memory or family-performance acceptance. Existing benchmark/compiler triangle estimates do not become rendered cost measurements through this packet.

The original 32 × 32 procedural sources and physical atlas manifest remain unchanged. The 75 mm course anchor is retained; checker-density success does not prove that source-image quantization, course phase, masonry styling or architectural proportions are accepted. Opaque swatch measurements agree on both backends; glass/background differences remain, so whole-image backend parity is not claimed.

## Verification and next defect

| Required check | Final result |
|---|---|
| `npm.cmd run typecheck` | Pass, exit 0 |
| `npm.cmd run lint` | Pass, exit 0 |
| `npm.cmd run test` | Pass, exit 0; 329 tests, 81 files |
| `npm.cmd run build` | Pass, exit 0; existing non-failing chunk-size advisory |
| `npm.cmd run test:e2e` | Pass, exit 0 |
| Frozen replay capture | Pass; 18 building + four sampling images, all six density gates, zero page errors |

Logs are under `test-results/r1-s1-2026-10-14/`, with final runs named `*-final.log`. Diff review preserved the preceding R0/preparation work and found no unrelated production changes, new nondeterminism or stale async paths. `git diff --check` passes.

The [textured three-quarter view](building-webgpu-textured-three-quarter-ordinary.png) now exposes masonry across the glazing region rather than stretched bands. The [clay view](building-webgpu-clay-three-quarter-ordinary.png) confirms that apertures remain filled. Source review identifies complete wall-material pocket/reveal boxes across apertures, including an exterior reveal face in front of glass. The active high-detail compiler does not retain a closed whole-building massing box.

**Queued next:** R1.S2, clear opening apertures and establish frame/glass depth through the existing opening/split authority. Preserve controls, layout, material artifacts and this density result; add glazing-region ray/depth-order coverage for all orientations and repeat frozen rendered comparisons. No opening, trim-style or proportion repair was implemented in R1.S1. Whole-building visual acceptance remains open.
