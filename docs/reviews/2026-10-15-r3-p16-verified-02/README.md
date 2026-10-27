# R3.P16 selected-floor width authoring

Final verification: 2026-10-16. Source `779382aacef21d2af285d484b2620821c63be815b9a3d893084522388d4253ad`; [checkpoint](source-check-and-app-checkpoint.json) SHA `a7adad5f1f8c61fe3ebce9bc029963bd474c2f4aa8e52807cecd04527230483b`.

The selected-window inspector now applies one width atomically to every actual window on that facade floor. The guarded controller preserves outside directives, materials, source ownership and stale-result protections. One accepted operation is one history entry/revision/checkpoint. Complete-set noops preserve version and redo. V4 upgrades retain v5 authority on Undo.

All five documented checks pass: **1,402 tests / 97 files**, TypeScript, lint, production build and E2E. Focused controller/App tests pass **207 / two files**. Six native workflows pass, with root inspection of 22 current captures. The new workflow covers real multi-window floor edits, exact frame/glass and outside matrices, complete IR/gallery/input equivalence, raw five-channel materials, Undo/Redo, Save, actual writer release and automatic cold-history recovery. Seven P15 compatibility roundtrips remain pinned and inherited while the codec stays byte-protected.

The original later-invalid-member gate is fulfilled directly. Natural public source `p16-direct-late-22` yields front floor 3 widths 1.35, 1.35 and 1.25 m. A 1.30 m draft passes both earlier single-window checks, rejects at the last member, and the public floor controller publishes nothing. This closes the gap found in candidate02's earlier rejection evidence. The earlier checkpoint, boundary record and failed/read-only probes are preserved; the current candidate03 is authoritative.

Candidate01 failed TypeScript only in a new door-test helper; candidate02 adds an explicit optional-span guard. Candidate03 adds the direct later-invalid-member controller test. Exact inverse checks reconstruct both earlier candidates; the entire old test prefixes and all production source are retained. Parser-only helpers and helper-only failures are distinguished from actual checks. Raw scripts are archived as inert snapshots. No commit, push, publication, paid provider, release or installation occurred.

Source scope is five existing paths; 252 other source files are protected. Human architectural appearance, worth-keeping, density and representative-machine performance remain pending. The next separate packet is R3.P17's pure matching-bay kernel; matching-bay UI is not claimed here.
