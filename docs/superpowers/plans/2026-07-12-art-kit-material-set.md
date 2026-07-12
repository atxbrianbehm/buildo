# Art-Kit Material Set Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkbox (`- [ ]`) tracking.

**Goal:** Milestone M8 / Slice 5 — define kit-level material roles with physical scale (`metersPerTile`), map them into the atlas planner and procedural provider, and expose glTF-ready metadata on atlas slots/sources without breaking procedural-first generation.

**Architecture:**

- `artKitMaterialSet.ts` owns pure resolution of `ArtKitManifest.materials` → atlas slot bindings + scale.
- `atlasPlanner.ts` optionally consumes an art kit (default: `late19cApartmentKit` when style pack matches) so tileable slots use **tile physical size** from `metersPerTile`, not full facade extents.
- Optional atlas slot fields (schema-versioned additive) carry `metersPerTile`, `artKitMaterialRoleId`, `proceduralSource` for export mapping.
- `proceduralMaterialProvider` uses `metersPerTile` / physical tile size to keep brick coursing scale stable across source resolutions.
- No Three.js in materials/art-kit modules. Secrets stay server-side.

**Parent plans:** `docs/plans/kit-grammar-wfc-utdg-block.md` (M8), art-fidelity bridge Slice 5.

---

## File structure

| Action | Path |
|---|---|
| Create | `src/features/building-family/materials/artKitMaterialSet.ts` |
| Create | `src/features/building-family/tests/artKitMaterialSet.test.ts` |
| Modify | `src/features/building-family/art-kit/late19cApartmentKit.ts` (plaster + grime roles) |
| Modify | `src/features/building-family/contracts/atlasManifest.ts` (optional metadata fields) |
| Modify | `src/features/building-family/materials/atlasPlanner.ts` |
| Modify | `src/features/building-family/materials/providers/proceduralMaterialProvider.ts` |
| Modify | tests: `atlasPlanner`, `proceduralMaterialProvider` (if present), contracts |
| Update | kit-grammar plan, fidelity bridge, integration map |

## Public API

```ts
export interface ArtKitMaterialBinding {
  atlasSlotId: string;
  materialRoleId: string;
  label: string;
  channels: Array<"baseColor" | "normal" | "orm" | "height" | "opacity">;
  metersPerTile: number;
  proceduralSource: string;
  gltfHints: {
    baseColorTexture: boolean;
    normalTexture: boolean;
    metallicRoughnessTexture: boolean; // ORM
    occlusionTexture: boolean; // ORM R
    alphaMode: "OPAQUE" | "BLEND" | "MASK";
  };
}

export interface ArtKitMaterialSet {
  schemaVersion: "0.1.0";
  artKitManifestId: string;
  bindings: ArtKitMaterialBinding[];
  diagnostics: Diagnostic[];
}

export function resolveArtKitMaterialSet(kit: ArtKitManifest): ArtKitMaterialSet;
export function artKitMaterialForAtlasSlot(kit: ArtKitManifest, atlasSlotId: string): ArtKitMaterialRole | undefined;
export function tilePhysicalSizeM(metersPerTile: number): { width: number; height: number };
export function mapSelectedFamilyToArtKitMaterialId(role: string, selectedFamily: string): string | undefined;
```

## Behavior rules

1. **Tileable slots** (`uvMode` repeat / cap-repeat, periodicity x/xy): `physicalSizeM = { width: metersPerTile, height: metersPerTile }` from kit role when bound.
2. **Stretch slots** (glass, door, ornament, utility): keep component-oriented physical sizes; still attach kit role metadata when a hint matches.
3. **Brick scale:** procedural brick cell size in pixels derives from `metersPerTile` so 1.2 m tiles have stable coursing density independent of facade bay count.
4. **Distinct sources:** plaster ≠ brick ≠ roof ≠ metal ≠ wood ≠ glass (explicit proceduralSource ids).
5. **Additive schema only** — optional fields on `AtlasSlot`; existing fixtures without them still validate.

## Tasks

### Task 1: Material set resolver + kit fixture expansion

- [x] Tests for binding every kit material with atlas hint, plaster/grime presence, glTF hints, diagnostics on missing hints
- [x] Implement `artKitMaterialSet.ts`
- [x] Add plaster + grime materials to `late19cApartmentKit`
- [x] `npm.cmd run test -- artKitMaterialSet artKitContracts`

### Task 2: Atlas contract + planner wiring

- [x] Optional `metersPerTile`, `artKitMaterialRoleId`, `proceduralSource` on `AtlasSlot`
- [x] `planAtlas(spec, options?: { artKit?: ArtKitManifest | null })`
- [x] Default art kit when `stylePackId` ∈ kit.stylePackIds
- [x] Tileable slots get tile physical size; material sources include metersPerTile
- [x] Tests: wall.primary physical size equals brick metersPerTile (1.2); deterministic
- [x] `npm.cmd run test -- atlasPlanner contracts`

### Task 3: Procedural provider scale

- [x] Prefer `request.metersPerTile` / physical tile for brick/stucco pattern frequency
- [x] Test: same metersPerTile → same brick cell count across widthPx variants (proportional)
- [x] `npm.cmd run test -- proceduralMaterialProvider`

### Task 4: Docs + final

- [x] Mark M8 / Slice 5 done
- [x] Integration map
- [x] `npm.cmd run typecheck`

## Acceptance

- [x] Brick coursing scale stable for fixed metersPerTile
- [x] Plaster and roof use distinct procedural sources
- [x] Roles expose PBR-like channels
- [x] Atlas slots/sources carry glTF-mappable metadata
- [x] No Math.random; no Three in core material set module

## Validation

```powershell
npm.cmd run test -- artKitMaterialSet artKitContracts atlasPlanner proceduralMaterialProvider contracts
npm.cmd run typecheck
```
