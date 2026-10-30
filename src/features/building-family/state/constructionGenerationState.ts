import { retainConstructionCorniceVocabulary, withConstructionCorniceLayout } from "../core/constructionCorniceVocabulary";
import { retainConstructionParapetVocabulary, withConstructionParapetSilhouette } from "../core/constructionParapetVocabulary";
import { retainConstructionRoundHead, withConstructionRoundHead } from "../core/constructionRoundHeadVocabulary";
import { withConstructionGroupedBays } from "../core/constructionGroupedBayGraph";
import { withConstructionStorefrontDivision } from "../core/constructionStorefrontDivisionGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { retainConstructionStorefront, withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { retainConstructionOpeningEdits, withConstructionOpeningEdits } from "../core/constructionOpeningEditGraph";
import { retainConstructionWindowVocabulary } from "../core/constructionWindowVocabulary";
import { DEFAULT_CONSTRUCTION_RECIPE_ID } from "../core/constructionRecipeCatalog";
import { AtlasManifestSchema, type AtlasManifest } from "../contracts/atlasManifest";
import { validateConstructionSurfaceSources } from "../core/constructionSurfaceAuthoring";
import { evaluatePsg } from "../../prompt-spaghetti/core/evaluatePsg";
import { PsgDocumentSchema } from "../../prompt-spaghetti/contracts/psgDocument";
import { adaptPsgEvaluationToBuildingIntent } from "../psg/psgBuildingIntentAdapter";
import { hashCanonicalJson } from "../core/contentHash";
import { z } from "zod";
import brief from "../../../../docs/research/utdg-late19c-v0.1.json";
import { BayConstructionGraphSchema, createBuildingConstructionGraph, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { ConstructionGenerationSourceSchema, ConstructionReferenceSnapshotSchema, type ConstructionGenerationInput } from "../contracts/constructionGeneration";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { canonicalJson } from "../core/canonicalJson";
import { captureConstructionGenerationSource, readConstructionGenerationSource } from "../core/constructionGenerationSource";
import { constructionRecipeReference, ConstructionGenerationResolutionSchema, readConstructionGenerationResolution, resolveConstructionGeneration } from "../core/constructionGenerationResolver";
import { ConstructionReferenceMaterialPlanSchema, readConstructionReferenceMaterialPlan } from "../materials/constructionReferenceMaterials";

const shape = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-generation-lineage"),
  source: ConstructionGenerationSourceSchema, resolution: ConstructionGenerationResolutionSchema,
  materialPlan: ConstructionReferenceMaterialPlanSchema, materialSourceHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const ConstructionGenerationLineageSchema = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
}).pipe(shape);
export type ConstructionGenerationLineage = z.infer<typeof ConstructionGenerationLineageSchema>;

/** Lineage is immutable generation evidence. The current authored graph remains authoritative. */
export async function readConstructionGenerationLineage(input: unknown) {
  const parsed = ConstructionGenerationLineageSchema.parse(input);
  if (canonicalJson(parsed) !== canonicalJson(input)) throw new Error("Generation lineage admission would change serialized fields.");
  const owned = structuredClone(parsed), source = await readConstructionGenerationSource(owned.source);
  await readConstructionGenerationResolution(owned.resolution, source);
  await readConstructionReferenceMaterialPlan(owned.materialPlan, source);
  return owned;
}
export interface ConstructionGenerationControls {
  recipeId?: string; floorCount: number; bayCount: number; buildingSeed: string; materialSeed: string; trimSeed: string;
  lockFootprint: boolean; lockStoreys: boolean; lockOpenings: boolean; preserveAuthored: boolean;
}
export const defaultConstructionGenerationControls: ConstructionGenerationControls = {
  recipeId: DEFAULT_CONSTRUCTION_RECIPE_ID, floorCount: 3, bayCount: 4, buildingSeed: "building-1", materialSeed: "material-1", trimSeed: "trim-1",
  lockFootprint: false, lockStoreys: false, lockOpenings: false, preserveAuthored: true
};
const controlsSchema = z.object({ recipeId: z.string().min(1).max(512).optional(), floorCount: z.number().int().min(2).max(6), bayCount: z.number().int().min(3).max(6),
  buildingSeed: z.string().trim().min(1).max(256), materialSeed: z.string().trim().min(1).max(256), trimSeed: z.string().trim().min(1).max(256),
  lockFootprint: z.boolean(), lockStoreys: z.boolean(), lockOpenings: z.boolean(), preserveAuthored: z.boolean() }).strict();

function assertTopology(current: BayConstructionGraph, generated: BayConstructionGraph) {
  if (current.schemaVersion === "0.12.0") generated = withConstructionStorefrontDivision(withConstructionGroupedBays(withConstructionStorefront(generated, 1), current.upperBayGroups), current.storefrontDivision);
  else if (current.schemaVersion === "0.11.0") generated = withConstructionGroupedBays(generated, current.upperBayGroups);
  else if (current.schemaVersion === "0.10.0") generated = withConstructionRoundHead(generated, 0);
  else if (current.schemaVersion === "0.9.0") generated = withConstructionParapetSilhouette(withConstructionCorniceLayout(generated, 0), 0);
  else if (current.schemaVersion === "0.8.0") generated = withConstructionCorniceLayout(generated, 0);
  else if (current.schemaVersion === "0.7.0") generated = withConstructionOpeningEdits(generated);
  else if (current.schemaVersion === "0.6.0") generated = withConstructionStorefront(generated, 0);
  const topology = (graph: BayConstructionGraph) => ({ ...graph, schemaVersion: graph.schemaVersion === "0.5.0" ? "0.4.0" : graph.schemaVersion, nodes: graph.nodes.map(node => {
    if (node.type === "SetSurface") return { ...node, composition: null };
    if (node.type === "EditOpeningWidth") return { ...node, overrides: null };
    return "parameters" in node ? { ...node, parameters: null } : node;
  }) });
  if (canonicalJson(topology(current)) !== canonicalJson(topology(generated)))
    throw new Error("This graph has authored connections or added nodes. Keep editing it, or open a new construction before using this recipe; the current building is retained.");
}

/** Reroll only the existing registered topology. Preserve authored finishes and numeric edits. */
export async function resolveWorkbenchGeneration(currentInput: unknown, previousInput: ConstructionGenerationLineage | null,
  controlsInput: ConstructionGenerationControls, reroll = false, referenceInput?: unknown) {
  const inputGraph = structuredClone(BayConstructionGraphSchema.parse(currentInput));
  const authoredAwnings = inputGraph.awnings;
  let current = inputGraph;
  if (authoredAwnings) {
    const { awnings: _removed, ...prior } = inputGraph; void _removed;
    current = BayConstructionGraphSchema.parse({ ...prior, schemaVersion: "0.12.0" });
  }
  const previous = previousInput ? structuredClone(ConstructionGenerationLineageSchema.parse(previousInput)) : null;
  const controls = controlsSchema.parse(controlsInput);
  const reference = referenceInput === undefined ? undefined : ConstructionReferenceSnapshotSchema.parse(referenceInput);
  const oldSource = previous ? await readConstructionGenerationSource(previous.source) : null;
  const input: ConstructionGenerationInput = oldSource ? {
    schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: current.documentId,
    intent: structuredClone(oldSource.intent), recipe: structuredClone(oldSource.recipe), reference: structuredClone(oldSource.reference),
    intentionalExceptions: structuredClone(oldSource.intentionalExceptions)
  } : {
    schemaVersion: "0.1.0", kind: "construction-generation-input", documentId: current.documentId,
    intent: { schemaVersion: "0.1.0", prompt: "Rectangular masonry building", requested: { floorCount: 3, bayCount: 4 },
      seeds: { family: "buildo-masonry-family", building: "building-1", material: "material-1", trim: "trim-1" }, locks: [],
      psg: { traceId: "construction-workbench-explicit-controls", evaluatedVariables: {} } },
    recipe: await constructionRecipeReference(), reference: {
      schemaVersion: "0.1.0", kind: "construction-reference-snapshot", id: "late19c-material-demo", revision: "1",
      origin: { kind: "local-demo", locator: "docs/research/utdg-late19c-v0.1.json" }, architectureCoverage: "unknown",
      coverageNotes: "Local research material vocabulary. Architectural evidence is not verified.", claims: [],
      materialBrief: structuredClone(brief) as ConstructionGenerationInput["reference"]["materialBrief"]
    }, intentionalExceptions: []
  };
  if (reference) input.reference = reference;
  if (previous) await readConstructionGenerationResolution(previous.resolution, oldSource);
  if (controls.recipeId !== undefined) input.recipe = await constructionRecipeReference(controls.recipeId);
  const template = previous?.resolution ?? { graph: createBuildingConstructionGraph(current.documentId) };
  assertTopology(current, template.graph);
  Object.assign(input.intent.requested, { floorCount: controls.floorCount, bayCount: controls.bayCount });
  Object.assign(input.intent.seeds, { building: reroll ? "building-" + (await hashCanonicalJson({ seed: controls.buildingSeed, operation: "reroll-unlocked-v1" })).slice(0, 32) : controls.buildingSeed, material: controls.materialSeed, trim: controls.trimSeed });
  input.intent.psg.evaluatedVariables = { ...input.intent.psg.evaluatedVariables, "building.floorCount": controls.floorCount, "building.bayCount": controls.bayCount };
  // Only locks created by this UI are refreshed. Unknown imported locks stay explicit.
  input.intent.locks = input.intent.locks.filter(lock => lock.reason !== "Workbench control lock" && (controls.preserveAuthored || lock.reason !== "Authored numeric edit"));
  for (const node of current.nodes) if ("parameters" in node) {
    if (node.type === "PlaceStorefront") continue;
    const original = template.graph.nodes.find(item => item.id === node.id)!;
    if (!("parameters" in original)) throw new Error("Generation parameter topology changed.");
    const groupLocked = node.type === "Footprint" && controls.lockFootprint || node.type === "Storeys" && controls.lockStoreys || (["PlaceOpening", "AssembleWindow"].includes(node.type) || ["0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0"].includes(current.schemaVersion) && ["PlaceDoor", "AssembleDoor"].includes(node.type)) && controls.lockOpenings;
    for (const [field, value] of Object.entries(node.parameters)) {
      if (node.type === "AssembleWindow" && field === "layout" || node.type === "PlaceOpening" && field === "upperFrontRoundHead" || node.type === "BuildingRoof" && ["corniceAssembly", "parapetSilhouette"].includes(field)) continue;
      const path = "construction/" + node.id + "/" + field;
      const authored = controls.preserveAuthored && (value !== (original.parameters as Record<string, number>)[field] ||
        input.intent.locks.some(lock => lock.semanticPath === path && lock.reason === "Authored numeric edit"));
      if (groupLocked || authored) {
        input.intent.locks = input.intent.locks.filter(lock => lock.semanticPath !== path || lock.reason !== "Authored numeric edit");
        if (!input.intent.locks.some(lock => lock.semanticPath === path)) input.intent.locks.push({ semanticPath: path, scope: "building", lockedValue: value, reason: authored ? "Authored numeric edit" : "Workbench control lock" });
        if (node.type === "Storeys" && field === "count") input.intent.requested.floorCount = value;
        if (node.type === "SplitBays" && field === "count") input.intent.requested.bayCount = value;
      }
    }
  }
  // Evaluate a real, versioned PSG document and retain its literal trace. Supported
  // recipe defaults are explicit nodes; imported requests are never relabeled.
  const requested = { wallMaterial: "brick-red", roofType: "flat", windowFamily: "double-hung", corniceFamily: "profiled-stone", ...input.intent.requested };
  const document = PsgDocumentSchema.parse({ schemaVersion: "2.0.0", id: "construction-masonry-intent-v1", nodes: [
    { id: "style", type: "SetVariable", variableName: "building.stylePack", value: input.intent.stylePackId ?? "late-19c-commercial-demo" },
    ...Object.entries(requested).filter(([key]) => key !== "trimDensity").map(([key, value]) => ({ id: key, type: "SetVariable", variableName: "building." + key, value })),
    { id: "trim-choice", type: "WeightedChoice", semanticPath: "building/trim", choices: [{ value: "restrained", weight: 1 }, { value: "moderate", weight: 1 }] },
    { id: "trim", type: "SetVariable", variableName: "building.trimDensity", inputIds: ["trim-choice"] },
    { id: "output", type: "Output", inputIds: ["trim"], outputKind: "buildingIntent" }
  ] });
  const evaluation = evaluatePsg(document, { seed: input.intent.seeds.family + "/trim/" + controls.trimSeed });
  const adapted = adaptPsgEvaluationToBuildingIntent({ prompt: input.intent.prompt, seeds: input.intent.seeds, evaluation, locks: input.intent.locks });
  if (adapted.diagnostics.length) throw new Error(adapted.diagnostics.map(item => item.message).join(" "));
  // An explicit unsupported trim request remains an error instead of being rewritten.
  if (input.intent.requested.trimDensity === "ornate" || previous && oldSource?.intent.psg.sourceDocumentId !== "construction-masonry-intent-v1" && input.intent.requested.trimDensity !== undefined)
    adapted.intent.requested.trimDensity = input.intent.requested.trimDensity;
  input.intent = JSON.parse(canonicalJson(adapted.intent));
  input.intent.psg.sourceDocumentId = document.id;
  input.intent.psg.traceId = "psg-" + await hashCanonicalJson({ document, evaluation });
  input.intent.psg.evaluatedVariables = { ...input.intent.psg.evaluatedVariables,
    "$constructionPsgDocument": document, "$constructionPsgTrace": JSON.parse(canonicalJson(evaluation.trace)) };
  const source = await captureConstructionGenerationSource(input), resolution = await resolveConstructionGeneration(source);
  const preserve = controls.preserveAuthored || controls.lockOpenings;
  const keepStorefront = preserve || source.intent.locks.some(lock => ["construction/opening", "construction/window", "construction/frontage", "construction/storefrontDivision"]
    .some(path => path === lock.semanticPath || path.startsWith(lock.semanticPath + "/") || lock.semanticPath.startsWith(path + "/")));
  let graph = retainConstructionRoundHead(current, retainConstructionParapetVocabulary(current, retainConstructionCorniceVocabulary(current, retainConstructionOpeningEdits(current, retainConstructionStorefront(current, retainConstructionWindowVocabulary(current, structuredClone(resolution.graph), preserve), keepStorefront), preserve), controls.preserveAuthored), controls.preserveAuthored), preserve);
  const keepGroups = preserve || source.intent.locks.some(lock => ["construction/opening", "construction/window", "construction/upperBayGroups"]
    .some(path => path === lock.semanticPath || path.startsWith(lock.semanticPath + "/") || lock.semanticPath.startsWith(path + "/")));
  if (["0.11.0", "0.12.0"].includes(current.schemaVersion) && keepGroups) {
    graph = withConstructionGroupedBays(graph, current.upperBayGroups);
    try { await evaluateConstruction(graph); }
    catch (failure) { throw new Error(`A retained grouped bay does not fit the generated building: ${failure instanceof Error ? failure.message : "invalid construction"}`, { cause: failure }); }
  }
  if (current.schemaVersion === "0.12.0" && keepStorefront) {
    graph = withConstructionStorefrontDivision(graph, current.storefrontDivision);
    try { await evaluateConstruction(graph); }
    catch (failure) { throw new Error(`The retained storefront divisions do not fit the generated building: ${failure instanceof Error ? failure.message : "invalid construction"}`, { cause: failure }); }
  }
  if (authoredAwnings && keepStorefront) {
    graph = withConstructionAwnings(graph, authoredAwnings);
    try { await evaluateConstruction(graph); }
    catch (failure) { throw new Error(`A retained awning does not fit the generated building: ${failure instanceof Error ? failure.message : "invalid construction"}`, { cause: failure }); }
  }
  for (const node of graph.nodes) if (node.type === "SetSurface") {
    const authored = current.nodes.find(item => item.id === node.id);
    if (authored?.type === "SetSurface") node.composition = structuredClone(authored.composition);
  }
  return { source, resolution, graph, controls: { ...controls, buildingSeed: source.intent.seeds.building,
    floorCount: source.intent.requested.floorCount!, bayCount: source.intent.requested.bayCount! } };
}

/** An explicit library replacement follows named slots while preserving authored finish intent. */
export function rebindGenerationSurfaceSources(input: unknown,
  previousAtlas: { contentHash: string; manifest: AtlasManifest }, nextAtlas: { contentHash: string; manifest: AtlasManifest }) {
  const graph = structuredClone(BayConstructionGraphSchema.parse(input));
  const hash = z.string().regex(/^[a-f0-9]{64}$/);
  const previous = { contentHash: hash.parse(previousAtlas.contentHash), manifest: AtlasManifestSchema.parse(previousAtlas.manifest) };
  const next = { contentHash: hash.parse(nextAtlas.contentHash), manifest: AtlasManifestSchema.parse(nextAtlas.manifest) };
  validateConstructionSurfaceSources(graph, previous);
  for (const node of graph.nodes) if (node.type === "SetSurface" && node.composition.sources.length) {
    let changed = false;
    for (const source of node.composition.sources) {
      const oldSlot = previous.manifest.slots.find(slot => slot.id === source.slotId);
      const newSlot = next.manifest.slots.find(slot => slot.id === source.slotId);
      if (!oldSlot || !newSlot || oldSlot.role !== newSlot.role) throw new Error("The replacement material library cannot retain finish slot " + source.slotId + ". The current building is retained.");
      for (const layer of node.composition.layers) if (layer.sourceId === source.id && canonicalJson(layer.physicalSizeM) === canonicalJson(oldSlot.physicalSizeM)) {
        changed ||= canonicalJson(layer.physicalSizeM) !== canonicalJson(newSlot.physicalSizeM);
        layer.physicalSizeM = structuredClone(newSlot.physicalSizeM);
      }
      changed ||= source.atlasContentHash !== next.contentHash;
      source.atlasContentHash = next.contentHash;
    }
    if (changed) node.composition.revision++;
  }
  validateConstructionSurfaceSources(graph, next);
  return BayConstructionGraphSchema.parse(graph);
}
