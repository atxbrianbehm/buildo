# Visual QA Packet Implementation Plan

> **For agentic workers:** Implement task-by-task.

**Goal:** Milestone M11 / Slice 8 — schema-versioned visual QA packet exportable from the app so fidelity claims stay evidence-backed.

**Architecture:**

- Pure builders under `src/features/building-family/qa/` (no Three/React).
- `createModuleQualityReport(fixture)` evaluates checklist items from IR, graph, art kit, and atlas metadata.
- `createVisualQaPacket({ fixture, ... })` wraps report + seeds, hashes, routes, known gaps.
- Assembly Hall (and optional Prompt Lab) can download JSON via existing download helper.
- Status fields: `pass` | `fail` | `estimated` | `not-captured` (mirrors benchmark documentation honesty).

**Parent plans:** kit-grammar M11, art-fidelity bridge Slice 8.

---

## Packet shape (conceptual)

```ts
VisualQaPacket {
  schemaVersion: "0.1.0"
  packetKind: "dynamic-building-family-visual-qa"
  createdAt
  screenshotTargetRoute: "#room=assemblyHall"
  prompt, seeds, fidelityMode, stylePackId, detailLevel
  hashes: { artKitManifestId, atlasId, atlasContentHash, graphId, sourceGraphHash, familyId, buildingId }
  qualityReport: ModuleQualityReport
  knownGaps: string[]
  benchmarkProfileId?: string
}
```

## Checklist categories

silhouette, facadeRhythm, openingDepth, trimLayering, materialScale, sideRearTreatment, roofEdgeTreatment, clayReadability, wireframeInspection, texturedReadability, performanceBudget

## Tasks

1. [x] moduleQualityReport + tests  
2. [x] visualQaPacket + tests  
3. [x] Assembly Hall download action  
4. [x] Docs  

## Validation

```powershell
npm.cmd run test -- moduleQualityReport visualQaPacket AssemblyHall
npm.cmd run typecheck
```

**Status:** implemented 2026-07-12.
