# C10.P0 — parapet silhouette planning

This packet adds a strictly admitted, versioned plan for a flat or raised-center front parapet. For the raised treatment it derives three contiguous spans with balanced shoulders, a central rise and a six-point coping path. It rejects footprints where the existing parapet thickness and coping cannot fit, owns input data and rederives serialized plans before accepting them. The ratios are explicit design choices, not sourced historical evidence.

Seven focused tests cover the step path, flat form, ownership, dimensions and endpoints, fit boundaries, deterministic JSON replay and malformed/tampered input. Final focused tests, typecheck and lint pass. The first lint run failed on a test formatting rule; its log is retained, and the corrected source passed all three checks. All 356 source/config/test pins from the prior T9 native capture remain byte-identical. See [verification](verification.json) and [logs](checks/).

This is a pure planning contract. It changes no graph, mesh, renderer, product control, material or serialized project. P1 must construct real closed geometry and preserve the accepted cornices and flat baseline; P2 must expose it and prove actual source/material continuity before visual review. UTDG architecture coverage remains unknown.
