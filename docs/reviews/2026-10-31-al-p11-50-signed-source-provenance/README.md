# Signed-source provenance for storefront variation

When a signed building has awnings and supports but no facade piers, removing the sign for family generation requires an older graph version with a one-by-one storefront placeholder. Family generation now receives and validates the actual signed source against that unsigned plan. It recognizes the placeholder as implicit only when the signed source has no division and the placeholder is exactly one by one. An explicitly stored division, including one by one, remains protected; mismatched sources are rejected. Material lineage and authored sign and awning choices remain intact.

The WebGL family and close-up show real pane variation on a signed source without piers. The test covers deterministic replay, source validation, protection of an explicit one-by-one choice, and material retention. This is still a study, not proof of the app's no-pier reset-to-family workflow. The family remains repetitive in proportions, brick and storefront layout; the sign is blank, dimensions are demo values and historical coverage is unknown.

Reproduce with `node docs/reviews/2026-10-31-al-p11-50-signed-source-provenance/render.mjs`.

Validation: typecheck, lint, production build, full suite (2,136 tests in 181 files), and standard browser smoke passed. The focused provenance test initially used an invalid mismatched fixture; the corrected valid mismatch passed. The build retains its existing chunk-size warning. The isolated render used WebGL.
