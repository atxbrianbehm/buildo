import { BuildingGraphSchema, type BuildingGraph, type BuildingGraphNode } from "../contracts/buildingGraph";
import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type { Diagnostic } from "../core/diagnostics";
import { hashCanonicalJson } from "../core/contentHash";
import type { ComponentCatalog } from "../components/componentCatalogBuilder";
import { late19cApartmentKit, planFacadeModules } from "../art-kit";

function buildingPath(spec: BuildingFamilySpec, suffix: string): string {
  return `building/${spec.familyId}/${suffix}`;
}

function node(input: BuildingGraphNode): BuildingGraphNode {
  return input;
}

function recipeId(catalog: ComponentCatalog, role: string): string {
  const recipe = catalog.recipes.find((candidate) => candidate.role === role);
  if (!recipe) {
    throw new Error(`Missing component recipe for role ${role}`);
  }
  return recipe.id;
}

function buildNodes(spec: BuildingFamilySpec, catalog: ComponentCatalog): BuildingGraphNode[] {
  const wallPanelRecipeId = recipeId(catalog, "wall");
  const windowRecipeId = recipeId(catalog, "window");
  const doorRecipeId = recipeId(catalog, "door");
  const verticalTrimRecipeId = recipeId(catalog, "verticalTrim");
  const corniceRecipeId = recipeId(catalog, "cornice");
  const roofRecipeId = recipeId(catalog, "roof");
  const windowCount = spec.massing.floorCount * spec.facade.frontBayCount;
  const facadeModulePlan = planFacadeModules({
    spec,
    kit: late19cApartmentKit
  });

  return [
    node({
      id: "node.footprint",
      type: "CreateRectFootprint",
      parameters: {
        widthM: spec.massing.widthM,
        depthM: spec.massing.depthM
      },
      upstreamIds: [],
      semanticPathTemplate: buildingPath(spec, "massing/footprint"),
      stage: "massing"
    }),
    node({
      id: "node.massing",
      type: "ExtrudeMassing",
      parameters: {
        floorHeightsM: spec.massing.floorHeightsM,
        parapetHeightM: spec.massing.parapetHeightM
      },
      upstreamIds: ["node.footprint"],
      semanticPathTemplate: buildingPath(spec, "massing/block"),
      stage: "massing"
    }),
    node({
      id: "node.facades",
      type: "ForEachFacade",
      parameters: {
        facades: ["front", "rear", "left", "right"]
      },
      upstreamIds: ["node.massing"],
      semanticPathTemplate: buildingPath(spec, "facade/{facade}"),
      stage: "facade"
    }),
    node({
      id: "node.floors",
      type: "SplitFloors",
      parameters: {
        floorCount: spec.massing.floorCount,
        floorHeightsM: spec.massing.floorHeightsM
      },
      upstreamIds: ["node.facades"],
      semanticPathTemplate: buildingPath(spec, "facade/{facade}/floor/{floor}"),
      stage: "facade"
    }),
    node({
      id: "node.bays",
      type: "SplitBays",
      parameters: {
        frontBayCount: spec.facade.frontBayCount,
        sideBaySpacingM: spec.facade.sideBaySpacingM
      },
      upstreamIds: ["node.floors"],
      semanticPathTemplate: buildingPath(spec, "facade/{facade}/floor/{floor}/bay/{bay}"),
      stage: "facade"
    }),
    node({
      id: "node.art-kit-facade-plan",
      type: "Group",
      parameters: {
        artKitManifestId: facadeModulePlan.artKitManifestId,
        unitMeters: facadeModulePlan.unitMeters,
        plannerId: facadeModulePlan.plannerId,
        cellCount: facadeModulePlan.cells.length,
        placementCount: facadeModulePlan.placements.length,
        diagnostics: facadeModulePlan.diagnostics,
        placements: facadeModulePlan.placements.map((placement) => ({
          id: placement.id,
          moduleId: placement.moduleId,
          facade: placement.facade,
          floorIndex: placement.floorIndex,
          bayIndex: placement.bayIndex,
          zone: placement.zone,
          layer: placement.layer,
          originMeters: placement.originMeters,
          sizeMeters: placement.sizeMeters,
          semanticPath: placement.semanticPath
        }))
      },
      upstreamIds: ["node.bays"],
      semanticPathTemplate: buildingPath(spec, "art-kit/facade-plan"),
      stage: "facade"
    }),
    node({
      id: "node.wall-panels",
      type: "EmitWallPanel",
      parameters: {
        recipeId: wallPanelRecipeId,
        atlasSlotId: "wall.primary"
      },
      upstreamIds: ["node.art-kit-facade-plan"],
      semanticPathTemplate: buildingPath(spec, "facade/{facade}/floor/{floor}/bay/{bay}/wall/panel"),
      stage: "facade"
    }),
    node({
      id: "node.openings",
      type: "PlaceOpening",
      parameters: {
        windowRecipeId,
        doorRecipeId,
        doorBay: Math.floor(spec.facade.frontBayCount / 2)
      },
      upstreamIds: ["node.wall-panels"],
      semanticPathTemplate: buildingPath(spec, "facade/front/floor/{floor}/bay/{bay}/opening/{kind}"),
      stage: "openings"
    }),
    node({
      id: "node.window-instances",
      type: "InstanceComponent",
      parameters: {
        role: "window",
        recipeId: windowRecipeId,
        instanceCount: windowCount,
        semanticPathTemplate: buildingPath(spec, "facade/front/floor/{floor}/bay/{bay}/window/frame")
      },
      upstreamIds: ["node.openings"],
      semanticPathTemplate: buildingPath(spec, "facade/front/floor/{floor}/bay/{bay}/window/frame"),
      stage: "openings"
    }),
    node({
      id: "node.trim-instances",
      type: "InstanceComponent",
      parameters: {
        role: "verticalTrim",
        recipeId: verticalTrimRecipeId,
        instanceCount: spec.facade.frontBayCount + 1,
        semanticPathTemplate: buildingPath(spec, "facade/front/bay-edge/{bayEdge}/trim/vertical")
      },
      upstreamIds: ["node.wall-panels"],
      semanticPathTemplate: buildingPath(spec, "facade/front/bay-edge/{bayEdge}/trim/vertical"),
      stage: "trim"
    }),
    node({
      id: "node.cornice",
      type: "SweepProfile",
      parameters: {
        recipeId: corniceRecipeId,
        profileRecipeId: catalog.recipes.find((recipe) => recipe.id === corniceRecipeId)?.profileRecipeId
      },
      upstreamIds: ["node.trim-instances"],
      semanticPathTemplate: buildingPath(spec, "facade/front/cornice/primary"),
      stage: "trim"
    }),
    node({
      id: "node.roof",
      type: "EmitRoof",
      parameters: {
        recipeId: roofRecipeId,
        roofType: spec.massing.roof.type
      },
      upstreamIds: ["node.massing"],
      semanticPathTemplate: buildingPath(spec, "roof/primary"),
      stage: "roof"
    }),
    node({
      id: "node.output",
      type: "OutputBuilding",
      parameters: {
        catalogId: catalog.catalogId
      },
      upstreamIds: ["node.cornice", "node.roof"],
      semanticPathTemplate: buildingPath(spec, "output"),
      stage: "roof"
    })
  ];
}

export async function buildBuildingGraph(
  spec: BuildingFamilySpec,
  catalog: ComponentCatalog
): Promise<BuildingGraph> {
  const nodes = buildNodes(spec, catalog);
  const graphWithoutId = {
    schemaVersion: "0.1.0" as const,
    graphId: "pending",
    nodes,
    outputNodeId: "node.output"
  };
  const graphId = `graph-${(await hashCanonicalJson({ ...graphWithoutId, graphId: undefined })).slice(0, 16)}`;

  return BuildingGraphSchema.parse({
    ...graphWithoutId,
    graphId
  });
}

function diagnostic(code: string, message: string, path: string, received?: unknown): Diagnostic {
  return {
    code,
    message,
    severity: "error",
    path,
    received
  };
}

export function validateBuildingGraph(graphInput: unknown): Diagnostic[] {
  const parsed = BuildingGraphSchema.safeParse(graphInput);
  if (!parsed.success) {
    return [
      diagnostic(
        "buildingGraph.invalidSchema",
        "Building graph does not match the schema.",
        "buildingGraph",
        parsed.error.issues.map((issue) => issue.message).join(", ")
      )
    ];
  }

  const graph = parsed.data;
  const diagnostics: Diagnostic[] = [];
  const nodesById = new Map<string, BuildingGraphNode>();

  for (const graphNode of graph.nodes) {
    if (nodesById.has(graphNode.id)) {
      diagnostics.push(
        diagnostic("buildingGraph.duplicateNode", `Building graph contains duplicate node ${graphNode.id}.`, "nodes", graphNode.id)
      );
    }
    nodesById.set(graphNode.id, graphNode);
  }

  if (!nodesById.has(graph.outputNodeId)) {
    diagnostics.push(
      diagnostic(
        "buildingGraph.missingOutput",
        `Building graph output node ${graph.outputNodeId} is missing.`,
        "outputNodeId",
        graph.outputNodeId
      )
    );
  }

  for (const graphNode of graph.nodes) {
    for (const upstreamId of graphNode.upstreamIds) {
      if (!nodesById.has(upstreamId)) {
        diagnostics.push(
          diagnostic(
            "buildingGraph.missingUpstream",
            `Building graph node ${graphNode.id} references missing upstream node ${upstreamId}.`,
            `nodes.${graphNode.id}.upstreamIds`,
            upstreamId
          )
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleNodes = new Set<string>();

  function visit(nodeId: string): void {
    if (cycleNodes.size > 0 || visited.has(nodeId)) {
      return;
    }
    if (visiting.has(nodeId)) {
      cycleNodes.add(nodeId);
      return;
    }

    const graphNode = nodesById.get(nodeId);
    if (!graphNode) {
      return;
    }

    visiting.add(nodeId);
    for (const upstreamId of graphNode.upstreamIds) {
      visit(upstreamId);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  for (const graphNode of graph.nodes) {
    visit(graphNode.id);
  }

  if (cycleNodes.size > 0) {
    diagnostics.push(
      diagnostic(
        "buildingGraph.cycle",
        "Building graph contains an upstream dependency cycle.",
        "nodes",
        Array.from(cycleNodes)
      )
    );
  }

  return diagnostics;
}
