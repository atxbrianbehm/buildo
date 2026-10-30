# AL.P10.11 — saved family pier variation

Family source 0.14 stores the initial seeded pier variation plan alongside optional existing composition, inherited fabric and per-member assignments. It validates replay and family seed, material ownership and all member graphs. Member updates retain the initial plan as provenance rather than forcing edited graphs back to the original choices.

The source test round-trips the format, retains an individual pier removal, rejects tampering, seed mismatch and the older schema, and exercises optional fabric ownership. An actual WebGPU workspace run verifies that the current editor rejects this newer format while preserving the scene. Artist controls, reopening this format in the workspace and visual review are still pending; the plan is a demo and not historical evidence.

The browser guard script uses a locally generated `docs/reviews/2026-10-30-al-p6-2-storefront-authoring/webgpu-02/divided.json` fixture, which is not tracked in Git, so the browser run is not reproducible from a clean checkout alone. The source test generates its own material fixture.

All five checks passed: typecheck, lint, build, browser smoke and the full suite (2,084 tests in 168 files). The build retains its existing chunk-size warning.
