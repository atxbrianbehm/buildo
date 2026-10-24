# R1.S10 — fresh production wall-panel phase

Engineering complete for fresh compilation. S10 moves S9's selected shared phase into the pure compiler's existing wall-panel seam. R1's human visual, worth-keeping, measured whole-building density and representative-machine/family-performance gates remain open.

Base: local `main`, `4c0fedeacfc9b4bed0c0000096d7d1ea605d23b9`, plus the existing mixed revival worktree. Packet `2026-10-14-r1-s10`; finalized 2026-10-15 04:07 UTC / 2026-10-14 23:07 America/Chicago. No commit, push, publication or remote-provider call occurred.

## Accepted evidence

- [Acceptance card](acceptance-card.json), SHA **`a13a900cd2f7f24ac968917c6fcf2d6f212fee6705c60f2c2f1ba5743e064502`**.
- [Independent source/copy checkpoint](../../../test-results/r1-s10-2026-10-14/final-01-proof/source-and-copy-checkpoint.json), SHA **`b24c754e22feba7f101c956f816d4351f25dafae8a8daf60c4b5db7ee66203a9`**.
- [Actual preservation log](../../../test-results/r1-s10-2026-10-14/verification-final-01.log), exit 0: 13 literal raw/durable pairs, 12 decoded PNGs, 67 exact source snapshots and all 247 source hashes. Independent review verified the literal pairs and archived provenance.
- [Pre-edit source ledger](../../../test-results/r1-s10-2026-10-14/before-source/source-baseline.json), SHA `9c2834bd27119c14ec173971cf6b12eabe1bdaa4a12c4287ac76524745394495`.
- [Pre-edit UV checkpoint](../../../test-results/r1-s10-2026-10-14/before-original-wall-uvs/original-wall-uvs.json), SHA `02080dd1a915ce05bbd74dfc1aa8c754e2dc1a9df20b9cf5cc2c4ada605ae0b8`; [50,880 literal Float32 LE bytes](../../../test-results/r1-s10-2026-10-14/before-original-wall-uvs/wall-panel-original-uvs.f32.bin), SHA `37e76f653f71aabba69f43e25665c45324effc03a904974465933e659860969b`.

Both pre-edit freezes passed before implementation. [S9](../2026-10-14-r1-s9-verified/README.md), its attribution/provenance and the [S8 material baseline](../2026-10-14-r1-s8-verified/README.md) remain preserved; their scripts/validators are unchanged. The checkpoint freezes the executed preserver and provenance. Accepted preserver SHA: `d545c0bda536b506a5e4668aded9d4f07c4c9abce57728e334ae0f3fa13d59e4`.

## Exact source and geometry delta

Changed exactly three existing files: `compiler/facadeSplitPlan.ts`, `tests/facadeSplitPlan.test.ts` and `tests/buildingCompiler.test.ts` under `src/features/building-family/`. Added exactly four: `qa/r1WallPhaseProduction.ts`, `tests/r1WallPhaseProduction.test.ts`, `scripts/diagnostics/r1-wall-phase-production-browser.mjs` and `scripts/capture-r1-wall-phase-production.mjs`. The other 240 old source files are byte-identical, with no removals.

All final checks, runtime smoke, capture and preservation bind aggregate **`f6b09811a508268cc66672e39540c20047eaafba87ac6cb8fff8882f1ca6796c`**, 247 files.

Only `wallPrimitivesFromSplitPlan` changes production behavior. It retains authoritative facade ownership and order, using Float32-quantized placed source vertices to anchor phase: rear U=x−xMin; front U=xMax−x; right U=zMax−z; left U=z−zMin; V=y−groundY. Bounds anchor phase rather than choose owned faces, preserving corner-cap/inset-wall ownership.

| Quantity | Accepted proof |
|---|---|
| Source walls | 265 boxes, 6,360 vertices, 3,180 triangles, 1,590 faces |
| Selected/protected faces | 265 / 1,325; only selected face UVs may change |
| Changed UV scalars | 1,980; the selected mask is broader than the changed scalar set |
| Other arrays/order/instances | Positions, normals, indices, order and transforms unchanged |
| Recovered original IR | Substitute only exact old UVs in a read-only view → `349d1b2c44cee7c41d222c3da689c301fb2fac8f7fd37fb9fc3d1515ec939bcd` |
| Unchanged metadata | `b0bd8ece1683865f9ffe14a6acb112f4ae7f40e8a331e0ba440311afa773f274` |
| New production IR | `13205e74ca6c17d53beafe5ec339de4e2d82ff3cb42abf33e5afa1704da77f97` |
| New production UVs | `891ea31cb7912eb6e14ea72aa04fd18a8589c0f2f0e4eeeefc2899527fd0a5c1` |
| Selected rendered buffers, equal S9 shared | `80f8af529a89c96279ffd106014bc78e0bc35540ca3c0441ec6e98e753ee792c` |
| New whole rendered geometry | `a9e918244facbfb381378dd145df3a6337aa9d98d2deb136b0e4f62250fddd8b` |
| Protected rendered geometry | `9249e8d58ab784ef67783e2ffcabd0c86028d6a26a2e9bc34f94a456641286c0` |

Whole IR/geometry are a new production baseline: S9 shared mode retained original source IR, whereas S10 emits changed UVs. No whole-geometry equality with S9 diagnostic IR is claimed. Aperture, winding, coverage, density and historical compiler gates remain active.

Construction counts: 11,868 IR triangles; 63,938 scene triangles; 3,629,016 scene geometry bytes; 118 instances; 7,552 instance-matrix bytes. Selected rendered walls: 47,912 vertices / 22,366 triangles. Original-local-phase delta: +2,430 scene triangles / +184,680 geometry bytes, with transforms unchanged. These are construction counts, not timing or representative-machine acceptance. S9 diagnostic peak-allocation histories do not describe S10 production.

## Material and encoded PNG proof

All twelve actual source request/content records, raw layers and five packed raw channels remain S8-exact. Structural compilation does not regenerate material artifacts. Fresh verification independently decodes actual `debugExport.channels[].pngDataUrl` bytes, checks PNG dimensions and RGBA equality with actual packed/S8-verified raw channels, then re-encodes owned copies through the unchanged `createAtlasDebugExport` and compares literal PNG bytes.

Proof kind: `fresh-actual-decode-and-deterministic-reencode-from-S8-verified-raw-channels`. Legacy `channelHash` hashes name/dimensions/raw RGBA, not encoded PNG bytes. S8 did not preserve separate historical encoded-PNG pairs; no such equality is asserted. Encoder source guards stay fixed and re-encoding is verification only. The card's four-key material projection binds source/layer/channel hashes, with atlas identity separately bound.

## Actual presented captures

Real compiler/adapter/materials/default production mount, ordinary lighting, complete stage, high-detail kit fixture, 1280 × 800. Each preset runs production → base-color-only → flat-no-shadow → restored production. Actual backend identities are WebGPU and WebGL as labelled. Page errors/fallbacks: zero.

| Backend / pose | Production | Base color only | Flat, no shadow | Restored production |
|---|---|---|---|---|
| WebGPU rear | [PNG](r1-s10-webgpu-rear-ordinary-production.png) | [PNG](r1-s10-webgpu-rear-ordinary-base-color-only.png) | [PNG](r1-s10-webgpu-rear-ordinary-flat-no-shadow.png) | [PNG](r1-s10-webgpu-rear-ordinary-restored-production.png) |
| WebGPU right | [PNG](r1-s10-webgpu-right-ordinary-production.png) | [PNG](r1-s10-webgpu-right-ordinary-base-color-only.png) | [PNG](r1-s10-webgpu-right-ordinary-flat-no-shadow.png) | [PNG](r1-s10-webgpu-right-ordinary-restored-production.png) |
| WebGL three-quarter | [PNG](r1-s10-webgl-three-quarter-ordinary-production.png) | [PNG](r1-s10-webgl-three-quarter-ordinary-base-color-only.png) | [PNG](r1-s10-webgl-three-quarter-ordinary-flat-no-shadow.png) | [PNG](r1-s10-webgl-three-quarter-ordinary-restored-production.png) |

Six actual base/flat PNG byte arrays equal S9 shared controls; three restored-production PNGs equal S10 production counterparts. S10 production is a new baseline. Independent review inspected all twelve S10 images and six literal S9 comparators.

Shared course alignment is now default. Rear lower-wall bands, thin rear/right piece boundaries and fine front floor-row lines remain, including flat controls. Dense mortar, busy trim and oblique wavy/moiré-like patterns remain visually rough; this packet did not investigate the latter's cause. No blanket texture-only or convincing-whole-building claim is made. The unchanged 0.96 m / twelve-course / six-column model declares 80 mm courses / 160 mm pitch; the retained 75 mm anchor is nominal, not measured whole-building density.

## Verification and retained attempts

| Required check | Accepted result / actual log |
|---|---|
| `npm.cmd run test` | Exit 0; **901 tests / 92 files** ([log](../../../test-results/r1-s10-2026-10-14/test-final-01.log)) |
| `npm.cmd run lint` | Exit 0 ([log](../../../test-results/r1-s10-2026-10-14/lint-final-01.log)) |
| `npm.cmd run typecheck` | Exit 0 ([log](../../../test-results/r1-s10-2026-10-14/typecheck-final-01.log)) |
| `npm.cmd run build` | Exit 0; existing non-failing chunk-size advisory ([log](../../../test-results/r1-s10-2026-10-14/build-final-01.log)) |
| `npm.cmd run test:e2e` | Exit 0; `ALL_FIVE_CHECKS_PASSED_AND_SOURCE_STABLE` ([log](../../../test-results/r1-s10-2026-10-14/e2e-final-01.log)) |
| Fresh capture | Exit 0 ([log](../../../test-results/r1-s10-2026-10-14/capture-final-01.log)) |
| Preservation | Exit 0 ([log](../../../test-results/r1-s10-2026-10-14/verification-final-01.log)) |

Compiler-focused: 32/32 across three files. Production QA: 44/44. Final scoped lint/typecheck, runner parser/import/preparation and `git diff --check` passed. All five final logs have matching source-before/after hashes and stable results. Independent source review found no unrelated edits, structural randomness, leak or stale-result defect remaining in scope.

The [injected ownership smoke](../../../test-results/r1-s10-2026-10-14/ownership-smoke-01.log) passes twelve distinct cases: late production/condition/capture/snapshot results after remount; same-owner queued condition rejection/success; superseded hashing; old disposal after new mount; competing delayed mounts; disposal during mount; failed candidate cleanup. Captured owner epochs/generations, operation queue and idempotent disposal protect newer ownership. Exact helper/browser/source identities and actual exit 0 are bound by the preserved checkpoint. This is an injected async harness, not actual GPU failure simulation.

Excluded intermediate results remain retained: compiler-focused 01 compared a newly tested raw JS coordinate 11.999999999999998 to literal 12; the new assertion now uses Float32-submitted coordinates. QA typecheck 01 rejected an unnecessary narrowed interleaved-buffer fallback in a new test; ordinary BufferAttribute.array is used. Runner lint 03/04 required the nearest cleanup error as AggregateError cause; primary and cleanup errors are both preserved. Preparation 01 preceded the ownership correction. Final preparation 02, ownership smoke 01, all five final-01 checks, capture and preservation pass. No existing assertion or quality threshold was relaxed. No failed full-five/capture/preservation attempts occurred in S10. A later documentation-write quoting error occurred before any file mutation; it is not capture/test evidence.

## Boundaries and next packet

Fresh compilation only is covered. `restoreAssemblyHallFixtureFromCompletedFamilyPacket` attaches saved runtime IR; runtime schema 0.1.0 lacks compiler revision. Graph/atlas-based fixture/artifact IDs can collide across old/new geometry, and completed-packet hashing omits raw IR buffers. Restored/warm-cached packets do not automatically acquire the UV fix. Source restoration, compiler-aware content identity, migration/recompilation and atomic registry replacement remain R2 integration.

All six human criteria, worth-keeping, measured whole-building density and representative-machine/family-performance gates remain open. The [next separate packet](../../plans/building-authoring-revival.md#ready-queue) is R2.P0 authored-source contract and pure resolution, four new pure contract/core/test files with live integration held for later packets. Independent preparation does not clear R1 or establish live save/reopen.
