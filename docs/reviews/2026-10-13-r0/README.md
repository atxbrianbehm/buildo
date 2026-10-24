# R0: recovered baseline evidence

These are fresh live-app captures after [R0 baseline recovery](../../plans/building-authoring-revival.md#r0-execution-results--2026-10-13). Earlier audit/July captures remain unchanged.

- Source: local main at base `4c0fede` plus scoped R0 working-tree changes; uncommitted.
- Captured: 2026-10-14 04:36:00–02 UTC (2026-10-13 in America/Chicago).
- Harness: installed Playwright Chromium and Vite, fresh browser session, 1600 × 1000 at device scale 1. Owned browser/server resources closed after capture.
- Reported renderer: WebGPU; zero page errors. This is baseline evidence, not whole-building aesthetic acceptance or representative-machine sign-off.
- Document: `buildo-demo-family`; prompt: `four floors, 7 bays, brick, flat roof, ornate trim`.
- Seeds: `family-seed`, `building-seed`, `material-seed`, `trim-seed`. Normalization now preserves the seven requested bays.
- Mode: kit, high detail, stages through roof. Default camera/light; no orbit or raking-light pass.
- All required checks pass: typecheck, lint, 291 unit tests across 78 files, production build, browser smoke.

| Capture | SHA-256 |
|---|---|
| [Prompt Lab desktop](prompt-lab-desktop.png) | `D7202E753A56F945561B2AFF41F8D923EB79C882AB54B813B63A419DA318E8C7` |
| [Assembly Hall desktop, textured](assembly-hall-textured-desktop.png) | `61B553BDAEB0B71B0800C0B26939AFCBF6421EA2F81059FC38DF7E820E1836C0` |
| [Building canvas, textured](assembly-hall-textured-canvas.png) | `70EC55DEB4015CEF31FD4F8B0B4D6B9E47E1741598B20E752AC143633A04FA12` |
| [Building canvas, clay](assembly-hall-clay-canvas.png) | `B5FABEF92573F3D689810FE7ED7DE5257A809FE3CB0D1141665E0BC876B18FAD` |

Command logs and the temporary capture harness remain under ignored `test-results/r0-2026-10-13/`. Durable execution details and the remaining R1 visual gate are in the plan.
