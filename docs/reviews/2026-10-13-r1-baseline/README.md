# R1: reference acceptance card and sampling baseline

**Packet started:** 2026-10-13; captured and verified 2026-10-14 (America/Chicago)  
**Status:** preparation complete; all human visual reviews pending  
**Scope:** freeze the building, references, capture conditions and diagnostic baseline before selecting the first visual repair.

Run the repository capture harness:

```powershell
node scripts/capture-r1-baseline.mjs
```

The schema-validated [acceptance card](acceptance-card.json) records exact inputs, resolved dimensions and recipe identities, source snapshot, camera poses, render size, and ordinary/raking light settings. Reuse these conditions for repair comparisons. The [sampling report](sampling-report.json) records channel/source hashes, input/adapted UVs, texture settings, material scalars and probes of the presented PNGs. Captures alone do not record human approval. The default command refuses to overwrite this packet; supply a fresh repository-local output directory for another capture.

## Frozen canonical building

| Field | Value |
|---|---|
| Document | `buildo-demo-family` |
| Style pack | `late-19c-commercial-demo`, labelled demo |
| Prompt | `four floors, 7 bays, brick, flat roof, ornate trim` |
| Family seed | `family-seed` |
| Building seed | `building-seed` |
| Material seed | `material-seed` |
| Trim seed | `trim-seed` |
| Generation mode | Kit, high detail, complete through roof |
| Structural expectation | Four floors and seven valid requested front bays |
| Resolved specification | Width 29.016 m, depth 15 m; floor heights 5.6 / 3.606 / 3.606 / 3.606 m; parapet 1.287 m; seven front bays |
| Capture canvas | 1280 × 800, device scale 1, perspective field of view 42 degrees |
| Physical anchors | 75 mm brick courses; complete actual atlas manifest in the card, including the 0.96 × 0.96 m wall tile |

This is the same input set as the [R0 recovered baseline](../2026-10-13-r0/README.md). R0 recorded a 1600 × 1000 page at device scale 1 and an 842 × 521 building canvas; the exact R1 renderer size is frozen in the acceptance card. Retaining these inputs separates sampling investigation from a new building composition.

Marx supplies the primary visual hierarchy: masonry mass, restrained upper openings, projecting crown, differentiated base and a competent side elevation. The canonical four-floor/seven-bay building adapts those relationships. It is not a replica of Marx's proportions or a reconstruction from image pixels. Changing to a reference-sized composition would require a separately named and captured baseline.

## Reference identity and crops

The following original local files were visually inspected and their dimensions and SHA-256 values verified. Crop rectangles use original-image pixels, with origin at the top left. They identify comparison regions; the original images remain unchanged.

| Role | Original image | Dimensions | Comparison crop |
|---|---|---|---|
| Primary: whole-building hierarchy | [Former John Marx Grocery Store, Buffalo](../../ref/Former_John_Marx_Grocery_Store,_Buffalo,_New_York_-_20200821.jpg) | 960 × 1280 | `x: 80, y: 145, width: 840, height: 945` |
| Secondary: commercial base/body transition | [Brooklyn architecture on Vanderbilt Avenue](<../../ref/AN_EXAMPLE_OF_BROOKLYN_ARCHITECTURE_ON_VANDERBILT_AVENUE_IN_NEW_YORK_CITY._BROOKLYN_REMAINS_ONE_OF_AMERICA'S_BEST..._-_NARA_-_555902.jpg>) | 960 × 649 | `x: 270, y: 380, width: 405, height: 210` |

Reference hashes:

```text
Marx:
64CB05E4BD20A98833F2E5811B5E71A8C533A279486D8F0B0F9EADC6F7E00171

Vanderbilt:
CF616403EF6BE4F64680B797D13057E5D284D496E7B58B54EC7BE2205512C61C
```

The inspected Marx image has three levels and four front upper-window bays. The historical [reference catalog](../../ref/catalog.json) says “Regular 3-bay upper rhythm”; that count does not match these pixels. Vanderbilt has four levels including its red commercial base, while the catalog includes a `three-story` tag. These discrepancies are recorded here without changing the historical catalog. Vanderbilt's base/body contrast and transition guide base composition; its boarded alterations remain contextual.

## Six visual acceptance criteria

Review the whole building at an ordinary viewing distance, then inspect the same frozen views with raking light. Use clay to judge architecture and textured views to judge surface appearance. Existing measured geometry checks remain separate from these visual judgments. All six rows are **pending human review**; no current image or automated batch-presence check establishes a pass.

| Criterion | Tangible ordinary-view outcome | Tangible raking-view outcome | Human review |
|---|---|---|---|
| Massing and commercial base | Ground, upper body and crown read immediately. Ground framing/height differs from the body; the roof cap does not bury the cornice. | Crown and base cast coherent shadows at the recorded whole-building scale. | Pending |
| Facade rhythm | Upper openings align into rows; piers and masonry remain readable. Ground/body/crown have distinct emphasis rather than equally strong horizontal bands. | Pier, lintel and sill edges reinforce the hierarchy without clipping or misalignment. | Pending |
| Opening depth and glazing | Upper windows read as openings in walls. Glazing is visually distinct from masonry and frames; frame, return and glass layers remain legible. | Returns and frame shadows expose an inward glass plane with consistent facade orientation. | Pending |
| Trim layering and restraint | Crown is the primary trim system; belts, lintels and sills remain secondary. Intermediate ledges do not overwhelm the openings. | Multiple crown layers and smaller opening projections read without floating pieces or coplanar flicker. | Pending |
| Material scale and role/channel sampling | Brick courses read at a physical building scale. Wall, glass and trim retain their intended material roles; the surface pattern does not dominate the architecture. | Relief follows the intended mortar/material structure. One- and four-metre swatches retain equal physical density; channels remain correctly assigned. | Pending |
| Side/rear coherence | Secondary elevations have a simpler opening hierarchy. Corners, cornice returns and ground contact remain continuous. Rear output reads as coherent generated architecture. | Secondary openings recess correctly and trim joins remain coherent. Unseen reference elevations receive no reference-fidelity claim. | Pending |

These cover the original single-building checklist rows 1–6, with the catalog's storefront/base judgment included in massing. Freeze the existing approximately 75 mm brick-course anchor and named physical tile dimensions in the acceptance card. A later human review should identify the exact capture and criterion, and leave a failed or unreviewed row open.

The [R0 textured capture](../2026-10-13-r0/assembly-hall-textured-canvas.png) shows dominant masonry striping, filled-looking glazing and heavy horizontal projections. Its [clay capture](../2026-10-13-r0/assembly-hall-clay-canvas.png) is pale under default lighting. These observations motivate the baseline checks; they do not replace a scored R1 review.

## Capture conditions and backend evidence

The current product compiler, generated fixture, atlas and renderer adapter supply the building captures. Exact `front`, `three-quarter`, `right` and `rear` camera poses, plus ordinary and raking light settings, are frozen in `acceptance-card.json`. Whole-building framing should retain the complete roof and ground contact. Raking light supplements the ordinary view; it must not become the only condition under which architecture reads.

The captured WebGPU matrix contains four poses × two presentations × two lights. The WebGL compatibility lane contains the three-quarter ordinary view in both presentations. Each backend also has procedural and controlled sampling captures. Actual backend identity, primary perspective camera, projection matrix and frozen camera/light agreement were validated for every building image. Additional WebGL poses or raking views are outside this packet's matrix.

| Pose / backend | Textured, ordinary | Textured, raking | Clay, ordinary | Clay, raking |
|---|---|---|---|---|
| WebGPU front | [View](building-webgpu-textured-front-ordinary.png) | [View](building-webgpu-textured-front-raking.png) | [View](building-webgpu-clay-front-ordinary.png) | [View](building-webgpu-clay-front-raking.png) |
| WebGPU three-quarter | [View](building-webgpu-textured-three-quarter-ordinary.png) | [View](building-webgpu-textured-three-quarter-raking.png) | [View](building-webgpu-clay-three-quarter-ordinary.png) | [View](building-webgpu-clay-three-quarter-raking.png) |
| WebGPU right | [View](building-webgpu-textured-right-ordinary.png) | [View](building-webgpu-textured-right-raking.png) | [View](building-webgpu-clay-right-ordinary.png) | [View](building-webgpu-clay-right-raking.png) |
| WebGPU rear | [View](building-webgpu-textured-rear-ordinary.png) | [View](building-webgpu-textured-rear-raking.png) | [View](building-webgpu-clay-rear-ordinary.png) | [View](building-webgpu-clay-rear-raking.png) |
| WebGL three-quarter | [View](building-webgl-textured-three-quarter-ordinary.png) | Outside planned matrix | [View](building-webgl-clay-three-quarter-ordinary.png) | Outside planned matrix |

## Procedural and controlled sampling

Sampling must distinguish the actual generated source from a diagnostic atlas before attributing the visible result to UV handling, source content, material role selection or channel binding.

- **Procedural atlas:** the actual completed fixture's generated material pixels and channel data, sampled through the current adapter. This connects the swatches to the product's surface appearance.
- **Controlled atlas:** named synthetic patterns/role colors and known channel values with recorded physical dimensions, sampled through the same adapter. This exposes repetition, interpolation, role isolation and channel behavior. It is a diagnostic fixture and supplies no procedural-material aesthetic acceptance.
- **Geometry comparison:** one-metre and four-metre wall swatches and an opening/trim sample, with dimensions and mappings recorded. Equal per-metre density must survive a larger surface. Apparent wall striping alone does not identify its cause.

| Backend | Actual procedural atlas | Controlled diagnostic atlas |
|---|---|---|
| WebGPU | [View](sampling-webgpu-procedural.png) | [View](sampling-webgpu-controlled.png) |
| WebGL | [View](sampling-webgl-procedural.png) | [View](sampling-webgl-controlled.png) |

## Verified results

| Evidence | Current state |
|---|---|
| Acceptance-card and sampling-report runtime validation | Pass, schema version 0.1.0 |
| Resolved specification, artifact hashes and source identity | Recorded: local HEAD, tracked-diff hash and diagnostic/reference file hashes |
| WebGPU building matrix and runtime backend report | 16 images, actual WebGPU, primary perspective camera |
| WebGL compatibility captures and runtime backend report | Two images, actual WebGL, primary perspective camera |
| Procedural/controlled sampling evidence | Four images; both sources on both actual backends |
| Capture hashes, page errors and resource cleanup | All 22 PNG hashes verified; zero page errors; owned scenes, renderers, browser and Vite server closed |
| Six human visual judgments | Pending |
| Whole building judged worth keeping by the user | Pending |

The accepted capture run is `test-results/r1-2026-10-14/frozen`, logged in `capture-frozen.log`; copies of its 22 PNGs and two JSON artifacts were verified by SHA-256. Earlier route-fallback attempts and the shadow-camera-corrupted building captures are excluded. The harness now bypasses internal shadow cameras and validates the main perspective projection before freezing evidence. These corrections changed the diagnostic harness, not the production renderer or geometry.

Controlled swatches identify the first repair:

| Wall sample | Expected tile extents U × V | Current adapted span U × V | Controlled horizontal boundaries, WebGPU / WebGL |
|---|---|---|---|
| 1 × 1 m mesh | 1.0417 × 1.0417 | 1 × 1 | 8 / 8 |
| 4 × 1 m mesh | 4.1667 × 1.0417 | 0.1667 × 0.0417 | 2 / 2 |
| Normalized 1 m recipe scaled to 4 × 1 m | 4.1667 × 1.0417 | 1 × 1 | 8 / 8 |

In the swatch images, the upper-left square is the one-metre wall, the upper middle rectangle is the four-metre mesh, the lower rectangle is the scaled instance, and the right-hand opening uses the actual frame/glass recipes. The four-metre mesh loses almost all pattern variation; the instance stretches the same eight-cell pattern across four times the width. UV spans and independent presented-PNG scans agree across backends. Boundary counts are raw diagnostics, including asymmetric markings; they are not aesthetic scores or an exact brick-course count.

Controlled sources use flat height, roughness 255, metalness 0 and opacity 255. Production material scalars remain active, including glass opacity 0.82. Both packed atlases, source layers and input IR arrays stayed byte-identical. Adapter UVs remain in their intended slot rectangles; no neighbouring-role bleed was observed. Opaque sampling agrees closely, but background/glass pixels differ between backends; this packet does not claim full image parity. The product currently generates 32 × 32 sources into a 128 × 128 atlas; source fidelity remains a later visual question.

All 18 building views were inspected for framing and actual content. Broad masonry bands, obscured/filled-looking upper openings and heavy intermediate courses remain visible; side/rear quality remains open. **R1.S1 is the next separate packet:** restore physical wall sampling on mesh and scaled-instance paths, retain slot/channel isolation and immutable inputs, and recapture both backends using the frozen conditions. Then reassess the largest remaining visible defect. This preparation packet does not complete R1 or confer representative-machine, publication or release approval.
