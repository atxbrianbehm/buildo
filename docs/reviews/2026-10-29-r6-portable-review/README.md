# Portable family performance review preparation

The [review script](../../../scripts/family-performance-review.mjs) accepts an explicit saved family file instead of depending on this workstation's retained file path. It opens that family in the actual construction workbench, edits the selected member's width and returns/saves three times. It writes before/after screenshots, three separate saved copies and a versioned receipt containing the input and script SHA-256 hashes, Git revision and tracked-change status, browser/OS/CPU/memory observations, backend, viewport and wall-clock samples. It creates a new output directory and refuses to overwrite an existing one. The input family is read, not overwritten. Output files include the family source and should be handled accordingly.

From a clean checkout with the repository dependencies and Playwright Chromium already installed, create an empty parent such as `test-results` and run separately:

```powershell
node scripts/family-performance-review.mjs webgpu "C:\path\to\saved-family.json" test-results/review-webgpu
node scripts/family-performance-review.mjs webgl "C:\path\to\saved-family.json" test-results/review-webgl
```

Choose new output paths for each run. Keep the family file and source revision identical when comparing devices; the receipt records tracked changes but does not establish that untracked files cannot affect a build. Record the actual GPU model, driver, power mode and other workload separately: browser adapter information can be empty or incomplete, and the script does not establish hardware acceleration. The saved copies are review artifacts, not replacements for the supplied family. A failed run may leave a partial output directory; use a new name for a retry.

## Local verification

Both renderers completed the three-cycle workflow using the retained P3.1 family, with no page errors: [WebGPU receipt](webgpu.json), [WebGL receipt](webgl.json). The runs were simultaneous and are functional verification, not a controlled cross-device benchmark. The WebGPU [family screenshot](webgpu-family.png) was inspected and shows the related family and controls. The script was untracked while these runs used source revision `ec6014f`; its exact tested bytes are identified by the script hash in both receipts. The only tracked change was this packet's plan update. Focused ESLint passed; invalid arguments and an existing output directory were rejected. Initial sandboxed launches could not find the installed Chromium; the final runs used the user's previously authorized existing Chromium workflow. No browser was installed.

This is a reproducible handoff, not representative-machine acceptance, a frame-time or memory benchmark, or a visual checklist sign-off. The two overview screenshots do not cover all checklist views. Actual checklist items 1–7 and a stored visual QA packet on the chosen representative machine remain necessary before Phase F implementation.
