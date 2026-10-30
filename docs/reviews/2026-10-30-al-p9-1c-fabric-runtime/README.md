# AL.P9.1c: Supplemental fabric renderer resource

This packet adds a Three.js resource owner for the separately validated awning fabric. Its texture uses the source's physical tile dimensions against metre-based geometry UVs; scene leases defer disposal of the texture and material until the owner is closed and the final lease is released. The atlas is not modified. Invalid or tampered fabric is rejected before resource creation.

The [isolated angled render](striped-angle.png) and [front render](striped-clay.png) use this actual resource with the existing procedural awning and storefront study; the wall and storefront are flat-color demo materials. These are WebGL study images, not screenshots of the application or evidence of product integration. The canopy remains rigid and lacks supports. Graph/worker integration, semantic binding, editor ownership and both product renderers remain subsequent work.

The focused runtime test covers source integrity, physical repeat, pixel bytes, shared leases and one-time disposal. All five repository checks passed: 2,054 tests across 154 files, the standard browser smoke suite, typecheck, lint and build. The build retains its large-chunk warning. Reproduce the study with `node docs/reviews/2026-10-30-al-p9-1c-fabric-runtime/render.mjs`.
