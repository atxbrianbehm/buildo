# October revival: current-render evidence

These are fresh live-app captures for the [building authoring revival plan](../../plans/building-authoring-revival.md), not copies of the July comparison renders.

- Source: local main at `4c0fede`; no application source changes before capture.
- Captured: 2026-10-14 03:51:06–08 UTC (2026-10-13 in America/Chicago).
- Harness: installed Playwright Chromium and Vite, fresh browser session, 1600 × 1000 at device scale 1. Owned server/browser resources closed after capture.
- Reported renderer backend: WebGPU. No page errors; this is not representative-machine performance sign-off.
- Document: `buildo-demo-family`; prompt: `four floors, 7 bays, brick, flat roof, ornate trim`.
- Seeds: `family-seed`, `building-seed`, `material-seed`, `trim-seed`.
- Mode: kit, high detail, stages through roof. Camera/light: default Assembly Hall view; no orbit or raking-light pass.

| Capture | SHA-256 |
|---|---|
| [Prompt Lab desktop](prompt-lab-desktop.png) | `D7202E753A56F945561B2AFF41F8D923EB79C882AB54B813B63A419DA318E8C7` |
| [Assembly Hall desktop, textured](assembly-hall-textured-desktop.png) | `8C36E2B606BCA4D78A600AD308B97BA0061D86148D3B4DDA8A5D9F18B8EB54BD` |
| [Building canvas, textured](assembly-hall-textured-canvas.png) | `20FFD45061A32D7373036B8C16DE55A37C2F721E58E0EB591B70AE924185678E` |
| [Building canvas, clay](assembly-hall-clay-canvas.png) | `FA7564063C782A613F5F4DF5301ECC30807FC2E9997A97E95141A7579DE1C50E` |

Copies saved here were verified byte-for-byte against the temporary capture outputs. Historical reference images and comparison notes remain unchanged.
