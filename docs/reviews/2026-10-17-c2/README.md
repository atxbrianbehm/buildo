# C2 — executable facade repetition and node workspace

Status: engineering complete, 2026-10-17. C1 bay appearance was accepted by the user. [Verification and preserved-file hashes](verification.json).

The construction workbench now repeats the accepted bay through connected floor/bay splits and named selections. A three-storey/four-bay facade contains twelve windows, rendered as thirty-six actual frame/glass/trim instances sharing three procedural prototypes. Changing counts changes real scope collections and instance transforms. Semantic addresses retain floor/bay identity.

The node workspace supports selection, parameters, compatible connections, add/delete, bypass, layout and scope/geometry previews. Added nodes scroll to their actual layout position; malformed worker replies cannot omit the compiled prototype pool. It edits the same graph as the inspector. Optional profiled bands and the roof cap are connected contributions. Invalid edits retain the last valid source and view. Preview remains separate from saved construction.

Graph/project version 0.2.0 explicitly adds these operators while retaining the 0.1.0 reader and unchanged C1 IR. Both APIs reopen nondefault counts, named selections, bypasses and rewired connections. A legacy C1 project resaves with exactly equal JSON values, including its material authority. Structural edits make no provider calls after the twelve construction material artifacts initialize.

The viewport and canvas now share their sizing rule. Facade framing fits actual bounds to the view, and Fit nodes fits both dimensions. Native clay review isolated pane striping to opaque shadow casting by the new instanced glazing. The renderer marks those glass proxies as receivers without opaque casting; frames, trim and masonry retain their shadows. The legacy C1 path retains its existing policy. Fine shadow-edge aliasing remains visible.

| Check | Result |
|---|---|
| Typecheck | Pass |
| Lint | Pass |
| Unit tests | 1,569 / 109 files pass |
| Production build | Pass |
| Standard browser smoke | All eight existing authoring/recovery workflows pass |

The final focused compiler/workbench/node tests pass 26/26. Full coverage includes exact C1 IR bytes, real prototype buffers and native instance transforms, stable semantic lookup, typed connections, graph causality, material preservation, invalid/stale results and cleanup. The build retains its existing large-chunk advisory. The UI detector reports eight inherited accent-border warnings.

Actual [WebGPU](webgpu-receipt.json) and [WebGL](webgl-receipt.json) each pass fourteen draw observations and twenty-two captures, with no page/runtime errors. The observer compares submitted positions, normals, indices and instance matrices to the worker result, checks glass shadow policy and confirms visible canvas bounds. Full native framebuffer PNGs reproduce exactly on reopen and rejected edits; CSS-rounded-corner compositing is kept outside that native pixel comparison. The harness reads pixels after the real render and does not change geometry or materials. Reset view supplies a consistent camera for source comparisons; rejected edits are checked without resetting their current view. GL is deliberately forced by hiding navigator.gpu.

| Backend | Workspace | Clay workspace | Close textured | Close clay |
|---|---|---|---|---|
| WebGPU | [View](images/webgpu-final-desktop.png) | [View](images/webgpu-reference-clay-workspace.png) | [View](images/webgpu-facade-close-textured-close-workspace.png) | [View](images/webgpu-facade-close-clay-close-workspace.png) |
| WebGL | [View](images/webgl-final-desktop.png) | [View](images/webgl-reference-clay-workspace.png) | [View](images/webgl-facade-close-textured-close-workspace.png) | [View](images/webgl-facade-close-clay-close-workspace.png) |

Compact layouts: [WebGPU](images/webgpu-compact.png), [WebGL](images/webgl-compact.png). Close native framebuffer images are preserved beside these workspace views. The facade has real recessed sash, aperture returns, chamfered members and extruded sill/lintel profiles. This milestone constructs the front facade. Ground-floor entrance, complete side/rear walls and a whole-building roof remain C4. Glazing uses the accepted opaque display preset and outdoor reflection field; interiors remain outside this slice.

Raw final App runs are app-08-webgpu/webgl under test-results/c2-2026-10-17, driven by capture-c2-09.mjs. Earlier runs are retained: initial layout clipping was corrected; subsequent strict screenshot hashes caught 38 CSS-corner pixels, leading to exact native framebuffer capture; shadow probes isolated opaque glazing casting before the source correction. Final review added the new-node visibility and omitted-prototype-pool regressions; final-03 is superseded by final-04. All five final-04 check logs, API receipts, selected reviewed images and twenty-one runtime/test sources are preserved here. This is a scoped source checkpoint for continued work, not a complete repository export.

Next: C3.P0 undo/redo and automatic source recovery, then C3.P1 semantic surfaces. No commits, pushes, publication, paid providers, installation or release occurred.
