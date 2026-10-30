# AL.P10.0 — upper façade pier geometry study

A versioned, runtime-validated plan places upper-front vertical piers at bay edges within explicit floor clearances, avoiding provided opening spans. The compiler study builds each as three beveled procedural solids: shaft, base and cap. Pier identities carry floor and edge indices; plan replay rejects changed source or geometry choices. The request requires explicitly supplied free floor intervals and opening clearances; it does not itself derive these from a building graph.

The isolated comparison uses a synthetic wall and simple glazing: left has no piers, right has the new geometry. This is not the actual editor, a historical reconstruction, or a texture/material acceptance. The treatment is plain and needs review alongside the real façade, trims, window heads, divided/grouped openings, horizontal bands, local finishes and material UVs. Graph/worker, project persistence, family generation and artist controls remain unimplemented.

Focused tests cover owned deterministic replay, semantic identities, opening and floor clearance conflicts, limits, and finite generated geometry. The image was produced by `node docs/reviews/2026-10-30-al-p10-facade-piers/render-clay.mjs`. All five checks passed: 2,074 unit tests across 165 files, browser smoke, typecheck, lint and build. The build retains its existing chunk-size warning.
