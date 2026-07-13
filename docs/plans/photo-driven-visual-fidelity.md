# Photo-Driven Visual Fidelity Packets

**Status:** active — V1–V3 landed 2026-07-13; next V4  
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

### V4 — Horizontal body hierarchy

**Gap:** Floors exist; body still stamp-like.  
**Levers:** Belt projection, spandrel pride, optional lintel-at-opening-head strips.  
**Exit:** Three horizontal shadow systems: base top, mid belts, cornice.

### V5 — Material scale

**Gap:** Textured mode not period-checked.  
**Levers:** Art-kit metersPerTile, atlas roles—not structure regen.  
**Exit:** Brick course scale vs human-height openings feels building-sized.

### V6 — Evidence close-out

Re-score Marx + Vanderbilt packets; archive captures; link from kit-grammar Phase C visual QA gate; park this plan as exited.

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

---

## 8. Non-goals

- Photoreal rendering path  
- Photo import / reconstruction  
- Preassembled facade libraries as truth  
- Block/street generation (parent Phase F)  
- Combining V packets in one PR without explicit ask  
