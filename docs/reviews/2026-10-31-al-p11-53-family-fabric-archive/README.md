# Portable grouped-family fabric study

An experimental, versioned wrapper saves an existing grouped-family archive with explicit per-member fabric assignments. Reading it checks its own hash, replays the embedded family, validates every fabric artifact and matches the assignments to the family, source building, member identities and inherited fabric. Existing family archives and their format remain unchanged.

The WebGL family and detail views render actual geometry and fabric assignments after serialization and reopening. The focused test exercises round-trip replay, tampered assignments and a valid assignment from the wrong family. The workspace explicitly rejects this new wrapper while it lacks support, leaving the current building intact; it does not silently omit fabric choices. Artist-facing creation and preview remain separate work. The demo colors are not historical evidence, and brick, storefront layout and awning placement still repeat.

Reproduce the reopened render with `node docs/reviews/2026-10-31-al-p11-53-family-fabric-archive/render.mjs`.

Validation: typecheck, lint, production build, full suite (2,138 tests in 182 files), standard browser smoke, focused archive replay and workspace-guard tests passed. The archive test timeout was extended for its additional full replays. The build retains its existing chunk-size warning; the isolated render used WebGL.
