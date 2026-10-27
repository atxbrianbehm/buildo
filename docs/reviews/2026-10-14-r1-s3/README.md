# R1.S3 — Crown clearance and subordinate intermediate trim

**Result:** complete for the bounded front-trim clearance repair. All five repository checks pass, including 391 tests across 83 files. R1's six human criteria and whole-building worth-keeping judgment remain pending.

This geometry-only packet fits front cornice, belts and spandrels around the existing authoritative openings. It preserves controls, opening layout, frame/glass transforms, recipes/catalog/graph identity, material sources and atlas channels. No commit, push or remote-provider call belongs to this packet. The preceding [S2 evidence](../2026-10-14-r1-s2/README.md), [S1 density packet](../2026-10-14-r1-s1/README.md) and [original baseline](../2026-10-13-r1-baseline/README.md) remain preserved.

## Evidence and reproduction

- [Acceptance card](acceptance-card.json): frozen controls, references, identities, source/diff hashes, cameras/lights and 18 building captures.
- [Sampling report](sampling-report.json): procedural/controlled swatches, actual backends, source/channel hashes and presented-PNG measurements.
- [Wall comparison](wall-sampling-comparison.json): preservation of all three physical wall paths on actual WebGPU and WebGL.
- [Textured three-quarter view](building-webgpu-textured-three-quarter-ordinary.png) and [clay raking view](building-webgpu-clay-three-quarter-raking.png): verified crown/top-floor glazing clearance and subordinate intermediate courses. Human aesthetic acceptance remains pending.

Replay the recorded card into a fresh directory:

```powershell
node scripts/capture-r1-baseline.mjs <fresh-output-directory> docs/reviews/2026-10-14-r1-s2/acceptance-card.json
```

**Final evidence:** captured under test-results/r1-s3-2026-10-14/2026-10-14-r1-s3/ at 2026-10-14T17:01:47.445Z. The final 18 building and four sampling PNGs use 1280 × 800/DPR 1, with zero page errors and all six wall-density gates passing. Verification covers three schemas, all 22 PNG hashes, 17 source hashes plus the tracked diff, 66 ancestor images and all 25 durable copies. The source checkpoint retains the tracked-working-tree patch and source snapshots. All four sampling PNG hashes exactly match S2; preceding captures/checkpoints remain unchanged.

## What changed

The compiler derives trim clearance after building FacadeSplitPlan bindings and the actual paired opening transforms. It expands transformed frame/glass geometry envelopes by 50 mm, including arched casing and hood extents; nominal slot dimensions alone are insufficient. This derived input does not place openings or create another authoring authority.

The crown band starts above every actual front opening envelope within the body/roof region and ends at the floor-total plus parapet. A bounded allowance permits a narrow safe crown with zero parapet; unavailable bands omit the optional crown safely. Cornice profiles are rebuilt at fitted height and translated so the profile, brackets and fascia all remain in that band. Normals are generated from the fitted geometry rather than retained after scaling emitted positions.

Intermediate bands remain local to their floor breaks: search is bounded by 0.8 m and one-quarter of each adjacent floor, and all actual opening envelopes are subtracted. Selected bands are capped at 0.58 m for the commercial-base break and 0.32 m for upper breaks. Blank floors cannot expand ledges. Belt/profile/drip occupy the lower 40%; spandrels occupy the upper 60%, with 10 mm clearance on each side of the shared partition, leaving a 20 mm joint. Heights do not grow beyond their authored request, and tiny/empty systems emit no invalid empty batches.

Fitted intermediate projection is limited by local height and the available crown height, keeping floor systems subordinate. Mid-body string courses that crossed glazing are omitted in the fitted building path. Standalone calls retain their existing authored previews and dimensions.

Existing UV domains remain explicit: extruded profile strips/caps use normalized UVs; box primitives use metre UVs. Focused tests verify normalized coverage/source values, metre box distances, unit normals and actual fitted face normals. S3 does not repair mixed non-wall material-role sampling. S1's physical wall sampling remains unchanged; all six rendered density gates pass, and all four swatch PNGs are byte-identical to S2.

## Geometric coverage

The frozen 53-window/one-door fixture now passes complete-scene aperture checks with no cornice exception. At each high/low detail level, 492 strict rays cover 477 window-pane points, nine door-transom points and six lower-leaf points. Pane-first ordering, outward winding, nearby backing behind each pane rear and the intended lower leaf are retained.

Independent checks clip actual cornice/belt/spandrel triangles against the complete front window/transom pane rectangles and exterior depth. All five fixtures have zero positive projected trim overlap: the frozen canonical building, and layered/restrained crowns at the legal two-floor short-body and eight-floor tall-body endpoints. A synthetic 2 mm course sentinel proves this continuous rectangle test detects a crossing that the nine-point ray grid misses.

Fitted geometry tests cover every bracket/fascia/drip, shared-band separation, projection hierarchy, layered/restrained profiles, narrow/empty envelopes, nonfinite rejection, deterministic output and unchanged source specs/recipes/profiles. This proves bounded geometry clearance; it does not establish aesthetic acceptance.

## Verification and pending review

| Required check | Final result |
|---|---|
| npm.cmd run typecheck | Pass, exit 0 |
| npm.cmd run lint | Pass, exit 0 |
| npm.cmd run test | Pass, exit 0; 391 tests across 83 files |
| npm.cmd run build | Pass, exit 0; existing non-failing chunk-size advisory |
| npm.cmd run test:e2e | Pass, exit 0 |
| Frozen replay | Pass; 18 building + four sampling images, zero page errors, six wall-density gates |
| Source/evidence/copies | Pass; three schemas, 17 source hashes + tracked diff, 22 PNGs, 66 ancestor images and 25 durable copies |

**Bounded renderer cost:** 11,388 compiler IR triangles, 58,440 rendered triangles and 3,323,488 bytes (3.1695 MiB) of unique geometry buffers. Counts and source hashes are recorded in renderer-cost-final.log. Canonical SSR counts do not establish representative-machine memory/frame-time or family-performance acceptance. Final logs use the *-final.log suffix under test-results/r1-s3-2026-10-14/.

The old restored-IR/regeneration identity collision documented in S2 remains an R2 limitation; this packet does not repair state/persistence. Fresh S3 renders confirm the missing middle-front opening row and sparse side rows as the next largest visible defect. The next separate packet is a planner-local occupancy/rhythm repair with meaningful per-storey minimums and deterministic cell scores; global seeds and material artifacts remain unchanged. No planner repair was implemented in S3. Human judgments of crown hierarchy, trim restraint, facade rhythm, material roles and the whole building remain pending.
