# Pier-to-band junction study

The experimental pier compiler accepts an explicit `0.2.0` study request that brings upper-floor pier ends to the continuous storey bands. Legacy requests and saved graph directives continue to use their original clearance. The study requires an active band; it does not alter the cornice clearance, authored graph, materials, or non-pier geometry. It is not integrated into an archive or artist control.

The WebGL `before` and `after` images use the same building, grouped opening, materials, camera and lights. The detail views show the narrow gaps closing at the storey bands. The pier and band remain separate solids with touching faces; this does not establish welded topology or rule out artifacts from every camera angle and material. This is a small cleanup, not a more expressive capital, a reviewed baseline, or a complete texture and junction assessment. The building is a demo with unknown historical coverage; no signed storefront or family is exercised by this isolated study.

The focused compiler test checks the actual pier extents, unchanged non-pier geometry, legacy behavior, deterministic replay and missing-band rejection. Reproduce the comparison with `node docs/reviews/2026-10-31-al-p11-42-pier-band-study/render.mjs`.

Validation: typecheck, lint, production build, full suite (2,130 tests in 181 files), and standard browser smoke passed. The build retains its existing chunk-size warning. The isolated comparison was rendered in WebGL only.
