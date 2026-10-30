# C10: procedural parapet silhouette

The accepted construction building has a single continuous flat parapet. Add a second, visibly raised-center front parapet treatment to the same `BuildingRoof` operator, retaining the flat form as the literal default. The front wall rises in three contiguous sections with a centered raised middle and balanced lower shoulders; the other three elevations retain their flat parapet. A continuous profiled coping follows the resulting top, including the two vertical transitions. This is generic geometric vocabulary, not an assertion about historical styles or UTDG coverage.

Use the existing `BuildingRoof` scope, building dimensions, parapet height, coping projection and wall/trim materials. The existing deck and accepted cornice treatments remain independent. No preassembled mesh, image-derived structure or material regeneration is allowed. The registered graph owns the authored treatment; seeded recipe lineage remains unchanged until a separately versioned recipe actually supplies such a choice. A custom graph remains available in advanced mode.

## Sequential packets

| Packet | Scope | Required closure |
| --- | --- | --- |
| C10.P0 — complete | Pure, versioned raised-center front parapet plan: owned source, three contiguous balanced spans, explicit base/top heights and coping path. No compiler, graph or product behavior change. | Strict JSON and tamper rejection, deterministic replay, finite physical bounds, contiguous spans and path, positive shoulders/center, dimension endpoints and invalid fit, typecheck, lint and focused tests. |
| C10.P1 — complete | Compile the plan into closed, outward procedural parapet and coping geometry on the existing roof scope with an explicit graph/worker version. Keep the old flat output and all non-parapet/coping buffers literal. | Real triangle winding, watertightness, corners/steps, UVs, no exposed coplanar faces, dimension causality, accepted three cornices and protected geometry/material identities, protocol and old-source coverage. |
| C10.P2 — engineering complete | Add an artist-facing parapet treatment choice under Roof & trim, retaining advanced access, authored exceptions, generation locks, portable history and cold recovery. | All five checks; real WebGPU/WebGL whole and close textured/clay views; supported dimensions, invalid-fit retention, undo/redo/Save/Open/cold, material and source continuity, no material regeneration, compact/keyboard access and phone review. |
| C10 visual review — accepted | Review both actual silhouettes before family expansion. | Explicit human visual decision, separate from historical UTDG, artist studies and family/block performance. |

P0 is planning groundwork and does not make the new silhouette visible. Continue P1 and P2 as separate PRs once their predecessor passes; do not insert a new human gate between them. The step plan is a geometric design input only. Do not claim the new surface is usable before its compiler, controls and native proof exist.


P0 result: seven focused tests, typecheck and lint pass; all 356 prior source/config/test pins remain exact. The initial lint-only formatting failure is retained. [Evidence](../reviews/2026-10-29-c10-p0-parapet-planning/README.md). No runtime silhouette is claimed.


P1 result: graph/worker 0.9 admits real closed stepped geometry; 68 focused tests/five files, typecheck and lint pass. The flat compiled buffers and the accepted cornice backing/repeats stay exact in the covered cases. A separate clay diagnostic shows the compiled silhouette; product authoring, texture interaction and cold continuation remain P2. [Evidence](../reviews/2026-10-29-c10-p1-parapet-geometry/README.md).


P2 result: grouped authoring, project 0.10 and authored regeneration retention are implemented. All five checks pass (1,948 tests/135 files and eight E2E workflows); both native backends cover actual textured/clay, map-disabled, height/elevations, undo/redo, source, room and cold continuity. The initially visible contact/brick join was repaired as one continuous parapet boundary with aligned UVs. Existing triangular ground-shadow gaps are visible in a similar flat baseline and remain unattributed. [Evidence](../reviews/2026-10-29-c10-p2-parapet-authoring/README.md). Human visual review is next.


On October 29 the user accepted the flat and raised-center parapets as the baseline. [Decision](../reviews/2026-10-29-c10-accepted/README.md). Ground-shadow quality and family/block performance remain separate.
