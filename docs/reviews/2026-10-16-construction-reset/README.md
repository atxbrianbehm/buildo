# Construction reset — 2026-10-16

The product is not ready. The user wants geometry-node-like construction plus semantic surface composition, with one convincing building as the first success case. The existing passing checks establish useful engineering foundations; they do not establish that product.

## Live findings

The audit inspected the current graph contract/builder, compiler, split plan, opening/profile expanders, fixture generation, material provider/packer/registry and App/viewer integration. It also directly inspected the latest accepted P4 desktop render against the existing Marx Grocery reference.

- `contracts/buildingGraph.ts` admits an untyped parameter record and untyped upstream IDs. It lacks per-operator parameter schemas, typed sockets and output-type admission.
- `compiler/buildingGraphBuilder.ts` generates one prescribed graph from the spec. Its node arrangement is not an artist-authored construction program.
- `compiler/buildingCompiler.ts:911` validates the graph, checks referenced component recipes, then invokes fixed wall/opening/trim/roof builders using the spec. It does not evaluate upstream outputs. High detail selects a fixed list of decorative builders.
- `ui/assemblyHallFixture.ts:490` rebuilds this descriptive graph from the resolved spec before compilation. An authored graph would be overwritten unless this authority direction changes.
- The current workspace supports useful source-backed parameter and selected-window width edits. It provides no operator assembly, connection editing, branch bypass or intermediate operator output inspection.
- The actual render has excessively salient masonry, patterned-looking glazing, heavy repeated trim and weak architectural hierarchy. These are visible product failures, not pending paperwork.
- Material work still contains demo compromises: ordinary source requests are 32×32; primary masonry has a separate descriptor-based rerasterization path, so source size alone does not explain its appearance. Glass is generated as a noisy colored alpha layer, and the renderer applies shared atlas channels with broad slot-name shading rules. The relative contributions of source pattern, normals, UVs, lighting and geometry need a controlled bay comparison; this audit does not claim one proven cause for every artifact.
- Reusable foundations exist: deterministic seed trees, facade scopes and aperture subtraction, opening bindings, profile solids, IR, worker transport, actual instance picking, resource ownership, material layers and source recovery. Keep them.

## Direct compiler discriminator

[Actual results](graph-causality.json) come from the current compiler, using the same input construction as its existing tests. The small runnable probe is retained at `test-results/construction-reset-2026-10-16/graph-causality.mjs`.

| Graph mutation | Validation errors | Full geometry payload |
|---|---:|---|
| Halve footprint-node width | 0 | Identical |
| Disconnect opening-node input | 0 | Identical |
| Remove window-instance node | 0 | Identical |
| Select footprint as graph output | 0 | Identical |

All four change `sourceGraphHash`; all retain 23,948 vertices, 11,868 triangles and 118 instances. The compared hash includes geometry arrays, transforms, semantics, bounds and metrics, excluding provenance. This proves these graph mutations have no construction effect in the tested current path. It is not a claim that every possible graph edit is ignored.

## First implementation milestone: C1 — one executable, convincing bay

Build one bounded vertical slice in the actual workbench. Do not spend another milestone adding an isolated finish panel.

1. Define only the operators needed for one bay: rectangular facade scope, opening placement, wall emission, window assembly and output join. Give each operator strict parameter schemas and typed input/output sockets. Opening placement produces one layout consumed by both wall subtraction and window assembly.
2. Execute connected reachable nodes in dependency order. Missing or incompatible required inputs, cycles and unsupported operators produce actionable errors; they never fall through to the fixed generator. Disconnected optional contributions do not appear. Empty or invalid output does not replace the last valid building.
3. Reuse existing split/opening/profile geometry and IR emission. Separate geometry emission from fixed orchestration only where required. The authored graph owns dimensions/layout; the spec/style supplies initial defaults and constraints. Do not regenerate the graph from the spec after an edit.
4. Use the Marx reference as the architectural direction: a restrained masonry bay, a clear opening, recessed glazing, a thin frame and legible sill/lintel. Render the bay at close and facade distance in the real viewer. Establish proportions in clay, then tune masonry contrast/scale/normal response and glazing under the same ordinary lighting. Change actual construction/material inputs; no baked building image or preassembled mesh.
5. Expose the executed bay parameters in the workbench beside the live viewport. Show the selected operator's actual scope/output. Width, opening height and recess edits must visibly affect their intended geometry. Removing the window contribution must remove its frame/glass; removing the opening operation must close its hole when the wall consumes the uncut scope.
6. Store the small graph as validated, versioned source and reopen equivalent output. Use the existing source ownership/transaction and material reuse seams. Make one explicit project-format evolution when required, rather than adding a format for each control. Preserve legacy readers and accepted legacy behavior.
7. Verify parameter AND connection causality, wall/opening agreement, deterministic semantics, material reuse, invalid-graph recovery and resource cleanup. Run relevant existing regressions and all five documented checks after the coherent slice. Inspect actual current clay/textured bay and facade-distance captures on WebGPU and WebGL.

C1 is not complete on pure evaluator tests. It must work from the live App and produce a visibly improved bay. Human appearance acceptance remains explicit; a failed appearance review keeps the visual result open and is corrected before multiplying the bay. Necessary preparation may continue while review is pending, but no family/block expansion or quality claim follows automatically.

## Following milestones — sequential, not combined

- **C2 — repeat and construct a facade.** Add real floor/bay split operators, named architectural selections, and optional profile/roof branches. Repeat the accepted bay into a restrained three-storey/four-bay reference composition; then vary counts. Put a small node panel beside the building in this milestone, with connections, node parameters, bypass and intermediate previews. Keep the node set limited to executed operators. This is a primary construction surface, not an optional final decoration.
- **C3 — semantic surfaces and continuous authoring.** Bind wall/frame/glass/trim materials and one local finish override to graph-produced scopes using the existing compositor. Inspector and node panel edit the same graph/project. Integrate undo/redo, save/open and cold recovery for those operations. Structural edits preserve material artifacts; material edits preserve geometry. Reuse prior machinery rather than another independent editor model.
- **C4 — one whole building worth keeping.** Finish ground/body/crown hierarchy, coherent side/rear elevations, roof silhouette and material response. Demonstrate a complete session: construct, edit, bypass a trim branch, change a selected surface, undo, save and reopen. Compare whole building and close views against the reference. Only then resume controlled families and blocks.

## Scope and execution changes

R4.P5 frame-finish UI is deferred. Its only unfinished source change, a controller command, was archived at `test-results/r4-p5-2026-10-16/held-buildingRunController.ts.snapshot` before restoring its accepted P4 before-image. Hash guards checked both the held change and accepted snapshot. All 270 P4 source files were then verified byte-identical to the accepted baseline; no P5 UI or new tests were created.

The accepted P4 checks remain inherited evidence for those identical sources, not newly run checks. This audit ran the independent compiler discriminator and source restoration verification. No new render was captured; visual findings use the directly inspected accepted P4 render and existing reference.

Keep milestone scope reviewable, but stop making whole-tree snapshot duplication and large proof inventories the deliverable. Reuse existing checkpoints and regressions; keep a concise diff, actual relevant results and useful current captures. Required correctness, compatibility, resource, visual and human gates still apply. Do not change seven subsystems just to add a control.

No commits, pushes, publication, provider spending, installation or release are authorized.

