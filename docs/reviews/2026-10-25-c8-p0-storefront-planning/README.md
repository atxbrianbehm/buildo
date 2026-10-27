# C8.P0 - storefront aperture planning

Pure planning groundwork is complete. The existing app does not expose or render storefronts from this packet yet. C8.P1 compiler geometry and C8.P2 product integration are required follow-through; no new human gate separates them.

`contracts/constructionStorefront.ts` admits strict JSON request/plan version0.1. `core/constructionStorefront.ts` derives a front-ground display or glazed-entrance aperture, lower framed region, transom rail and upper region in facade-local metres. A display uses explicit piers, bulkhead and head band. An entrance starts at grade and shares the display transom line. Fit errors reject; no parameter is silently clamped. The lower entrance region is an assembly envelope, not final door-leaf glazing geometry.

[Actual executable plans](plans.json) include a2.48m display opening above a0.55m bulkhead, a1.22m grade-level entrance and a2.88m display in a wider3.2m bay. Literal JSON continuation rederives and compares the plan; changing a source or derived dimension rejects. Request/source ownership, malformed versions/values/accessors/cycles, physical partition, width/pier/depth and transom fit, and translation are tested. Side/rear and upper-floor scopes explicitly reject at this boundary; callers must select front-ground scopes.

Typecheck, lint and38 focused tests across two files pass, including24 new cases and inherited C7 legacy compiler/recipe hashes. All332 preexisting tracked source/config pins remain byte-identical. Three new modules have no runtime imports from React, Three, stores, DOM or providers. [Verification](verification.json) links source snapshots, logs and before pins. No broad product suite or browser capture is claimed for unused pure planning code.

The optional first Vite loader probe returned valid plans and exited0 but emitted an asynchronous dependency-discovery shutdown warning. Its script and stdout are retained; that first stderr was terminal-only. The final probe disables discovery, uses a packet-local cache, emits the same plans and closes cleanly. No production source changed between probes.

Generation recipes, C7 formats/layouts, materials, renderer ownership and project persistence remain unchanged. These are authored procedural design dimensions; historical UTDG architecture coverage remains unknown. Public PR publication is still waiting on the exact-payload approval card. No push, merge, paid provider, installation or release occurred.
