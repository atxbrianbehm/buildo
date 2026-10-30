# AL.P9.1h: Awning workspace scene ownership

Construction fixture preparation can now verify and own supplemental fabric before creating graph-generated awning meshes, pass it into the family scene and atlas-backed surface runtime, and release it after scene leases are disposed. Missing fabric rejects. The family runtime includes shared fabric materials and textures in its live counts. Existing project opening, history and checkpoint recovery remain guarded until the next packet can retain the source.

The [textured fixture study](workspace-fixture.png) renders the actual prepared construction fixture in isolated WebGL with procedural demo masonry, graph-generated awnings and independent striped fabric. It is not an editable app screenshot. The rigid canopy has no support arms or cloth deformation, and no historic dimensions are claimed. Reproduce with `node docs/reviews/2026-10-30-al-p9-1h-workspace-scene/render.mjs`.

Focused scene and existing surface tests passed, including missing source and repeated disposal. Typecheck and lint passed. All five repository checks passed: 2,058 tests across 157 files, the standard browser smoke suite, typecheck, lint and build. The build retains its large-chunk warning.
