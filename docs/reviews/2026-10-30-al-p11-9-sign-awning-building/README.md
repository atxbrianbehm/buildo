# AL.P11.9 — sign and awning whole-building study

An explicitly versioned experimental request compiles a sign and an existing awning in the same bay of a complete building. Optional support rods and the canopy use the earlier shared-clearance plans. Other awnings retain their geometry, the canopy keeps its fabric material slot, and the source graph remains unchanged. Tests cover replay, source identity, clearance, supported and unsupported canopies, adjacent-bay retention and rejection of unsafe mounting.

The WebGL textured fixture includes striped awning fabric, masonry, piers, storefront glazing, a neighboring awning, and the combined treatment. The captured angle shows no obvious sign or rod intersection with the fabric; it is an illustrative compiler fixture, not an actual editable workspace or exhaustive texture assessment. Graph and worker integration, project continuity, full renderer coverage and artist authoring remain pending. The current app still rejects same-bay placement. This example is not evidence of historical coverage.

Typecheck, lint, build, browser smoke and the full suite passed (2,101 tests in 174 files). The first full run had an existing family undo test time out waiting for its button; that test passed in isolation and the full suite then passed on rerun. The build retains its existing chunk-size warning.
