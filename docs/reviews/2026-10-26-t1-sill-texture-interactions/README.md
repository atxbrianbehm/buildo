# T1 — storefront sill / texture interactions

The reported jagged brick-coloured patches on the display sills are overlapping geometry. The old 30 mm cap ended exactly at the bulkhead top; its upward face occupied the same plane as the masonry reveal. This packet seats that cap on the bulkhead instead, moving only its physical Y placement by 30 mm. No polygon offset, texture blur, material regeneration or shadow-bias workaround is used. The storefront prototype cache key now names the corrected geometry.

The same reviewed version8 project is opened on both native backends. Its source SHA256 is `f4f4a273bde8f2920f43c1d882f43361310f092176122ce1307d91f54d5d6df8`; every final Save/Open/cold file stays byte-identical to that source. No source format, recipe, seed, authored dimensions, finish or UTDG coverage is rewritten.

## Controlled result

| Same camera and light | Old placement restored | Corrected physical sill |
|---|---|---|
| Original textures | [Jagged brick patches](negative-control-webgl/sill-textured.png) | [Clean sill, WebGL](webgl/sill-textured.png) / [WebGPU](webgpu/sill-textured.png) |
| Normal maps removed | [Patches persist](negative-control-webgl/sill-no-normal.png) | [Clean sill](webgl/sill-no-normal.png) |
| Colour, normal and ORM maps removed | [Competing surfaces persist](negative-control-webgl/sill-no-textures.png) | [No competing top surfaces](webgl/sill-no-textures.png) |
| Shadows disabled, original textures | [Patches persist](negative-control-webgl/sill-no-shadows.png) | [Clean sill](webgl/sill-no-shadows.png) |
| Maps and shadows disabled | [Overlap remains visible](negative-control-webgl/sill-clay-no-shadows.png) | [Clean sill](webgl/sill-clay-no-shadows.png) |

The negative control restores only `bottom - 0.015` in a read-only Vite transform of the pinned final storefront module. On-disk production source and the final prototype key remain unchanged. This is a controlled geometry discriminator, not a claim that the entire old checkout was executed. All nine WebGL camera/light pairs are exact. The removal modes retain base material colours; the filename `clay-no-shadows` means maps/shadows disabled, not the separate product Clay presentation.

Only the three ground-display `trim` paths change submitted positions/normals/indices/UVs/transforms between negative and final controls. Every other semantic geometry hash, all five material-channel hashes and every semantic surface binding remain exact. The actual renderer executes before the passive observer checks submitted buffers against the real compiler output. Final geometry is equal across WebGPU and WebGL. [Machine-readable proof](verification.json).

WebGPU passes four source checkpoints and seven captures; WebGL passes four checkpoints and nine captures. Exact native pixels return after Open and cold recovery on each backend; cold provider/material-generation calls are zero. These are per-backend continuation checks, not a broad backend-parity or performance claim. The familiar WebGL shadow-map deprecation and precision warnings remain.

## Validation and boundaries

Three new cases exercise real wall-reveal contact at varying bulkhead heights and a nonzero floor origin. They require the cap to sit on masonry, its visible top to clear it by its 30 mm thickness, and its top UVs to keep physical metre scale. Existing finite geometry, winding, nondegenerate UVs, doorway, wall-area, regular-window, roof and material-slot regressions remain. All five required checks pass: typecheck, lint, **1,863 tests /128 files**, build and **eight standard E2E workflows**. [Exact gate receipt](required-checks.json).

Production changes are confined to two compiler files plus their existing test. All343 other code/config pins are unchanged. Renderer, material, UI and persistence modules are unchanged. The broader known legacy regular-window profile end-cap topology is separate from this storefront-box defect; no general trim-topology or historical UTDG claim is made here.

[Excluded diagnostic attempts](excluded-attempts.json) distinguish the first missing-render discriminator and diagnostic-only WebGPU cache errors from final production evidence. The final WebGPU harness assigns fresh material clones and leaves production shadows intact; the full shadow-off discriminator is on WebGL. Temporary materials, browser and server are disposed. Final actual native pixels and whole-workspace images are retained alongside receipts; portable source is referenced by literal hash rather than duplicated again.

The user accepted the UX2 task and requested this repair. Publication targets a separate PR stacked on PR8, with actual before/after images added to the existing phone gallery. No merge is authorized by this packet. Publication receipts will be linked after delivery.
