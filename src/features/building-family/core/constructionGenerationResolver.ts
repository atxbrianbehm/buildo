import { constructionRecipeReference, getConstructionRecipeDefinition } from "./constructionRecipeCatalog";
export { constructionRecipeReference } from "./constructionRecipeCatalog";
import { z } from "zod";
import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { ConstructionGenerationSourceSchema, type ConstructionGenerationSource } from "../contracts/constructionGeneration";
import { findBuildingDocumentJsonIssue } from "../contracts/buildingDocument";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { canonicalJson } from "./canonicalJson";
import { hashCanonicalJson } from "./contentHash";
import { readConstructionGenerationSource } from "./constructionGenerationSource";
import { createSeedTree } from "./seedTree";
import { withConstructionRoundHead } from "./constructionRoundHeadVocabulary";

const choiceSchema = z.object({
  target: z.string().min(1), value: z.number().finite(), basis: z.enum(["default", "seeded", "requested", "derived", "locked"])
}).strict();
const resolutionShape = z.object({
  schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-generation-resolution"),
  resolverVersion: z.enum(["construction-generation-resolver-v1", "construction-generation-resolver-v2"]), sourceContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  graph: BayConstructionGraphSchema, graphContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  choices: z.array(choiceSchema).max(128), contentHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();
const ResolutionSchema = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", path: issue.path, message: issue.message });
}).pipe(resolutionShape);
export const ConstructionGenerationResolutionSchema = ResolutionSchema;
export type ConstructionGenerationResolution = z.infer<typeof ResolutionSchema>;

const round = (value: number) => Math.round(value * 1e9) / 1e9;
function assertSupported(source: ConstructionGenerationSource) {
  const requested = source.intent.requested;
  if (source.intent.stylePackId !== undefined && source.intent.stylePackId !== "late-19c-commercial-demo")
    throw new Error("This construction recipe supports the late-19c commercial demo style only.");
  const supported = { wallMaterial: "brick-red", roofType: "flat", windowFamily: "double-hung", corniceFamily: "profiled-stone" } as const;
  for (const [key, value] of Object.entries(supported))
    if (requested[key as keyof typeof supported] !== undefined && requested[key as keyof typeof supported] !== value)
      throw new Error("This construction recipe does not implement requested " + key + ": " + requested[key as keyof typeof supported] + ".");
  if (requested.symmetry !== undefined) throw new Error("An authored symmetry control is not implemented by this construction recipe.");
  if (requested.trimDensity === "ornate") throw new Error("Ornate trim is not implemented by this construction recipe.");
  for (const [key, min, max] of [["floorCount", 2, 6], ["bayCount", 3, 6]] as const) {
    const value = requested[key];
    if (value !== undefined && (value < min || value > max)) throw new Error("Requested " + key + " is outside this recipe's supported range.");
  }
}

/** Resolve into ordinary executed operators. Material/reference appearance never invents structure. */
export async function resolveConstructionGeneration(input: unknown): Promise<ConstructionGenerationResolution> {
  const source = await readConstructionGenerationSource(input), expected = await constructionRecipeReference(source.recipe.id);
  if (canonicalJson(source.recipe) !== canonicalJson(expected)) throw new Error("Generation recipe ID, version or content hash is unavailable or mismatched.");
  assertSupported(source);
  const definition = getConstructionRecipeDefinition(source.recipe.id);
  const graph = structuredClone(definition.baseGraph); graph.documentId = source.documentId;
  for (const node of graph.nodes) if (node.type === "SetSurface") node.composition.documentId = source.documentId;
  const values = new Map<string, z.infer<typeof choiceSchema>>();
  for (const node of graph.nodes) if ("parameters" in node) for (const [field, value] of Object.entries(node.parameters))
    values.set("construction/" + node.id + "/" + field, { target: "construction/" + node.id + "/" + field, value, basis: "default" });
  const originalTree = createSeedTree(source.intent.seeds.family).fork("construction").fork("building/" + source.intent.seeds.building);
  const tree = definition.resolverVersion === "construction-generation-resolver-v1" ? originalTree : originalTree.fork("recipe/" + definition.id);
  const trimTree = createSeedTree(source.intent.seeds.family).fork("construction/recipe/" + definition.id).fork("trim/" + source.intent.seeds.trim);
  const choose = (key: string) => { const choices = definition.choices[key]; return choices[tree.int(0, choices.length - 1, key)]; };
  const set = (id: string, field: string, value: number, basis: z.infer<typeof choiceSchema>["basis"]) => {
    const target = "construction/" + id + "/" + field;
    if (!values.has(target)) throw new Error("The recipe references an unavailable construction parameter: " + target);
    values.set(target, { target, value: round(value), basis });
  };
  const requested = source.intent.requested;
  set("facade", "count", requested.floorCount ?? choose("floorCount"), requested.floorCount === undefined ? "seeded" : "requested");
  set("bays", "count", requested.bayCount ?? choose("bayCount"), requested.bayCount === undefined ? "seeded" : "requested");
  set("facade", "groundHeightM", choose("groundHeightM"), "seeded");
  set("facade", "upperHeightM", choose("upperHeightM"), "seeded");
  set("opening", "widthM", choose("openingWidthM"), "seeded");
  set("opening", "heightM", choose("openingHeightM"), "seeded");
  for (const [target, choice] of Object.entries(definition.parameterChoices ?? {})) {
    const [, id, field] = target.split("/");
    const seed = choice.seedDomain === "trim" ? trimTree : tree;
    set(id, field, choice.values[seed.int(0, choice.values.length - 1, target)], "seeded");
  }
  const trim = requested.trimDensity ?? createSeedTree(source.intent.seeds.family).fork("trim/" + source.intent.seeds.trim).chooseWeighted([
    { value: "restrained", weight: 2 }, { value: "moderate", weight: 1 }
  ], "density");
  const trimBasis = requested.trimDensity === undefined ? "seeded" : "requested";
  set("bands", "heightM", trim === "restrained" ? .09 : .12, trimBasis);
  set("bands", "projectionM", trim === "restrained" ? .055 : .07, trimBasis);
  set("roof", "corniceHeightM", trim === "restrained" ? .24 : .3, trimBasis);
  set("roof", "corniceProjectionM", trim === "restrained" ? .18 : .24, trimBasis);
  if (trim === "ornate") throw new Error("Ornate trim is not implemented by this construction recipe.");
  const profile = definition.trimProfiles?.[trim];
  if (profile) for (const [target, value] of Object.entries(profile)) { const [, id, field] = target.split("/"); set(id, field, value, trimBasis); }
  const locks = new Map<string, number>();
  for (const lock of source.intent.locks) {
    if (lock.semanticPath === "construction/opening/upperFrontRoundHead" && lock.scope !== "element" && (lock.lockedValue === 0 || lock.lockedValue === 1)) {
      locks.set(lock.semanticPath, lock.lockedValue);
      continue;
    }
    if (lock.scope === "element" || !values.has(lock.semanticPath) || typeof lock.lockedValue !== "number" || !Number.isFinite(lock.lockedValue))
      throw new Error("Unsupported construction lock: " + lock.semanticPath + ". Use an implemented numeric construction parameter with building or family scope.");
    const previous = values.get(lock.semanticPath)!;
    if (previous.basis === "requested" && ["construction/facade/count", "construction/bays/count"].includes(lock.semanticPath) && previous.value !== lock.lockedValue)
      throw new Error("Requested count conflicts with construction lock: " + lock.semanticPath);
    locks.set(lock.semanticPath, lock.lockedValue);
  }
  const get = (id: string, field: string) => locks.get("construction/" + id + "/" + field) ?? values.get("construction/" + id + "/" + field)!.value;
  set("footprint", "widthM", get("bays", "count") * choose("bayPitchM"), "derived");
  set("footprint", "depthM", Math.max(choose("depthM"), get("bays", "count") * Math.max(1.75, get("opening", "widthM") + .4)), "derived");
  set("entrance", "widthM", get("opening", "widthM"), "derived");
  set("entrance", "heightM", get("opening", "heightM") + get("opening", "sillM"), "derived");
  for (const [target, value] of locks) values.set(target, { target, value, basis: "locked" });
  for (const node of graph.nodes) if ("parameters" in node) for (const field of Object.keys(node.parameters))
    Object.assign(node.parameters, { [field]: values.get("construction/" + node.id + "/" + field)!.value });
  const head = locks.get("construction/opening/upperFrontRoundHead");
  const admitted = BayConstructionGraphSchema.parse(head === undefined ? graph : withConstructionRoundHead(graph, head as 0 | 1));
  const payload = {
    schemaVersion: "0.1.0" as const, kind: "construction-generation-resolution" as const, resolverVersion: definition.resolverVersion,
    sourceContentHash: source.contentHash, graph: admitted, graphContentHash: await hashCanonicalJson(admitted),
    choices: [...values.values()].sort((a, b) => a.target < b.target ? -1 : a.target > b.target ? 1 : 0)
  };
  return ResolutionSchema.parse({ ...payload, contentHash: await hashCanonicalJson(payload) });
}

/** Real compiler admission keeps its aperture/assembly constraints authoritative. */
export async function compileConstructionGeneration(input: unknown) {
  const resolution = await resolveConstructionGeneration(input);
  const construction = await evaluateConstruction(resolution.graph);
  return { resolution, construction };
}

/** Check portable lineage by replaying the pinned resolver, without external data access. */
export async function readConstructionGenerationResolution(input: unknown, sourceInput: unknown): Promise<ConstructionGenerationResolution> {
  const resolution = structuredClone(ResolutionSchema.parse(input)), source = ConstructionGenerationSourceSchema.parse(sourceInput);
  const { contentHash, ...payload } = resolution;
  if (contentHash !== await hashCanonicalJson(payload) || resolution.graphContentHash !== await hashCanonicalJson(resolution.graph))
    throw new Error("Generation resolution does not match its saved hashes.");
  const replay = await resolveConstructionGeneration(source);
  if (canonicalJson(replay) !== canonicalJson(resolution)) throw new Error("Generation resolution does not replay from its pinned source.");
  return resolution;
}
