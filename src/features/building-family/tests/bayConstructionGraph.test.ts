import { BayConstructionGraphSchema, createBayConstructionGraph, type BayConstructionGraph } from "../contracts/bayConstructionGraph";
import { evaluateBayConstruction } from "../compiler/evaluateBayConstruction";
import type { RuntimeBuildingIR } from "../contracts/runtimeBuildingIR";

function node<T extends BayConstructionGraph["nodes"][number]["type"]>(graph: BayConstructionGraph, type: T) {
  return graph.nodes.find(candidate => candidate.type === type) as Extract<BayConstructionGraph["nodes"][number], { type: T }>;
}
function geometry(ir: RuntimeBuildingIR) {
  return ir.meshBatches.map(batch => ({ id: batch.batchId, positions: [...batch.positions!],
    normals: [...batch.normals!], uvs: [...batch.uvs!], indices: [...batch.indices!] }));
}
function wallCovers(ir: RuntimeBuildingIR, x: number, y: number): boolean {
  const wall = ir.meshBatches.find(batch => batch.role === "wall")!;
  const positions = wall.positions!, indices = wall.indices!;
  for (let i = 0; i < indices.length; i += 3) {
    const p = [indices[i], indices[i + 1], indices[i + 2]].map(index => [positions[index * 3], positions[index * 3 + 1]]);
    const denominator = (p[1][1] - p[2][1]) * (p[0][0] - p[2][0]) + (p[2][0] - p[1][0]) * (p[0][1] - p[2][1]);
    if (Math.abs(denominator) < 1e-9) continue;
    const a = ((p[1][1] - p[2][1]) * (x - p[2][0]) + (p[2][0] - p[1][0]) * (y - p[2][1])) / denominator;
    const b = ((p[2][1] - p[0][1]) * (x - p[2][0]) + (p[0][0] - p[2][0]) * (y - p[2][1])) / denominator;
    if (a >= -1e-6 && b >= -1e-6 && a + b <= 1 + 1e-6) return true;
  }
  return false;
}

describe("authored bay graph admission", () => {
  it("roundtrips validated source without a spec or prompt", () => {
    const graph = createBayConstructionGraph();
    expect(BayConstructionGraphSchema.parse(JSON.parse(JSON.stringify(graph)))).toEqual(graph);
  });
  it.each(["unknown-operator", "unknown-field", "non-finite", "missing-node", "wrong-socket", "duplicate-id", "duplicate-input", "cycle", "wrong-output"])(
    "rejects %s instead of falling through to the fixed compiler", kind => {
      const graph = createBayConstructionGraph();
      const facade = node(graph, "FacadeScope"), opening = node(graph, "PlaceOpening"), output = node(graph, "Output");
      switch (kind) {
        case "unknown-operator": Object.assign(facade, { type: "GuessMesh" }); break;
        case "unknown-field": Object.assign(facade.parameters, { fakeDetail: 12 }); break;
        case "non-finite": facade.parameters.widthM = Infinity; break;
        case "missing-node": opening.input.nodeId = "missing"; break;
        case "wrong-socket": opening.input.nodeId = "wall"; break;
        case "duplicate-id": opening.id = facade.id; break;
        case "duplicate-input": output.inputs.push({ ...output.inputs[0] }); break;
        case "cycle": opening.input.nodeId = opening.id; break;
        case "wrong-output": graph.outputNodeId = facade.id; break;
      }
      expect(BayConstructionGraphSchema.safeParse(graph).success).toBe(false);
    }
  );
});

describe("connected bay construction", () => {
  it("builds separately stepped sash panes and outward-facing bevels inside the wall", async () => {
    const { ir } = await evaluateBayConstruction(createBayConstructionGraph());
    const frame = ir.meshBatches.find(batch => batch.role === "frame")!, glass = ir.meshBatches.find(batch => batch.role === "glass")!;
    const depths = [...glass.positions!].filter((_, i) => i % 3 === 2);
    expect(new Set(depths.map(value => value.toFixed(5))).size).toBe(4); // front/back of two distinct panes
    expect(Math.max(...depths) - Math.min(...depths)).toBeCloseTo(0.042);
    expect(Math.max(...[...frame.positions!].filter((_, i) => i % 3 === 2))).toBeCloseTo(0.22);
    expect([...frame.normals!].some(value => Math.abs(value) > 0.6 && Math.abs(value) < 0.8)).toBe(true);
    for (let i = 0; i < frame.indices!.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map(j => {
        const offset = frame.indices![i + j] * 3;
        return [...frame.positions!.slice(offset, offset + 3)];
      });
      const ab = b.map((v, axis) => v - a[axis]), ac = c.map((v, axis) => v - a[axis]);
      const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const normal = frame.normals!.slice(frame.indices![i] * 3, frame.indices![i] * 3 + 3);
      expect(cross.reduce((sum, value, axis) => sum + value * normal[axis], 0)).toBeGreaterThan(0);
    }
  });
  it("keeps masonry UV phase continuous across every wall panel", async () => {
    const { ir } = await evaluateBayConstruction(createBayConstructionGraph());
    const wall = ir.meshBatches.find(batch => batch.role === "wall")!;
    for (let vertex = 0; vertex < wall.positions!.length / 3; vertex++) {
      const i = vertex * 3;
      if (Math.abs(wall.normals![i + 2]) < 0.9) continue;
      expect(wall.uvs![vertex * 2]).toBeCloseTo(wall.positions![i]);
      expect(wall.uvs![vertex * 2 + 1]).toBeCloseTo(wall.positions![i + 1]);
    }
  });
  it("rejects a window behind an uncut wall instead of publishing conflicting layouts", async () => {
    const graph = createBayConstructionGraph();
    node(graph, "EmitWall").input.nodeId = "facade";
    await expect(evaluateBayConstruction(graph)).rejects.toThrow("same opening layout");
  });
  it("executes reachable nodes deterministically into actual geometry", async () => {
    const graph = createBayConstructionGraph();
    const first = await evaluateBayConstruction(graph), second = await evaluateBayConstruction(graph);
    expect(first).toEqual(second);
    expect(first.ir.meshBatches.map(batch => batch.role)).toEqual(["wall", "frame", "glass", "trim"]);
    expect(first.trace.map(entry => entry.nodeId)).toEqual(["facade", "opening", "wall", "window", "output"]);
    expect(first.ir.metrics.triangleCount).toBeGreaterThan(100);
    for (const batch of first.ir.meshBatches) {
      expect([...batch.positions!, ...batch.normals!, ...batch.uvs!].every(Number.isFinite)).toBe(true);
      expect(Math.max(...batch.indices!)).toBeLessThan(batch.positions!.length / 3);
    }
  });
  it("footprint parameters change submitted vertices, not only a provenance hash", async () => {
    const graph = createBayConstructionGraph(), before = await evaluateBayConstruction(graph);
    node(graph, "FacadeScope").parameters.widthM = 3.4;
    const after = await evaluateBayConstruction(graph);
    expect(after.ir.bounds.max[0]).toBeCloseTo(1.7);
    expect(geometry(after.ir)).not.toEqual(geometry(before.ir));
    expect(after.ir.meshBatches.find(batch => batch.role === "frame")).toEqual(before.ir.meshBatches.find(batch => batch.role === "frame"));
  });
  it("one opening layout drives both the wall hole and window", async () => {
    const graph = createBayConstructionGraph();
    const before = await evaluateBayConstruction(graph);
    expect(wallCovers(before.ir, 0, 1.5)).toBe(false);
    expect(wallCovers(before.ir, 0.7, 1.5)).toBe(true);
    node(graph, "PlaceOpening").parameters.widthM = 1.6;
    const after = await evaluateBayConstruction(graph);
    expect(wallCovers(after.ir, 0.7, 1.5)).toBe(false);
    expect(geometry(after.ir)).not.toEqual(geometry(before.ir));
    const frame = after.ir.meshBatches.find(batch => batch.role === "frame")!;
    expect(Math.max(...[...frame.positions!].filter((_, i) => i % 3 === 0))).toBeCloseTo(0.8);
  });
  it("disconnecting the window contribution removes frame, glass and trim", async () => {
    const graph = createBayConstructionGraph();
    node(graph, "Output").inputs = [{ nodeId: "wall", socket: "geometry" }];
    const result = await evaluateBayConstruction(graph);
    expect(result.ir.meshBatches.map(batch => batch.role)).toEqual(["wall"]);
    expect(result.trace.some(entry => entry.nodeId === "window")).toBe(false);
    expect(wallCovers(result.ir, 0, 1.5)).toBe(false);
  });
  it("rewiring the wall to the original scope closes the aperture", async () => {
    const graph = createBayConstructionGraph();
    node(graph, "EmitWall").input.nodeId = "facade";
    node(graph, "Output").inputs = [{ nodeId: "wall", socket: "geometry" }];
    const result = await evaluateBayConstruction(graph);
    expect(wallCovers(result.ir, 0, 1.5)).toBe(true);
    expect(result.trace.map(entry => entry.nodeId)).toEqual(["facade", "wall", "output"]);
    expect(result.ir.metrics.triangleCount).toBe(12);
  });
  it("recess changes actual window depth while retaining the wall", async () => {
    const graph = createBayConstructionGraph(), before = await evaluateBayConstruction(graph);
    node(graph, "AssembleWindow").parameters.recessM = 0.23;
    const after = await evaluateBayConstruction(graph);
    expect(after.ir.meshBatches[0]).toEqual(before.ir.meshBatches[0]);
    for (const role of ["frame", "glass"]) {
      const old = before.ir.meshBatches.find(batch => batch.role === role)!, next = after.ir.meshBatches.find(batch => batch.role === role)!;
      for (let i = 0; i < next.positions!.length; i++) {
        expect(next.positions![i]).toBeCloseTo(old.positions![i] + (i % 3 === 2 ? 0.09 : 0), 6);
      }
    }
  });
  it("material assignment changes slots while retaining all geometry arrays", async () => {
    const graph = createBayConstructionGraph(), before = await evaluateBayConstruction(graph);
    const after = await evaluateBayConstruction(graph, { wall: "brick", frame: "paint", glass: "glass", trim: "stone" });
    expect(geometry(after.ir)).toEqual(geometry(before.ir));
    expect(after.ir.meshBatches.map(batch => batch.materialSlotId)).toEqual(["brick", "paint", "glass", "stone"]);
  });
  it.each(["too-wide", "too-tall", "too-deep", "no-opening"])("rejects an impossible %s layout", async kind => {
    const graph = createBayConstructionGraph();
    if (kind === "too-wide") node(graph, "PlaceOpening").parameters.widthM = 2.7;
    if (kind === "too-tall") node(graph, "PlaceOpening").parameters.heightM = 3.2;
    if (kind === "too-deep") node(graph, "AssembleWindow").parameters.recessM = 0.34;
    if (kind === "no-opening") node(graph, "AssembleWindow").input.nodeId = "facade";
    await expect(evaluateBayConstruction(graph)).rejects.toThrow();
  });
  it("owns instructions before the hashing await and never mutates input", async () => {
    const graph = createBayConstructionGraph(), original = structuredClone(graph);
    const pending = evaluateBayConstruction(graph);
    node(graph, "FacadeScope").parameters.widthM = 99;
    const result = await pending;
    expect(result.graph).toEqual(original);
    expect(result.ir.bounds.max[0]).toBeCloseTo(1.4);
  });
});

