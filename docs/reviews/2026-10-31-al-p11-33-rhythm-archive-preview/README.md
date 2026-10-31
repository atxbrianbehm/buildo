# AL.P11.33 — read-only rhythm archive preview in the workspace

The existing Open family action recognizes a grouped-rhythm study archive, verifies and replays it, then previews its six buildings with the archived material and awning fabric. The original working building remains unchanged. The preview is explicitly read-only: family save and member editing are unavailable, and Return to building restores the original view. Invalid archives retain the previous building.

Actual app checks exercised the flow in [WebGL](webgl.png) and [WebGPU](webgpu.png), including return to the original construction. The component regression also verifies failed archive admission and runtime disposal. This does not yet create archives from the app, edit or save their members, or provide automatic recovery. Storefronts and materials remain visibly repetitive; architecture coverage is unknown.

Typecheck, lint, build, browser smoke and the full suite passed (2,126 tests in 181 files). The build retains its existing chunk-size warning.
