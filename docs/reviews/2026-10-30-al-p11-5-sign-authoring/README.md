# AL.P11.5 — bay-scoped sign authoring

Artists can add or remove one blank framed sign on a selected front storefront bay. The current demo uses fixed shallow dimensions. The compiler rejects a sign in a bay with an awning or without sufficient trim clearance. Removing the sign restores the prior graph, including existing piers and neighboring awnings.

Clean-start WebGPU and WebGL app runs reject a same-bay awning conflict, add a sign in another bay, remove it, undo, redo and recover while retaining base materials and fabric. The actual image shows the shallow blank panel. Lettering, proportions, sign materials, same-bay awning coexistence, generation and family use remain pending; no historical evidence is claimed. WebGL emitted existing shadow-map and shader precision warnings.

All five checks passed: typecheck, lint, build, browser smoke and the full suite (2,093 tests in 171 files). The build retains its existing chunk-size warning.
