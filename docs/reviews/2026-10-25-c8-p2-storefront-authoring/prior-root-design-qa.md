# C7 window vocabulary UI verification

final result: passed

## Visual truth and state

The existing grouped-inspector implementation is the UI baseline: `docs/reviews/2026-10-18-ux1-p1/webgpu/grouped-desktop.png`. The October25 user directive authorizes a bounded vocabulary extension; no new image-generated design or replacement app shell was requested. The expected addition is one named Window assembly choice in Openings, attached to actual procedural geometry.

Current implementation: `docs/reviews/2026-10-25-c7-window-vocabulary/webgpu/twin-inspector.png`. Both baseline and current full-page images are1493 x1059 pixels, captured in a1493 x1054 CSS viewport at deviceScaleFactor1. No density rescaling is used in `inspector-comparison.png`, which puts them in the same comparison input. Their recess values/assembly states differ deliberately; this comparison judges the new control and retained hierarchy, not identical scene content. The original legacy native default image also matches byte for byte on both backends.

`window-vocabulary-comparison.png` places actual double-hung, twin and six-light canvas captures together at their original scale. All use the same initial footprint/apertures/library; the six-light case retains one local frame finish. Focused six-light textured/clay and twin views were inspected, along with the combined inspector image, compact layout and WebGL cold view. These are real renderer captures; no raster building is used in the application.

## Findings and required surfaces

No actionable P0/P1/P2 UI findings remain for this bounded addition. There was no UI redesign/fix loop after the first inspected native views.

- Fonts/typography: the existing Inter/system/Segoe UI stack, field hierarchy and helper-text treatment are retained. The new select inherits the UI font and presents named assemblies rather than numeric codes. Desktop and compact labels wrap legibly without clipping; focus has a visible three-pixel outline.
- Spacing/layout: the existing viewport/inspector grid is retained. A deliberate extra row accommodates the assembly selector; the primary Apply action and actual affected-window count remain legible. Lower inspector sections continue through its normal vertical scroll. Desktop full-page1493 x1059, compact430 x2004 and tablet900 x1996 exports preserve the natural web layout; CSS viewports were1493 x1054,430 x1000 and900 x1100. No horizontal overflow is observed. The select is at least44px high and has enough width for Six-light casement.
- Colors/tokens: same forest-green action, pale surface, dark foreground and subdued border palette as the existing grouped controls. The select uses #fbfcf9/#18201c with #bcc7bd border; focus #526f46. No new decorative palette, asset or icon system was introduced.
- Image quality/asset fidelity: chamfered rails, mullions, glazing bars and individual panes come from the existing pure geometry compiler. They remain shared instanced prototypes. Textured and clay close-ups show real depth/subdivision. Comparison PNGs are QA compositions of original captures, not substitute product imagery. Full native/browser originals and source pins are retained.
- Copy/content: Double-hung sash, Twin casement and Six-light casement are named choices. The scope remains all actual generated windows; local geometry is explicitly unavailable. Keep edited dimensions and assemblies now describes the expanded retention behavior, and the generation copy explains opening locks and material replacement. The generator's pinned recipe remains the base; the current graph owns the new authored assembly exception.

[P3] The plain local preview still requests an absent favicon and records its inherited404 separately. The native workflows use their existing favicon204 route; their completed runs have zero browser errors. This is not a construction failure.

## Functional and accessibility evidence

`preview-check.json`: live preview HTTP200, keyboard ArrowDown chooses Twin casement, focus remains visible, the change stays a draft until Apply, and Apply publishes real construction. `select-keyboard-focus.png` and `preview-twin.png` show those states. No application page/console errors; the favicon request is classified separately. No assistive-technology session or recruited artist study is claimed.

All five repository checks pass:1,770 tests/123 files, typecheck, lint, build and eight standard browser workflows. The focused run passes54 tests. Native WebGPU/WebGL each cover18 actual states;14 and15 capture events respectively. Tests/proofs cover old compiler/recipe/native replay, schema/worker/project admission, feasible outward/metre-UV geometry, true shared scope, local finish retention, invalid-edit last-good behavior, undo/redo, generation retention/release, portable project0.6 and cold recovery.

The first WebGL attempt had identical source/geometry/materials but a different reopened PNG hash. An unobscured screenshot crop differed at one pixel by one red level; it is not a full-frame native-delta claim. A diagnostic rerun records the actual camera/lights and opened image and passes all original strict native reopen/cold assertions without production changes. Cause of the first variance remains unproven; the unsuccessful attempt is retained. This qualification does not affect the UI pass or legacy compiler/recipe identities.

## Checklist and limits

- [x] Named assembly control on the existing source/publication path.
- [x] Inspect same-input baseline/current UI comparison and focused real geometry.
- [x] Keyboard, focus, explicit draft/apply and responsive layout.
- [x] Both rendering backends and strict final portable/cold replay.
- [x] Existing material ownership, recipes, semantics and advanced editing retained.
- [x] Add eight actual review images to the private phone gallery; preserve its95 earlier images.

These are closed, fixed-pose shared assemblies. Opening animation, local structural targeting, storefront/door/roof expansion, artist acceptance and authoritative UTDG architecture coverage are not established by this packet.
