# R3.P8 — portable source-checkpoint contract and storage

Two new files add strict per-document source/unavailable records and a separate IndexedDB namespace. Actual v1–v4 codec validation, exact material dependencies and deterministic complete-record hashes protect source authority. All 253 existing sources remain literal.

All five checks pass: **1,307 tests / 96 files**, TypeScript, lint, build and E2E. Focused checkpoint/codec coverage: **89 / two files**. Source: `4e6b9be2c74f788bf800b3df0f6324ff29388c62dad3fcc91391e73951f82df0`. No commit or push was made.

- [Checkpoint](source-check-and-app-checkpoint.json) — `813f1094963d8be13bdeadeb20407d9a74d8a3e989b69a381cee58bc43b8d88e`
- [Required checks](raw/required-checks-final-03.json)
- [Source review](raw/source-review-01.json) and [root notes](raw/review-notes-01.md)
- [Current baseline App workflow](raw/app-workflow-03.json) and [current width workflow](raw/app-width-workflow-03.json), extracted from actual successful E2E01
- [Inherited inspected P6 captures](../2026-10-15-r3-p6-verified/raw/rendered-review-02.json)

Ten cases prove complete v1–v4 portable/material equality, resealed corruption rejection, getter-safe pre-await ownership, isolated direct lookup, unavailable-marker replacement, retained-record IO errors, actual default database/store wiring and revision-only hash behavior. Only undefined is absent; malformed or failed reads retain the record and throw without fallback/delete/list scans.

The first coherent source passes TypeScript, all 89 focused cases and both real App browser workflows. Full regression attempt01 passes 1,306 cases and times out at the unchanged familyBenchmarkProfilePacket test's 5,000 ms limit. Its source-stable failed log is retained. Attempt02 repeats the unchanged command/source and hits four five-second timeouts in the historical App/benchmark/orbit cases. Both failed runs remain retained. Attempt03 runs every test with two workers, retaining the same selection and 5,000 ms timeout, then lint and build; no repository configuration changes. The successful preflight01 and source review01 remain explicitly reused through their original pinned paths; no feature/test repair or duplicated preflight result is claimed.

The source-unavailable marker binds five legacy identity fields; it is not a full cached-packet fingerprint. Observed envelope checks cannot detect fields the generic reader already stripped, while embedded records and codec receipts are fully checked. Transaction completion acknowledges IndexedDB without an explicit physical-disk flush promise.

No controller/App activation, automatic save/recovery, FIFO, lock/CAS or v4 compile admission is added here. The current explicit Save/Open workflows rerun with unchanged UI; no new PNG or detector pass is claimed. Next is separate controller accepted-publication scheduling. Human appearance, worth-keeping, density and representative performance remain open.
