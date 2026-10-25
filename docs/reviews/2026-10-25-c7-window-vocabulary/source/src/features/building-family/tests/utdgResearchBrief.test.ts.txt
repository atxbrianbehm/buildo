import { describe, expect, it } from "vitest";
import late19cUtdgBrief from "../../../../docs/research/utdg-late19c-v0.1.json";
import {
  injectTextureDescriptionBrief,
  parseTextureDescriptionGraph
} from "../utdg/textureDescriptionContracts";

describe("UTDG research brief injection", () => {
  it("validates the prepared late-19c research JSON as an injectable brief", async () => {
    const injected = await injectTextureDescriptionBrief(late19cUtdgBrief);

    expect(injected.source).toBe("research-brief");
    expect(injected.schemaVersion).toBe("0.1.0");
    expect(injected.graph.id).toBe("utdg.late19c.modular-apartment-commercial.v0.1");
    expect(injected.graph.status).toBe("research-draft");
    expect(injected.graph.nodes.length).toBeGreaterThanOrEqual(4);
    expect(injected.contentHash).toMatch(/^[a-f0-9]{64}$/i);
    expect(injected.graph.nodes.every((node) => node.metersPerTile > 0)).toBe(true);
  });

  it("rejects edges that point at unknown node ids", () => {
    const raw = {
      ...late19cUtdgBrief,
      edges: [
        ...late19cUtdgBrief.edges,
        { from: "masonry.brick.running", to: "missing.node", relation: "pairs-with" as const }
      ]
    };

    expect(() => parseTextureDescriptionGraph(raw)).toThrow(/unknown node id/i);
  });

  it("rejects non-positive metersPerTile (material scale must be physical)", () => {
    const raw = {
      ...late19cUtdgBrief,
      nodes: late19cUtdgBrief.nodes.map((node, index) =>
        index === 0 ? { ...node, metersPerTile: 0 } : node
      )
    };

    expect(() => parseTextureDescriptionGraph(raw)).toThrow();
  });
});
