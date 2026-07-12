# UTDG research brief — late-19c masonry / trim (draft)

**Status:** prepared research artifact only — **not** a live engine in the runtime pipeline  
**Schema:** `docs/research/utdg-late19c-v0.1.json`  
**Consumer contract (optional inject):** `src/features/building-family/utdg/`  
**Date:** 2026-07-12

## Purpose

Universal Texture Description Graph (UTDG) is treated as a **versioned research brief** that can later be **injected** into the material / atlas lane. It must not invent structure (floors, bays, openings, massing).

Until a material consumer is wired:

- This brief is documentation + a schema-valid JSON seed.
- Assembly Hall, kit placement, WFC, and geometry expanders do **not** depend on UTDG.
- Phase E in `docs/plans/kit-grammar-wfc-utdg-block.md` starts from **injecting** this brief, not inventing a greenfield material compiler in the dark.

## Injection model

```text
docs/research/utdg-late19c-v0.1.json
        ↓  parse + Zod validate (pure)
TextureDescriptionGraph (schemaVersioned)
        ↓  later (Phase E2)
Art-kit material roles / atlas planner / remote prompt fragments
        ↓
Packed atlas channels  (structure IR hash unchanged when only weathering hints change)
```

Rules:

1. Inject by reference id + content hash, not by free-form chat into structure.
2. Nodes describe **roles and physical scale**, not mesh recipes.
3. Edges are pairing / weathering / trim / overlay relations for material planning only.
4. Remote material overlays remain composited on procedural height authority.

## Research framing (late 19c modular apartment / commercial)

Target read: urban masonry commercial/apartment body with storefront base, cast or cut stone trim, painted wood frames, flat or shallow parapet roof edge.

| Role family | Intent | Scale notes |
|---|---|---|
| `masonry.brick.running` | Primary wall field | ~0.20–0.25 m course height; avoid “giant brick” atlas tiling |
| `stone.trim.cast` | Belt courses, lintels, sills, quoins | Coarser grain than brick; lighter value |
| `wood.frame.painted` | Window/door frames and sash | Small feature scale; fine roughness variation |
| `glass.clear` | Opening fills | Low roughness; no structural meaning |
| `metal.hardware.painted` | Door hardware accents | Tiny; optional remote detail only |
| `roof.parapet.brick` | Parapet / roof cap field | Match wall brick or slightly darker |

Historical tags used in the seed graph: `period:late-19c`, `region:north-atlantic-urban`, `family:modular-apartment-commercial`.

## Non-goals (explicit)

- Full historical authority or museum-grade material science  
- Photo → mesh or façade parsing as structural truth  
- UTDG driving WFC tiles, bay counts, or opening placement  
- Authoring UI for texture graphs in this brief revision  

## Acceptance when Phase E opens

1. JSON seed validates against the consumer contract.
2. Brief id + content hash appear in run diagnostics when injected.
3. Structural IR / graph hashes are stable if only `generationHints.weathering` changes.
4. Art Kit material set can map kit roles → UTDG node ids without geometry imports in `utdg/`.

## Related code / plans

- Plan Phase E: `docs/plans/kit-grammar-wfc-utdg-block.md`
- Art-kit materials (today): `src/features/building-family/materials/artKitMaterialSet.ts`
- Inject parser: `src/features/building-family/utdg/textureDescriptionContracts.ts`
