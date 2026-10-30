import { describe, expect, it } from "vitest";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionOpeningWidth } from "../core/constructionOpeningEditGraph";
import { resolveConstructionGroupedBay } from "../core/constructionGroupedBay";
import { hashCanonicalJson } from "../core/contentHash";
import { evaluateConstruction } from "../compiler/evaluateConstruction";
import { evaluateGroupedBayConstruction } from "../compiler/evaluateGroupedBayConstruction";

function group(count: 2 | 3 = 2) { return resolveConstructionGroupedBay({ schemaVersion: "0.1.0", kind: "construction-grouped-bay-request",
  scope: { id: "facade/floor/1/bay/0", face: "front", floorIndex: 1, bayIndex: 0,
    originM: [-5.6, 4, -0.36], sizeM: [2.8, 3.7, 0.36] },
  parameters: { memberCount: count, memberWidthM: count === 2 ? 0.9 : 0.65, heightM: 2.12, sillM: 0.78,
    pierWidthM: 0.24, frameWidthM: 0.055, recessM: 0.14 } }); }
function request(count: 2 | 3 = 2) { return { schemaVersion: "0.1.0", kind: "construction-grouped-geometry-request",
  graph: createBuildingConstructionGraph(), groups: [group(count)] }; }

describe("grouped bay compiler", () => {
  it.each([2, 3] as const)("cuts %i separate apertures, retaining masonry piers and member frames", async count => {
    const input = request(count), { source, result } = await evaluateGroupedBayConstruction(input);
    const wall = result.ir.meshBatches.find(batch => batch.role === "wall" && batch.batchId.includes("/facade/"))!;
    const covers = (x: number, y: number) => {
      const p = wall.positions!, indices = wall.indices!;
      for (let i = 0; i < indices.length; i += 3) {
        const v = [...indices.slice(i, i + 3)].map(index => [p[index*3], p[index*3+1], p[index*3+2]]);
        if (v.some(vertex => Math.abs(vertex[2] + 4.2) > 1e-5)) continue;
        const cross = (a: number[], b: number[]) => (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);
        const signs = [cross(v[0],v[1]),cross(v[1],v[2]),cross(v[2],v[0])];
        if (signs.every(n=>n>=-1e-7) || signs.every(n=>n<=1e-7)) return true;
      }
      return false;
    };
    for (const member of source.groups[0].members) {
      expect(covers(member.centerAlongM, member.centerYM)).toBe(false);
      for (const role of ["frame", "glass", "trim"]) {
        const entry = result.ir.semanticIndex.find(x => x.semanticPath.includes(`${member.id}/${role}`));
        expect(entry).toBeDefined();
        const batch = result.ir.instanceBatches.find(x => x.batchId === entry!.batchId)!;
        expect(batch.transforms![entry!.elementIndex! * 16 + 12]).toBeCloseTo(member.centerAlongM);
      }
    }
    for (let i = 1; i < count; i++) expect(covers((source.groups[0].members[i-1].centerAlongM + source.groups[0].members[i].centerAlongM)/2, 5.8)).toBe(true);
    expect(result.ir.sourceGraphHash).toBe(await hashCanonicalJson(source));
    expect((await evaluateGroupedBayConstruction(JSON.parse(JSON.stringify(source)))).result.ir.semanticIndex).toEqual(result.ir.semanticIndex);
  });
  it("retains the original compile path and material bindings", async () => {
    const input = request(), before = await evaluateConstruction(input.graph), grouped = await evaluateGroupedBayConstruction(input), after = await evaluateConstruction(input.graph);
    expect(after.ir).toEqual(before.ir);
    expect(new Set(grouped.result.ir.instanceBatches.map(batch => batch.materialSlotId))).toEqual(new Set(before.ir.instanceBatches.map(batch => batch.materialSlotId)));
    expect(grouped.result.ir.sourceGraphHash).not.toBe(before.ir.sourceGraphHash);
  });
  it("keeps member identities and unaffected neighboring transforms when the group width changes", async () => {
    const input = request(), first = (await evaluateGroupedBayConstruction(input)).result;
    input.groups[0] = resolveConstructionGroupedBay({ ...input.groups[0].source,
      parameters: { ...input.groups[0].source.parameters, memberWidthM: 0.8 } });
    const second = (await evaluateGroupedBayConstruction(input)).result;
    const paths = (result: typeof first) => result.ir.semanticIndex.filter(x => x.semanticPath.includes("/bay/0/opening/")).map(x => x.semanticPath);
    expect(paths(first)).toEqual(paths(second));
    const transform = (result: typeof first, path: string) => {
      const entry = result.ir.semanticIndex.find(x => x.semanticPath.includes(path) && x.semanticPath.endsWith("/frame"))!;
      const batch = result.ir.instanceBatches.find(x => x.batchId === entry.batchId)!;
      return [...batch.transforms!.slice(entry.elementIndex! * 16, entry.elementIndex! * 16 + 16)];
    };
    expect(transform(first, "/bay/1/")).toEqual(transform(second, "/bay/1/"));
    expect(transform(first, "/bay/0/opening/0/")).not.toEqual(transform(second, "/bay/0/opening/0/"));
  });
  it("rejects a parent-bay width override instead of applying it ambiguously", async () => {
    const input = request(); input.graph = withConstructionOpeningWidth(input.graph, { target: { documentId: "authored-building", storeysNodeId: "facade",
      windowNodeId: "window", face: "front", floorIndex: 1, bayIndex: 0 }, widthM: 1 });
    await expect(evaluateGroupedBayConstruction(input)).rejects.toThrow(/missing or ambiguous/);
  });
  it("keeps the existing 256-scope budget after expanding groups", async () => {
    const input = request();
    const footprint = input.graph.nodes.find(node => node.type === "Footprint")!, storeys = input.graph.nodes.find(node => node.type === "Storeys")!, bays = input.graph.nodes.find(node => node.type === "SplitBays")!;
    footprint.parameters.widthM = 60; footprint.parameters.depthM = 60; storeys.parameters.count = 4; bays.parameters.count = 16;
    input.groups[0] = resolveConstructionGroupedBay({ ...input.groups[0].source,
      scope: { ...input.groups[0].source.scope, originM: [-30, 4, -0.36], sizeM: [3.75, 3.7, 0.36] } });
    await expect(evaluateGroupedBayConstruction(input)).rejects.toThrow(/256 scopes after grouping/);
  });
  it("rejects mismatched or tampered source, missing scopes and duplicate groups", async () => {
    const mismatch = request(); mismatch.groups[0].source.scope.sizeM[0] = 3;
    await expect(evaluateGroupedBayConstruction(mismatch)).rejects.toThrow();
    const missing = request(); missing.groups[0] = resolveConstructionGroupedBay({ ...missing.groups[0].source, scope: { ...missing.groups[0].source.scope, id: "missing" } });
    await expect(evaluateGroupedBayConstruction(missing)).rejects.toThrow(/missing from the executed/);
    const duplicate = request(); duplicate.groups.push(duplicate.groups[0]);
    await expect(evaluateGroupedBayConstruction(duplicate)).rejects.toThrow(/unique/);
    const noWall = request(); const wall = noWall.graph.nodes.find(node => node.type === "EmitWall")!; wall.bypassed = true;
    await expect(evaluateGroupedBayConstruction(noWall)).rejects.toThrow(/matching wall aperture/);
    const narrow = request(); narrow.groups[0] = resolveConstructionGroupedBay({ ...narrow.groups[0].source,
      parameters: { ...narrow.groups[0].source.parameters, pierWidthM: 0.16 } });
    await expect(evaluateGroupedBayConstruction(narrow)).rejects.toThrow(/between openings for separate trim/);
    const edge = request(); edge.groups[0] = resolveConstructionGroupedBay({ ...edge.groups[0].source,
      parameters: { ...edge.groups[0].source.parameters, memberWidthM: 1.18 } });
    await expect(evaluateGroupedBayConstruction(edge)).rejects.toThrow(/outer masonry/);
  });
});
