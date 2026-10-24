import { describe, expect, it } from "vitest";
import brief from "../../../../docs/research/utdg-late19c-v0.1.json";
import type { ConstructionGenerationInput, ConstructionGenerationSource } from "../contracts/constructionGeneration";
import { captureConstructionGenerationSource } from "../core/constructionGenerationSource";
import { compileConstructionGeneration, constructionRecipeReference, readConstructionGenerationResolution, resolveConstructionGeneration } from "../core/constructionGenerationResolver";
import { hashCanonicalJson } from "../core/contentHash";

async function source(change?: (input: ConstructionGenerationInput) => void) {
  const input: ConstructionGenerationInput = {
    schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: "generated-test",
    intent: { schemaVersion: "0.1.0", prompt: "Masonry building", requested: { floorCount: 3, bayCount: 4, trimDensity: "moderate" },
      seeds: { family: "family", building: "building", material: "material", trim: "trim" }, locks: [],
      psg: { traceId: "generation-test", evaluatedVariables: { "building.floorCount": 3 } } },
    recipe: await constructionRecipeReference(), reference: {
      schemaVersion: "0.1.0", kind: "construction-reference-snapshot", id: "late19c-demo", revision: "1",
      origin: { kind: "local-demo", locator: "docs/research/utdg-late19c-v0.1.json" },
      architectureCoverage: "unknown", coverageNotes: "Draft material vocabulary; architecture evidence unverified.", claims: [],
      materialBrief: structuredClone(brief) as ConstructionGenerationInput["reference"]["materialBrief"]
    }, intentionalExceptions: []
  };
  change?.(input);
  return captureConstructionGenerationSource(input);
}
async function recapture(value: ConstructionGenerationSource, change: (input: ConstructionGenerationInput) => void) {
  const input: ConstructionGenerationInput = { schemaVersion: "0.1.0", kind: "construction-generation-input",
    documentId: value.documentId, intent: structuredClone(value.intent), recipe: structuredClone(value.recipe),
    reference: structuredClone(value.reference), intentionalExceptions: structuredClone(value.intentionalExceptions) };
  change(input); return captureConstructionGenerationSource(input);
}
function parameter(graph: Awaited<ReturnType<typeof resolveConstructionGeneration>>["graph"], id: string, field: string) {
  const node = graph.nodes.find(item => item.id === id)!;
  if (!("parameters" in node)) throw new Error("Expected parameter node");
  return (node.parameters as Record<string, number>)[field];
}

describe("seeded construction generation through actual operators", () => {
  it("compiles two requested buildings into four real elevations with shared procedural windows, an entrance and a roof", async () => {
    const a = await compileConstructionGeneration(await source(input => Object.assign(input.intent.requested, { floorCount: 2, bayCount: 3 })));
    const b = await compileConstructionGeneration(await source(input => Object.assign(input.intent.requested, { floorCount: 4, bayCount: 5 })));
    expect(a.construction.ir.instanceBatches[0].count).toBe(23);
    expect(b.construction.ir.instanceBatches[0].count).toBe(79);
    expect(a.construction.ir.bounds.max[1]).toBeLessThan(b.construction.ir.bounds.max[1]);
    expect(a.construction.ir.bounds.max[0]).toBeLessThan(b.construction.ir.bounds.max[0]);
    for (const result of [a, b]) {
      expect(result.construction.ir.meshBatches.filter(batch => batch.role === "wall")).toHaveLength(4);
      expect(result.construction.ir.meshBatches.filter(batch => batch.batchId.includes("/node/door/"))).toHaveLength(5);
      expect(result.construction.ir.meshBatches.filter(batch => batch.batchId.includes("/node/roof/"))).toHaveLength(3);
      expect(result.construction.prototypes).toHaveLength(3);
      expect(result.construction.ir.sourceGraphHash).toBe(result.resolution.graphContentHash);
      expect(result.construction.ir.semanticIndex.some(item => item.semanticPath.endsWith("facade/rear/floor/1/bay/0/frame"))).toBe(true);
      expect(result.resolution.graph.nodes.find(node => node.type === "SetSurface")!.composition.documentId).toBe("generated-test");
    }
    expect(a.construction.prototypes).toEqual(b.construction.prototypes);
  });

  it("replays the same source and opens the resolved graph without fetching any references", async () => {
    const captured = await source(), a = await compileConstructionGeneration(captured), b = await compileConstructionGeneration(captured);
    expect(a).toEqual(b);
    expect(await readConstructionGenerationResolution(JSON.parse(JSON.stringify(a.resolution)), JSON.parse(JSON.stringify(captured)))).toEqual(a.resolution);
    expect(a.resolution.choices.some(choice => choice.target === "construction/facade/count" && choice.basis === "requested" && choice.value === 3)).toBe(true);
  });

  it("varies an unlocked building seed while explicit floor/bay choices and semantic identities survive", async () => {
    const hashes = new Set<string>();
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const captured = await source(input => { input.intent.seeds.building = seed; });
      const { resolution, construction } = await compileConstructionGeneration(captured);
      hashes.add(resolution.graphContentHash);
      expect(parameter(resolution.graph, "facade", "count")).toBe(3);
      expect(parameter(resolution.graph, "bays", "count")).toBe(4);
      expect(construction.ir.semanticIndex.some(item => item.semanticPath.endsWith("facade/floor/1/bay/0/frame"))).toBe(true);
    }
    expect(hashes.size).toBeGreaterThan(1);
  });

  it("resolves unspecified counts using the semantic seed tree", async () => {
    const captured = await source(input => { input.intent.requested = {}; });
    const first = await compileConstructionGeneration(captured), second = await compileConstructionGeneration(captured);
    expect(first).toEqual(second);
    expect(first.resolution.choices.find(choice => choice.target === "construction/facade/count")!.basis).toBe("seeded");
    expect(parameter(first.resolution.graph, "facade", "count")).toBeGreaterThanOrEqual(2);
  });

  it("retains explicit numeric graph-parameter locks across rerolls", async () => {
    for (const seed of ["first", "second", "third"]) {
      const captured = await source(input => {
        input.intent.seeds.building = seed;
        input.intent.locks = [
          { semanticPath: "construction/footprint/widthM", scope: "building", lockedValue: 12.25 },
          { semanticPath: "construction/opening/widthM", scope: "family", lockedValue: 1.18 },
          { semanticPath: "construction/facade/count", scope: "building", lockedValue: 3 }
        ];
      });
      const { resolution } = await compileConstructionGeneration(captured);
      expect(parameter(resolution.graph, "footprint", "widthM")).toBe(12.25);
      expect(parameter(resolution.graph, "opening", "widthM")).toBe(1.18);
      expect(parameter(resolution.graph, "entrance", "widthM")).toBe(1.18);
      expect(resolution.choices.filter(choice => choice.basis === "locked")).toHaveLength(3);
    }
  });

  it.each(["path", "element", "value", "count-conflict"] as const)("diagnoses unsupported or conflicting locks: %s", async kind => {
    const captured = await source(input => {
      input.intent.locks = [{ semanticPath: "construction/facade/count", scope: "building", lockedValue: 3 }];
      if (kind === "path") input.intent.locks[0].semanticPath = "component/old-window";
      if (kind === "element") input.intent.locks[0].scope = "element";
      if (kind === "value") input.intent.locks[0].lockedValue = { invented: 3 };
      if (kind === "count-conflict") input.intent.locks[0].lockedValue = 4;
    });
    await expect(resolveConstructionGeneration(captured)).rejects.toThrow(/lock/i);
  });

  it("keeps structural geometry exact for reference-weathering, prompt-provenance or material-seed-only changes", async () => {
    const captured = await source(), initial = await compileConstructionGeneration(captured);
    for (const change of [
      (input: ConstructionGenerationInput) => { input.reference.materialBrief.nodes[0].generationHints.weathering = "different-weathering"; },
      (input: ConstructionGenerationInput) => { input.intent.seeds.material = "different-material"; },
      (input: ConstructionGenerationInput) => { input.intent.prompt = "Same explicit building, different provenance wording"; }
    ]) {
      const changed = await recapture(captured, change), result = await compileConstructionGeneration(changed);
      expect(changed.contentHash).not.toBe(captured.contentHash);
      expect(result.resolution.graph).toEqual(initial.resolution.graph);
      expect(result.resolution.graphContentHash).toBe(initial.resolution.graphContentHash);
      expect(result.construction).toEqual(initial.construction);
    }
  });

  it.each([
    { roofType: "gable" }, { windowFamily: "tall-arched" }, { corniceFamily: "bracketed-metal" },
    { wallMaterial: "stucco" }, { trimDensity: "ornate" as const }, { symmetry: .8 }, { floorCount: 1 }, { bayCount: 2 }
  ])("rejects unsupported requests instead of silently substituting: %o", async requested => {
    const captured = await source(input => Object.assign(input.intent.requested, requested));
    await expect(resolveConstructionGeneration(captured)).rejects.toThrow(/recipe|implemented|supported/i);
  });

  it("rejects an unavailable style pack and mismatched recipe identity", async () => {
    await expect(resolveConstructionGeneration(await source(input => { input.intent.stylePackId = "unknown-style"; }))).rejects.toThrow(/style/i);
    for (const key of ["id", "version", "contentHash"] as const) {
      const captured = await source(input => { input.recipe[key] = key === "contentHash" ? "f".repeat(64) : "unavailable"; });
      await expect(resolveConstructionGeneration(captured)).rejects.toThrow(/recipe.*mismatched/i);
    }
  });

  it("leaves dimensional feasibility to the real compiler and rejects impossible authored locks", async () => {
    const captured = await source(input => { input.intent.locks = [{ semanticPath: "construction/footprint/depthM", scope: "building", lockedValue: 1 }]; });
    await expect(compileConstructionGeneration(captured)).rejects.toThrow(/wall depth|footprint/i);
  });

  it("owns captured input before async resolution", async () => {
    const captured = await source(), expected = structuredClone(captured), pending = resolveConstructionGeneration(captured);
    captured.intent.requested.floorCount = 6;
    captured.reference.materialBrief.nodes[0].generationHints.weathering = "mutated";
    expect(await pending).toEqual(await resolveConstructionGeneration(expected));
  });

  it("rejects a rehashed false resolution by independently replaying its pinned source", async () => {
    const captured = await source(), resolved = await resolveConstructionGeneration(captured);
    resolved.choices[0].value += .1;
    const { contentHash: oldHash, ...payload } = resolved;
    expect(oldHash).toMatch(/^[a-f0-9]{64}$/);
    resolved.contentHash = await hashCanonicalJson(payload);
    await expect(readConstructionGenerationResolution(resolved, captured)).rejects.toThrow(/replay/i);
  });
});
