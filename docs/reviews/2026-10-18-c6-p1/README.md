# C6 - selectable procedural construction recipes

C5 was accepted on 2026-10-18. C6.P0 and C6.P1 are engineering complete; **C6 human visual review is pending**.

The existing construction inspector now offers restrained masonry, deep reveals and projecting cornice. Selection resolves a pinned recipe through the existing graph and worker compiler. The original C5 recipe ID/version/hash, saved source, compiled buffers and native pixels remain exact. No preassembled meshes, new renderer, material generator or project format were added.

For the captured three-storey/four-bay example, deep reveals change wall depth from 0.36 to 0.44 m, window recess from 0.14 to 0.25 m, frame width from 0.055 to 0.07 m and sill projection from 0.12 to 0.22 m. The cornice recipe changes cornice projection from 0.18 to 0.28 m and parapet height from 0.55 to 0.65 m. Recipe seeds and locks remain authoritative; these values describe the captured example rather than fixed values for every seed.

All five required checks pass: typecheck, lint, **1,746 tests across 121 files**, build and eight standard browser workflows. WebGPU and WebGL each passed 13 actual App checkpoints and 17 captures. Proof checks native submitted positions, normals, indices and instance transforms against the compiler. Recipe switching retains exact material source and channels, authored depth and frame finish; Undo/Redo restores recipe/source/pixels. Save/Open, room return and cold recovery retain exact source and pixels, with zero cold provider or material-generation calls. Failed candidate owners are disposed in regression coverage; retired owners are checked in the browser.

The first native comparison retained a footprint lock from an imported C5 project, correctly preserving wall thickness. Final native-02 captures explicitly clear locks and set storeys, bays and seeds before comparing recipes. Both runs are retained in raw evidence. Five P1 source/test paths changed after P0; the other 57 pins are unchanged.

## Review views

[Phone gallery](https://app.notion.com/p/3fdb77d6cd4f812a9f88f1316beb9c25) has 14 new C6 images alongside the existing C4/C5 images. The requested Buildo parent remains unresolved; the gallery has not been moved under a guessed page.

Compare [restrained](native-webgpu/restrained-building.png), [deep reveals](native-webgpu/deep-building.png) and [projecting cornice](native-webgpu/cornice-building.png); [original opening](native-webgpu/restrained-opening.png), [deeper opening](native-webgpu/deep-opening.png), [entrance](native-webgpu/deep-entrance.png), [roof](native-webgpu/cornice-roof.png), [clay](native-webgpu/cornice-clay.png), [compact controls](native-webgpu/recipes-compact.png) and [WebGL recovery](native-webgl/cold-recovered.png). Both backend folders contain the full set. [Verification](verification.json) pins the implementation, checks and receipts; [portable sources](portable/manifest.json) reopen offline.

These remain three modest geometric treatments of one rectangular masonry family. The clearest differences are openings, sills, parapets and profiles. Materials remain stylized, glazing opaque and interiors absent. Architecture coverage is unknown; the pinned material brief is not a live architectural UTDG integration. Additional opening/entrance assemblies, material character/weathering and related buildings require separate packets after the C6 visual decision. No family/block, performance, release or publication approval is claimed.
