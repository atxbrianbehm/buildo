## UX2 — one selected-window width

<date start="2026-10-26" />

Engineering complete; review of this new task is pending. Choose an upper-front frame in the viewport or **Selected window → Window to edit**, change **Selected width (m)** and choose **Apply window width**. The wall opening, frame, glazing and sill change together. **Use shared width** resets that window.

Local widths survive Keep edited dimensions and assemblies or Lock openings; clearing both releases them. Other local dimensions, ground-frontage targets and side/rear windows are outside this first scoped task. Missing targets retain the accepted building. A painted frame also keeps its finish guard: remove that finish explicitly before removing its storey, or keep the target.

All five checks pass: **1,860 tests /128 files and eight standard E2E workflows**. WebGPU and WebGL each pass **19 states /16 captures**, with exact final native pixels across reopen, room return and cold recovery within each backend. Cold provider/material-generation calls are zero. Phone-width controls retain full labels,44px fields and3px keyboard focus. No artist study, historical UTDG architecture or family/block acceptance is claimed.

[Selected-window implementation and complete evidence — PR #8](https://github.com/atxbrianbehm/buildo/pull/8)

Images below are actual reviewed runtime output, embedded from the approved public GitHub checkpoint through immutable URLs. The first before/after pair isolates the one-window edit. Later controls/cold views also include an intentional shared-width edit and local finish from the continuation test. Existing WebGL warnings and legacy material/trim differences remain; this is not a cross-backend visual-parity claim.

<image source="https://raw.githubusercontent.com/atxbrianbehm/buildo/36bc79cbb4144186a70cecb9b5ae2a24bcdf3bfd/docs/reviews/2026-10-26-ux2-p2-selected-window-authoring/webgpu/legacy-storefront-building.png">Before the local edit: the continued C8 building.</image>

<image source="https://raw.githubusercontent.com/atxbrianbehm/buildo/36bc79cbb4144186a70cecb9b5ae2a24bcdf3bfd/docs/reviews/2026-10-26-ux2-p2-selected-window-authoring/webgpu/one-window-widened.png">First local edit: one upper-front opening widened from 1.22m to 1.8m; every other opening remains unchanged.</image>

<image source="https://raw.githubusercontent.com/atxbrianbehm/buildo/36bc79cbb4144186a70cecb9b5ae2a24bcdf3bfd/docs/reviews/2026-10-26-ux2-p2-selected-window-authoring/webgpu/selected-window-controls.png">Actual selected-window controls after a later intentional shared-width edit; the local width remains1.8m.</image>

<image source="https://raw.githubusercontent.com/atxbrianbehm/buildo/36bc79cbb4144186a70cecb9b5ae2a24bcdf3bfd/docs/reviews/2026-10-26-ux2-p2-selected-window-authoring/webgpu/widened-window-close.png">Textured close view of the wider frame, glazing and sill.</image>

<image source="https://raw.githubusercontent.com/atxbrianbehm/buildo/36bc79cbb4144186a70cecb9b5ae2a24bcdf3bfd/docs/reviews/2026-10-26-ux2-p2-selected-window-authoring/webgpu/widened-window-clay-close.png">Clay close view: actual frame, reveal, glazing bars and closed trim geometry.</image>

<image source="https://raw.githubusercontent.com/atxbrianbehm/buildo/36bc79cbb4144186a70cecb9b5ae2a24bcdf3bfd/docs/reviews/2026-10-26-ux2-p2-selected-window-authoring/ui-compact.png">Uninstrumented phone-width controls: full target label and keyboard focus.</image>

<image source="https://raw.githubusercontent.com/atxbrianbehm/buildo/36bc79cbb4144186a70cecb9b5ae2a24bcdf3bfd/docs/reviews/2026-10-26-ux2-p2-selected-window-authoring/ui-desktop.png">Uninstrumented desktop inspector with the selected window highlighted.</image>

<image source="https://raw.githubusercontent.com/atxbrianbehm/buildo/36bc79cbb4144186a70cecb9b5ae2a24bcdf3bfd/docs/reviews/2026-10-26-ux2-p2-selected-window-authoring/webgl/cold-recovered.png">WebGL cold recovery of the final workflow source, including the later shared edit and local finish. Final native pixels are exact within this backend; inherited rendering differences remain.</image>

---
