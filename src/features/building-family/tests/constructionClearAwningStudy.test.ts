import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { withConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { assertClearAwningLocks, resolveConstructionClearAwningStudy } from "../core/constructionClearAwningStudy";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration } from "../state/constructionGenerationState";
import { resolveSourceAwareClearAwningStudy } from "../state/constructionClearAwningStudy";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import { captureConstructionGenerationSource } from "../core/constructionGenerationSource";
import { resolveConstructionGeneration } from "../core/constructionGenerationResolver";
import stylePack from "../style-packs/late-19c-commercial-demo.json";

it("adds deterministic awnings away from the entrance while preserving authored storefront parts", async () => {
  const storefront = withConstructionStorefront(createBuildingConstructionGraph("clear_awning"), 1);
  const awnings = withConstructionAwnings(storefront, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
  const supported = withConstructionAwningSupports(awnings, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
  const graph = withConstructionSignAwningClearance(withConstructionStorefrontSign(supported, { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), 0.04);
  graph.nodes.find(node => node.type === "SplitBays")!.parameters.count = 5;
  const input = { schemaVersion: "0.1.0", kind: "construction-clear-awning-study", familySeed: "clear-awning", openingLock: false, additionalCount: 2, graph };
  const snapshot = structuredClone(input), result = resolveConstructionClearAwningStudy(input);
  expect(result.selectedBays).toEqual([2, 4]); expect(input).toEqual(snapshot);
  expect(resolveConstructionClearAwningStudy(JSON.parse(JSON.stringify(input)))).toEqual(result);
  expect(result.graph.storefrontSign).toEqual(graph.storefrontSign); expect(result.graph.awningSupports).toEqual(graph.awningSupports);
  expect(result.graph.signAwningGapM).toBe(graph.signAwningGapM); expect(result.graph.awnings!.find(awning => awning.bayIndex === 0)).toEqual(graph.awnings![0]);
  expect(result.graph.awnings!.some(awning => awning.bayIndex === 1)).toBe(false);
  expect(result.graph.awnings!.every((awning, index, all) => index === 0 || awning.bayIndex - all[index - 1].bayIndex > 1)).toBe(true);
  const compiled = await evaluateConstruction(result.graph);
  expect(compiled.ir.semanticIndex.filter(item => item.semanticPath.endsWith("/awning.canopy"))).toHaveLength(3);
  const one = Array.from({ length: 12 }, (_, index) => resolveConstructionClearAwningStudy({ ...input, familySeed: `seed-${index}`, additionalCount: 1 }).selectedBays[0]);
  expect(new Set(one).size).toBeGreaterThan(1);
  expect(() => resolveConstructionClearAwningStudy({ ...input, openingLock: true })).toThrow(/Unlock openings/);
  const crowded = structuredClone(graph); crowded.nodes.find(node => node.type === "SplitBays")!.parameters.count = 3;
  expect(() => resolveConstructionClearAwningStudy({ ...input, graph: crowded })).toThrow(/enough separated bays/);
  for (const semanticPath of ["construction", "construction/awning", "construction/opening/awning", "construction/frontage/mode"])
    expect(() => assertClearAwningLocks([{ semanticPath }])).toThrow(/pinned lock/);
  expect(() => assertClearAwningLocks([{ semanticPath: "construction/roof/parapetHeightM" }])).not.toThrow();
  const initial = await resolveWorkbenchGeneration(createBuildingConstructionGraph("clear_awning"), null, defaultConstructionGenerationControls);
  const template = (await normalizeBuildingSpec(initial.source.intent, stylePack)).spec;
  const lineage = { schemaVersion: "0.1.0" as const, kind: "construction-generation-lineage" as const, source: initial.source,
    resolution: initial.resolution, materialPlan: await planConstructionReferenceMaterials(template, initial.source), materialSourceHash: "a".repeat(64) };
  expect((await resolveSourceAwareClearAwningStudy(input, lineage)).selectedBays).toEqual([2, 4]);
  const pinned = await captureConstructionGenerationSource({ schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: initial.source.documentId,
    intent: { ...initial.source.intent, locks: [{ semanticPath: "construction/opening/upperFrontRoundHead", scope: "family", lockedValue: 0, reason: "Imported pin" }] },
    recipe: initial.source.recipe, reference: initial.source.reference, intentionalExceptions: initial.source.intentionalExceptions });
  const pinnedLineage = { ...lineage, source: pinned, resolution: await resolveConstructionGeneration(pinned), materialPlan: await planConstructionReferenceMaterials(template, pinned) };
  expect((await resolveSourceAwareClearAwningStudy(input, pinnedLineage)).selectedBays).toEqual([2, 4]);
  const different = structuredClone(graph); different.documentId = "different";
  const surface = different.nodes.find(node => node.type === "SetSurface"); if (surface?.type === "SetSurface") surface.composition.documentId = "different";
  await expect(resolveSourceAwareClearAwningStudy({ ...input, graph: different }, lineage)).rejects.toThrow(/same document/);
}, 120000);
