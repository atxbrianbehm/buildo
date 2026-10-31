import { z } from "zod";
import { BayConstructionGraphSchema } from "../contracts/bayConstructionGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";

const requestSchema = z.object({ schemaVersion: z.literal("0.1.0"), kind: z.literal("construction-grouped-facade-rhythm-study"),
  graph: BayConstructionGraphSchema, firstFloor: z.number().int().min(1), lastFloor: z.number().int().min(1),
  firstBay: z.number().int().min(0), lastBay: z.number().int().min(0), memberCount: z.union([z.literal(2), z.literal(3)]),
  memberWidthM: z.number().finite().positive(), pierWidthM: z.number().finite().gt(0.2) }).strict();

/** Compile an explicit bounded rhythm without replacing existing local edits or publishing a partial result. */
export async function compileConstructionGroupedFacadeRhythmStudy(input: unknown) {
  const request = requestSchema.parse(input), graph = structuredClone(request.graph);
  if (graph.schemaVersion !== "0.17.0" || !graph.storefrontSign) throw new Error("Choose a signed storefront with an explicit awning clearance.");
  const storeys = graph.nodes.find(node => node.type === "Storeys"), bays = graph.nodes.find(node => node.type === "SplitBays"),
    opening = graph.nodes.find(node => node.type === "PlaceOpening"), edits = graph.nodes.find(node => node.type === "EditOpeningWidth");
  if (!storeys || !bays || bays.bypassed || !opening || opening.bypassed || opening.parameters.upperFrontRoundHead === 1)
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
