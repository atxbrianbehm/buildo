# AL.P10.12 — seeded pier variation in the workspace

The family controls offer optional seeded upper-front pier variation. In the tested family, two members have slender piers, two have more projecting piers and two have none. Existing authored piers remain untouched. The plan and member graphs are saved independently so an artist can add or remove piers on a single building and reopen the result.

Actual WebGPU and WebGL app exercises generate the family with awnings and support rods, edit one member's width and piers, assign an individual fabric, save and reopen while retaining siblings, source materials and the original plan. No material-provider calls occurred during these operations. A separate WebGPU attempt correctly rejected an imported opening-width lock. WebGL emitted existing shadow-map and shader precision warnings.

The browser script uses a locally generated `docs/reviews/2026-10-30-al-p9-2u-entrance-workspace/webgl-combined-02/before.json` fixture, which is not tracked in Git, so this browser exercise is not reproducible from a clean checkout alone. The screenshot is the actual generated family. Its similar brick, massing and storefronts remain visually repetitive; this demo is not a historical reconstruction or a street-readiness claim.

All five checks passed: typecheck, lint, build, browser smoke and the full suite (2,084 tests in 168 files). The build retains its existing chunk-size warning.
