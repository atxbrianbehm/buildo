## T2 — regular sill and lintel solids

<date start="2026-10-26" />

Regular whole-building windows now use the closed loft already proven on local width edits. The old shared sill/lintel had 22 non-outward triangles; the corrected solid has zero. Its exterior profiles and bounds stay exact. This is a geometry correction with a modest visible change, not a new building treatment.

A validated stone finish tests the original 0.64 m colour/normal/ORM tile through the existing semantic compositor. Only 43 legacy regular-trim paths change; other geometry, channels, finishes and source stay exact. All five checks pass: 1,866 tests /129 files and eight end-to-end workflows. Both native backends pass strict Save/Open/cold source and pixel recovery, with zero cold material/provider calls.

The end-view exercise also exposed residual camera damping through Reset view. T2's test setup isolates that motion state; the production fix is a separate queued T3 packet. No pixel tolerance is added.

[Review PR #10](https://github.com/atxbrianbehm/buildo/pull/10) · [Evidence, replay and limits](https://github.com/atxbrianbehm/buildo/blob/2a8c4e37a7643c138254afa08c378f5fc2463b6f/docs/reviews/2026-10-26-t2-regular-trim-recovery/README.md)

![Before: regular sill/lintel with the existing stone finish, WebGL.](https://raw.githubusercontent.com/atxbrianbehm/buildo/2a8c4e37a7643c138254afa08c378f5fc2463b6f/docs/reviews/2026-10-26-t2-regular-trim-recovery/before-webgl/sill-textured.png)

![After: closed caps with the same exact exterior profile and stone finish, WebGL.](https://raw.githubusercontent.com/atxbrianbehm/buildo/2a8c4e37a7643c138254afa08c378f5fc2463b6f/docs/reviews/2026-10-26-t2-regular-trim-recovery/webgl/sill-textured.png)

![Before: native end view of the old extrusion, WebGL.](https://raw.githubusercontent.com/atxbrianbehm/buildo/2a8c4e37a7643c138254afa08c378f5fc2463b6f/docs/reviews/2026-10-26-t2-regular-trim-recovery/before-webgl/trim-end-textured.png)

![After: closed solid in the exact same end-view camera and light, WebGL.](https://raw.githubusercontent.com/atxbrianbehm/buildo/2a8c4e37a7643c138254afa08c378f5fc2463b6f/docs/reviews/2026-10-26-t2-regular-trim-recovery/webgl/trim-end-textured.png)

![After: original 0.64 m stone texture scale with colour, normal and ORM channels, WebGPU.](https://raw.githubusercontent.com/atxbrianbehm/buildo/2a8c4e37a7643c138254afa08c378f5fc2463b6f/docs/reviews/2026-10-26-t2-regular-trim-recovery/webgpu/sill-textured.png)

![Texture stress source: whole building, WebGL. The material library and original recipe lineage stay intact.](https://raw.githubusercontent.com/atxbrianbehm/buildo/2a8c4e37a7643c138254afa08c378f5fc2463b6f/docs/reviews/2026-10-26-t2-regular-trim-recovery/webgl/whole-textured.png)

---
