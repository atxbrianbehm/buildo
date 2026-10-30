# AL.P9.2a: Bay-scoped awning authoring

The construction workspace offers a storefront awning section: select a front bay and add or remove its awning. The first placement explicitly creates a striped demo fabric; subsequent placements and structural edits reuse it. Removing the last awning keeps that source so undo can restore the treatment. Placement dimensions and fabric are fixed demo defaults in this slice, and the rigid canopy has no support arms or cloth deformation.

The actual [WebGL building](webgl-authored.png), [WebGPU building](webgpu-authored.png) and [artist controls](controls.png) show two manually placed awnings. Both backends exercised placement, removal, undo/redo, automatic recovery, explicit save/reopen, unchanged atlas and fabric on subsequent placements, and zero new atlas material-provider calls during editing. Both backends also passed the extended final-awning removal and history check. These captures do not establish historical dimensions or street readiness. Generation and family preview remain guarded until they can preserve the fabric.

Focused control and graph tests and typecheck passed. Full repository validation is pending. The workflow script requires the locally retained P6.2 project at `docs/reviews/2026-10-30-al-p6-2-storefront-authoring/webgpu-02/divided.json`.
