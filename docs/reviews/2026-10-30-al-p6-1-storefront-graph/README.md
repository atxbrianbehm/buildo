# AL.P6.1: Storefront division graph and worker

Graph 0.12 stores explicit display and transom light counts for the active front storefront, alongside grouped upper bays. The compiler uses the same validated division plan for window and entrance assemblies, includes the division in its window prototype cache key, and preserves material roles and semantic paths. Project 0.13 round-trips the graph and its literal material source; older graph and project paths remain supported. A one-light choice preserves the prior geometry.

The focused storefront, graph and grouped-bay suites passed 24 tests. The actual browser worker smoke matches direct compilation, including prototype geometry and semantic paths, and verifies transferred instance buffers. Typecheck and lint passed during development. Full validation is pending.

There is no editor control for this choice in this packet. Generation from the new graph explicitly rejects instead of silently discarding storefront choices; family source admission remains limited to the previous graph version. Artist controls, generation and family variation, actual app captures and textured intersection review are follow-up work. The isolated clay studies in [P6.0](../2026-10-30-al-p6-storefront-composition/README.md) do not establish product visual acceptance or historical evidence.
