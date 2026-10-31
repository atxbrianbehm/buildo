# Signed-family storefront-light study

The retained-sign family study can opt into the existing deterministic demo catalog of display and transom pane divisions. Source-authored divisions are rejected rather than overwritten; the narrow generation change removes an implicit one-by-one placeholder only when the source has no division and the generated placeholder is exactly the default. A non-default generated value is rejected. Signed awnings, support rods, facade piers, the sign clearance and the pinned material plan remain intact.

`family.png` and `storefront-detail.png` show actual WebGL geometry with six different pane-count combinations. Massing, material and most storefront structure are held constant to isolate this study, so the family still looks too similar for a convincing street. The sign panel is blank; dimensions are demo values and historical coverage is unknown. This is not yet an artist-facing choice, an archive integration, or a finished set.

The focused test checks varied graph output, deterministic replay, retained source details and material plan, and rejection of explicit source divisions. Run `node docs/reviews/2026-10-31-al-p11-45-signed-storefront-lights/render.mjs` to reproduce the views.

Validation: typecheck, lint, production build, full suite (2,133 tests in 181 files), and standard browser smoke passed. The build retains its existing chunk-size warning. This isolated study was rendered in WebGL only.
