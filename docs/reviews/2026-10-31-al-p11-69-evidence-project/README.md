# AL.P11.69: Portable evidence application snapshot

The versioned `construction-evidence-project` wrapper pairs an existing validated construction project with one replayable evidence application. Admission verifies the embedded project and material source, replays the application, requires its resulting graph to equal the project graph, and requires its declared generation source to equal the project's generation source. The wrapper is a snapshot of one application, not a claim that the evidence was reviewed or that later edits remain explained by it.

The original project format remains unchanged. This packet does not yet expose the wrapper in the workbench, implement history of multiple applications, or resolve how to carry provenance across later edits. Existing project readers will not open the wrapper until a separate integration is added. A mismatching graph or lineage is rejected rather than silently associating the record with a different building.

Focused tests use synthetic research and actual generated material data to check save/reopen, material retention, source retention, changed graph, mismatched generation source and tampering. Validation passed: typecheck, lint, production build, focused replay tests, full suite (2,153 tests in 189 files), and standard browser smoke. The build retains its existing chunk-size warning.
