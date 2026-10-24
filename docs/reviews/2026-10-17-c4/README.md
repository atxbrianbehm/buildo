# C4: one complete procedural building

C4 engineering is complete. **Whole-building appearance awaits the user's review.** The app now starts with connected operators constructing a complete building, and the saved project retains those operators and semantic finishes.

![Final whole-building preview](presentation-webgpu/final-building.png)

## Review the result

Live local preview: [Building construction](http://127.0.0.1:4417/#document=c4-review). The loopback Vite server was checked for HTTP 200 after the standard browser gate completed. The Codex panel request was queued for this thread.

- [Final desktop workspace](presentation-webgpu/final-desktop.png) and [compact workspace](presentation-webgl/final-compact.png).
- [Modeled entrance, transom, leaf, hardware and threshold](presentation-webgpu/final-entrance.png).
- [Front textured](native-webgpu/front-textured.png) / [clay](native-webgpu/front-clay.png).
- [Side textured](native-webgpu/left-textured.png) / [clay](native-webgpu/left-clay.png).
- [Rear textured](native-webgpu/rear-textured.png) / [clay](native-webgpu/rear-clay.png).
- [Other side](native-webgpu/right-textured.png), [roof textured](native-webgpu/roof-textured.png) / [clay](native-webgpu/roof-clay.png).
- [Selected frame with local finish](native-webgpu/window-local-close.png).
- [Final WebGL building](presentation-webgl/final-building.png); its fallback badge no longer obscures the building. Core native captures predate that CSS-only correction; final-presentation captures show the current UI.

## What changed

Version 0.4.0 adds Footprint, Storeys, PlaceDoor, AssembleDoor and BuildingRoof to the executable graph and worker/project readers. The default 11.2 m by 8.4 m building has three storeys, four punched facade solids, 47 window assemblies sharing three prototypes, a five-part door, continuous bands and a closed roof with parapet, cornice and coping. Inspector values and graph parameters share one authority. Shared aperture subdivisions drive wall holes and opening assemblies; exact quarter-turn poses orient the instances.

Continuous facade solids remove internal bay caps. Building-scoped rail/profile UVs represent physical length on every face, and isolated filtered tiles keep finish scale independent of atlas neighbors. New projects use 256-pixel frame, door, roof and trim sources; imported material libraries stay unchanged. The roof uses its own aligned filtered color/normal/ORM planes. No preassembled building, facade or component assets are used.

Actual glass/frame picking, Focus frame, ordered local/shared finishes, Undo/Redo, Save/Open and automatic recovery work on the completed building. Material edits retain submitted geometry and actual UV buffers; structural changes reuse all original material channel bytes. Equal-bounds finish updates retain the focused camera. Standard C2/C3 facade completion preserves material sources and surviving front frame targets; a ground-front window is explicitly replaced by the entrance. Unsupported custom conversions or missing finish targets reject without replacing the accepted scene.

## Verified behavior

| Required check | Result |
|---|---|
| `npm.cmd run typecheck` | Pass, final-03 |
| `npm.cmd run lint` | Pass, final-03 and post-archive |
| `npm.cmd run test -- --maxWorkers=2` | **1,632 tests /116 files**, final-02 |
| `npm.cmd run build` | Pass, final-03 |
| `npm.cmd run test:e2e` | Pass, all eight existing workflows, final-03 |

The full unit suite ran on core candidate-04. Final candidate-05 differs only in scoped fallback CSS. All executable source and tests remain byte-identical. Fresh typecheck, lint, build and the standard browser check run on the final source. Final presentation captures reproduce the core native framebuffer exactly while proving the smaller badge clears the model on desktop and compact layouts.

Actual WebGPU and WebGL each pass **22 observed states /23 captures**, plus **four final presentation captures**. Captured cameras cover front, both sides, rear, roof and close entrance in clay/textured views. Structural probes change footprint depth, storey count, window width and parapet height. Native probes check submitted positions/normals/indices/transforms, original source channels, actual UVs, scoped finish bindings, history pixel restoration, old C3 pixels, conversion continuity, version-4 portable source and exact cold-recovery pixels. Each backend records twelve initial construction-source requests, zero afterward, zero on cold recovery and disposal of retired owners. Final receipts have zero page errors. All 46 core screenshots and eight final presentation screenshots were visually inspected, with the six core contact sheets retained.

[Machine-readable verification](verification.json), [portable source manifest](portable/manifest.json), [source snapshots](source/), [baseline diffs](diff/), [checks](checks/) and [capture drivers](drivers/) are preserved. Source snapshots and drivers use `.txt` suffixes to avoid becoming duplicate active tests or lint inputs. Portable JSON is deduplicated by file SHA while the manifest retains each backend's original saved/cold file identity.

## Attempts and review limits

Early probes and interrupted candidates remain under provenance, attempts and checks. An initial native conversion assertion incorrectly required the front window that becomes the entrance; it was corrected to require preservation of surviving windows. A UV probe's arbitrary unique-coordinate threshold was replaced by physical-coordinate/nondegenerate-UV checks. Code review caught a compatibility issue where an unconnected version-4 operator could change old facade UVs; rendering now depends on reachable building scope, and explicit regressions cover old C1/C2 output. Earlier native/check jobs were interrupted before acceptance to make that correction.

The first combined final browser run collided with a concurrently running presentation capture's shared Vite dependency cache. Its dynamic-import failure is retained. The independent final-03 rerun, after capture servers closed, passes all eight workflows. No product behavior was changed to bypass that failure.

Materials remain restrained and stylized, with opaque reflection-based glazing and no interiors. Conversion is bounded to the standard connected facade. Representative-machine performance, a convincing family and blocks are not established here. This packet proves engineering behavior and supplies rendered views; it does not accept its own appearance. C1's earlier appearance acceptance remains scoped to that bay. The next gate is the user's judgment of the whole building, opening depth, material scale, trim restraint, roof, entrance and usefulness of the construction workflow.

No commit, push, publication, installation, release or paid provider call was performed. The existing mixed recovery tree is preserved.
