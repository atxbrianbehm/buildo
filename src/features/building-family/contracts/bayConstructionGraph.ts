import { z } from "zod";
import { ConstructionStorefrontParametersSchema } from "./constructionStorefront";
import { ConstructionOpeningWidthOverrideSchema } from "./constructionOpeningEdit";
import { findBuildingDocumentJsonIssue } from "./buildingDocument";
import { BuildingSurfaceCompositionSchema } from "./surfaceComposition";

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/);
const metres = z.number().finite().positive().max(100);
const scopeInput = z.object({ nodeId: id, socket: z.literal("scope") }).strict();
const footprintInput = z.object({ nodeId: id, socket: z.literal("footprint") }).strict();
const geometryInput = z.object({ nodeId: id, socket: z.literal("geometry") }).strict();

export const ConstructionWindowLayoutSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type ConstructionWindowLayout = z.infer<typeof ConstructionWindowLayoutSchema>;
export const ConstructionCorniceLayoutSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type ConstructionCorniceLayout = z.infer<typeof ConstructionCorniceLayoutSchema>;

export const BayConstructionNodeSchema = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("Footprint"), parameters: z.object({ widthM: metres, depthM: metres, wallDepthM: metres }).strict() }).strict(),
  z.object({ id, type: z.literal("Storeys"), input: footprintInput, parameters: z.object({ count: z.number().int().min(1).max(12), groundHeightM: z.number().finite().min(2.5).max(8), upperHeightM: z.number().finite().min(2.5).max(8) }).strict() }).strict(),
  z.object({ id, type: z.literal("PlaceDoor"), input: scopeInput, bypassed: z.boolean().optional(), parameters: z.object({ bayIndex: z.number().int().min(0).max(19), widthM: z.number().finite().min(0.7).max(2.5), heightM: z.number().finite().min(2).max(4) }).strict() }).strict(),
  z.object({ id, type: z.literal("AssembleDoor"), input: scopeInput, bypassed: z.boolean().optional(), parameters: z.object({ recessM: z.number().finite().min(0.02).max(2), frameWidthM: z.number().finite().min(0.04).max(0.2), leafHeightM: z.number().finite().min(1.9).max(2.7), thresholdProjectionM: z.number().finite().min(0.02).max(0.4) }).strict() }).strict(),
  z.object({ id, type: z.literal("PlaceStorefront"), input: scopeInput, bypassed: z.boolean().optional(), parameters: ConstructionStorefrontParametersSchema.omit({ entranceWidthM: true }).extend({ mode: z.union([z.literal(0), z.literal(1)]) }).strict() }).strict(),
  z.object({ id, type: z.literal("EditOpeningWidth"), input: scopeInput, bypassed: z.boolean().optional(),
    overrides: z.array(ConstructionOpeningWidthOverrideSchema).max(220) }).strict(),
  z.object({ id, type: z.literal("BuildingRoof"), input: scopeInput, bypassed: z.boolean().optional(), parameters: z.object({ parapetHeightM: z.number().finite().min(0.2).max(1.2), copingProjectionM: z.number().finite().min(0.02).max(0.2), corniceHeightM: z.number().finite().min(0.1).max(0.6), corniceProjectionM: z.number().finite().min(0.08).max(0.4), corniceAssembly: ConstructionCorniceLayoutSchema.optional(), parapetSilhouette: z.union([z.literal(0), z.literal(1)]).optional() }).strict() }).strict(),
  z.object({ id, type: z.literal("FacadeScope"),
    parameters: z.object({ widthM: metres, heightM: metres, wallDepthM: metres }).strict()
  }).strict(),
  z.object({ id, type: z.literal("PlaceOpening"), input: scopeInput, bypassed: z.boolean().optional(),
    parameters: z.object({ widthM: metres, heightM: metres, sillM: z.number().finite().min(0.08).max(99), upperFrontRoundHead: z.union([z.literal(0), z.literal(1)]).optional() }).strict()
  }).strict(),
  z.object({ id, type: z.literal("EmitWall"), input: scopeInput, bypassed: z.boolean().optional() }).strict(),
  z.object({ id, type: z.literal("AssembleWindow"), input: scopeInput, bypassed: z.boolean().optional(),
    parameters: z.object({
      recessM: z.number().finite().min(0.02).max(2),
      frameWidthM: z.number().finite().min(0.025).max(0.2),
      sillProjectionM: z.number().finite().min(0.02).max(0.4),
      layout: ConstructionWindowLayoutSchema.optional()
    }).strict()
  }).strict(),
  z.object({ id, type: z.literal("SplitFloors"), input: scopeInput, bypassed: z.boolean().optional(),
    parameters: z.object({ count: z.number().int().min(1).max(12) }).strict() }).strict(),
  z.object({ id, type: z.literal("SplitBays"), input: scopeInput, bypassed: z.boolean().optional(),
    parameters: z.object({ count: z.number().int().min(1).max(20) }).strict() }).strict(),
  z.object({ id, type: z.literal("SelectScopes"), input: scopeInput, bypassed: z.boolean().optional(),
    parameters: z.object({ floorIndex: z.number().int().min(-1).max(11), bayIndex: z.number().int().min(-1).max(19) }).strict() }).strict(),
  z.object({ id, type: z.literal("ProfileTrim"), input: scopeInput, bypassed: z.boolean().optional(),
    parameters: z.object({ heightM: z.number().finite().min(0.03).max(0.4), projectionM: z.number().finite().min(0.02).max(0.3) }).strict() }).strict(),
  z.object({ id, type: z.literal("RoofCap"), input: scopeInput, bypassed: z.boolean().optional(),
    parameters: z.object({ depthM: z.number().finite().min(0.2).max(20), heightM: z.number().finite().min(0.05).max(0.5), projectionM: z.number().finite().min(0.02).max(0.4) }).strict() }).strict(),
  z.object({ id, type: z.literal("JoinGeometry"), inputs: z.array(geometryInput).min(1).max(32) }).strict(),
  z.object({ id, type: z.literal("SetSurface"), input: geometryInput, bypassed: z.boolean().optional(), composition: BuildingSurfaceCompositionSchema }).strict(),
  z.object({ id, type: z.literal("Output"), inputs: z.array(geometryInput).min(1).max(32) }).strict()
]);

export type BayConstructionNode = z.infer<typeof BayConstructionNodeSchema>;

const shape = z.object({
  schemaVersion: z.enum(["0.1.0", "0.2.0", "0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0"]),
  kind: z.literal("bay-construction"),
  documentId: id,
  nodes: z.array(BayConstructionNodeSchema).min(2).max(128),
  upperBayGroups: z.array(z.object({ storeysNodeId: id, floorIndex: z.number().int().min(1).max(11), bayIndex: z.number().int().min(0).max(19),
    memberCount: z.union([z.literal(2), z.literal(3)]), memberWidthM: metres, pierWidthM: z.number().finite().gt(0.2).max(100) }).strict()).max(220).optional(),
  storefrontDivision: z.object({ displayLights: z.union([z.literal(1), z.literal(2)]), transomLights: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict().optional(),
  outputNodeId: id
}).strict().superRefine((graph, context) => {
  const nodes = new Map<string, BayConstructionNode>();
  const issue = (message: string, path: Array<string | number> = ["nodes"]) =>
    context.addIssue({ code: "custom", message, path });
  if (["0.11.0", "0.12.0"].includes(graph.schemaVersion) ? graph.upperBayGroups === undefined : graph.upperBayGroups !== undefined)
    issue("Grouped-bay directives require graph version 0.11.0.", ["upperBayGroups"]);
  if (graph.schemaVersion === "0.12.0" ? graph.storefrontDivision === undefined : graph.storefrontDivision !== undefined)
    issue("Storefront divisions require graph version 0.12.0.", ["storefrontDivision"]);
  const groupKeys = (graph.upperBayGroups ?? []).map(group => JSON.stringify([group.storeysNodeId, group.floorIndex, group.bayIndex]));
  if (new Set(groupKeys).size !== groupKeys.length) issue("Grouped bay targets must be unique.", ["upperBayGroups"]);
  for (const node of graph.nodes) {
    if (node.type === "PlaceOpening" && node.parameters.upperFrontRoundHead !== undefined && !["0.10.0", "0.11.0", "0.12.0"].includes(graph.schemaVersion)) issue("Round-headed openings require construction graph version 0.10.0.");
    if (node.type === "PlaceStorefront" && !["0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(graph.schemaVersion)) issue("Storefront operators require construction graph version 0.6.0.");
    if (node.type === "EditOpeningWidth") {
      if (!["0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(graph.schemaVersion)) issue("Scoped opening edits require construction graph version 0.7.0.");
      const targets = node.overrides.map(({ target }) => JSON.stringify([target.documentId, target.storeysNodeId, target.face, target.floorIndex, target.bayIndex]));
      if (new Set(targets).size !== targets.length) issue("Opening width targets must be unique.");
      if (node.overrides.some(({ target }) => target.documentId !== graph.documentId)) issue("Opening width targets must belong to the construction document.");
    }
    if (["Footprint", "Storeys", "PlaceDoor", "AssembleDoor", "BuildingRoof"].includes(node.type) && !["0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(graph.schemaVersion)) issue("Whole-building operators require construction graph version 0.4.0.");
    if (["JoinGeometry", "SetSurface"].includes(node.type) && !["0.3.0", "0.4.0", "0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(graph.schemaVersion)) issue("Surface operators require construction graph version 0.3.0.");
    if (node.type === "SetSurface") {
      if (node.composition.documentId !== graph.documentId) issue("Surface composition must belong to the construction document.");
      for (const layer of node.composition.layers) {
        const target = layer.target;
        const supported = target.kind === "slot" ? ["frame.primary", "trim.horizontal.primary"].includes(target.slotId)
          : ["frame", "horizontalTrim"].includes(target.kind === "role" ? target.role : target.expectedRole);
        if (!supported) issue("Construction finish nodes currently target frames and horizontal trim.");
      }
    }
    if (graph.schemaVersion === "0.1.0" && (!["FacadeScope", "PlaceOpening", "EmitWall", "AssembleWindow", "Output"].includes(node.type) || "bypassed" in node)) {
      issue("Facade operators and bypass require construction graph version 0.2.0.");
    }
    if (node.type === "BuildingRoof") {
      if (["0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(graph.schemaVersion) && node.parameters.corniceAssembly === undefined) issue("Cornice vocabulary graphs require an explicit cornice assembly.");
      if (!["0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(graph.schemaVersion) && node.parameters.corniceAssembly !== undefined) issue("Cornice assembly layouts require construction graph version 0.8.0.");
      if (["0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(graph.schemaVersion) && node.parameters.parapetSilhouette === undefined) issue("Parapet vocabulary graphs require an explicit silhouette.");
      if (!["0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(graph.schemaVersion) && node.parameters.parapetSilhouette !== undefined) issue("Parapet silhouettes require construction graph version 0.9.0.");
    }
    if (node.type === "AssembleWindow") {
      if (["0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(graph.schemaVersion) && node.parameters.layout === undefined) issue("Window vocabulary graphs require an explicit assembly layout.");
      if (!["0.5.0", "0.6.0", "0.7.0", "0.8.0", "0.9.0", "0.10.0", "0.11.0", "0.12.0"].includes(graph.schemaVersion) && node.parameters.layout !== undefined) issue("Window assembly layouts require construction graph version 0.5.0.");
    }
    if (nodes.has(node.id)) issue("Node IDs must be unique.");
    nodes.set(node.id, node);
  }
  if (graph.nodes.filter(node => node.type === "SetSurface").length > 1) issue("Use one final surface finish node with an ordered layer stack.");
  if (graph.storefrontDivision && graph.nodes.filter(node => node.type === "PlaceStorefront" && !node.bypassed && node.parameters.mode === 1).length !== 1)
    issue("Storefront divisions require one active storefront operator.", ["storefrontDivision"]);
  for (const group of graph.upperBayGroups ?? []) if (nodes.get(group.storeysNodeId)?.type !== "Storeys") issue("Grouped bays require an existing storeys operator.", ["upperBayGroups"]);
  if (graph.nodes.filter(node => node.type === "EditOpeningWidth").length > 1) issue("Use one scoped opening width operation.");
  for (const node of graph.nodes) if (node.type === "EditOpeningWidth") for (const { target } of node.overrides) {
    if (nodes.get(target.storeysNodeId)?.type !== "Storeys" || nodes.get(target.windowNodeId)?.type !== "AssembleWindow") issue("Opening width targets require existing storeys and window assembly operators.");
  }
  if (nodes.get(graph.outputNodeId)?.type !== "Output") issue("The graph output must be an Output node.", ["outputNodeId"]);
  const references = (node: BayConstructionNode) =>
    "inputs" in node ? node.inputs : "input" in node ? [node.input] : [];
  for (const node of graph.nodes) {
    const linked = new Set<string>();
    for (const input of references(node)) {
      const upstream = nodes.get(input.nodeId);
      const socket = upstream ? constructionOutputSocket(upstream.type) : undefined;
      if (!upstream) issue(`Node ${node.id} references missing node ${input.nodeId}.`);
      else if (socket !== input.socket) issue(`Node ${node.id} requires a ${input.socket} output from ${input.nodeId}.`);
      if (upstream?.type === "SetSurface" && (node.type !== "Output" || node.inputs.length !== 1)) issue("A surface finish must feed Output as its only geometry contribution.");
      if (linked.has(input.nodeId)) issue(`Node ${node.id} repeats an input contribution.`);
      linked.add(input.nodeId);
    }
  }
  const active = new Set<string>(), visited = new Set<string>();
  const visit = (node: BayConstructionNode): void => {
    if (active.has(node.id)) { issue("Construction graph contains a cycle."); return; }
    if (visited.has(node.id)) return;
    active.add(node.id);
    for (const input of references(node)) {
      const upstream = nodes.get(input.nodeId);
      if (upstream) visit(upstream);
    }
    active.delete(node.id);
    visited.add(node.id);
  };
  for (const node of graph.nodes) visit(node);
});

/** Serialized instructions are admitted before any evaluator or renderer sees them. */
export const BayConstructionGraphSchema = z.unknown().superRefine((value, context) => {
  const issue = findBuildingDocumentJsonIssue(value);
  if (issue) context.addIssue({ code: "custom", message: issue.message, path: issue.path });
}).pipe(shape);
export type BayConstructionGraph = z.infer<typeof BayConstructionGraphSchema>;

export function constructionOutputSocket(type: BayConstructionNode["type"]): "scope" | "geometry" | "footprint" | undefined {
  if (type === "Footprint") return "footprint";
  if (["Storeys", "PlaceDoor", "PlaceStorefront", "EditOpeningWidth", "FacadeScope", "SplitFloors", "SplitBays", "SelectScopes", "PlaceOpening"].includes(type)) return "scope";
  if (["EmitWall", "AssembleWindow", "ProfileTrim", "RoofCap", "JoinGeometry", "SetSurface", "AssembleDoor", "BuildingRoof"].includes(type)) return "geometry";
}

/** Explicit authoring transition; the accepted bay's dimensions and window parameters survive. */
export function repeatBayAsFacade(source: BayConstructionGraph): BayConstructionGraph {
  const facade = source.nodes.find(node => node.type === "FacadeScope");
  const opening = source.nodes.find(node => node.type === "PlaceOpening");
  const window = source.nodes.find(node => node.type === "AssembleWindow");
  if (!facade || !opening || !window) throw new Error("Repeating a bay requires a facade, opening and window assembly.");
  return BayConstructionGraphSchema.parse({ schemaVersion: "0.2.0", kind: "bay-construction", documentId: source.documentId,
    outputNodeId: "output", nodes: [
      { ...facade, id: "facade", parameters: { ...facade.parameters, widthM: facade.parameters.widthM * 4, heightM: facade.parameters.heightM * 3 } },
      { id: "floors", type: "SplitFloors", input: { nodeId: "facade", socket: "scope" }, parameters: { count: 3 } },
      { id: "bays", type: "SplitBays", input: { nodeId: "floors", socket: "scope" }, parameters: { count: 4 } },
      { ...opening, id: "opening", input: { nodeId: "bays", socket: "scope" } },
      { id: "selection", type: "SelectScopes", input: { nodeId: "opening", socket: "scope" }, parameters: { floorIndex: -1, bayIndex: -1 } },
      { id: "wall", type: "EmitWall", input: { nodeId: "opening", socket: "scope" } },
      { ...window, id: "window", input: { nodeId: "selection", socket: "scope" } },
      { id: "bands", type: "ProfileTrim", input: { nodeId: "floors", socket: "scope" }, parameters: { heightM: 0.12, projectionM: 0.07 } },
      { id: "roof", type: "RoofCap", input: { nodeId: "facade", socket: "scope" }, parameters: { depthM: 0.8, heightM: 0.16, projectionM: 0.12 } },
      { id: "output", type: "Output", inputs: ["wall", "window", "bands", "roof"].map(nodeId => ({ nodeId, socket: "geometry" })) }
    ] });
}

export function createBayConstructionGraph(documentId = "authored-bay"): BayConstructionGraph {
  return BayConstructionGraphSchema.parse({
    schemaVersion: "0.1.0", kind: "bay-construction", documentId,
    nodes: [
      { id: "facade", type: "FacadeScope", parameters: { widthM: 2.8, heightM: 3.8, wallDepthM: 0.36 } },
      { id: "opening", type: "PlaceOpening", input: { nodeId: "facade", socket: "scope" },
        parameters: { widthM: 1.22, heightM: 2.12, sillM: 0.78 } },
      { id: "wall", type: "EmitWall", input: { nodeId: "opening", socket: "scope" } },
      { id: "window", type: "AssembleWindow", input: { nodeId: "opening", socket: "scope" },
        parameters: { recessM: 0.14, frameWidthM: 0.055, sillProjectionM: 0.12 } },
      { id: "output", type: "Output", inputs: [
        { nodeId: "wall", socket: "geometry" }, { nodeId: "window", socket: "geometry" }
      ] }
    ], outputNodeId: "output"
  });
}


/** A complete building derives its facades and roof from one footprint and storey system. */
export function createBuildingConstructionGraph(documentId = "authored-building"): BayConstructionGraph {
  return BayConstructionGraphSchema.parse({ schemaVersion: "0.4.0", kind: "bay-construction", documentId, outputNodeId: "output", nodes: [
    { id: "footprint", type: "Footprint", parameters: { widthM: 11.2, depthM: 8.4, wallDepthM: .36 } },
    { id: "facade", type: "Storeys", input: { nodeId: "footprint", socket: "footprint" }, parameters: { count: 3, groundHeightM: 4, upperHeightM: 3.7 } },
    { id: "bays", type: "SplitBays", input: { nodeId: "facade", socket: "scope" }, parameters: { count: 4 } },
    { id: "opening", type: "PlaceOpening", input: { nodeId: "bays", socket: "scope" }, parameters: { widthM: 1.22, heightM: 2.12, sillM: .78 } },
    { id: "entrance", type: "PlaceDoor", input: { nodeId: "opening", socket: "scope" }, parameters: { bayIndex: 1, widthM: 1.22, heightM: 2.9 } },
    { id: "wall", type: "EmitWall", input: { nodeId: "entrance", socket: "scope" } },
    { id: "selection", type: "SelectScopes", input: { nodeId: "entrance", socket: "scope" }, parameters: { floorIndex: -1, bayIndex: -1 } },
    { id: "window", type: "AssembleWindow", input: { nodeId: "selection", socket: "scope" }, parameters: { recessM: .14, frameWidthM: .055, sillProjectionM: .12 } },
    { id: "door", type: "AssembleDoor", input: { nodeId: "entrance", socket: "scope" }, parameters: { recessM: .14, frameWidthM: .075, leafHeightM: 2.3, thresholdProjectionM: .15 } },
    { id: "bands", type: "ProfileTrim", input: { nodeId: "facade", socket: "scope" }, parameters: { heightM: .12, projectionM: .07 } },
    { id: "roof", type: "BuildingRoof", input: { nodeId: "facade", socket: "scope" }, parameters: { parapetHeightM: .55, copingProjectionM: .06, corniceHeightM: .3, corniceProjectionM: .24 } },
    { id: "join", type: "JoinGeometry", inputs: ["wall","window","door","bands","roof"].map(nodeId=>({nodeId,socket:"geometry"})) },
    { id: "surface", type: "SetSurface", input: { nodeId: "join", socket: "geometry" }, composition: { schemaVersion: "0.1.0", documentId, revision: 0, sources: [], layers: [] } },
    { id: "output", type: "Output", inputs: [{ nodeId: "surface", socket: "geometry" }] }
  ] });
}
