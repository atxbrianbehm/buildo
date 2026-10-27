import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionWindowLayout } from "../core/constructionWindowVocabulary";
import { evaluateConstruction } from "../compiler/evaluateConstruction";

describe("regular whole-building opening trim", () => {
  it.each([0, 1, 2] as const)("closes every sill/lintel end with physical UVs for assembly %s", async layout => {
    const graph = withConstructionWindowLayout(createBuildingConstructionGraph(), "window", layout);
    const result = await evaluateConstruction(graph);
    const trim = result.prototypes!.filter(part => part.role === "trim");
    expect(trim.length).toBeGreaterThan(0);
    const p = graph.nodes.find(node => node.type === "AssembleWindow")!.parameters;
    const area = (points: number[][]) => points.slice(1).reduce((sum, point, i) => sum + (point[0] - points[i][0]) * (point[1] + points[i][1]) / 2, 0);
    const sectionArea = area([[0, .015], [.025, p.sillProjectionM * .8], [.045, p.sillProjectionM], [.1, p.sillProjectionM], [.14, .025]]) +
      area([[0, .025], [.012, .055], [.17, .055], [.185, .025]]);
    for (const part of trim) {
      const positions = part.positions!, normals = part.normals!, uvs = part.uvs!, indices = part.indices!;
      const edges = new Map<string, number>(), caps = [0, 0];
      const key = (id: number) => [...positions.slice(id * 3, id * 3 + 3)].join(",");
      const xs = [...positions].filter((_, i) => i % 3 === 0), left = Math.min(...xs), right = Math.max(...xs);
      let volume = 0;
      for (let i = 0; i < indices.length; i += 3) {
        const ids = [...indices.slice(i, i + 3)], v = ids.map(id => [...positions.slice(id * 3, id * 3 + 3)]);
        const ab = v[1].map((x, j) => x - v[0][j]), ac = v[2].map((x, j) => x - v[0][j]);
        const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        expect(cross.reduce((sum, x, j) => sum + x * normals[ids[0] * 3 + j], 0), `triangle ${i / 3}`).toBeGreaterThan(1e-10);
        const uv = ids.map(id => [...uvs.slice(id * 2, id * 2 + 2)]);
        expect(Math.abs((uv[1][0] - uv[0][0]) * (uv[2][1] - uv[0][1]) - (uv[1][1] - uv[0][1]) * (uv[2][0] - uv[0][0]))).toBeGreaterThan(1e-10);
        if (Math.abs(normals[ids[0] * 3]) > .99) for (const j of [1, 2]) {
          expect(uv[j][0] - uv[0][0]).toBeCloseTo(v[j][2] - v[0][2], 6);
          expect(uv[j][1] - uv[0][1]).toBeCloseTo(v[j][1] - v[0][1], 6);
        }
        for (let j = 0; j < 3; j++) {
          const edge = [key(ids[j]), key(ids[(j + 1) % 3])].sort().join("|");
          edges.set(edge, (edges.get(edge) ?? 0) + 1);
        }
        for (const [end, x] of [left, right].entries()) if (v.every(point => point[0] === x)) caps[end] += Math.abs(cross[0]) / 2;
        volume += (v[0][0] * (v[1][1] * v[2][2] - v[1][2] * v[2][1]) + v[0][1] * (v[1][2] * v[2][0] - v[1][0] * v[2][2]) + v[0][2] * (v[1][0] * v[2][1] - v[1][1] * v[2][0])) / 6;
      }
      expect([...edges.values()].every(count => count === 2)).toBe(true);
      for (const cap of caps) expect(cap).toBeCloseTo(sectionArea, 7);
      expect(volume).toBeCloseTo(sectionArea * (right - left), 7);
    }
  });
});
