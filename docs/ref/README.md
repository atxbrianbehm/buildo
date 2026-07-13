# Period photo references (`docs/ref`)

Manual visual QA set for comparing **kit-mode Assembly Hall** output against real late-19c / early commercial architecture.

This is **not** photo→mesh import and not a structure driver. References guide human judgment for silhouette, rhythm, opening depth, trim, and storefront base.

## Layout

| Path | Role |
|---|---|
| `docs/ref/*.jpg` | User-supplied primary street / facade photos |
| `docs/ref/catalog.json` | Schema-versioned catalog + comparison rubric |
| `docs/research/period-reference/images/` | Curated HABS / LOC public-domain set |
| `#room=periodRef` | In-app Period Ref Lab (dev server serves images) |

## Compare protocol

1. Generate a **kit** building in Prompt Lab (default seeds fine).
2. Open **Period Ref** (`#room=periodRef`), pick a **primary** reference.
3. Open **Assembly Hall** in a second tab or after scoring notes:
   - presentation **clay**
   - 3/4 front elevation, building ~70% of frame
   - **Shift-drag** key light for a raking pass
4. Score each rubric row in Period Ref Lab (`pass` / `partial` / `fail` / `not-reviewed`).
5. Optional: **Download comparison notes** JSON (schema-versioned) next to a Visual QA packet.

## Primary single-building targets

Prefer these first (best match for modular apartment / commercial kit):

- Marx Grocery (Buffalo) — cornice, lintels, corner + side
- Brooklyn Vanderbilt (NARA) — storefront base + upper body
- Boykin / stoop brick facade (`+.jpg`) — vertical grid + entry
- Holdout 116th — complete small building + street-wall contrast
- Ferrybank / Brooklyn Bridge HAER — arched commercial openings
- HABS Columbus apartment front + Jefferson City brick facade

Street panoramas and the Flatiron / arcade lithograph are **secondary / context** (block rhythm, not single-kit fidelity).

## Rights

- HABS / HAER / many LOC items: public domain U.S. government work — keep attribution in `SOURCES.json` / catalog.
- User-dropped files in this folder: **verify rights before publishing** screenshots or redistributing originals.

## First-pass results

Clay vs photo scores and ranked geometry follow-ups:

- `docs/ref/comparisons/2026-07-12-first-pass/FINDINGS.md`
- Capture script: `node scripts/capture-period-compare.mjs`

**Photo-driven plan:** `docs/plans/photo-driven-visual-fidelity.md` (packets V1–V6).  
**Landed:** P0 · P1 · V1–**V4** (base, cornice, openings, body belts).  
**Next:** V5 material scale (textured).

## Related

- Visual QA packet (automated IR checklist): Assembly Hall → Download Visual QA Packet
- Geometry quality track exit: `docs/plans/geometry-node-quality-packets.md` (G8)
- Kit roadmap Phase C4: `docs/plans/kit-grammar-wfc-utdg-block.md`
