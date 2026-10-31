import { z } from "zod";
import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { readConstructionGenerationLineage } from "./constructionGenerationState";

const requestFields = { kind: z.literal("construction-grouped-facade-rhythm-study"),
  graph: BayConstructionGraphSchema, firstFloor: z.number().int().min(1), lastFloor: z.number().int().min(1),
  firstBay: z.number().int().min(0), lastBay: z.number().int().min(0), memberCount: z.union([z.literal(2), z.literal(3)]),
  memberWidthM: z.number().finite().positive(), pierWidthM: z.number().finite().gt(0.2) };
const requestSchema = z.discriminatedUnion("schemaVersion", [
  z.object({ schemaVersion: z.literal("0.1.0"), ...requestFields }).strict(),
  z.object({ schemaVersion: z.literal("0.2.0"), ...requestFields, allowRoundHeads: z.literal(true) }).strict()
]);

/** Compile an explicit bounded rhythm without replacing existing local edits or publishing a partial result. */
export async function compileConstructionGroupedFacadeRhythmStudy(input: unknown) {
  const request = requestSchema.parse(input), graph = structuredClone(request.graph);
  if (graph.schemaVersion !== "0.17.0" || !graph.storefrontSign) throw new Error("Choose a signed storefront with an explicit awning clearance.");
  const storeys = graph.nodes.find(node => node.type === "Storeys"), bays = graph.nodes.find(node => node.type === "SplitBays"),
    opening = graph.nodes.find(node => node.type === "PlaceOpening"), edits = graph.nodes.find(node => node.type === "EditOpeningWidth");
  if (!storeys || !bays || bays.bypassed || !opening || opening.bypassed || (request.schemaVersion === "0.1.0" && opening.parameters.upperFrontRoundHead === 1))
    throw new Error("Grouped facade rhythm requires active storeys, bays and flat upper openings.");
  if (request.firstFloor > request.lastFloor || request.lastFloor >= storeys.parameters.count || request.firstBay > request.lastBay || request.lastBay >= bays.parameters.count)
    throw new Error("Choose an existing upper-floor and bay range.");
  const groups = [...(graph.upperBayGroups ?? [])];
  for (let floorIndex = request.firstFloor; floorIndex <= request.lastFloor; floorIndex++) for (let bayIndex = request.firstBay; bayIndex <= request.lastBay; bayIndex++) {
    if (groups.some(group => group.storeysNodeId === storeys.id && group.floorIndex === floorIndex && group.bayIndex === bayIndex) ||
        (edits && !edits.bypassed && edits.overrides.some(({ target }) => target.storeysNodeId === storeys.id && target.face === "front" && target.floorIndex === floorIndex && target.bayIndex === bayIndex)))
      throw new Error("The chosen rhythm conflicts with an existing grouped bay or local width edit.");
    groups.push({ storeysNodeId: storeys.id, floorIndex, bayIndex, memberCount: request.memberCount, memberWidthM: request.memberWidthM, pierWidthM: request.pierWidthM });
  }
  const admitted = BayConstructionGraphSchema.parse({ ...graph, upperBayGroups: groups });
  const construction = await evaluateConstruction(admitted);
  return { graph: admitted, construction };
}

/** Bind a rhythm study to verified generation lineage before using it with authored source. */
export async function compileSourceAwareGroupedFacadeRhythmStudy(input: unknown, lineageInput: unknown, controlsInput: unknown) {
  const request = requestSchema.parse(input), controls = z.object({ lockOpenings: z.boolean() }).strict().parse(controlsInput);
  const lineage = await readConstructionGenerationLineage(lineageInput);
  if (request.graph.documentId !== lineage.source.documentId) throw new Error("Rhythm graph and generation lineage must identify the same document.");
  if (controls.lockOpenings) throw new Error("Unlock openings before applying grouped facade rhythm.");
  const affected = ["construction/opening", "construction/window", "construction/upperBayGroups"];
  for (const lock of lineage.source.intent.locks) if (affected.some(path => path === lock.semanticPath || path.startsWith(lock.semanticPath + "/") || lock.semanticPath.startsWith(path + "/")))
    throw new Error(`Grouped facade rhythm conflicts with the pinned lock ${lock.semanticPath}.`);
  for (const lock of lineage.source.intent.locks) {
    const [root, id, field, ...rest] = lock.semanticPath.split("/");
    const node = request.graph.nodes.find(item => item.id === id);
    if (root !== "construction" || rest.length || !node || !("parameters" in node) || (node.parameters as Record<string, unknown>)[field] !== lock.lockedValue)
      throw new Error(`Rhythm graph does not retain the pinned lock ${lock.semanticPath}.`);
  }
  return compileConstructionGroupedFacadeRhythmStudy(request);
}
