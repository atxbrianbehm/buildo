# AL.P9.1a: Independent demo awning fabric

A versioned, runtime-validated source creates an owned 64×64 RGBA fabric artifact with explicit colours, physical tile size, solid or striped pattern, deterministic weave phase and a content hash. The source and its seed contain no awning dimensions or structural choices; replay rejects altered source, pixels or hash. This is an illustrative procedural material, not a historical evidence mapping or a photorealistic textile.

The [solid](solid-clay.png), [striped](striped-clay.png) and [striped angled](striped-angle.png) views render the actual generated texture on the existing procedural canopy and valance in an isolated WebGL study. They are not product screenshots. The current atlas has twelve occupied slots and the surface compositor expects every semantic surface to resolve to its atlas; the independent source is not yet admitted to saved projects, the renderer, graph or editor. Integration must preserve old atlas bytes and material lineage and must not regenerate fabric for a structural edit.

Five focused fabric and awning tests pass for ownership, replay, content integrity, source distinction and geometry fit. Full repository validation is pending. Reproduce the study with `node docs/reviews/2026-10-30-al-p9-1a-awning-fabric/render.mjs`.
