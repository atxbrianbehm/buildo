# C5 - dynamic building generation and pinned reference materials

C4 appearance is accepted. C5 engineering is complete; **C5 human product review is pending**.

The construction workbench now evaluates an actual versioned PSG intent document, resolves seeded recipe choices through the existing graph operators and worker compiler, and supports Generate building, Reroll unlocked, numeric lock groups and retained authored dimensions. The editable graph remains authoritative. Custom connections or added nodes diagnose rather than being replaced by the recipe.

Pinned reference snapshots drive ten material slots, procedural sources and physical scales. Structural changes retain exact atlas channels. Material replacement retains finish targets, masks, blend and strength while rebinding their named slots; explicit artist scale overrides survive. Version 0.5 projects retain source, resolution and material lineage around the unchanged 0.4 graph. Generation history is version 0.2; older files retain their original shapes and pixels.

All five required checks pass: typecheck, lint, **1724 tests across 120 files**, production build and standard browser smoke. Both WebGPU and WebGL pass 16 actual App checkpoints and 16 captures each: two/four storeys, edited depth, locks, finish/reroll, Undo/Redo, material seed change, snapshot import, rejected input retention, Save/Open, room return, old C4 pixels and cold recovery. Cold recovery makes zero provider calls and zero material-generation requests. Retired or failed GPU owners are disposed.

The first capture was invalidated by a hot reload. A later capture exposed and helped fix stale finish-atlas pins on material replacement; overlapping authored/group locks were also fixed. The first broad suite was interrupted after two existing benchmark fixture timeouts on a 64-logical-processor host. The final standard run caps test workers at 4; no timeout or assertion was relaxed. Earlier logs remain available.

Local demo architecture coverage stays **unknown**. The imported reference in these captures is an explicitly labeled local demo test fixture, not live UTDG architecture evidence. Roof deck and utility are unmapped; unsupported wall scales and explicit weathering strength fail clearly. Family/block and performance approval remain later gates.

## Review

[Phone review images](https://app.notion.com/p/3fdb77d6cd4f812a9f88f1316beb9c25) contain 9 new C5 images and all 54 C4 images. The requested Buildo parent page is still unresolved; the gallery has not been moved under a guessed page.

Compare [two storeys](native-webgpu/generated-two-storey.png), [four storeys](native-webgpu/generated-four-storey.png), [clay geometry](native-webgpu/generated-two-storey-clay.png), [roof](native-webgpu/four-storey-roof.png), [authored finish](native-webgpu/authored-frame-finish-close.png), [WebGPU recovery](native-webgpu/cold-recovered.png), [WebGL recovery](native-webgl/cold-recovered.png) and [compact controls](native-webgpu/generation-compact.png). Full receipts and source pins are in [verification.json](verification.json); portable projects are indexed in [portable/manifest.json](portable/manifest.json).

The next decision is whether this bounded generation/edit/lock/reroll workflow is acceptable before family/block expansion. No C5 approval is inferred from accepting C4.
