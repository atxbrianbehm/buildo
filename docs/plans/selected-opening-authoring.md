# UX2: widen one selected upper-front window

The grouped workflow and three-recipe geometric baseline were [accepted on October26](../reviews/2026-10-26-authoring-review-decisions.md). The concrete task is existing artist-protocol task7: select one upper-front regular window, make it wider, and retain every other window and the material library. The current selected-frame control changes surface finishes only. This packet must make the wall hole, frame, sill and glazing agree; a visual transform or global width edit is insufficient.

## Current implementation seams

- `ui/BayConstructionWorkbench.tsx` already rejects selection callbacks from a fixture other than its accepted/shown fixture. It stores the selected semantic frame path. Keep that ownership check and revalidate selection when source or fixture changes.
- `compiler/evaluateFacadeConstruction.ts` builds stable paths from document ID, assembly-node ID and `cell.key`. For Storeys, front keys are `${storeysNodeId}/floor/${floorIndex}/bay/${bayIndex}`; other elevations add their face to the root. Instance ordering is not identity.
- `PlaceOpening` currently supplies shared width/height/sill to every scope. `PlaceStorefront` then replaces the front-ground apertures. `EmitWall` and `AssembleWindow` must consume the same changed scope collection for a local width edit. A second assembly branch would leave the wall incorrect or duplicate the window.
- Window prototype cache keys already include physical width/height, sill and assembly parameters. Different local widths can share a new prototype without duplicating unrelated geometry. The target semantic path must remain stable so its finish layers survive.
- `state/constructionGenerationState.ts` rejects unsupported topology and retains authored C7/C8 exceptions over immutable recipe lineage. Local width overrides need the same explicit preservation/release policy; target loss must not silently redirect an edit.
- `state/constructionHistory.ts`, `state/bayConstructionProject.ts`, checkpoint admission and worker protocol all validate graph data. A new structural instruction requires explicit version admission across these boundaries. Old readers must not synthesize an edit.

## Sequential milestones

| Packet | Scope | Closure evidence |
|---|---|---|
| UX2.P0 — complete | Pure versioned selected-opening address/request/derived plan. Only upper-front regular windows, one absolute width per request. No graph/operator/UI change. | Typecheck, lint, targeted adversarial/fit/ownership/readback tests and preexisting-source pin preservation. Durable source/check receipt. |
| UX2.P1 — complete | Explicit graph/worker admission and one scope-edit operation after frontage, shared by wall/window consumers. Store overrides in graph source using structural addresses. | Actual compiled aperture/assembly causality, unchanged unrelated openings and protected geometry, native buffers/UV/winding/identity, missing/duplicate/stale target rejection, old graph hashes and request/reply validation. Typecheck/lint and focused tests. |
| UX2.P2 — ready | Selected-window width control with one clearly named target, apply/reset and existing publication/history flow. Portable/history/checkpoint, authored/locked generation retention and explicit release. | All five repository checks and both native backends: select one real frame, widen it, inspect wall/frame/glass, materials/finishes exact, invalid-fit retention, Undo/Redo, Save/Open, room/cold recovery, selection ownership, keyboard/compact operation. Real gallery images. |

P1 follows P0 and P2 follows P1 without inserting another human approval gate. Keep one commit and PR per milestone. After P2, human review of the actual task and the existing artist protocol remains required before broader UI migration or more targeted operations. No recruitment or external outreach is authorized here.

## Structural and continuation rules

The target is `{documentId, storeysNodeId, windowNodeId, face: "front", floorIndex, bayIndex}`. Floor is at least1; ground storefronts, doors, side/rear elevations and custom topology are outside this first task. Decode only the exact canonical `/frame` path, then prove it exists in the current accepted fixture/graph and refers to exactly one admitted regular-window cell. Do not accept arbitrary strings merely because they match the pattern.

Width is absolute metres. Preserve opening centre/height, assembly choice, recess, sill projection and window semantic identity. Retain at least80mm masonry at both edges and enough width/height for the current frame. Account only for floating-point coordinate roundoff. Reject physical misfit instead of clamping, moving the opening or changing neighbouring windows. The planner verifies its owned supplied scope; P1 must bind that scope to the evaluated graph.

Use one versioned scope instruction containing unique structural targets and widths, inserted explicitly into registered topology. Its complete output feeds wall and opening assemblies. Reject missing or duplicate targets and cross-document/assembly addresses. Do not add preassembled meshes, renderer transforms or a parallel generator. P1 admits graph/worker0.7 explicitly. Portable project0.8 remains P2 work; P0 alone did not admit either format.

Keep edited dimensions and assemblies or Lock openings preserves explicit local widths. Clearing both releases them to the actual seeded recipe. If a preserved target disappears after reducing floors/bays, reject the candidate and retain the accepted source/scene; do not drop, clamp or retarget it. Shared opening-width changes continue to affect unoverridden windows; resetting a local override returns that cell to the current shared value. Custom graphs retain honest advanced fallback and safe generation rejection unless explicitly admitted.

Structural edits preserve material artifacts, local finish layers, semantic addresses and generation/reference lineage. Old project reads remain literal. New portable source must bind the graph version and immutable material source, with exact source roundtrip and zero cold material/provider generation. Selection is transient UI state, not a renderer-instance index serialized into the project.

The UTDG architecture adapter, historical evidence, additional opening families, artist sessions and family/block performance remain separate. Passing this task does not establish them.
