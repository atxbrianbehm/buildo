# Explicit storefront-division reset

An explicit graph operation clears storefront pane divisions on graph versions that can represent their absence, preserving the sign, awning, support rods, facade piers and other choices. Version 0.12 returns to 0.11; versions 0.15–0.17 retain their versions. Versions 0.13 and 0.14 require a division and are rejected rather than silently migrated. Calling the operation on a graph without divisions leaves an owned copy unchanged.

The controlled WebGL before-and-after views show a divided storefront returning to a single display and transom pane while the signed awning and piers stay in place. The graph tests check compatible versions, geometry parity after clearing, and rejection of incompatible versions. This is not yet an artist-facing or undoable action. Family generation from a cleared signed source without piers may still synthesize a required legacy placeholder; that continuity requires separate work. The images are demo geometry, not historical attribution or a finished street.

Reproduce with `node docs/reviews/2026-10-31-al-p11-48-clear-storefront-division/render.mjs`.

Validation: typecheck, lint, production build, full suite (2,134 tests in 181 files), and standard browser smoke passed. The build retains its existing chunk-size warning. The isolated comparison was rendered in WebGL only.
