# Storefront divisions with piers and a signed awning

The explicit storefront-division graph operation now works on pier-bearing, signed and shared-sign-awning graphs without downgrading the graph or dropping its other directives. Existing graphs do not change until this operation is requested. The focused test confirms that the resulting divided glazing is real compiled geometry and that pier, sign, canopy, valance and support meshes remain unchanged.

The `before` and `after` WebGL views use the same building, materials, grouped upper window, sign, awning, rods, piers, camera and lights. The after view changes the display glazing from one to two lights and the transom from one to three. These are demo dimensions, not historical attribution or a complete facade. The combined workflow is not yet exposed as an artist control or family variation, and the storefront arrangement, brick and silhouettes still need broader variety. The sign panel is blank and no completed street is claimed.

Reproduce the render with `node docs/reviews/2026-10-31-al-p11-43-storefront-composition/render.mjs`.

Validation: typecheck, lint, production build, full suite (2,131 tests in 181 files), and standard browser smoke passed. The first smoke attempt timed out waiting for the Assembly Hall tab at startup; a complete retry passed. The build retains its existing chunk-size warning. The isolated comparison was rendered in WebGL only.
