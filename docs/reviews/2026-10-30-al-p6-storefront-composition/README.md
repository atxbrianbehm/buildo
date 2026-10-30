# AL.P6.0: Divided storefront geometry

This packet adds a versioned, validated division plan for an existing storefront aperture and constructs separate glazing panes and physical timber mullions. A display can have one or two lower lights; a display or entrance transom can have one, two or three lights. Clear dimensions derive from the original frame and reject undersized panes. The entrance leaf, hardware, wall aperture and original material slots remain unchanged. A single-light plan produces exactly the original geometry.

`single-clay.png` and `divided-clay.png` compare the existing and divided storefronts; `divided-angle.png` shows the physical depth. These are isolated, untextured WebGL compiler studies, not screenshots of the building application or evidence of historical dimensions. The renderer can be reproduced with `node docs/reviews/2026-10-30-al-p6-storefront-composition/render-clay.mjs`.

The focused division and storefront-geometry suites passed 21 tests; typecheck and lint passed. Full validation results will be recorded separately. This geometry is not yet wired to the graph, worker, editor or family generation. Texture interactions and real application rendering require those subsequent packets. The referenced streets also require more varied entrances, facade composition, signs, awnings and massing before a street-readiness claim.
