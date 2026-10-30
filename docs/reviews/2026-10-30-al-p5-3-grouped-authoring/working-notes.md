# Grouped-bay authoring working notes

The artist needs an explicit upper-front storey and bay, plus a choice between a single opening, a pair and three openings. A compact control can show the existing choice for the selected bay and edit member width and masonry pier width in metres. Apply should compile the change atomically with existing material data; an infeasible width, active rounded heads or an existing parent-bay width override must produce an actionable error while retaining the last valid building. The control should expose its scope, not require the user to edit nodes.

The grouping belongs to the accepted graph and uses the existing publication/history path. Undo, redo and save/open must preserve it. Removing the last group should restore the prior graph format without changing other authored choices, allowing the existing generation path again. Existing per-window width controls cannot target a grouped member until member-aware targets exist; avoid listing multiple member frames as one bay target. Material providers must not run during structural grouping. An artist must be able to see and undo the actual result on both renderers, including textured close-ups of the sills, reveals and adjacent masonry.

This note records the initial design intent. See the packet README for the implemented scope, evidence and remaining limitations.
