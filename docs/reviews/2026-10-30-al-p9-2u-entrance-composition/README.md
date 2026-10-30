# AL.P9.2u.1 — seeded entrance composition

This packet adds an opt-in, versioned demo composition that distributes a storefront entrance across available bays. The family seed and member ordinal determine the recorded offsets; applying a choice updates the existing `PlaceDoor` operator, so the normal compiler constructs the glazed entrance and storefront apertures. This is a bounded demo policy, not a historical claim or a metagrinder mapping.

The focused regression verifies deterministic replay and tamper rejection, four distinct entrance positions and four distinct compiled door meshes on the four-bay fixture, source ownership, opening-lock conflict, and rejection of punched frontage, authored awnings and simultaneous frontage/awning placement variation. Existing composition and awning tests pass. Family generation and the workspace explicitly reject the new plan version until a follow-up can preserve authored entrances, locks, persistence and materials end to end. No product render or artist review is claimed here.

Validation: `npm run typecheck`, `npm run lint`, `npm run build`, focused Vitest (9 tests); full unit suite 2,070 tests across 164 files passed; `npm run test:e2e` passed. Build retains the existing Vite chunk-size warning.
