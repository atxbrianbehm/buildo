# AL.P11.70: Evidence-aware construction history

Construction history can associate a replay-validated evidence application with the exact graph and generation source at one entry. Undo and redo return the corresponding application with the entry; a subsequent new edit has no application unless the caller explicitly supplies a matching one. Version 0.3 history stores aligned application and generation arrays. Existing 0.1 and 0.2 snapshots retain their prior representation.

History checks shape and graph/source relationships synchronously. Callers must replay-validate applications before recording them and must use `readConstructionHistorySnapshot` before trusting an external history snapshot; the reader replays every application. This packet adds the history capability only. The workbench does not yet use it, and ordinary project files do not automatically retain the application.

Focused tests use synthetic research to cover undo, redo, a diverging edit, mismatched graphs, external replay and altered application data. Validation passed: typecheck, lint, production build, focused history tests, full suite (2,154 tests in 190 files), and standard browser smoke. The build retains its existing chunk-size warning.
