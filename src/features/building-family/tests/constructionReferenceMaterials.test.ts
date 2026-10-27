import { describe, expect, it } from "vitest";
import brief from "../../../../docs/research/utdg-late19c-v0.1.json";
import type { ConstructionGenerationInput, ConstructionGenerationSource } from "../contracts/constructionGeneration";
import { captureConstructionGenerationSource } from "../core/constructionGenerationSource";
import { compileConstructionGeneration, constructionRecipeReference } from "../core/constructionGenerationResolver";
import { hashCanonicalJson } from "../core/contentHash";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { generateConstructionReferenceAtlas, planConstructionReferenceMaterials, readConstructionReferenceMaterialPlan, type ConstructionReferenceMaterialPlan } from "../materials/constructionReferenceMaterials";
import { validateAtlasPlan } from "../materials/atlasPlanner";

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

async function fixture() {
  const captured = await source();
  // A material template is pinned independently of subsequent structural intents.
  const template = (await normalizeBuildingSpec(captured.intent, stylePack)).spec;
  return { captured, template };
}
async function rehash(plan: ConstructionReferenceMaterialPlan) {
  plan.materialInputsHash = await hashCanonicalJson(plan.atlas);
  const { contentHash: ignored, ...payload } = plan; void ignored;
  plan.contentHash = await hashCanonicalJson(payload);
  return plan;
}
const small = { widthPx: 512, heightPx: 512, paddingPx: 4, sourceSizePx: 32 };

describe("pinned construction reference materials", () => {
  it("binds real roles, physical scales and sources without claiming roof deck or architecture coverage", async () => {
    const { captured, template } = await fixture();
    const plan = await planConstructionReferenceMaterials(template, captured);
    expect(plan.bindings).toHaveLength(10);
    expect(plan.unmappedSlots).toEqual(["roof.primary", "utility.mask"]);
    expect(plan.architectureCoverage).toBe("unknown");
    expect(validateAtlasPlan(plan.atlas)).toEqual([]);
    for (const [id, role, scale, procedure] of [
      ["wall.primary", "masonry.brick.running", .96, "running-bond-brick"],
      ["frame.primary", "wood.frame.painted", .32, "painted-wood-frame"],
      ["cornice.primary", "stone.trim.cast", .64, "cast-stone-trim"],
      ["glass.primary", "glass.clear", 1, "clear-glass"],
      ["ornament.primary", "metal.hardware.painted", .16, "painted-metal-hardware"]
    ] as const) {
      const slot = plan.atlas.manifest.slots.find(item => item.id === id)!;
      const request = plan.atlas.materialSources.find(item => item.sourceId === slot.materialSourceId)!;
      expect(request.selectedFamily).toBe(role);
      expect(request.metersPerTile).toBe(scale);
      expect(request.proceduralSource).toBe(procedure);
      expect(slot.physicalSizeM).toEqual({ width: scale, height: scale });
    }
    expect(await readConstructionReferenceMaterialPlan(JSON.parse(JSON.stringify(plan)), captured)).toEqual(plan);
  });

  it("generates deterministic packed channels with stone and painted hardware substrates", async () => {
    const { captured, template } = await fixture();
    const first = await generateConstructionReferenceAtlas(template, captured, new AbortController().signal, small);
    const second = await generateConstructionReferenceAtlas(template, captured, new AbortController().signal, small);
    expect(first).toEqual(second);
    expect(first.packedAtlas.diagnostics.filter(item => item.severity === "error")).toEqual([]);
    const sample = (id: string) => {
      const slot = first.packedAtlas.manifest.slots.find(item => item.id === id)!;
      const x = slot.rectPx.x + Math.floor(slot.rectPx.width / 2), y = slot.rectPx.y + Math.floor(slot.rectPx.height / 2);
      const offset = (y * first.packedAtlas.channels.orm.widthPx + x) * 4;
      return [...first.packedAtlas.channels.orm.data.slice(offset, offset + 4)];
    };
    const stone = sample("cornice.primary"), metal = sample("ornament.primary");
    expect(stone[1]).toBeGreaterThan(190); expect(stone[2]).toBe(0);
    expect(metal[1]).toBeLessThan(130); expect(metal[2]).toBe(150);
    expect(first.packedAtlas.slotProvenance.find(item => item.slotId === "cornice.primary")!.providerId).toBe("construction-reference-substrates-v1");
    expect(first.packedAtlas.slotProvenance.find(item => item.slotId === "wall.primary")!.providerId).toBe("procedural");
  }, 30000);

  it("keeps exact packed bytes and material identity across structural rerolls while actual geometry changes", async () => {
    const { captured, template } = await fixture();
    const changed = await recapture(captured, input => { input.intent.seeds.building = "another-building"; input.intent.requested.floorCount = 4; input.intent.requested.bayCount = 5; });
    const [a, b, ga, gb] = await Promise.all([
      generateConstructionReferenceAtlas(template, captured, new AbortController().signal, small),
      generateConstructionReferenceAtlas(template, changed, new AbortController().signal, small),
      compileConstructionGeneration(captured), compileConstructionGeneration(changed)
    ]);
    expect(ga.construction.ir.bounds).not.toEqual(gb.construction.ir.bounds);
    expect(a.plan.sourceContentHash).not.toBe(b.plan.sourceContentHash);
    expect(a.plan.materialInputsHash).toBe(b.plan.materialInputsHash);
    expect(a.packedAtlas).toEqual(b.packedAtlas);
  }, 30000);

  it("changes material seed outputs without changing compiled construction", async () => {
    const { captured, template } = await fixture();
    const changed = await recapture(captured, input => { input.intent.seeds.material = "another-material"; });
    const [a, b, ga, gb] = await Promise.all([
      generateConstructionReferenceAtlas(template, captured, new AbortController().signal, small),
      generateConstructionReferenceAtlas(template, changed, new AbortController().signal, small),
      compileConstructionGeneration(captured), compileConstructionGeneration(changed)
    ]);
    expect(a.plan.materialInputsHash).not.toBe(b.plan.materialInputsHash);
    expect(a.packedAtlas.channels.baseColor.data).not.toEqual(b.packedAtlas.channels.baseColor.data);
    expect(ga.construction).toEqual(gb.construction);
  }, 30000);

  it("consumes node scale and descriptor changes while retaining a literal pinned source", async () => {
    const { captured, template } = await fixture();
    const changed = await recapture(captured, input => { const node = input.reference.materialBrief.nodes.find(item => item.role === "stone.trim.cast")!; node.metersPerTile = .8; node.generationHints.remotePromptFragment = "new source-backed descriptor"; });
    const a = await planConstructionReferenceMaterials(template, captured), b = await planConstructionReferenceMaterials(template, changed);
    expect(b.atlas.manifest.slots.find(item => item.id === "cornice.primary")!.physicalSizeM).toEqual({ width: .8, height: .8 });
    expect(b.materialInputsHash).not.toBe(a.materialInputsHash);
    expect(b.atlas.materialSources.find(item => item.sourceId === "source.cornice.primary")!.promptVocabulary).toContain("new source-backed descriptor");
    expect(captured.reference.materialBrief.nodes.find(item => item.role === "stone.trim.cast")!.metersPerTile).toBe(.64);
  });

  it.each(["missing", "duplicate", "procedure", "channels", "wall-scale", "weathering"])("rejects unsupported reference input: %s", async mode => {
    const { captured, template } = await fixture();
    const changed = await recapture(captured, input => {
      const node = input.reference.materialBrief.nodes.find(item => item.role === "wood.frame.painted")!;
      if (mode === "missing") { input.reference.materialBrief.nodes = input.reference.materialBrief.nodes.filter(item => item !== node); input.reference.materialBrief.edges = input.reference.materialBrief.edges.filter(edge => edge.from !== node.id && edge.to !== node.id); }
      if (mode === "duplicate") input.reference.materialBrief.nodes.push({ ...node, id: "duplicate-frame" });
      if (mode === "procedure") node.generationHints.proceduralSource = "unregistered-provider";
      if (mode === "channels") node.channels = ["baseColor"];
      if (mode === "wall-scale") input.reference.materialBrief.nodes.find(item => item.role === "masonry.brick.running")!.metersPerTile = 1.2;
      if (mode === "weathering") input.intent.requested.weathering = .5;
    });
    await expect(planConstructionReferenceMaterials(template, changed)).rejects.toThrow();
  });

  it.each(["role", "scale", "seed", "vocabulary", "binding", "unmapped", "slots", "hash"])("rejects saved-plan tampering even with recomputed hashes: %s", async mode => {
    const { captured, template } = await fixture();
    const plan = await planConstructionReferenceMaterials(template, captured);
    if (mode === "role") plan.atlas.materialSources[0].selectedFamily = "forged";
    if (mode === "scale") plan.atlas.manifest.slots[0].metersPerTile = 3;
    if (mode === "seed") plan.atlas.materialSources[0].seedPath = "forged";
    if (mode === "vocabulary") plan.atlas.materialSources[0].promptVocabulary.push("forged");
    if (mode === "binding") plan.bindings.pop();
    if (mode === "unmapped") plan.unmappedSlots.push("imaginary");
    if (mode === "slots") plan.atlas.manifest.slots.pop();
    await rehash(plan);
    if (mode === "hash") plan.contentHash = "0".repeat(64);
    await expect(readConstructionReferenceMaterialPlan(plan, captured)).rejects.toThrow();
  });

  it("rejects nested fields that schema admission would silently discard", async () => {
    const { captured, template } = await fixture();
    const plan = await planConstructionReferenceMaterials(template, captured);
    Object.assign(plan.atlas.manifest, { unknown: "must not disappear" });
    await expect(readConstructionReferenceMaterialPlan(plan, captured)).rejects.toThrow("admission");
  });

  it("owns mutable inputs and reader values before async hashing", async () => {
    const { captured, template } = await fixture();
    const original = structuredClone(captured), expected = await planConstructionReferenceMaterials(template, original);
    const pending = planConstructionReferenceMaterials(template, captured);
    captured.intent.seeds.material = "late-mutation"; template.massing.widthM += 5;
    expect(await pending).toEqual(expected);
    const owned = structuredClone(expected), read = readConstructionReferenceMaterialPlan(owned, original);
    owned.atlas.materialSources[0].seedPath = "late-mutation"; original.intent.seeds.material = "late-mutation";
    expect(await read).toEqual(expected);
  });

  it("aborts before work and during asynchronous planning without publishing pixels", async () => {
    const { captured, template } = await fixture();
    const controller = new AbortController(); controller.abort();
    await expect(generateConstructionReferenceAtlas(template, captured, controller.signal, small)).rejects.toThrow("aborted");
    const later = new AbortController();
    const pending = generateConstructionReferenceAtlas(template, captured, later.signal, small); later.abort();
    await expect(pending).rejects.toThrow("aborted");
  });
});
