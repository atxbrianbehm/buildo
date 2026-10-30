# AL.P9.0: Procedural storefront awning geometry

A versioned, owned plan fits a simple sloped canopy and hanging valance to a single existing front-ground storefront bay. The roof and valance are closed procedural geometry with physical-coordinate UVs. The plan checks bay containment and an illustrative 2.05 m front-edge clearance; that threshold is a demo constraint, not a legal or historical claim. Dimensions are configurable and are not measured from the supplied photographs.

[Without awnings](without-clay.png), [awning front](awnings-clay.png) and [angled view](awnings-angle.png) use the same divided storefront geometry in an isolated, untextured WebGL study. The canopy is currently a simple rigid-looking surface: there are no support arms, cloth deformation, stripes or fabric material. This is not the application or an accepted visual baseline. Connecting it to an actual fabric slot, versioned graph/worker and artist controls remains subsequent work; structural edits must not regenerate the material artifact.

The focused awning and storefront tests passed 19 tests, including fit, clearance, replay, stale/tampered data, finite closed geometry and outward winding. Full repository validation is pending. The renderer can be reproduced with `node docs/reviews/2026-10-30-al-p9-awning-geometry/render-clay.mjs`.
