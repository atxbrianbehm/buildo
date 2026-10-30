# AL.P9.2e: Seeded family awning placement

The artist can opt into additional awnings on otherwise unoccupied front storefront bays when previewing a six-building family. The authored awnings remain intact; a deterministic demo catalog assigns zero, one or two extra awnings, and a semantic seed chooses their bays. A general opening or affected frontage lock prevents variation, while a pinned unrelated window width does not. Infeasible bay counts fail explicitly. The versioned family document saves and validates the composition and shared fabric, including through member edits and reopen.

Actual [WebGL](webgl-family.png) and [WebGPU](webgpu-family.png) previews exercise the editor, generation, member isolation and family save/reopen. The workflow verifies one, two and three awnings across members, retains the original bay, preserves sibling buildings and fabric, and observes no additional material-provider calls. The [member edit](webgl-member.png) removes the authored bay from one building without changing its siblings. The workflow uses the locally retained P6.2 project at `docs/reviews/2026-10-30-al-p6-2-storefront-authoring/webgpu-02/divided.json`.

The awnings share one striped demo fabric and fixed dimensions; no supports or cloth deformation are included. The family still repeats facade massing and materials in this example. These are bounded procedural studies, not evidence of historical appearance or street readiness. More variation and evidence mapping remain necessary.

All five repository checks passed: 2,061 tests across 159 files, standard browser smoke, typecheck, lint and build. The unit and browser suites ran separately; the build retains its large-chunk warning.
