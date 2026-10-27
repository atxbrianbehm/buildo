## C9 — cornice treatments ready for visual review

<date start="2026-10-27" />

Roof & trim now offers Moulded cornice, Dentil course and Bracket course. These are real procedural solids in the same building graph, with strict portable0.9 save/recovery. Keep edited dimensions and assemblies preserves the cornice; Lock openings keeps its existing window/frontage/local-width scope. Original PSG/recipe/UTDG lineage remains immutable, and demo architecture coverage remains unknown.

All five checks pass: 1,921 tests /131 files and eight end-to-end workflows. Each native backend verifies15 workflow states/21 captures plus four close states/12 captures, exact source/history/room/cold recovery and zero cold material/provider calls. The original moulded building pixels remain exact on both backends.

The new details stay inside the original cornice envelope, so the change is modest at whole-building scale. Close views are the useful comparison. The existing stone texture has a visible directional pattern; dark shadow fringe also appears in clay and map-disabled views. Renderer shadow quality is not repaired or accepted by this packet.

The reported sill issues were addressed separately: seated storefront caps in [PR #9](https://github.com/atxbrianbehm/buildo/pull/9) and closed regular-window sill/lintel solids in [PR #10](https://github.com/atxbrianbehm/buildo/pull/10). Current sill diagnostics below retain those repairs.

[Compiler PR #13](https://github.com/atxbrianbehm/buildo/pull/13) · [Authoring PR #14](https://github.com/atxbrianbehm/buildo/pull/14) · [Full evidence](https://github.com/atxbrianbehm/buildo/blob/d94e90be56028e3c70bd81a545ca7361e1e887e6/docs/reviews/2026-10-27-c9-p2-cornice-authoring/README.md)

**Decision pending:** are these three treatments acceptable as the next geometric vocabulary baseline, or should the cornice silhouette/detail become stronger before further architecture/family expansion? This is a visual decision, not a PR merge, artist study or historical-coverage approval.

![Whole building — bracket course, existing authored windows and storefront retained](https://raw.githubusercontent.com/atxbrianbehm/buildo/d94e90be56028e3c70bd81a545ca7361e1e887e6/docs/reviews/2026-10-27-c9-p2-cornice-authoring/native-webgpu/bracket-whole.png)

![Moulded baseline — actual WebGPU close view](https://raw.githubusercontent.com/atxbrianbehm/buildo/d94e90be56028e3c70bd81a545ca7361e1e887e6/docs/reviews/2026-10-27-c9-p2-cornice-authoring/close-webgpu/moulded-close.png)

![Dentil course — actual bevelled blocks within the existing envelope](https://raw.githubusercontent.com/atxbrianbehm/buildo/d94e90be56028e3c70bd81a545ca7361e1e887e6/docs/reviews/2026-10-27-c9-p2-cornice-authoring/close-webgpu/dentil-close.png)

![Bracket course — actual closed profile extrusions](https://raw.githubusercontent.com/atxbrianbehm/buildo/d94e90be56028e3c70bd81a545ca7361e1e887e6/docs/reviews/2026-10-27-c9-p2-cornice-authoring/close-webgpu/bracket-close.png)

![Dentils — clay geometry inspection](https://raw.githubusercontent.com/atxbrianbehm/buildo/d94e90be56028e3c70bd81a545ca7361e1e887e6/docs/reviews/2026-10-27-c9-p2-cornice-authoring/close-webgpu/dentil-clay-close.png)

![Brackets — clay geometry inspection; shadow fringe still visible](https://raw.githubusercontent.com/atxbrianbehm/buildo/d94e90be56028e3c70bd81a545ca7361e1e887e6/docs/reviews/2026-10-27-c9-p2-cornice-authoring/close-webgpu/bracket-clay-close.png)

![Bracket texture check — normal maps disabled](https://raw.githubusercontent.com/atxbrianbehm/buildo/d94e90be56028e3c70bd81a545ca7361e1e887e6/docs/reviews/2026-10-27-c9-p2-cornice-authoring/close-webgpu/bracket-no-normal.png)

![Bracket texture check — all maps disabled; diagnostic lighting is not final appearance](https://raw.githubusercontent.com/atxbrianbehm/buildo/d94e90be56028e3c70bd81a545ca7361e1e887e6/docs/reviews/2026-10-27-c9-p2-cornice-authoring/close-webgpu/bracket-no-textures.png)

![Repaired regular sill — current textured WebGPU view](https://raw.githubusercontent.com/atxbrianbehm/buildo/d94e90be56028e3c70bd81a545ca7361e1e887e6/docs/reviews/2026-10-27-c9-p2-cornice-authoring/native-webgpu/sill-textured.png)

![Same sill — WebGPU normal maps disabled](https://raw.githubusercontent.com/atxbrianbehm/buildo/d94e90be56028e3c70bd81a545ca7361e1e887e6/docs/reviews/2026-10-27-c9-p2-cornice-authoring/native-webgpu/sill-no-normal.png)

![Same sill — WebGL all maps disabled](https://raw.githubusercontent.com/atxbrianbehm/buildo/d94e90be56028e3c70bd81a545ca7361e1e887e6/docs/reviews/2026-10-27-c9-p2-cornice-authoring/native-webgl/sill-no-textures.png)

![Implemented Cornice treatment control — compact layout and keyboard focus](https://raw.githubusercontent.com/atxbrianbehm/buildo/d94e90be56028e3c70bd81a545ca7361e1e887e6/docs/reviews/2026-10-27-c9-p2-cornice-authoring/native-webgpu/compact-controls.png)
