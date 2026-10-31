# AL.P11.36 — paired or triple grouped-window choice

The signed-building grouped-family demo now offers a **Grouped windows** choice: pairs or groups of three. The selected value is recorded in the existing archive policy and drives real repeated opening geometry. When an archive is opened, the disabled preview control shows its saved choice; returning to the original building restores the artist's previous choice.

Actual app checks create, export and reopen a triple-window family in [WebGL](webgl.png) and [WebGPU](webgpu.png), retain the original source and material, and report no material-provider calls during the family operation. Opening-lock rejection is also exercised. Member editing, flexible scope, automatic recovery and broader storefront/material variation remain pending; this demo is not a historical or street-ready baseline.

Typecheck, lint, build, browser smoke and the full suite passed (2,127 tests in 181 files). The build retains its existing chunk-size warning.
