# AL.P11.38 — grouped-window placement control

The grouped-family demo now lets an artist place grouped windows on all upper storeys or only the top upper storey. The selected scope is recorded in the versioned family policy; older all-storey archives display their original setting. Opening an archive displays its saved scope, and returning to the source building restores the artist's prior choice.

Actual app checks create, export and reopen a top-storey triple-window family in [WebGL](webgl.png) and [WebGPU](webgpu.png), preserve the original source and materials, and make no material-provider calls during the operation. The focused workbench regression opens an older all-storey archive. Member editing, automatic recovery and broader storefront/material diversity remain pending; this is still a demo, not a historical or street-ready baseline.

Typecheck, lint, build, browser smoke and the full suite passed (2,128 tests in 181 files). The build retains its existing chunk-size warning.
