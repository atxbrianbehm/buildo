# UX1.P1 grouped inspector design QA

final result: passed

## Visual truth and normalization

Source: `docs/reviews/2026-10-18-authoring-concepts/grouped-inspector.png`, option 1 selected by the user in `docs/reviews/2026-10-18-authoring-choice/decision.json`. Source pixels 1493 x 1054; generated desktop illustration, without a declared CSS density. Its 1493 x 1054 image is compared directly at native resolution.

Implementation: `docs/reviews/2026-10-18-ux1-p1/webgpu/grouped-desktop.png`, actual 1493 x 1059 full-page capture in a 1493 x 1054 CSS viewport at deviceScaleFactor 1. The full-view comparison crops only the final five page pixels to align the viewport; it does not stretch or rescale either input. State: Openings expanded, shared recess 0.25 m, 47 actual generated windows, advanced graph collapsed.

Full-view comparison: `docs/reviews/2026-10-18-ux1-p1/design-comparison-final.png` places source and implementation in the same input. Focused inspector comparison: `docs/reviews/2026-10-18-ux1-p1/design-inspector-comparison-02.png` shows the earlier post-fix capture on the same production source; final native captures confirm the corrected styling. Both combined inputs were inspected. Additional final views: WebGPU/WebGL desktop, 900 x 1100 tablet and 430 x 1000 compact captures in that packet. Compact/tablet are responsive web layouts, not phone-bezel simulations.

## Findings and comparison history

Initial runtime pass: `layout-01/desktop.png` and `layout-01/compact.png` under the packet. [P2] Native gray primary buttons lost the concept's action hierarchy. [P2] An extra desktop toolbar row and verbose status spacing displaced the intended main view. The single batched correction gave Save/Apply forest-green treatment, aligned desktop project actions with the header, compacted status messages, kept the unavailable-local-geometry notice beside Openings, and placed Advanced before supplementary tools. No production changes followed the final required-check run.

Post-fix comparison: `design-comparison-final.png`, focused comparison, both native desktop views, `focus-desktop.png` and `hover-desktop.png`. No actionable P0/P1/P2 fidelity findings remain for this bounded prototype.

[P3] The ordinary standalone development preview requests an absent `/favicon.ico`, producing one resource 404. Exact URL is recorded in `interaction-qa.json`; no application errors were observed. The native observer workflows use their established explicit favicon 204 route and record zero browser errors. The missing favicon is inherited and does not affect construction or controls; adding a real product icon can be a later shell task. Earlier QA attempts and their diagnostics are retained.

## Required fidelity surfaces

- Fonts and typography: retain the existing Inter/system/Segoe UI sans stack. The generated illustration has no recoverable font metadata; its compact sans hierarchy is preserved with a strong inspector heading, 650-weight group/field labels and separate readable helper text. Inputs use tabular numerals. Final full and focused views show no clipped labels or accidental wrapping. The small recovery messages are secondary; focused input has a visible three-pixel outline.
- Spacing and layout: roughly two-thirds live viewport and one-third inspector, thin dividers, pale open-group row, architectural field labels opposite aligned numeric controls. Header actions share the desktop title row. Compact/tablet stack the viewport above the inspector and allow vertical scrolling; persistent controls do not overflow horizontally. Extra View controls and recovery states are justified existing functionality. Source and implementation total page heights differ by five pixels, not a density error.
- Colors and tokens: source's warm pale surface, forest-green primary actions, dark text, subdued borders and gray unavailable notice are retained. Actual primary color is #263c31; input foreground #18201c/background #fbfcf9, field border #bcc7bd, open group #e8ece5. Hover changes the primary to #365440. Existing warm error text remains visible near the scope controls. Disabled history actions are visibly muted.
- Image quality and asset fidelity: the building is the actual existing Three.js/compiler output, as required by this product task. A generated raster building would conceal functional geometry. No illustrative asset, CSS/SVG building approximation, preassembled mesh or replacement renderer was introduced. Model/camera/light and current materials produce the same restrained architectural direction while preserving actual procedural causality. Native and browser PNGs are retained without delivery resampling. No new icon package or decorative glyph was added; existing disclosure affordances remain native controls.
- Copy and content: preserve Shape, Storeys, Openings, Roof & trim, shared affected-window scope and unavailable local geometry. The concept's Preview action becomes Apply because this executes the existing atomic publication/history operation. Units appear in accessible labels, not decorative suffix boxes. Redo/Open and explicit status/errors remain for safe continuation. Actual counts update after applied structure or generation changes; the compact final source has 79 windows. Advanced graph, Surface finishes and Generate & vary preserve the actual feature boundary.

## Interaction and accessibility evidence

`interaction-qa.json`: focused number input and visible outline, captured hover, keyboard Enter opens Shape, no horizontal overflow at 900/430 CSS px, no application errors. No assistive-technology session, text-zoom audit or recruited artist study is claimed.

`webgpu/receipt.json` and `webgl/receipt.json`: each 16 actual draw states and 14 capture events; graph absent by default; shared recess/depth/storeys/cornice edits; actual scope 47 to 63; local finish changes preserve full geometry; history, legacy C5 file opening, exact portable source, locked reroll, custom-topology fallback, room return and exact cold native pixels. Material channels remain exact on structural changes; cold recovery makes zero provider/material-generation calls. Invalid edits retain the accepted scene; retired owners dispose. Seven added tests cover bindings, scope, bypass/custom boundaries and integrated publication/history/failure handling. All five required checks pass, including 1753 tests/122 files and eight standard browser workflows.

## Intentional constraints and open review

Grouped fields bind only the registered construction topology. Custom branches have an explicit advanced-editor route. Selecting a frame enables local finishes; geometry remains shared. Local structural editing is explicitly unavailable. Default architecture coverage remains unknown and no live UTDG architectural-data claim is made. The three recipe and future family/block gates remain separate.

The selected direction is implemented; human workflow acceptance and the proposed artist task sessions are still pending. QA passing is not artist usability acceptance or C6 visual acceptance.

## Implementation checklist

- [x] Bind selected concept to existing source and publication path.
- [x] Correct primary-action hierarchy and desktop density in one bounded batch.
- [x] Inspect full-view and focused same-input comparisons.
- [x] Exercise keyboard, focus/hover, failure, responsive and both rendering backends.
- [x] Preserve materials, advanced access and portable recovery; disclose missing scope support.
- [x] Record required checks and private phone-gallery evidence.
- [ ] Human review of the implemented workflow, followed by the separately defined artist sessions.
