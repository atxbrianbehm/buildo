# AL.P11.67: Propose an architectural interpretation

In **Generate & vary → Inspect research extract**, an artist can select an unreviewed candidate, choose a flat or round upper-front opening head, and create an interpretation against the accepted building. It is saved separately from the building and can be reopened when the graph still matches. Pending edits block creation and saving. If the building changes after a proposal is created, saving or reopening it rejects the stale proposal; the research remains available.

This is an explicit proposed interpretation, not a review of the claim, an authenticated attribution, a live Metagrinder connection or a geometry edit. Hashes detect inconsistent content, not source truth. Application of a choice requires separate compatibility, lock and provenance work.

The synthetic app exercise opens the source, creates, saves and reopens the proposal, checks source identifiers and the original building hash, and verifies that no material provider is called. It captures desktop and phone sizes for either renderer: `node docs/reviews/2026-10-31-al-p11-67-evidence-proposal-ui/verify.mjs webgl <new-output-dir>` (or `webgpu`). Focused tests additionally reject stale graphs and retain the previous research on failure.

Validation passed: typecheck, lint, production build, focused interaction tests, full suite (2,150 tests in 187 files), standard browser smoke, both renderer workflows at desktop and phone sizes, and the Impeccable detector. The build retains its existing chunk-size warning. A phone capture is available in the existing Buildo Notion review gallery.
