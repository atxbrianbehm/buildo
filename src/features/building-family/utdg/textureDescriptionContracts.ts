import { z } from "zod";
import { hashCanonicalJson } from "../core/contentHash";

/**
 * UTDG is a prepared research brief that may be injected into the material lane.
 * It is not a structure engine. See docs/research/utdg-late19c-brief.md.
 */

export const TextureDescriptionChannelSchema = z.enum([
  "baseColor",
  "normal",
  "orm",
  "height",
  "opacity",
  "mask"
]);

export const TextureDescriptionRelationSchema = z.enum([
  "pairs-with",
  "weathers-to",
  "trims",
  "overlays"
]);

export const TextureDescriptionNodeSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  channels: z.array(TextureDescriptionChannelSchema).min(1),
  metersPerTile: z.number().positive(),
  historicalTags: z.array(z.string().min(1)).default([]),
  generationHints: z
    .object({
      proceduralSource: z.string().min(1).optional(),
      remotePromptFragment: z.string().min(1).optional(),
      weathering: z.string().min(1).optional()
    })
    .default({})
});

export const TextureDescriptionEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  relation: TextureDescriptionRelationSchema
});

export const TextureDescriptionGraphSchema = z
  .object({
    schemaVersion: z.literal("0.1.0"),
    id: z.string().min(1),
    briefPath: z.string().min(1).optional(),
    status: z.enum(["research-draft", "injectable", "retired"]).default("research-draft"),
    historicalTags: z.array(z.string().min(1)).default([]),
    nodes: z.array(TextureDescriptionNodeSchema).min(1),
    edges: z.array(TextureDescriptionEdgeSchema).default([])
  })
  .superRefine((graph, ctx) => {
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    if (nodeIds.size !== graph.nodes.length) {
      ctx.addIssue({
        code: "custom",
        message: "Texture description graph node ids must be unique.",
        path: ["nodes"]
      });
    }
    for (const [index, edge] of graph.edges.entries()) {
      if (!nodeIds.has(edge.from)) {
        ctx.addIssue({
          code: "custom",
          message: `Edge from unknown node id: ${edge.from}`,
          path: ["edges", index, "from"]
        });
      }
      if (!nodeIds.has(edge.to)) {
        ctx.addIssue({
          code: "custom",
          message: `Edge to unknown node id: ${edge.to}`,
          path: ["edges", index, "to"]
        });
      }
    }
  });

export type TextureDescriptionGraph = z.infer<typeof TextureDescriptionGraphSchema>;
export type TextureDescriptionNode = z.infer<typeof TextureDescriptionNodeSchema>;

export interface InjectedTextureDescriptionBrief {
  schemaVersion: "0.1.0";
  graph: TextureDescriptionGraph;
  contentHash: string;
  source: "research-brief";
}

export function parseTextureDescriptionGraph(input: unknown): TextureDescriptionGraph {
  return TextureDescriptionGraphSchema.parse(input);
}

/**
 * Validate and wrap a research-brief JSON payload for later material injection.
 * Does not apply materials or touch building structure.
 */
export async function injectTextureDescriptionBrief(
  input: unknown
): Promise<InjectedTextureDescriptionBrief> {
  const graph = parseTextureDescriptionGraph(input);
  return {
    schemaVersion: "0.1.0",
    graph,
    contentHash: await hashCanonicalJson(graph),
    source: "research-brief"
  };
}

export function findTextureDescriptionNode(
  graph: TextureDescriptionGraph,
  nodeId: string
): TextureDescriptionNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}
