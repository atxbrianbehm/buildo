# AL.P5.0: grouped upper-bay planning

The reference images motivate multiple related windows in a single facade bay. The existing compiler stores one opening per evenly split bay, so a sash layout alone cannot represent separated apertures with masonry between them. This packet plans two or three centered rectangular members, with independent IDs, an explicit pier, 80 mm minimum outer masonry and frame/recess fit. The request and derived plan are versioned and runtime validated; replay recomputes the placements. It is deterministic and owns its inputs.

This is planning data only. It is not yet connected to wall subtraction, window geometry, selection, save/open, family composition or the UI, and creates no visible change. P5.1 must make both wall and assembly consume the same placements and address local edit identity. Round heads on groups and independent per-member authoring are not claimed in this first slice. P5.2 must test the actual artist workflow and both renderers. These are demo structural choices, not measurements or historical claims from the supplied images.

Verification: nine focused tests passed, covering two and three members, pier spacing, stable identities, invalid fit and replay. Typecheck and lint passed.
