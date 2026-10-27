import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { withConstructionWindowLayout } from "../core/constructionWindowVocabulary";
import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { defaultConstructionGenerationControls, resolveWorkbenchGeneration, rebindGenerationSurfaceSources, readConstructionGenerationLineage, type ConstructionGenerationLineage } from "../state/constructionGenerationState";
import { ConstructionHistory } from "../state/constructionHistory";
import { normalizeBuildingSpec } from "../core/specNormalizer";
import { planConstructionReferenceMaterials } from "../materials/constructionReferenceMaterials";
import stylePack from "../style-packs/late-19c-commercial-demo.json";
import { evaluateConstruction } from "../compiler/evaluateConstruction";

async function initial() {
  const result = await resolveWorkbenchGeneration(createBuildingConstructionGraph(), null, defaultConstructionGenerationControls);
  const template = (await normalizeBuildingSpec(result.source.intent, stylePack)).spec;
  const materialPlan = await planConstructionReferenceMaterials(template, result.source);
  const lineage: ConstructionGenerationLineage = { schemaVersion: "0.1.0", kind: "construction-generation-lineage",
    source: result.source, resolution: result.resolution, materialPlan, materialSourceHash: "a".repeat(64) };
  return { ...result, lineage, template };
}
const footprint = (graph: ReturnType<typeof createBuildingConstructionGraph>) => graph.nodes.find(node => node.type === "Footprint")!.parameters;

it("retains authored cornice separately from opening locks over immutable recipe and material lineage",async()=>{
  const a=await initial(),target={documentId:a.graph.documentId,storeysNodeId:"facade",windowNodeId:"window",face:"front" as const,floorIndex:1,bayIndex:2};
  const edited=withConstructionCorniceLayout(withConstructionOpeningWidth(withConstructionStorefront(withConstructionWindowLayout(a.graph,"window",2),1),{target,widthM:1.8}),2),before=structuredClone(edited);
  const roof=(graph:typeof edited)=>graph.nodes.find(node=>node.type==="BuildingRoof")!.parameters;
  const kept=await resolveWorkbenchGeneration(edited,a.lineage,defaultConstructionGenerationControls,true);
  expect(kept.graph.schemaVersion).toBe("0.8.0");expect(roof(kept.graph).corniceAssembly).toBe(2);expect(edited).toEqual(before);
  expect(kept.resolution.graph.schemaVersion).toBe("0.4.0");expect(roof(kept.resolution.graph)).not.toHaveProperty("corniceAssembly");
  expect(kept.source.intent.locks.some(lock=>lock.semanticPath.endsWith("/corniceAssembly"))).toBe(false);
  const materialPlan=await planConstructionReferenceMaterials(a.template,kept.source);
  expect(materialPlan.materialInputsHash).toBe(a.lineage.materialPlan.materialInputsHash);
  const next={...a.lineage,source:kept.source,resolution:kept.resolution,materialPlan};
  const openingLocked=await resolveWorkbenchGeneration(kept.graph,next,{...kept.controls,preserveAuthored:false,lockOpenings:true},true);
  expect(roof(openingLocked.graph).corniceAssembly).toBe(0);
  expect(openingLocked.graph.nodes.find(node=>node.type==="AssembleWindow")!.parameters.layout).toBe(2);
  expect(openingLocked.graph.nodes.find(node=>node.type==="PlaceStorefront")!.parameters.mode).toBe(1);
  expect(openingLocked.graph.nodes.find(node=>node.type==="EditOpeningWidth")!.overrides).toEqual([{target,widthM:1.8}]);
  const released=await resolveWorkbenchGeneration(edited,a.lineage,{...defaultConstructionGenerationControls,preserveAuthored:false,lockOpenings:false});
  expect(roof(released.graph)).toEqual({...roof(released.resolution.graph),corniceAssembly:0});
  expect(released.graph.nodes.find(node=>node.type==="AssembleWindow")!.parameters.layout).toBe(0);
  expect(released.graph.nodes.find(node=>node.type==="PlaceStorefront")!.parameters.mode).toBe(0);
  expect(released.graph.nodes.find(node=>node.type==="EditOpeningWidth")!.overrides).toEqual([]);
  edited.nodes.find(node=>node.type==="BuildingRoof")!.input.nodeId="bays";
  await expect(resolveWorkbenchGeneration(edited,a.lineage,defaultConstructionGenerationControls)).rejects.toThrow(/authored connections/);
});

it("retains one local width through authored/locked generation and explicitly releases or rejects target loss", async () => {
  const a=await initial(), target={documentId:a.graph.documentId,storeysNodeId:"facade",windowNodeId:"window",face:"front" as const,floorIndex:2,bayIndex:3};
  const edited=withConstructionOpeningWidth(withConstructionStorefront(withConstructionWindowLayout(a.graph,"window",2),1),{target,widthM:1.8});
  const before=structuredClone(edited), b=await resolveWorkbenchGeneration(edited,a.lineage,defaultConstructionGenerationControls,true);
  const overrides=(graph:typeof edited)=>graph.nodes.find(node=>node.type==="EditOpeningWidth")!.overrides;
  expect(edited).toEqual(before); expect(overrides(b.graph)).toEqual([{target,widthM:1.8}]);
  expect(b.graph.nodes.find(node=>node.type==="PlaceStorefront")!.parameters.mode).toBe(1);
  expect(b.graph.nodes.find(node=>node.type==="AssembleWindow")!.parameters.layout).toBe(2);
  const lineage={...a.lineage,source:b.source,resolution:b.resolution,materialPlan:await planConstructionReferenceMaterials(a.template,b.source)};
  expect(lineage.materialPlan.materialInputsHash).toBe(a.lineage.materialPlan.materialInputsHash);
  const c=await resolveWorkbenchGeneration(b.graph,lineage,{...b.controls,preserveAuthored:false,lockOpenings:true},true);
  expect(overrides(c.graph)).toEqual([{target,widthM:1.8}]);
  await expect(resolveWorkbenchGeneration(edited,a.lineage,{...defaultConstructionGenerationControls,floorCount:2})).rejects.toThrow(/preserved selected window/);
  await expect(resolveWorkbenchGeneration(edited,a.lineage,{...defaultConstructionGenerationControls,bayCount:3})).rejects.toThrow(/preserved selected window/);
  const released=await resolveWorkbenchGeneration(edited,a.lineage,{...defaultConstructionGenerationControls,preserveAuthored:false,lockOpenings:false,floorCount:2,bayCount:3});
  expect(overrides(released.graph)).toEqual([]);
  expect(released.graph.nodes.find(node=>node.type==="PlaceOpening")!.parameters).toEqual(released.resolution.graph.nodes.find(node=>node.type==="PlaceOpening")!.parameters);
  expect((await evaluateConstruction(released.graph)).ir.semanticIndex.some(entry=>entry.semanticPath.includes("/floor/2/"))).toBe(false);
});

describe("workbench generation ownership", () => {
  it("generates through the existing graph and compiler with literal local-demo coverage", async () => {
    const a = await initial();
    const compiled = await evaluateConstruction(a.graph);
    expect(compiled.ir.instanceBatches[0].count).toBe(47);
    expect(a.source.reference.architectureCoverage).toBe("unknown");
    expect(a.source.intent.psg.sourceDocumentId).toBe("construction-masonry-intent-v1");
    expect(a.source.intent.psg.traceId).toMatch(/^psg-[a-f0-9]{64}$/);
    expect(a.source.intent.psg.evaluatedVariables["$constructionPsgTrace"]).toEqual(expect.arrayContaining([expect.objectContaining({ nodeType: "WeightedChoice", semanticPath: "building/trim" })]));
    expect(await readConstructionGenerationLineage(JSON.parse(JSON.stringify(a.lineage)))).toEqual(a.lineage);
    const b = await resolveWorkbenchGeneration(a.graph, a.lineage, { ...defaultConstructionGenerationControls, floorCount: 4, bayCount: 5 });
    expect((await evaluateConstruction(b.graph)).ir.instanceBatches[0].count).toBe(79);
  });
  it("retains authored dimensions and finishes across successive rerolls", async () => {
    const a = await initial(), edited = structuredClone(a.graph);
    footprint(edited).depthM = 13;
    edited.nodes.find(node => node.type === "SetSurface")!.composition.revision = 9;
    const b = await resolveWorkbenchGeneration(edited, a.lineage, defaultConstructionGenerationControls, true);
    expect(footprint(b.graph).depthM).toBe(13);
    expect(b.graph.nodes.find(node => node.type === "SetSurface")!.composition.revision).toBe(9);
    expect(b.source.intent.locks).toContainEqual(expect.objectContaining({ semanticPath: "construction/footprint/depthM", lockedValue: 13, reason: "Authored numeric edit" }));
    const nextLineage = { ...a.lineage, source: b.source, resolution: b.resolution, materialPlan: await planConstructionReferenceMaterials(a.template, b.source) };
    const c = await resolveWorkbenchGeneration(b.graph, nextLineage, b.controls, true);
    expect(footprint(c.graph).depthM).toBe(13);
    expect(c.source.intent.locks.some(lock => lock.semanticPath === "construction/footprint/depthM")).toBe(true);
    const released = await resolveWorkbenchGeneration(c.graph, { ...nextLineage, source: c.source, resolution: c.resolution }, { ...c.controls, preserveAuthored: false }, true);
    expect(released.source.intent.locks.some(lock => lock.reason === "Authored numeric edit")).toBe(false);
  });
  it("captures selected lock groups and refreshes them on the next request", async () => {
    const a = await initial();
    const b = await resolveWorkbenchGeneration(a.graph, a.lineage, { ...defaultConstructionGenerationControls, lockFootprint: true }, true);
    expect(footprint(b.graph)).toEqual(footprint(a.graph));
    expect(b.source.intent.locks.filter(lock => lock.reason === "Workbench control lock")).toHaveLength(3);
    const next = { ...a.lineage, source: b.source, resolution: b.resolution };
    const c = await resolveWorkbenchGeneration(b.graph, next, b.controls, true);
    expect(c.source.intent.locks.filter(lock => lock.reason === "Workbench control lock")).toHaveLength(3);
  });
  it("retains numeric edits made before the first recipe generation", async () => {
    const edited = createBuildingConstructionGraph(); footprint(edited).depthM = 12;
    const result = await resolveWorkbenchGeneration(edited, null, defaultConstructionGenerationControls);
    expect(footprint(result.graph).depthM).toBe(12);
  });
  it("refuses authored connection or node replacement without mutating source", async () => {
    const a = await initial(), changed = structuredClone(a.graph);
    changed.nodes.find(node => node.type === "JoinGeometry")!.inputs.pop();
    const before = structuredClone(changed);
    await expect(resolveWorkbenchGeneration(changed, a.lineage, defaultConstructionGenerationControls, true)).rejects.toThrow("authored connections");
    expect(changed).toEqual(before);
  });
  it("owns controls, graph and pinned source before asynchronous work", async () => {
    const a = await initial(), graph = structuredClone(a.graph), controls = structuredClone(defaultConstructionGenerationControls), lineage = structuredClone(a.lineage);
    const expected = await resolveWorkbenchGeneration(graph, lineage, controls, true);
    const pending = resolveWorkbenchGeneration(graph, lineage, controls, true);
    controls.buildingSeed = "late"; footprint(graph).depthM = 90; lineage.source.intent.seeds.material = "late";
    expect(await pending).toEqual(expected);
  });
  it("keeps lineage aligned with source history and material-library boundaries", async () => {
    const a = await initial(), history = new ConstructionHistory();
    history.record(a.graph, a.lineage.materialSourceHash, false, a.lineage);
    const b = await resolveWorkbenchGeneration(a.graph, a.lineage, defaultConstructionGenerationControls, true);
    const lineage = { ...a.lineage, source: b.source, resolution: b.resolution, materialPlan: await planConstructionReferenceMaterials(a.template, b.source) };
    history.record(b.graph, lineage.materialSourceHash, false, lineage);
    expect(history.targetGeneration("undo")).toEqual(a.lineage);
    history.acceptTraversal("undo", history.target("undo")!);
    expect(history.currentGeneration).toEqual(a.lineage);
    expect(history.targetGeneration("redo")).toEqual(lineage);
    const snapshot = history.snapshot()!;
    expect(snapshot.schemaVersion).toBe("0.2.0");
    const restored = new ConstructionHistory(JSON.parse(JSON.stringify(snapshot)));
    expect(restored.currentGeneration).toEqual(a.lineage);
    history.record(b.graph, "b".repeat(64), false, { ...lineage, materialSourceHash: "b".repeat(64) });
    expect(history.canUndo).toBe(false);
  });
});

it("pins an imported UTDG snapshot without inventing architecture evidence or changing structure", async () => {
  const a = await initial(), reference = structuredClone(a.source.reference);
  reference.id = "imported-material-snapshot"; reference.revision = "2";
  reference.origin = { kind: "utdg-snapshot", snapshotId: "utdg-materials-2", contentHash: "b".repeat(64), locator: "offline/utdg-materials-2.json" };
  const result = await resolveWorkbenchGeneration(a.graph, a.lineage, defaultConstructionGenerationControls, false, reference);
  expect(result.graph).toEqual(a.graph);
  expect(result.source.reference.origin.kind).toBe("utdg-snapshot");
  expect(result.source.reference.architectureCoverage).toBe("unknown");
  expect(result.source.referenceContentHash).not.toBe(a.source.referenceContentHash);
});

it("keeps an authored lock when it overlaps a group lock and the group is later released", async () => {
  const a = await initial(), edited = structuredClone(a.graph); footprint(edited).depthM = 13;
  const b = await resolveWorkbenchGeneration(edited, a.lineage, { ...defaultConstructionGenerationControls, lockFootprint: true }, true);
  const lb = { ...a.lineage, source: b.source, resolution: b.resolution };
  const c = await resolveWorkbenchGeneration(b.graph, lb, b.controls, true);
  const lc = { ...lb, source: c.source, resolution: c.resolution };
  const d = await resolveWorkbenchGeneration(c.graph, lc, { ...c.controls, lockFootprint: false }, true);
  expect(footprint(d.graph).depthM).toBe(13);
  expect(d.source.intent.locks).toContainEqual(expect.objectContaining({ semanticPath: "construction/footprint/depthM", reason: "Authored numeric edit", lockedValue: 13 }));
});

it("rebinds finish slots and reference-default scale while retaining explicit artist scale and layer intent", async () => {
  const a = await initial(), graph = structuredClone(a.graph), surface = graph.nodes.find(node => node.type === "SetSurface")!;
  const previous = { contentHash: "a".repeat(64), manifest: a.lineage.materialPlan.atlas.manifest };
  const next = { contentHash: "b".repeat(64), manifest: structuredClone(previous.manifest) };
  next.manifest.slots.find(slot => slot.id === "cornice.primary")!.physicalSizeM = { width: .8, height: .8 };
  surface.composition.sources = [{ id: "authored", atlasContentHash: previous.contentHash, slotId: "cornice.primary" }];
  surface.composition.layers = [{ id: "finish", target: { kind: "role", role: "frame" }, sourceId: "authored", mask: { kind: "constant", value: 1 }, blend: "replace", opacity: .3, physicalSizeM: { width: .64, height: .64 }, channels: ["baseColor"] }];
  const rebound = rebindGenerationSurfaceSources(graph, previous, next), output = rebound.nodes.find(node => node.type === "SetSurface")!.composition;
  expect(output.sources[0].atlasContentHash).toBe(next.contentHash);
  expect(output.layers[0]).toEqual({ ...surface.composition.layers[0], physicalSizeM: { width: .8, height: .8 } });
  expect(output.revision).toBe(surface.composition.revision + 1);
  expect(surface.composition.sources[0].atlasContentHash).toBe(previous.contentHash);
  surface.composition.layers[0].physicalSizeM = { width: .23, height: .23 };
  expect(rebindGenerationSurfaceSources(graph, previous, next).nodes.find(node => node.type === "SetSurface")!.composition.layers[0].physicalSizeM).toEqual({ width: .23, height: .23 });
  const missing = structuredClone(next); missing.manifest.slots = missing.manifest.slots.filter(slot => slot.id !== "cornice.primary");
  expect(() => rebindGenerationSurfaceSources(graph, previous, missing)).toThrow("cannot retain finish slot");
  const wrong = structuredClone(next); wrong.manifest.slots.find(slot => slot.id === "cornice.primary")!.role = "glass";
  expect(() => rebindGenerationSurfaceSources(graph, previous, wrong)).toThrow("cannot retain finish slot");
  expect(() => rebindGenerationSurfaceSources(graph, { ...previous, contentHash: "c".repeat(64) }, next)).toThrow("no longer matches");
});


describe("construction recipe transitions", () => {
  it("switches recipes without mistaking generated defaults for authored locks and replays the original", async () => {
    const a = await initial();
    const b = await resolveWorkbenchGeneration(a.graph, a.lineage, { ...defaultConstructionGenerationControls, recipeId: "deep-reveal-masonry" });
    expect(b.source.recipe.id).toBe("deep-reveal-masonry");
    expect(b.resolution.resolverVersion).toBe("construction-generation-resolver-v2");
    expect(b.source.intent.locks).toEqual([]);
    expect(footprint(b.graph).wallDepthM).toBeGreaterThan(footprint(a.graph).wallDepthM);
    const plan = await planConstructionReferenceMaterials(a.template, b.source);
    expect(plan.materialInputsHash).toBe(a.lineage.materialPlan.materialInputsHash);
    const lb = { ...a.lineage, source: b.source, resolution: b.resolution, materialPlan: plan };
    expect(await readConstructionGenerationLineage(lb)).toEqual(lb);
    const { recipeId: omitted, ...legacyControls } = b.controls;
    expect(omitted).toBe("deep-reveal-masonry");
    expect((await resolveWorkbenchGeneration(b.graph, lb, legacyControls)).source.recipe).toEqual(b.source.recipe);
    const c = await resolveWorkbenchGeneration(b.graph, lb, defaultConstructionGenerationControls);
    expect(c.graph).toEqual(a.graph);
    expect(c.source).toEqual(a.source);
  });
  it("keeps numeric edits, selected groups, finishes and history across recipe changes", async () => {
    const a = await initial(), edited = structuredClone(a.graph); footprint(edited).depthM = 13;
    edited.nodes.find(node => node.type === "SetSurface")!.composition.revision = 9;
    const b = await resolveWorkbenchGeneration(edited, a.lineage, { ...defaultConstructionGenerationControls, recipeId: "deep-reveal-masonry", lockOpenings: true });
    expect(footprint(b.graph).depthM).toBe(13);
    expect(b.graph.nodes.find(node => node.type === "AssembleWindow")!.parameters).toEqual(a.graph.nodes.find(node => node.type === "AssembleWindow")!.parameters);
    expect(b.graph.nodes.find(node => node.type === "SetSurface")!.composition.revision).toBe(9);
    const lb = { ...a.lineage, source: b.source, resolution: b.resolution, materialPlan: await planConstructionReferenceMaterials(a.template, b.source) };
    const c = await resolveWorkbenchGeneration(b.graph, lb, { ...b.controls, recipeId: "projecting-cornice-masonry", lockOpenings: false });
    expect(footprint(c.graph).depthM).toBe(13);
    expect(c.source.intent.locks.some(lock => lock.reason === "Workbench control lock")).toBe(false);
    expect(c.graph.nodes.find(node => node.type === "SetSurface")!.composition.revision).toBe(9);
    expect((await evaluateConstruction(c.graph)).ir.instanceBatches[0].count).toBe(47);
    const lc = { ...lb, source: c.source, resolution: c.resolution, materialPlan: await planConstructionReferenceMaterials(a.template, c.source) };
    expect(lc.materialPlan.materialInputsHash).toBe(lb.materialPlan.materialInputsHash);
    const history = new ConstructionHistory(); history.record(b.graph, lb.materialSourceHash, false, lb); history.record(c.graph, lc.materialSourceHash, false, lc);
    expect(history.targetGeneration("undo")!.source.recipe.id).toBe("deep-reveal-masonry");
    history.acceptTraversal("undo", history.target("undo")!);
    expect(new ConstructionHistory(history.snapshot()!).targetGeneration("redo")!.source.recipe.id).toBe("projecting-cornice-masonry");
  });
  it("rejects unavailable recipes and tampered previous lineage while owning the recipe selection before awaiting", async () => {
    const a = await initial(), before = structuredClone(a);
    await expect(resolveWorkbenchGeneration(a.graph, a.lineage, { ...defaultConstructionGenerationControls, recipeId: "unknown" })).rejects.toThrow("unavailable or mismatched");
    const tampered = structuredClone(a.lineage); tampered.resolution.resolverVersion = "construction-generation-resolver-v2";
    await expect(resolveWorkbenchGeneration(a.graph, tampered, { ...defaultConstructionGenerationControls, recipeId: "deep-reveal-masonry" })).rejects.toThrow();
    const controls = { ...defaultConstructionGenerationControls, recipeId: "deep-reveal-masonry" };
    const pending = resolveWorkbenchGeneration(a.graph, a.lineage, controls); controls.recipeId = "unknown";
    expect((await pending).source.recipe.id).toBe("deep-reveal-masonry"); expect(a).toEqual(before);
  });
});

it("retains authored casement vocabulary over the literal pinned recipe and releases it explicitly",async()=>{
  const a=await initial(),edited=withConstructionWindowLayout(a.graph,"window",2);
  const before=structuredClone(edited),b=await resolveWorkbenchGeneration(edited,a.lineage,defaultConstructionGenerationControls,true);
  expect(b.graph.schemaVersion).toBe("0.5.0");expect(b.graph.nodes.find(n=>n.type==="AssembleWindow")!.parameters.layout).toBe(2);expect(b.resolution.graph.schemaVersion).toBe("0.4.0");
  expect(b.source.intent.locks.some(lock=>lock.semanticPath.endsWith("/layout"))).toBe(false);expect(edited).toEqual(before);
  const lineage={...a.lineage,source:b.source,resolution:b.resolution,materialPlan:await planConstructionReferenceMaterials(a.template,b.source)};
  const c=await resolveWorkbenchGeneration(b.graph,lineage,{...b.controls,preserveAuthored:false,lockOpenings:true},true);
  expect(c.graph.nodes.find(n=>n.type==="AssembleWindow")!.parameters.layout).toBe(2);
  const next={...lineage,source:c.source,resolution:c.resolution,materialPlan:await planConstructionReferenceMaterials(a.template,c.source)};
  const d=await resolveWorkbenchGeneration(c.graph,next,{...c.controls,preserveAuthored:false,lockOpenings:false},true);
  expect(d.graph.nodes.find(n=>n.type==="AssembleWindow")!.parameters.layout).toBe(0);
  const rejected=structuredClone(edited);rejected.nodes.find(n=>n.type==="JoinGeometry")!.inputs.pop();await expect(resolveWorkbenchGeneration(rejected,a.lineage,defaultConstructionGenerationControls,true)).rejects.toThrow("authored connections");
});

it("retains authored storefront and entrance choices, locks them, then releases to the literal recipe", async () => {
  const a = await initial(), edited = withConstructionWindowLayout(withConstructionStorefront(a.graph, 1), "window", 2);
  edited.nodes.find(node => node.type === "PlaceStorefront")!.parameters.pierWidthM = 0.24;
  Object.assign(edited.nodes.find(node => node.type === "PlaceDoor")!.parameters, { bayIndex: 2, widthM: 1.4 });
  const before = structuredClone(edited);
  const b = await resolveWorkbenchGeneration(edited, a.lineage, defaultConstructionGenerationControls, true);
  expect(b.graph.schemaVersion).toBe("0.6.0"); expect(b.resolution.graph.schemaVersion).toBe("0.4.0");
  expect(b.graph.nodes.find(node => node.type === "PlaceStorefront")!.parameters).toEqual(edited.nodes.find(node => node.type === "PlaceStorefront")!.parameters);
  expect(b.graph.nodes.find(node => node.type === "PlaceDoor")!.parameters.widthM).toBe(1.4);
  expect(b.source.intent.locks.some(lock => lock.semanticPath.includes("/frontage/"))).toBe(false);
  expect(edited).toEqual(before); await evaluateConstruction(b.graph);
  const lineage = { ...a.lineage, source: b.source, resolution: b.resolution, materialPlan: await planConstructionReferenceMaterials(a.template, b.source) };
  const c = await resolveWorkbenchGeneration(b.graph, lineage, { ...b.controls, preserveAuthored: false, lockOpenings: true }, true);
  expect(c.graph.nodes.find(node => node.type === "PlaceStorefront")!.parameters.mode).toBe(1);
  expect(c.graph.nodes.find(node => node.type === "PlaceDoor")!.parameters).toMatchObject({ bayIndex: 2, widthM: 1.4 });
  expect(c.graph.nodes.find(node => node.type === "AssembleWindow")!.parameters.layout).toBe(2);
  const next = { ...lineage, source: c.source, resolution: c.resolution, materialPlan: await planConstructionReferenceMaterials(a.template, c.source) };
  const d = await resolveWorkbenchGeneration(c.graph, next, { ...c.controls, preserveAuthored: false, lockOpenings: false }, true);
  expect(d.graph.nodes.find(node => node.type === "PlaceStorefront")!.parameters.mode).toBe(0);
  expect(d.graph.nodes.find(node => node.type === "PlaceDoor")!.parameters).toEqual(d.resolution.graph.nodes.find(node => node.type === "PlaceDoor")!.parameters);
  expect(d.graph.nodes.find(node => node.type === "AssembleWindow")!.parameters.layout).toBe(0);
  const custom = structuredClone(edited); custom.nodes.find(node => node.type === "PlaceStorefront")!.input.nodeId = "bays";
  await expect(resolveWorkbenchGeneration(custom, a.lineage, defaultConstructionGenerationControls)).rejects.toThrow("authored connections");
});
