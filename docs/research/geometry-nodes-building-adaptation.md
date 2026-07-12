# Geometry Nodes / CGA → Buildo adaptation brief

**Status:** research guidance for geometry quality (not a product plan rewrite)  
**Date:** 2026-07-12  
**Implementation plan:** `docs/plans/geometry-node-quality-packets.md` (packets G1–G8)  
**Sources:** Blender Geometry Nodes building generators (Kammerbild, Buildify-style module assembly, face-driven facade grids); CGA shape (Müller et al. 2006) mass → facade → detail hierarchy.

## What the tutorials/literature actually do

### Blender Geometry Nodes building generators
Common pipeline across tutorials and kits (Buildify, face-driven generators, procedural city videos):

1. **Start from mass** — box / extruded footprint / simple volumes  
2. **Separate faces** — front/sides/roof treated as domains  
3. **Grid / split facade** — floors × bays as a 2D lattice on each face  
4. **Instance modules** — windows, cornices, trim assets placed on cells  
5. **Extrude / solidify** — wall thickness, offsets, profile curves for moldings  
6. **Parameters** — floor count, bay width, module collection pickers  

Key product idea: **modules + face lattice + extrude**, not a freeform mesh sculpt.

### CGA shape grammar (Müller / Wonka)
Hierarchical production:

1. **Mass model** (volumes)  
2. **Facade structure** (split / repeat into floors and tiles)  
3. **Detail** (windows, doors, ornaments with context rules)  

Critical operators for us:

| Operator | Meaning | Buildo mapping |
|---|---|---|
| **Split** | Divide a scope into child scopes | Floor bands, bay tiles |
| **Repeat** | Tile children to fill scope | Floors × bays |
| **Component split** | Faces of mass → facades | Front/side/rear already |
| **Occlusion / context** | Don’t put door mid-air | Planner zones (ground/body) |

## What Buildo already has

| GN/CGA idea | Buildo today |
|---|---|
| Mass | `BuildingFamilySpec.massing` |
| Facade grid | Art-kit cells + planner |
| Module instance | Kit openings / IR instances |
| Profile extrude | `profileLibrary` + `profileSweepGeometry` solids |
| Detail hierarchy | Cornice, belts, pilasters, spandrels, pockets |

## Gaps vs “Geometry Nodes quality”

1. **Walls were full bay slabs** — GN/CGA usually **subdivide wall around openings** (piers, spandrel, lintel, sill wall).  
2. **Openings were stuck on** — better: wall scopes leave an **opening hole region**, then frame fills it.  
3. **Storefront not a first-class split** — ground should split into bulkhead / glazing / lintel scopes.  
4. **No explicit split grammar artifact** — hard to debug “why this bay looks wrong.”  
5. **No true curve mesh profiles yet** beyond closed polyline extrusion (good next step after wall splits).

## Adaptation rules for Buildo (constraints)

- Keep **pure TS expanders** (no Blender dependency, no React in core).  
- **No preassembled building meshes** as source of truth.  
- Prefer **split → scopes → expanders** over more one-off box stacks.  
- Seed tree only for choices; structure stays deterministic.  
- Schema-version any new serialized split artifact.

## Implementation priority (this track)

1. **Facade wall subdivision** — each front bay → pier L/R + sill + head + optional spandrel — **done** (`facadeWallSubdivision.ts`).  
2. **Ground storefront split** — bulkhead / opening / lintel as scopes — **partial** (`mesh.storefront-hierarchy`).  
3. **Serializable `FacadeSplitPlan`** — **done** (`facadeSplitPlan.ts`): one plan drives wall punches + opening instance centers.  
4. **G1 split authority** — **done**: kit openings only from plan/split; proof uses front-only split defaults; compiler asserts 1:1 frame instances ↔ split openings. No parallel `ModuleInstanceSet` / hard-coded bay opening path.  
5. Later (G2+): slot-locked frame sizes/pockets, storefront modules, split hash in UI, expander unification.

## Non-goals

- Porting Blender node graphs  
- Full CGA interpreter DSL  
- Photo facade parsing as structure  
