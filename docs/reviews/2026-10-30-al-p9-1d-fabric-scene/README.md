# AL.P9.1d: Supplemental fabric scene binding

The actual Three.js scene adapter can bind a separately owned awning fabric to uniquely addressed canopy and valance mesh batches, without asking the atlas registry for that slot. A scene lease retains the material until scene disposal. Missing fabric, invalid or ambiguous semantic addresses, fabric instances and existing surface-composition combinations reject explicitly. Surface composition still assumes atlas-backed batches, so awnings cannot yet coexist with it through this experimental adapter path.

The [isolated angle](striped-angle.png) uses procedural awning geometry passed through the actual scene adapter with a synthetic IR; the surrounding storefront remains a separate flat-color study. This is not the application and does not demonstrate graph, worker, editor, project or family ownership. Canopy supports and cloth detail remain absent.

Focused tests cover semantic lookup, shared material, missing fabric, composition guard, semantic rejection and scene disposal. All five repository checks passed: 2,055 tests across 155 files, the standard browser smoke suite, typecheck, lint and build. The build retains its large-chunk warning. Run the isolated render with `node docs/reviews/2026-10-30-al-p9-1d-fabric-scene/render.mjs`.
