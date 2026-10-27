## T1 — sill and texture-interaction repair

<date start="2026-10-26" />

The reported brick-coloured jagged patches came from the sill and masonry top sharing a plane. The existing 30 mm display cap now sits on the bulkhead. Original textures, metric UV scale, finishes and authored source are retained. Removing normal maps, all texture maps, or WebGL shadows does not cure the old placement; restoring only that placement reproduces the defect.

All five checks pass: 1,863 tests /128 files and eight end-to-end workflows. WebGPU and WebGL preserve exact Save/Open/cold source and native pixels; cold material/provider calls are zero. Only three ground-display trim paths change. UX2 selected-window authoring is accepted. General legacy regular-window end caps remain a separate known issue.

[Review PR #9](https://github.com/atxbrianbehm/buildo/pull/9) · [Controlled evidence and limits](https://github.com/atxbrianbehm/buildo/blob/6f50c880c2422471c5c28f2bdb2a1cfcf25c63d0/docs/reviews/2026-10-26-t1-sill-texture-interactions/README.md)

![Before: original sill placement reproduces jagged brick patches, WebGL.](https://raw.githubusercontent.com/atxbrianbehm/buildo/6f50c880c2422471c5c28f2bdb2a1cfcf25c63d0/docs/reviews/2026-10-26-t1-sill-texture-interactions/negative-control-webgl/sill-textured.png)

![After: the physical cap sits on masonry; original textures and finishes retained, WebGL.](https://raw.githubusercontent.com/atxbrianbehm/buildo/6f50c880c2422471c5c28f2bdb2a1cfcf25c63d0/docs/reviews/2026-10-26-t1-sill-texture-interactions/webgl/sill-textured.png)

![Before, texture maps removed: competing surfaces remain visible.](https://raw.githubusercontent.com/atxbrianbehm/buildo/6f50c880c2422471c5c28f2bdb2a1cfcf25c63d0/docs/reviews/2026-10-26-t1-sill-texture-interactions/negative-control-webgl/sill-no-textures.png)

![After, texture maps removed: the sill top clears the masonry.](https://raw.githubusercontent.com/atxbrianbehm/buildo/6f50c880c2422471c5c28f2bdb2a1cfcf25c63d0/docs/reviews/2026-10-26-t1-sill-texture-interactions/webgl/sill-no-textures.png)

![After: the same reviewed saved source with original textures, WebGPU.](https://raw.githubusercontent.com/atxbrianbehm/buildo/6f50c880c2422471c5c28f2bdb2a1cfcf25c63d0/docs/reviews/2026-10-26-t1-sill-texture-interactions/webgpu/sill-textured.png)

![After: whole building, WebGL. Only the three display sills change geometry.](https://raw.githubusercontent.com/atxbrianbehm/buildo/6f50c880c2422471c5c28f2bdb2a1cfcf25c63d0/docs/reviews/2026-10-26-t1-sill-texture-interactions/webgl/whole-textured.png)

---
