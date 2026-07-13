# Photo-Driven Visual Fidelity Packets

**Status:** **exited** — V1–V6 complete 2026-07-13 (structure + material scale); further period work is optional follow-ups  
**Date:** 2026-07-13  
**Parent tracks:** G1–G8 geometry quality (exited), kit-grammar roadmap, Period Ref Lab  
**Primary refs:** `docs/ref/` + `docs/research/period-reference/` via `#room=periodRef`  
**Delivery mode:** one **packet** = one reviewable PR-sized milestone with a **visible clay delta** against a named photo ref.

---

## 1. Honest goal

Move kit-mode Assembly Hall output from **readable modular box** toward **period-believable commercial/apartment silhouette in clay**, judged by side-by-side photo compare—not by IR checklist alone.

This is **not** photoreal materials, photo→mesh, or Blender GN parity. Textured brick is a later packet after clay silhouette sells.

**Exit for this plan (V6):** On default demo seed, clay 3/4 front + Shift-raking light, a non-author can name ground / body / cornice bands and punched openings without prompting—and Marx / Vanderbilt comparison notes move several rows from partial toward pass.

---

## 2. What already landed (do not re-do)

| Item | Role |
|---|---|
| G1–G8 | Split plan, storefront scopes, expanders, clay gate |
| Period Ref Lab | Catalog, `/period-ref` serve, rubric, comparison notes |
| P0 | Front trim projects outward (cornice/belt/quoin) |
| P1 | Opening instances oriented to facade normals; throat into wall |
| Visual QA packet | Automated IR evidence (floor, not ceiling) |

**Lesson:** Orientation/correctness packets without **massing amplitude** feel the same in the product. Prefer packets that change silhouette in 10 seconds.

---

## 3. Judging protocol (every packet)

1. **Primary ref** named in the packet (default: Marx Grocery or Vanderbilt).  
2. Kit mode, clay, default seeds unless packet says otherwise.  
3. Capture: `node scripts/capture-period-compare.mjs` (or Assembly Hall screenshot).  
4. Shift-rake light once; if the claim needs forensics to see, the packet is too small.  
5. Update comparison notes under `docs/ref/comparisons/…`.  
6. Automated tests cover pure geometry/spec; photos stay human-scored.

---

## 4. Packet sequence

| ID | Packet | Primary ref | Visible exit (clay) | Depends |
|---|---|---|---|---|
| **V1** | **Commercial base band** | Vanderbilt, Marx | Ground floor height clearly > upper floors; bulkhead/glazing/lintel read as a base system | P0–P1 |
| **V2** | **Cornice crown weight** | Marx, Columbus cornice detail | Skyline sells multi-layer overhang without zoom | V1 |
| **V3** | **Punched opening amplitude** | Marx lintels, Columbus | Throat dark under rake; lintel hood as shelf | V1 |
| **V4** | **Horizontal body hierarchy** | Marx, Boykin | Clear belt/spandrel rhythm between base and cornice | V1–V3 |
| **V5** | **Material scale pass** | Any brick ref | Brick/tile scale coherent at default camera (textured) | V4 |
| **V6** | **Evidence close-out** | All primary | Period notes re-scored; Visual QA known-gaps updated; kit roadmap unblocked for layout | V2–V5 |

Optional later (not this plan): corner bays/oriels, arched ground arcade family, multi-lot street wall (Phase F).

---

## 5. Packet details

### V1 — Commercial base band (this milestone)

**Gap:** Ground ≈ upper floor height; storefront hierarchy exists but does not dominate silhouette.  
**Levers:**

- Style-pack ground floor height vs typical (target ~1.45–1.6×).  
- `groundFloorRatio` derived / consistent with heights.  
- Storefront vertical split ratios for tall ground (bulkhead + tall glazing + lintel).  
- Proud storefront hierarchy on exterior face (same outward convention as P0).  
- Plinth / ground wall depth already slightly thicker—keep, don’t replace structure with mesh kits.

**Out of scope:** New preassembled storefront meshes; WFC; remote materials.

**Validation:**

```powershell
npm.cmd run test -- storefrontScopeSplit specNormalizer facadeSplitPlan buildingCompiler
npm.cmd run typecheck
```

Clay: ground band visibly taller than floor above at default camera (no zoom).

### V2 — Cornice crown weight — **done 2026-07-13**

**Gap:** P0 made cornice present; amplitude still light vs Marx.  
**Levers:** Deeper layered/restrained profiles, `scaleProfileProjection`, taller corniceHeightM, larger brackets + fascia bar.  
**Exit:** 3/4 clay skyline reads “has a cornice” before openings are inspected (≥ ~0.7 m overhang on layered).

### V3 — Punched opening amplitude — **done 2026-07-13**

**Gap:** P1 fixed orientation; depth still shallow vs brick refs.  
**Levers:** Deeper frame/door recipes, side/head returns, deeper glass, hoodProjection, fuller wall pockets.  
**Exit:** Assembly depth ≥ ~0.55 m and glass inset ≥ ~0.2 m; throat reads under Shift-rake without hunting.

### V4 — Horizontal body hierarchy — **done 2026-07-13**

**Gap:** Floors exist; body still stamp-like.  
**Levers:** Deeper belt profile + projectionScale, ground→body heavy belt, drip bars, mid-body string courses, taller/prouder spandrels.  
**Exit:** Three horizontal systems read at default camera: ground top / floor belts / cornice (plus mid-body strings).

### V5 — Material scale — **done 2026-07-13**

**Gap:** Textured mode not period-checked; UVs stretched one tile per face.  
**Levers:** UTDG-aligned metersPerTile; meter-space box UVs; atlas remap divides by physicalSizeM + wrap for tileable slots; brick course density from 0.075 m.  
**Exit:** Brick ~0.96 m/tile in period range; wall UVs tile by meters; materialScale QA checks period ranges.

### V6 — Evidence close-out — **done 2026-07-13**

Documented packet landings in this plan + `docs/ref/comparisons/…/FINDINGS.md`; Marx notes freeform updated. Visual QA materialScale now enforces period ranges. Layout work (WFC M12) is no longer blocked by “weak mass” from this track—period photoreal remains open-ended.

---

## 6. Mapping to parent roadmaps

| Parent | Relation |
|---|---|
| G8 clay gate | Floor for “composed”; V packets raise period likeness |
| Kit Phase C4 Visual QA | Continues; period notes are complementary evidence |
| M12 WFC | Still blocked until silhouette packets V1–V3 land (layout on weak mass is waste) |
| UTDG / materials | V5 is the consumer-facing gate; structure stays forbidden |

---

## 7. Status log

| Date | Event |
|---|---|
| 2026-07-12 | Period Ref Lab + first-pass FINDINGS (P0–P4 backlog) |
| 2026-07-13 | P0 outward trim, P1 opening orientation |
| 2026-07-13 | This plan; **V1 commercial base** landed (5.6 m ground vs ~3.5 m body) |
| 2026-07-13 | **V2 cornice crown weight** landed (deeper profile + brackets + fascia) |
| 2026-07-13 | **V3 punched opening amplitude** landed (returns, deeper glass/pockets, hoods) |
| 2026-07-13 | **V4 horizontal body hierarchy** landed (belts, drips, string courses, spandrels) |
| 2026-07-13 | **V5 material scale** landed (period metersPerTile + physical UV tiling) |
| 2026-07-13 | **V6 evidence close-out** — plan exited |

---

## 8. Non-goals

- Photoreal rendering path  
- Photo import / reconstruction  
- Preassembled facade libraries as truth  
- Block/street generation (parent Phase F)  
- Combining V packets in one PR without explicit ask  
