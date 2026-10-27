# Artist workflow comparison protocol

Status: proposed; no participants recruited or observed, no usability numbers collected. No outreach is authorized by this document.

Recruit five artists for a formative session: ideally three who use object/layer/inspector tools without routinely authoring procedural graphs, and two experienced procedural artists. Confirm these match the intended audience before treating results as product evidence. Record experience rather than labeling all artists beginners.

Use the same starting building, supported controls, generation seed and material library in all variants. Counterbalance current/alternative order. Give neutral task goals without instructions naming the controls. Separate human interaction time from compilation/material wait. Preserve recordings or observation notes only with participant consent.

## Tasks

1. Generate a three-storey building with four bays per elevation.
2. Make the whole building deeper; keep its materials.
3. Make the cornice project farther; explain what will change before applying.
4. Change one frame finish, then all frames; undo only the local change.
5. Reroll variety while preserving the footprint and authored finish.
6. Save, reopen and identify which choices are authored and which are generated.
7. Diagnostic capability task: make one upper-front window wider while keeping every other window. Current missing scoped geometry support is a capability gap, not a participant failure.
8. Expert-only task: add a construction operation, explain its connection to output, then recover from an incompatible connection or referenced-node deletion.

## Record

For each task: completion without coaching; first intended action; human interaction and system wait times; help requests; wrong-target edits; no-op edits; graph interactions required; state/scope predictions; recovery success; preserved source/material lineage. Ask participants to explain the target and expected effect before committing. Do not infer confidence or understanding from completion alone.

## Proposed gates (design targets, not measured results or industry benchmarks)

- At least 4 of 5 participants complete each supported ordinary task without coaching. Treat small-sample results as formative.
- Ordinary generation, dimensions, material edits and reroll require zero node connections.
- Every participant can identify the affected scope before a potentially broad edit; no unnoticed edits to unrelated parts.
- Generation setup takes under 60 seconds of human interaction; supported local edits under 120 seconds, excluding system wait. Report distributions, not only averages.
- Every tested error leaves a recoverable accepted building; no irreversible data loss. Undo/reopen preserve exact accepted project source and material lineage.
- Expert graph users can inspect dependencies and author a custom branch without losing access to the saved artist project. Unsupported recipe regeneration after custom topology must be explicit before the action.
- Test keyboard operation, visible focus, labels and target selection separately. Do not claim accessibility compliance from screenshots or successful mouse automation.

## Bounded sequence

UX0: current task/behavior audit and live walkthrough are complete: seven compiler/resolver probes, eight real-App captures and seventeen actions, with no human participants.
UX1: compare two task flows on supported controls, retaining the same source/compiler. A prototype must label any unsupported targeted geometry operation; no fictional working control.
UX2: implement one chosen end-to-end artist task, including any necessary scoped operation, undo, locks and save/reopen. Review this before broad UI migration or more architecture operators.

The next implementation decision is an artist-facing workflow and one test task, not a replacement engine. C6 visual acceptance remains a separate pending decision.
