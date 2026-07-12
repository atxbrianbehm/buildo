# Buildo

Buildo is the greenfield home for the Wild Construct Dynamic Building Family work.

The first target is a browser vertical slice that resolves Prompt Spaghetti intent, normalizes it through a style pack, generates a semantic material atlas, compiles modular building geometry, and renders the result through a Three.js adapter.

## Project Docs

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
