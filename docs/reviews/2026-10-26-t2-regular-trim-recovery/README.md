# T2 — regular-window sill and lintel caps

The primary whole-building path now uses the existing closed opening loft for every regular sill/lintel, including unedited windows. Previously only locally width-edited windows used it. The legacy shared prototype had22 non-outward triangles out of44; the corrected solid has64 triangles, zero non-outward triangles and zero collapsed UV triangles. Its exterior profile points and physical bounds remain exact. This is a cap/closure repair, not a new architectural treatment.

`evaluateFacadeConstruction.ts` selects the proven loft and versions its regular whole-building prototype key. `constructionOpeningTrimGeometry.ts` only updates its descriptive comment. Standalone older bay/facade previews retain their prior compiler path; generic profile sweeps, roof bands, UI, materials, renderer and persistence are outside this repair. Existing locally edited closed trim and the T1 storefront sill stay unchanged.

## Geometry and texture proof

The actual reviewed version8 source is extended through the existing validated compositor with one diagnostic `horizontalTrim` role layer: the pinned `trim.horizontal.primary` stone source, base colour/normal/ORM channels,0.64m ×0.64m physical tile. The material source library is literal-unchanged. This exercises the existing supported file/compositor boundary; it does not add a trim-authoring control to the UI. The unique replay source and12 literal aliases are retained in [textured-project.zip](textured-project.zip) and [its manifest](portable-manifest.json).

| Native view | Before | Corrected |
|---|---|---|
| Original stone finish, WebGL | [Regular window](before-webgl/sill-textured.png) | [Regular window](webgl/sill-textured.png) |
| Exposed-end angle, WebGL | [Old cap](before-webgl/trim-end-textured.png) | [Closed cap](webgl/trim-end-textured.png) |
| Maps removed, WebGL | [Old geometry](before-webgl/sill-no-textures.png) | [Corrected geometry](webgl/sill-no-textures.png) |
| Stone finish, WebGPU | [Regular window](before-webgpu/sill-textured.png) | [Regular window](webgpu/sill-textured.png) |

All seven WebGL before/after camera and light pairs are exact; WebGPU whole/front focused cameras are exact. GPU end-view drag sampling differed, so those later GPU views are not presented as exact camera comparisons. Original profiles/silhouettes are intentionally retained. The cap repair is geometrically substantive but visually modest; it does not claim a new level of building realism.

Only43 legacy regular-trim semantic paths change submitted geometry in this source. Every other semantic geometry hash—including frames, glazing, wall, roof, door, storefront and previously locally edited trim—remains exact. Material-channel hashes, finish bindings, profile bounds and imported source stay exact. The real renderer executes before passive submission checks; final compiled geometry matches across backends. [Verification](verification.json).

Final WebGL passes four source checkpoints/ten captures; WebGPU passes four/eight. Native pixels return exactly after Open and cold recovery on each backend, with zero cold provider/material-generation calls. Colour/normal/ORM removal is exercised on both backends; WebGL also supplies shadow-off controls. These controls retain base material colours; the `clay-no-shadows` filename denotes maps/shadows removed, not the separate product Clay mode.

## Tests, replay and diagnostic limits

Three new cases fail before the repair for all three window assemblies. They now require outward nondegenerate triangles, physical cap UV deltas, two incident triangles per welded edge, exact cap area and signed solid volume. Existing preservation cases explicitly retain exterior profile points, all frame/glass buffers, original recipe/resolution hashes, archived mesh bytes and every instance transform. Whole-building compiler goldens intentionally change from `10b986...` to `6d29b0...`; source graphs and recipe JSON do not change. The old compiler byte hash is not claimed as retained.

All five required checks pass: typecheck, lint, **1,866 tests /129 files**, build and **eight standard E2E workflows**. [Gate receipt](required-checks.json). [Focused preservation](preservation-regressions-final.log) passes32 cases. The first full run passed1,863 cases and failed three inherited topology/instance-ID expectations; its exact log is preserved. The final gate run follows the test refinements. Two test-only updates occurred after native capture; every production/config pin used in those native runs is still exact. Final code/config/test pins total347;339 of346 prior pins stay literal and one test file is added.

[Excluded attempts](excluded-attempts.json) retain the rejected diagnostic role and strict pixel failures. Partial failed draws prove the reopen mismatch was camera matrices after an end-view orbit; source, geometry, channels, bindings and lights matched. The final harness drains diagnostic orbit damping before clicking the actual Reset view button and retains exact camera/light/pixel assertions. This stabilizes the test setup without changing production camera-reset behavior or adding pixel tolerance. The Reset-view damping issue remains a separate bounded follow-up. Familiar WebGL deprecation/precision warnings remain.

No paid provider, new mesh asset, architecture/UTDG evidence, artist study, release, merge or performance acceptance is introduced. Publication is a separate PR stacked on T1/PR9, followed by actual images in the existing phone gallery. A subsequent publication receipt will supersede pending-delivery wording in this sealed archive.
