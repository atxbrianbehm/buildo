# AL.P4.0 — metagrinder evidence boundary audit

Read-only inspection on 2026-10-30 of `C:\Users\behmb\Documents\Cascade Projects\metagrinder`, branch `codex/metagrinder-scene-grammar-checkpoint`, HEAD `a3c07b83c7810e4c3112239dc7c96fa89a7a121b`, remote `https://github.com/WildConstruct/metagrinder`. The checkout has unrelated tracked modifications; the files below had no tracked diff. Nothing in that checkout was modified. SHA-256 pins are of the inspected working files:

| Upstream file | SHA-256 |
| --- | --- |
| `packages/core/src/schemas/extraction.ts` | `c5a06e97c566c2e970942d4b88d8f61adc614364085dfa16e47a173b29e63d67` |
| `packages/core/src/schemas/provenance.ts` | `93a3c5f95fa4c5309c6cc43478e2b4067ed77ac1b6d73a1afb23f306cd0fe49a` |
| `packages/core/src/schemas/vocabulary.ts` | `e72d3588c87ddd8a884f0232c6234d174db285c4264b56213323c332a1229a21` |
| `packages/core/src/schemas/utdg.ts` | `65b84d5ca41bd417d491bacd79692769e156096ab75f51453372b4c5f3376d20` |
| `packages/core/src/schemas/source-package.ts` | `847c923678fc9fe4cec26b916a15d947c75006a78c558dcbe60d90dcbf0c90f2` |
| `packages/core/src/schemas/source-lifecycle.ts` | `40cde6dd21a861a1ea6e2d6325c65a6807d61ac95406e72dd469ea7ef8166872` |
| `packages/core/tests/fixtures/metagrinder/utdg-candidates.json` | `eb81db44f2c24daefdcc99d12b4fbaac109750820c9070f517c3093c2bd88cf4` |
| `packages/core/src/stages/utdg/__fixtures__/mini-cell-source-anchors.json` | `aef6b854d8f641de63e2325e533d509d4e8c6b1d7be7a24767e55a58f6cd5b77` |

## Observed contracts

- `extraction` carries an envelope (`artifact`, `schemaVersion`, `runId`, `inputId`, `createdAt`) and claims, concepts, evidence, uncertainty and questions. An extracted claim has free-text content and category, confidence and provenance; these are not already typed Buildo geometry parameters.
- Provenance separately records source input and chunk IDs, optional spans and excerpt, attribution mode, evidence basis, confidence, verification and reasoning note. Verification is not the same field as human citation review or canonical promotion.
- `source-lifecycle` models registered sources, evidence, claims and citation reviews; its schema explicitly says chain invariants belong to the governance state machine. A shape-valid record alone does not prove a valid or current evidence chain. Retraction and integrity flags must remain visible.
- `utdg-candidates` exports staged candidates. Its candidate schema permits only draft, staged or needs-review records; it explicitly does not promote to canonical UTDG. Records carry evidence/source references, rights, confidence and optional provenance. The checked-in `packages/core/tests/fixtures/metagrinder/utdg-candidates.json` is a legacy submission-shaped demo, not an example of the current `utdg-candidates` envelope; do not silently treat it as one.
- The inspected mini-cell fixture concerns early motorsport wardrobe, not commercial-building facades. A targeted search in `packages/core/tests/fixtures` and `research_tests` for cornice, storefront, parapet and facade yielded no matching architectural slice. This limited search does not prove none exists elsewhere. No source-backed commercial-building claim or upstream architectural coverage has been established.

## Consequence for the bridge

Use the actual source-lifecycle and provenance terms rather than translating staged status into approval. An explicit, reviewable mapping from a specific claim to a supported Buildo choice must remain distinct from the upstream free-text assertion; do not infer a geometry setting from a keyword or silently fill absent facts. The adapter must validate source/evidence/claim references, citation review, retraction/integrity conditions and provenance against actual upstream semantics, retain IDs and locators, pin its inputs and expose conflicts and unknowns. Only an appropriately verified, reviewed and applicable architectural record can drive a structural prior. Demo or synthetic test records must be labeled as such. Artist choices and locks remain authoritative and material artifacts stay independent.

The next bounded packet can implement and test the intake and explicit-mapping boundary, including negative tests using the real non-architectural fixture shape. It cannot claim historically sourced commercial-facade generation until an appropriate actual record and its evidence chain have been found and checked. This audit does not grant rights, promote candidates, run metagrinder, or change the product.
