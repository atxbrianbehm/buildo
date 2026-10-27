# R2.P10 verified — bay catalog and exact reopen geometry

Engineering complete. Bay-only edits rebuild width-dependent catalog recipes while retaining all material artifacts. This is a separate four-file packet after accepted P9.

- Source: `646fdc7be3a3ab0b3a011b63095ccd6a7b16a3a7eb51cd62b6b33e8a55fe49b1`; four changed files, 249 protected source pairs, no additions.
- Checks: 1,166 tests / 95 files; focused 21 cases / four files; lint, typecheck, build and E2E pass. Four old flat/non-roof geometry receipts remain exact.
- Causality: unchanged whole public Save/Open regression fails on complete active/reopened geometry, then passes after only two invalidation entries change. Historical tests reconstruct literally.
- Actual App: seven bays/revision12 → six bays/revision13 → reopen13 on the frozen authored gable/arched-window source. Full catalog, graph, spec, semantic metadata and 48 buffers / 1,369,856 bytes match exactly. Submitted cornice/belt/roof-cap buffers bind to saved IR with fresh connected owners.
- Materials: positive 12 provider / one interpreter call; all three source intervals zero/zero. Both five-channel byte comparisons cover 327,680 unchanged bytes, alongside exact atlas/material metadata and four literal codec canaries.
- Visual: all six actual PNGs inspected. Narrowing and reopen continuity pass; masonry density, dark trim, blocky roof sampling, camera cropping and stale UI text remain limitations. Human appearance and performance acceptance remain pending.

[Checkpoint](source-check-and-app-checkpoint.json), SHA `b02fc3ff55deccaf05c4f8a24d6cb4b11eb4323f1069ebfbeb938cb6b2f8e493`, is byte-identical to the accepted raw checkpoint. [App proof](raw/app-proof-02/result.json), [source review](raw/source-review-final-01.json), [check receipts](raw/required-checks-final-01.json) and [visual inspection](raw/visual-inspection-01.json) retain distinct evidence. The actual successful preservation log is copied alongside this archive after its completed run.

The shell-pipe focused launcher failure and App capture-schema startup failure remain excluded attempts. Their logs/helpers were not overwritten. The corrected launcher reuses the same-source typecheck; the corrected App capture serializes optional catalog/graph fields exactly as Download Export does. Neither required a product change. All runnable/source archive copies have `.snapshot` suffixes.

Next is the separate recognized-profile completed-cache replay packet. No commit, push, release, automatic persistence, broad compiler-content identity migration or visual acceptance is implied.
