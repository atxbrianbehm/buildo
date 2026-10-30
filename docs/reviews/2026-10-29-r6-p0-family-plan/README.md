# R6.P0 — authored family source plan

This packet owns a strictly admitted, versioned six-member plan. It assigns stable member document IDs and semantic seed-tree paths, rebases selected-opening targets and surface composition document IDs, and revalidates every graph. Reading a saved plan recomputes its members and rejects tampering. A connected whole-building graph is required, and member IDs cannot collide with the source document.

Five focused tests in two files, typecheck and lint pass. The tests compile all six copies, verify distinct building semantic paths, preserve the selected opening and parapet choice, and cover deterministic JSON replay, ownership, malformed input and source-identity collision. All 339 source/config pins from C10.P2 remain exact. See [verification](verification.json) and the logs.

These copies are intentionally the same building with different identities and seeds; this packet does not run the generation resolver, generate six distinct geometries, share renderer resources, or display a family. R6.P1 and P2 must do those things and prove compatible lock/material/source behavior. Historical UTDG coverage remains unknown.
