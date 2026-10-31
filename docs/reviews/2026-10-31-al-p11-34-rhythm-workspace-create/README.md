# AL.P11.34 — create and export a grouped family in the workspace

For a generated signed building with a same-bay awning and retained material lineage, the workspace offers **Preview grouped family**. The clearly labeled demo varies massing, upper heads and roofs and applies paired-window rhythm on eligible facades. It retains the source sign, awning, support rods and material source. The preview is read-only but **Save family** exports a verified archive that Open family can reopen; Return to building leaves the original construction in place. Opening locks and incompatible or ill-fitting source choices stop the operation without publishing a partial family.

Actual app checks cover creation, export, reopening and unchanged source in [WebGL](webgl.png) and [WebGPU](webgpu.png), with no material-provider calls during the family operation. WebGL also exercises the opening-lock rejection. Member editing, automatic recovery and flexible rhythm controls remain pending; this fixed demo is not street-ready or a historical inference, and storefront and material treatments still repeat.

Typecheck, lint, build, browser smoke and the full suite passed (2,126 tests in 181 files). The build retains its existing chunk-size warning.
