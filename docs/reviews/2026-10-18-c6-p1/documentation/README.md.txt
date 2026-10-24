# Buildo

Buildo is a procedural building construction workbench built with React, Three.js and Zustand. Connected geometry operators create architectural scopes; semantic surface layers bind finishes to those scopes.

The current starting workflow constructs one rectangular building with four facades, repeated procedural windows, an entrance and a complete roof. C4 appearance is accepted. C5 adds seeded PSG-to-construction generation, retained numeric locks and pinned reference-material snapshot import; engineering checks and C5 human review are complete. C6 now offers three pinned procedural construction recipes, with retained materials, authored edits and portable recovery. All five checks pass (1,746 tests /121 files); C6 visual review is pending. [Current results and review images](docs/reviews/2026-10-18-c6-p1/README.md).

## Construct a building

1. Run `npm run dev` and open the local URL. The root route opens **Building construction**; a previously saved construction for that workspace recovers automatically.
2. Select a node or **Construction step**, change Footprint, Storeys, opening, entrance, window, trim or roof parameters, then choose **Apply construction**. The node graph and inspector edit the same source. Invalid edits keep the last accepted building visible.
3. Click a frame or its glass, then use **Focus frame** and **Surface finishes** to add a local or shared Wood, Stone or Masonry layer. Apply changes to preview and save them. Structural edits reuse the existing material library.
4. Use **Undo construction** / **Redo construction**, **Save construction** and **Open construction** to continue editing. Accepted edits also save locally for cold recovery. Explicit JSON files retain source and material dependencies.

Use **Generate a building** in the construction inspector to choose 2–6 storeys and 3–6 bays per elevation, then set building/material/trim seeds and choose **Generate building** or **Reroll unlocked**. Lock footprint, storeys or openings; **Keep edited dimensions** retains numeric artist changes. Authored finishes survive material replacement. A changed material library starts a fresh undo history. Custom graph connections remain editable and portable; the bounded recipe rejects rerolls that would overwrite them.

**Import reference snapshot** admits the versioned Buildo reference boundary and pins the imported data for generation and offline continuation. The default is a local material demo with unknown architecture coverage. Material roles and physical scales are consumed; a live architectural UTDG adapter remains future work.

Older bay/facade files still open. Standard connected facades offer **Complete building**, which preserves their material sources and surviving front frame finishes while adding the other elevations, entrance and roof. Custom branches that cannot be converted safely retain the prior scene with a diagnostic.

**Advanced generator** returns to the existing generation workflow. Existing lab links remain available, including `#room=promptLab` and `#room=assemblyHall`; they do not force the new default landing. Use `#document=your-workspace` on the root route for a separate local construction workspace. These procedural materials and reflection-based glazing are a preview; interiors, accepted families and blocks remain later milestones.

## Project Docs

- `docs/plans/building-authoring-revival.md` - October repository audit and building-first revival plan.
- `docs/plans/dynamic-building-family.md` - source MVP implementation plan.
- `docs/plans/kit-grammar-wfc-utdg-block.md` - post-MVP kit grammar, WFC, UTDG, and block generation plan.
- `docs/architecture/dynamic-building-family-integration.md` - repository-specific integration map.
- `docs/superpowers/plans/2026-06-25-dynamic-building-family-art-fidelity-bridge.md` - art-fidelity bridge slices.

## Local Commands

```bash
npm install
npm run dev
npm run dev:server
npm run build
npm run typecheck
npm run test
npm run lint
```

End-to-end browser checks start Vite locally and verify the app in Playwright Chromium:

```bash
npm run test:e2e
```

Install Playwright browsers first if the local machine has not already done so:

```bash
npx playwright install
```
