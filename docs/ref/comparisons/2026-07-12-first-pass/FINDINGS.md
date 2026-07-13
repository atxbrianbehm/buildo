# First-pass period photo comparison (2026-07-12 / 13)

**Method:** Kit-mode Assembly Hall clay capture (default seeds, `four floors, 7 bays, brick, flat roof, ornate trim`) vs primary photo refs from `docs/ref` + HABS pack.  
**Artifacts:** this folder (`assembly-hall-clay-*.png`, `ref-*.jpg`, `*-period-comparison.json`).  
**Capture:** `node scripts/capture-period-compare.mjs`  
**Lighting caveat:** default orbit lighting only — no Shift-drag raking pass in this capture.

## Scoreboard (clay)

### After P0 + P1 (current captures)

| Rubric | Marx Grocery | Notes |
|---|---|---|
| Silhouette / massing | **partial** | Cornice + brackets project; roof slab still softens crown |
| Facade rhythm | partial | Belts/quoins help; still stamp-like vs Marx bay hierarchy |
| Opening depth | **partial (stronger)** | Facades orient local +Z outward; glass/throat into wall; lintel hoods |
| Trim layering | **partial** | Layers visible; crown still lighter than Marx |
| Storefront / base | partial | Plinth helps; base not tall enough (**P2**) |
| Side / rear | partial | Secondary side + corner quoins; side openings oriented |
| Material scale | not-reviewed | Textured deferred |

**Marx (post-P1):** 0 pass · 6 partial · 0 fail · 1 not-reviewed — opening depth no longer a flat surface-box fail mode  

### First capture (pre-fix, historical)

Silhouette + trim layering were **fail** because front moldings used `facadeSign +1` and centers offset into the mass — cornice geometry existed (trim stage metrics) but was buried.

## What already works (keep)

1. **Overall box massing + multi-floor stack** — readable as a building, not a prop.
2. **Bay / floor grid** — vertical piers and horizontal floor lines appear in clay.
3. **Opening assemblies present** — frames/sills exist; stage reveal lists openings + trim batches.
4. **Side elevation hierarchy (weak but present)** — side is not a full copy of the front bay count.
5. **Kit path is live** — same fixture is what product rooms use (not a separate mock).

## Ranked geometry follow-ups (photo-driven)

### P0 — Cornice placement outward — **done 2026-07-13** (amplitude raised in V2)

**Root cause:** Front cornice/belt/plinth/pilaster/spandrel/quoin placement swept profile `d` **into** the building (+Z) instead of outward (-Z).  
**Fix:** `profiledTrimGeometry.ts` anchors on `frontFacadeExteriorZM` and uses `facadeSign: -1` for front moldings; proud boxes move to -Z.  
**Exit met:** Clay 3/4 view shows projecting cornice brackets, belts, and quoins (see re-captured `assembly-hall-clay-default.png`).  
**Residual:** Crown still lighter than Marx multi-layer cornice; optional follow-up is profile depth scale, not placement.

### P1 — Openings as punched mass, not surface boxes — **done 2026-07-13**

**Root cause:** Opening instances used pure scale+translate with no facade orientation, so local exterior (+Z) mapped to world +Z (into the front mass). Glass/recess sat *outside* the wall; openings read as stuck-on boxes. Frame centers were also offset 3 cm outboard of the wall face.  
**Fix:**
- `openingInstanceMatrix` maps local +Z onto each facade outward normal (front -Z, rear +Z, left -X, right +X)
- Frame anchors on the outer wall face (no outboard bias)
- Deeper throat / glass inset; proud lintel hood stack; larger pocket hierarchy fractions  
**Exit met:** Clay re-capture shows frames/hoods on the wall plane with glass/throat reading inward (see `assembly-hall-clay-default.png` / orbit).  
**Residual:** Still not as deep as Marx punched brick; raking Shift-light capture would make the throat clearer. Not a placement bug anymore.

### P2 / V1 — Commercial base band — **done 2026-07-13**

**Refs:** Vanderbilt red base, Marx storefront belt  
**Plan:** `docs/plans/photo-driven-visual-fidelity.md` (packet V1)  
**Fix:** Style-pack ground **5.6 m** vs typical **~3.5 m** (~1.5×); derived `groundFloorRatio`; taller storefront glazing split; proud outward bulkhead/lintel/fascia; thicker ground wall depth; taller plinth.  
**Exit:** Ground band clearly taller than floor above at default clay camera — intended as a 10-second silhouette win (not a forensic lighting check).
### P3 — Lintel / belt courses as horizontal trim layers

**Refs:** Marx stone lintels/sills, Columbus window hoods  
**Gap:** Horizontal hierarchy beyond floor lines is weak.  
**Direction:** Belt course + lintel profile instances at opening heads (profiled trim path).  
**Exit:** At least one intermediate horizontal shadow band between ground and cornice.

### P4 — Later grammar (not this pass)

- Corner bays / oriels (Vanderbilt, Columbus)  
- Arched opening families as default for commercial ground  
- Street-wall multi-building row (panorama refs)  
- Textured brick scale check  

## Capture notes

| File | Role |
|---|---|
| `assembly-hall-clay-default.png` | Default camera, clay |
| `assembly-hall-clay-orbit.png` | Mild orbit |
| `assembly-hall-clay-page.png` | Full UI chrome (stage counts) |
| `ref-marx-grocery.jpg` | Primary commercial corner |
| `ref-brooklyn-vanderbilt.jpg` | Storefront base + body |
| `ref-habs-columbus.jpg` | Bay apartment front |
| `ref-holdout-116th.jpg` | Small complete building |
| `ref-boykin-stoop.jpg` | Stoop / vertical grid |

Stage metrics from page capture (illustrative): facade 4 objects, openings 5, trim present — after P0/P1 clay readability improved for crown and opening throat.

### V2 — Cornice crown weight — **done 2026-07-13**

**Plan:** photo-driven V2  
**Fix:** Deeper layered profile (max d ~1.08 m), projectionScale, taller corniceHeightM, larger brackets + continuous fascia bar.  
**Exit:** Layered crown overhang ≥ ~0.7 m past front face.

### V3 — Punched opening amplitude — **done 2026-07-13**

**Plan:** photo-driven V3  
**Fix:** Deeper window/door recipes, side/head returns, deeper glass, hoodProjection, fuller pockets.  
**Exit:** depth ≥ 0.55 m, glass inset ≥ 0.2 m.

## Next actions

1. ~~P0–P1 placement~~ **landed**  
2. ~~V1 commercial base~~ **landed**  
3. ~~V2 cornice crown~~ **landed**  
4. ~~V3 opening amplitude~~ **landed**  
5. **V4** horizontal body hierarchy (next)  

