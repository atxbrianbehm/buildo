# UX1.P0 - artist authoring direction concepts

Status: visual exploration complete; human direction selection pending. This prepares the decision after the UX0 audit. It does not authorize or implement a new default authoring model, new geometry operators or additional building assemblies. C6 visual acceptance remains pending separately.

Three independent built-in Image Gen results are shown in the chat. Their stable selection mapping follows their actual displayed order:

| Displayed option | Artifact | Proposed interaction |
|---|---|---|
| 1 | [Grouped inspector](grouped-inspector.png) | Whole-building architectural controls, explicit shared effect on 47 windows, advanced graph collapsed. Local geometry editing is marked unimplemented. |
| 2 | [Select and shape](select-and-shape.png) | Selected component, a visible architectural address, explicit target scope and affected count, contextual proposed change. |
| 3 | [Elevation studio](elevation-studio.png) | A front elevation with human-readable storey/bay selection and a corresponding 3D preview. |

[Phone gallery](https://app.notion.com/p/3fdb77d6cd4f812a9f88f1316beb9c25) keeps these concepts separate from the actual runtime walkthrough. All images carry CONCEPT - NOT IMPLEMENTED. The source image for every generation was the freshly audited actual workbench; no reference was inferred from a filename. The actual output dimensions are recorded in [prompts-and-images.json](prompts-and-images.json); images were not stretched to match the requested 1600 x1128 frame. The same file retains all prompts and original generated-image paths. Built-in Image Gen was used; no CLI image API or paid material provider was invoked.

## What these views can decide

Which interaction model deserves the first bounded working prototype: grouped architectural controls, direct part selection, or elevation-cell selection. The graph/compiler/source/history/material foundations remain shared. The future prototype must identify what it actually supports; no proposed local geometry operation becomes functional because it appears in a concept image.

## Review limits

These are generated UI illustrations, not pixel-accurate runtime captures or compiled geometry evidence. Building details differ slightly from the reference. Option1 concerns shared window parameters; options2/3 propose local geometry targeting. This set therefore compares direction, not equal-capability task completion. Controlled usability comparison still requires matching supported tasks and implementation states.

The selection concept uses radio-style treatment rows. Before implementation, distinguish mutually exclusive assembly variants from cumulative authored operations; the raster is not a final modifier-stack contract. The elevation concept would additionally require reliable 2D/3D selection correspondence. No human participants have evaluated any concept. No design direction is recorded as accepted.

## Next packet after human selection

UX1.P1: implement a bounded research prototype of the selected direction using the existing construction document and actual publication/history path. Start with supported whole-building edits and local finishes, and label targeted structural editing as unavailable until a real scoped operation lands. Keep the existing production workflow recoverable. Do not replace the compiler or add a parallel hardcoded generator. Verify the implemented task with meaningful state tests and actual browser captures; collect artist evidence separately using the [protocol](../2026-10-18-artist-authoring/artist-test-protocol.md).

The Product Design ideation workflow requires stopping for selection before build work. This is a direction decision, not a request to repeat the already-authorized Chromium capture approval.
