# Buildo

Buildo is a procedural building construction workbench built with React, Three.js and Zustand. Connected geometry operators create architectural scopes; semantic surface layers bind finishes to those scopes.

The current starting workflow constructs one rectangular building with four facades, repeated procedural windows, an entrance and a complete roof. C4/C5, the three C6 geometric recipes and the grouped workflow are accepted. C7 adds **Twin casement** and **Six-light casement** beside the original double-hung sash; C8 adds display frontage and a glazed entrance. UX2 adds one real local structural task: widen a selected upper-front window while retaining other openings. All five checks pass (1,860 tests /128 files), plus19 states on each native backend. [Selected-window results and actual images](docs/reviews/2026-10-26-ux2-p2-selected-window-authoring/README.md). Human review of this new task, artist sessions and family/block/performance acceptance remain separate.

## Construct a building

1. Run `npm run dev` and open the local URL. The root route opens **Building construction**; a previously saved construction for that workspace recovers automatically.
2. Open **Shape**, **Storeys**, **Openings**, **Ground floor** or **Roof & trim**, change shared architectural dimensions, then **Apply changes**. Openings states the actual affected-window count. Invalid edits keep the last accepted building visible. **Advanced recipe graph** retains node properties/connections and additional entrance/profile controls; custom branches use that editor. In **Openings → Window assembly**, choose a sash/casement construction; Apply changes regular window assemblies; ground display bays use their own frontage controls.
3. Click a frame or its glass, then use **Focus frame** and **Surface finishes** to add a local or shared Wood, Stone or Masonry layer. Apply changes to preview and save them. Structural edits reuse the existing material library.
4. Use **Undo construction** / **Redo construction**, **Save construction** and **Open construction** to continue editing. Accepted edits also save locally for cold recovery. Explicit JSON files retain source and material dependencies.

For a shopfront, choose **Ground floor → Ground frontage → Storefront**. Set the numbered entrance bay and width; **Frontage proportions** exposes piers, bulkhead, head band, transom, frame and recess. Apply updates the front ground-floor row; upper storeys and other elevations keep their windows.

For one local width, click an upper-front frame or its glass, or choose its numbered storey/bay under **Selected window → Window to edit**. Change **Selected width (m)**, then **Apply window width**. The wall aperture, frame, glazing and sill change together. **Use shared width** resets that window to the current shared opening width. Shared controls disclose retained local widths. Unapplied local text blocks other publication actions until applied or reverted.

Open **Generate & vary** in the construction inspector to choose 2–6 storeys and 3–6 bays per elevation, then set building/material/trim seeds and choose **Generate building** or **Reroll unlocked**. Lock footprint, storeys or openings; **Keep edited dimensions and assemblies** retains edited dimensions, window assemblies and ground frontage. Authored finish intent survives material replacement. A changed material library starts a fresh undo history. Custom graph connections remain editable and portable; the bounded recipe rejects rerolls that would overwrite them. Window and frontage choices are authored exceptions over the pinned recipe base: keep authored changes or lock openings to retain them; clearing both restores the actual seeded recipe and punched frontage.

**Import reference snapshot** admits the versioned Buildo reference boundary and pins the imported data for generation and offline continuation. The default is a local material demo with unknown architecture coverage. Material roles and physical scales are consumed; a live architectural UTDG adapter remains future work.

Older bay/facade files still open. Standard connected facades offer **Complete building**, which preserves their material sources and surviving front frame finishes while adding the other elevations, entrance and roof. Custom branches that cannot be converted safely retain the prior scene with a diagnostic.

Inside **Advanced recipe graph**, **Advanced generator** returns to the existing generation workflow. Existing lab links remain available, including `#room=promptLab` and `#room=assemblyHall`; they do not force the new default landing. Use `#document=your-workspace` on the root route for a separate local construction workspace. These procedural materials and reflection-based glazing are a preview; interiors, accepted families and blocks remain later milestones.

Local width overrides survive **Keep edited dimensions and assemblies** or **Lock openings** during generation; clearing both releases them. Removing a preserved target rejects the candidate and retains the accepted building. A finish painted onto a removed frame has its own guard: explicitly remove that finish before removing its storey, or keep the target. Side/rear windows, ground frontage and other local structural dimensions remain outside this first scoped task. Portable project0.8 retains graph0.7, materials and generation lineage; old files remain literal.

[Review the actual images on your phone](https://app.notion.com/p/3fdb77d6cd4f812a9f88f1316beb9c25). [PR and gallery publication receipt](docs/reviews/2026-10-26-ux2-publication/README.md).

## Project Docs

- `docs/plans/building-authoring-revival.md` - October repository audit and building-first revival plan.
- `docs/plans/dynamic-building-family.md` - source MVP implementation plan.
- `docs/plans/kit-grammar-wfc-utdg-block.md` - post-MVP kit grammar, WFC, UTDG, and block generation plan.
- `docs/architecture/dynamic-building-family-integration.md` - repository-specific integration map.
- `docs/superpowers/plans/2026-06-25-dynamic-building-family-art-fidelity-bridge.md` - art-fidelity bridge slices.

Review evidence is published as a bounded subset; large generated archives remain local. See [GitHub archive scope](docs/reviews/GITHUB-ARCHIVE-SCOPE.md) before relying on historical attachment links or packet inventories.

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
