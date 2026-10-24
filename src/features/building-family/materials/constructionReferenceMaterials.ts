import { z } from "zod";
import { AtlasManifestSchema, AtlasSlotSchema } from "../contracts/atlasManifest";
import { BuildingFamilySpecSchema } from "../contracts/buildingFamilySpec";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { readConstructionGenerationSource } from "../core/constructionGenerationSource";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { DiagnosticSchema } from "../core/diagnostics";
import { createSeedTree } from "../core/seedTree";
import { planAtlas, validateAtlasPlan, type AtlasPlan } from "./atlasPlanner";
import { packAtlas } from "./atlasPacker";
import { PrimaryWallSamplingProfileSchema } from "./periodicMasonryRaster";
import { ProceduralMaterialProvider, hashMaterialSourceContent, type MaterialSourceArtifact, type MaterialSourceRequest, type PixelLayer } from "./providers/proceduralMaterialProvider";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const sourceShape = z.object({
  sourceId: z.string(), role: AtlasSlotSchema.shape.role, selectedFamily: z.string(), periodicity: AtlasSlotSchema.shape.periodicity,
  physicalSizeM: AtlasSlotSchema.shape.physicalSizeM, seedPath: z.string(), promptVocabulary: z.array(z.string()),
  metersPerTile: z.number().finite().positive().optional(), artKitMaterialRoleId: z.string().optional(),
  proceduralSource: z.string().optional(), samplingProfile: PrimaryWallSamplingProfileSchema.optional()
}).strict();
const atlasShape = z.object({ manifest: AtlasManifestSchema, materialSources: z.array(sourceShape), profileRecipeIds: z.array(z.string()), diagnostics: z.array(DiagnosticSchema) }).strict();
const bindingShape = z.object({ slotId: z.string(), nodeId: z.string(), nodeContentHash: hash, metersPerTile: z.number().finite().positive() }).strict();
const optionsShape = z.object({ widthPx: z.number().int().min(128).max(4096).optional(), heightPx: z.number().int().min(128).max(4096).optional(), paddingPx: z.number().int().nonnegative().optional() }).strict();
const planShape = z.object({
  schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-reference-material-plan"),
  resolverVersion: z.literal("construction-reference-materials-v1"), sourceContentHash: hash, referenceContentHash: hash,
  architectureCoverage: z.enum(["unknown", "partial", "supported"]), templateSpec: BuildingFamilySpecSchema, options: optionsShape, atlas: atlasShape,
  bindings: z.array(bindingShape), unmappedSlots: z.array(z.string()), materialInputsHash: hash, contentHash: hash
}).strict();
const PlanSchema = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
}).pipe(planShape);
export const ConstructionReferenceMaterialPlanSchema = PlanSchema;
export type ConstructionReferenceMaterialPlan = z.infer<typeof PlanSchema>;

const slotRoles: Record<string, string> = {
  "wall.primary": "masonry.brick.running", "wall.secondary": "masonry.brick.running",
  "glass.primary": "glass.clear", "frame.primary": "wood.frame.painted", "door.primary": "wood.frame.painted",
  "trim.horizontal.primary": "stone.trim.cast", "trim.horizontal.secondary": "stone.trim.cast",
  "trim.vertical.primary": "stone.trim.cast", "cornice.primary": "stone.trim.cast", "ornament.primary": "metal.hardware.painted"
};
const procedures: Record<string, string> = {
  "masonry.brick.running": "running-bond-brick", "glass.clear": "clear-glass", "wood.frame.painted": "painted-wood-frame",
  "stone.trim.cast": "cast-stone-trim", "metal.hardware.painted": "painted-metal-hardware"
};
const roleIds: Record<string, string> = {
  "masonry.brick.running": "brick", "glass.clear": "glass", "wood.frame.painted": "painted-wood",
  "stone.trim.cast": "trim-stone", "metal.hardware.painted": "painted-metal"
};
function abort(signal: AbortSignal) { if (signal.aborted) throw new Error("Reference material generation aborted."); }

/** Opt-in material consumer. Existing AtlasPlanner and C4 source generation remain literal. */
export async function planConstructionReferenceMaterials(baseSpec: unknown, sourceInput: unknown,
  options: { widthPx?: number; heightPx?: number; paddingPx?: number } = {}): Promise<ConstructionReferenceMaterialPlan> {
  const spec = structuredClone(BuildingFamilySpecSchema.parse(baseSpec));
  const ownedOptions = optionsShape.parse(options);
  const source = await readConstructionGenerationSource(sourceInput);
  if (source.intent.requested.weathering !== undefined) throw new Error("Explicit weathering strength is not implemented by this reference material planner; use authored surface layers.");
  const atlas: AtlasPlan = await planAtlas(spec, { widthPx: 1024, heightPx: 1024, paddingPx: 8, ...ownedOptions });
  const bindings: z.infer<typeof bindingShape>[] = [], unmappedSlots: string[] = [];
  for (const slot of atlas.manifest.slots) {
    const role = slotRoles[slot.id];
    if (!role) { unmappedSlots.push(slot.id); continue; }
    const nodes = source.reference.materialBrief.nodes.filter(node => node.role === role);
    if (nodes.length !== 1) throw new Error("Reference material role needs exactly one node: " + role);
    const node = nodes[0];
    const required = role === "glass.clear" ? ["baseColor", "orm", "opacity"] : ["baseColor", "normal", "orm"];
    if (!required.every(channel => node.channels.includes(channel as typeof node.channels[number])) || node.generationHints.proceduralSource !== procedures[role])
      throw new Error("Reference role has unsupported channels or procedural source: " + role);
    if (slot.id === "wall.primary" && node.metersPerTile !== .96)
      throw new Error("The verified primary masonry sampler requires its 0.96 metre tile; another wall scale needs an explicit sampler version.");
    const request = atlas.materialSources.find(item => item.sourceId === slot.materialSourceId)!;
    const physicalSizeM = { width: node.metersPerTile, height: node.metersPerTile };
    const vocabulary = [node.role, node.generationHints.proceduralSource, ...(node.generationHints.remotePromptFragment ? [node.generationHints.remotePromptFragment] : []), ...(node.generationHints.weathering ? ["weathering-description:" + node.generationHints.weathering] : [])];
    Object.assign(request, { selectedFamily: node.role, proceduralSource: node.generationHints.proceduralSource,
      artKitMaterialRoleId: roleIds[role], physicalSizeM, metersPerTile: node.metersPerTile,
      seedPath: "reference-material/" + source.intent.seeds.material + "/" + slot.id, promptVocabulary: vocabulary });
    Object.assign(slot, { physicalSizeM, metersPerTile: node.metersPerTile, proceduralSource: node.generationHints.proceduralSource,
      artKitMaterialRoleId: roleIds[role], seedPath: "reference-slot/" + source.intent.seeds.material + "/" + slot.id,
      generationPrompt: vocabulary.join(", "), compatibilityTags: [...slot.compatibilityTags, ...node.historicalTags] });
    bindings.push({ slotId: slot.id, nodeId: node.id, nodeContentHash: await hashCanonicalJson(node), metersPerTile: node.metersPerTile });
  }
  atlas.manifest.atlasId = "atlas-" + (await hashCanonicalJson({ manifest: { ...atlas.manifest, atlasId: undefined }, sources: atlas.materialSources })).slice(0, 16);
  const errors = validateAtlasPlan(atlas).filter(item => item.severity === "error");
  if (errors.length) throw new Error(errors.map(item => item.message).join(" "));
  // Existing planner has optional undefined values. Persist its explicit JSON representation.
  const admittedAtlas = atlasShape.parse(JSON.parse(canonicalJson(atlas)));
  const payload = { schemaVersion: "0.1.0" as const, kind: "construction-reference-material-plan" as const,
    resolverVersion: "construction-reference-materials-v1" as const, sourceContentHash: source.contentHash,
    referenceContentHash: source.referenceContentHash, architectureCoverage: source.reference.architectureCoverage,
    templateSpec: JSON.parse(canonicalJson(spec)), options: ownedOptions, atlas: admittedAtlas, bindings, unmappedSlots, materialInputsHash: await hashCanonicalJson(admittedAtlas) };
  return PlanSchema.parse({ ...payload, contentHash: await hashCanonicalJson(payload) });
}

export async function readConstructionReferenceMaterialPlan(input: unknown, sourceInput: unknown) {
  const parsed = PlanSchema.parse(input);
  if (canonicalJson(parsed) !== canonicalJson(input)) throw new Error("Material plan admission would change serialized fields.");
  const plan = structuredClone(parsed);
  // Own both inputs before the first await. Replay checks roles, scales, seed paths,
  // vocabulary, coverage and all slot bindings rather than trusting rehashed metadata.
  const source = await readConstructionGenerationSource(sourceInput);
  const expected = await planConstructionReferenceMaterials(plan.templateSpec, source, plan.options);
  if (canonicalJson(plan) !== canonicalJson(expected)) throw new Error("Reference material plan does not match its pinned source and planner replay.");
  return plan;
}

/** Stone and hardware are actual substrate generators, not the legacy metal/ornament fallback. */
async function solidReferenceSource(request: MaterialSourceRequest, signal: AbortSignal): Promise<MaterialSourceArtifact> {
  abort(signal);
  const owned = structuredClone(request), stone = owned.proceduralSource === "cast-stone-trim";
  const providerId = "construction-reference-substrates-v1", requestHash = await hashCanonicalJson({ providerId, request: owned });
  const tree = createSeedTree(owned.seedPath).fork(requestHash);
  const layer = (): PixelLayer => ({ widthPx: owned.widthPx, heightPx: owned.heightPx, channels: "rgba8", data: new Uint8ClampedArray(owned.widthPx * owned.heightPx * 4) });
  const baseColor = layer(), height = layer(), roughness = layer(), metalness = layer();
  for (let y = 0; y < owned.heightPx; y++) for (let x = 0; x < owned.widthPx; x++) {
    const sx = owned.periodicity === "x" || owned.periodicity === "xy" ? x % Math.max(1, owned.widthPx - 1) : x;
    const sy = owned.periodicity === "xy" ? y % Math.max(1, owned.heightPx - 1) : y;
    const grain = tree.float01(sx + "/" + sy) - .5, offset = (y * owned.widthPx + x) * 4;
    const color = stone ? [188, 181, 164] : [102, 113, 105];
    baseColor.data.set([...color.map(value => Math.round(value + grain * (stone ? 12 : 7))), 255], offset);
    for (const [target, value] of [[height, 128 + grain * (stone ? 8 : 3)], [roughness, (stone ? 216 : 106) + grain * 12], [metalness, stone ? 0 : 150]] as const)
      target.data.set([Math.round(value), Math.round(value), Math.round(value), 255], offset);
  }
  abort(signal);
  const layers = { baseColor, height, roughness, metalness };
  const contentHash = await hashMaterialSourceContent({ providerId, requestHash, layers });
  abort(signal);
  return { sourceId: owned.sourceId, providerId, widthPx: owned.widthPx, heightPx: owned.heightPx, layers, requestHash, contentHash,
    provenance: { providerId, seedPath: owned.seedPath, promptVocabulary: owned.promptVocabulary, algorithm: stone ? "cast-stone-grain-v1" : "painted-metal-hardware-v1" } };
}

/** Generate only on a new material-input identity. Structural rerolls reuse the packed atlas. */
export async function generateConstructionReferenceAtlas(baseSpec: unknown, sourceInput: unknown, signal: AbortSignal,
  options: { widthPx?: number; heightPx?: number; paddingPx?: number; sourceSizePx?: number } = {}) {
  abort(signal);
  const { sourceSizePx = 256, ...atlasOptions } = options;
  if (!Number.isInteger(sourceSizePx) || sourceSizePx < 16 || sourceSizePx > 4096) throw new Error("Reference source size must be an integer from 16 to 4096.");
  const plan = await planConstructionReferenceMaterials(baseSpec, sourceInput, atlasOptions); abort(signal);
  const provider = new ProceduralMaterialProvider();
  const artifacts = await Promise.all(plan.atlas.materialSources.map(source => {
    const size = source.samplingProfile ? 256 : sourceSizePx;
    const request = { ...structuredClone(source), widthPx: size, heightPx: size };
    return source.proceduralSource === "cast-stone-trim" || source.proceduralSource === "painted-metal-hardware"
      ? solidReferenceSource(request, signal) : provider.generate(request, signal);
  }));
  abort(signal);
  const packedAtlas = await packAtlas(plan.atlas, artifacts); abort(signal);
  return { plan, packedAtlas };
}
