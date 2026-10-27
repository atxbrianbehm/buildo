import { describe, expect, it } from "vitest";
import { ConstructionCorniceDetailRequestSchema, type ConstructionCorniceDetailRequest } from "../contracts/constructionCorniceDetail";
import { resolveConstructionCorniceDetail, readConstructionCorniceDetailPlan } from "../core/constructionCorniceDetail";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { evaluateConstruction } from "../compiler/evaluateConstruction";

const request = (assembly: ConstructionCorniceDetailRequest["assembly"] = "dentil-course"): ConstructionCorniceDetailRequest => ({
  schemaVersion: "0.1.0", kind: "construction-cornice-detail-request", assembly,
  building: { widthM: 11.2, depthM: 13, heightM: 12 }, cornice: { heightM: .3, projectionM: .24 }
});
const plan = (assembly: ConstructionCorniceDetailRequest["assembly"] = "dentil-course") => resolveConstructionCorniceDetail(request(assembly));
function frontDepth(profile: Array<{ yM: number; depthM: number }>, y: number) {
  for (let i = 0; i < profile.length - 2; i++) {
    const a = profile[i], b = profile[i + 1];
    if (y >= a.yM - 1e-10 && y <= b.yM + 1e-10) return a.depthM + (b.depthM - a.depthM) * (y - a.yM) / (b.yM - a.yM);
  }
  throw new Error("Sample outside the cornice envelope");
}

describe("pure cornice detail planning", () => {
  it.each(["moulded", "dentil-course", "bracket-course"] as const)("owns, serializes and rederives %s", assembly => {
    const source = request(assembly), before = structuredClone(source), result = resolveConstructionCorniceDetail(source);
    expect(source).toEqual(before); expect(result.source).not.toBe(source); expect(result.source.building).not.toBe(source.building);
    expect(resolveConstructionCorniceDetail(source)).toEqual(result);
    const decoded = readConstructionCorniceDetailPlan(JSON.parse(JSON.stringify(result)));
    expect(decoded).toEqual(result); expect(decoded).not.toBe(result);
    result.backingProfile[0].depthM = .1; expect(result.envelopeProfile[0].depthM).toBe(0);
    result.source.building.widthM = 20; expect(source).toEqual(before);
  });

  it.each([[.1, .08], [.3, .24], [.6, .4]])("matches the actual existing cornice envelope at %s/%s", async (heightM, projectionM) => {
    const graph = createBuildingConstructionGraph(), footprint = graph.nodes.find(node => node.type === "Footprint")!.parameters;
    const storeys = graph.nodes.find(node => node.type === "Storeys")!.parameters, roof = graph.nodes.find(node => node.type === "BuildingRoof")!;
    roof.parameters.corniceHeightM = heightM; roof.parameters.corniceProjectionM = projectionM;
    const source = request("moulded"); source.building = { widthM: footprint.widthM, depthM: footprint.depthM,
      heightM: storeys.groundHeightM + (storeys.count - 1) * storeys.upperHeightM }; source.cornice = { heightM, projectionM };
    const result = resolveConstructionCorniceDetail(source), compiled = await evaluateConstruction(graph);
    const positions = compiled.ir.meshBatches.find(batch => batch.batchId.endsWith("/node/roof/building/cornice"))!.positions!;
    for (const point of result.envelopeProfile) expect([...positions].some((_, i) => i % 3 === 0 &&
      Math.abs(positions[i] + footprint.widthM / 2 + point.depthM) < 1e-5 && Math.abs(positions[i + 1] - point.yM) < 1e-5 &&
      Math.abs(positions[i + 2] + footprint.depthM / 2 + point.depthM) < 1e-5)).toBe(true);
    expect(result.backingProfile).toEqual(result.envelopeProfile); expect(result.recipe.kind).toBe("none"); expect(result.units).toEqual([]);
  });

  it.each(["dentil-course", "bracket-course"] as const)("balances %s on all four faces with corner clearance and physical gaps", assembly => {
    const result = plan(assembly); expect(result.recipe.kind).not.toBe("none");
    if (result.recipe.kind === "none") throw new Error("Expected repeated units");
    const width = result.recipe.widthM;
    expect(result.faces.map(face => face.face)).toEqual(["front", "right", "rear", "left"]);
    expect(result.units.length).toBe(result.faces.reduce((sum, face) => sum + face.count, 0));
    expect(new Set(result.units.map(unit => unit.id)).size).toBe(result.units.length);
    for (const face of result.faces) {
      const units = result.units.filter(unit => unit.face === face.face); expect(units).toHaveLength(face.count);
      expect(face.spanM).toBe(face.face === "front" || face.face === "rear" ? 11.2 : 13);
      expect(face.marginM).toBeGreaterThanOrEqual(face.endInsetM - 1e-10);
      expect(units[0].centerAlongM - width / 2).toBeGreaterThanOrEqual(-face.spanM / 2 + face.endInsetM - 1e-10);
      expect(units.at(-1)!.centerAlongM + width / 2).toBeLessThanOrEqual(face.spanM / 2 - face.endInsetM + 1e-10);
      for (const [i, unit] of units.entries()) {
        expect(unit.id).toBe(`${face.face}/${i}`); expect(unit.ordinal).toBe(i);
        expect(unit.centerAlongM + units[units.length - 1 - i].centerAlongM).toBe(0);
        if (i) expect(unit.centerAlongM - units[i - 1].centerAlongM - width).toBeCloseTo(face.pitchM - width, 10);
      }
    }
  });

  it.each([[.1, .08], [.3, .24], [.6, .4]])("keeps carved backing and bracket segments inside the original solid at %s/%s", (heightM, projectionM) => {
    for (const assembly of ["dentil-course", "bracket-course"] as const) {
      const source = request(assembly); source.building.widthM = source.building.depthM = 3; source.cornice = { heightM, projectionM };
      const result = resolveConstructionCorniceDetail(source);
      for (const point of result.backingProfile) expect(point.depthM).toBeLessThanOrEqual(frontDepth(result.envelopeProfile, point.yM) + 1e-10);
      if (result.recipe.kind === "dentil") {
        expect(result.recipe.topM).toBeGreaterThan(result.recipe.bottomM);
        expect(result.recipe.frontDepthM).toBeLessThanOrEqual(frontDepth(result.envelopeProfile, result.recipe.bottomM) + 1e-10);
        expect(result.recipe.bevelM).toBeGreaterThan(0); expect(result.recipe.backDepthM).toBeGreaterThan(0);
      } else if (result.recipe.kind === "bracket") for (let i = 1; i < result.recipe.profile.length; i++) {
        const a = result.recipe.profile[i - 1], b = result.recipe.profile[i]; expect(b.yM).toBeGreaterThan(a.yM);
        for (let sample = 0; sample <= 16; sample++) {
          const t = sample / 16, y = a.yM + (b.yM - a.yM) * t, depth = a.depthM + (b.depthM - a.depthM) * t;
          expect(depth).toBeGreaterThan(result.recipe.backDepthM);
          expect(depth).toBeLessThanOrEqual(frontDepth(result.envelopeProfile, y) + 1e-10);
        }
      }
    }
  });

  it("fits exactly one unit, rejects a genuinely short span without changing source, and bounds allocation", () => {
    const source = request(), width = source.cornice.heightM * .65;
    source.building.widthM = width + Math.max(width, source.cornice.projectionM);
    const tight = resolveConstructionCorniceDetail(source); expect(tight.faces[0].count).toBe(1); expect(tight.units[0].centerAlongM).toBe(0);
    source.building.widthM -= .00001; const before = structuredClone(source);
    expect(() => resolveConstructionCorniceDetail(source)).toThrow(/corner clearances/); expect(source).toEqual(before);
    const boundary = request(); boundary.building.widthM = boundary.building.depthM = 127 * width * 2 + width + .24;
    expect(resolveConstructionCorniceDetail(boundary).units).toHaveLength(512);
    boundary.building.widthM += width * 2; expect(() => resolveConstructionCorniceDetail(boundary)).toThrow(/512-unit/);
  });

  it.each(["dentil-course", "bracket-course"] as const)("rejects unfit and over-budget %s without clamping", assembly => {
    const source = request(assembly); source.building.depthM = .02;
    expect(() => resolveConstructionCorniceDetail(source)).toThrow(/right face/);
    source.building.widthM = source.building.depthM = 100; source.cornice.heightM = .1;
    expect(() => resolveConstructionCorniceDetail(source)).toThrow(/512-unit/);
    source.assembly = "moulded"; expect(resolveConstructionCorniceDetail(source).units).toEqual([]);
  });

  it("changes repeats only with their physical span and translates profiles with the wall top", () => {
    const source = request(), before = resolveConstructionCorniceDetail(source);
    source.building.widthM += 2; const wider = resolveConstructionCorniceDetail(source);
    expect(wider.faces[0].count).toBeGreaterThan(before.faces[0].count); expect(wider.faces[1]).toEqual(before.faces[1]);
    source.building.heightM += 3; const taller = resolveConstructionCorniceDetail(source);
    expect(taller.units).toEqual(wider.units); expect(taller.faces).toEqual(wider.faces);
    for (const [i, point] of taller.envelopeProfile.entries()) expect(point.yM - wider.envelopeProfile[i].yM).toBeCloseTo(3, 10);
  });

  it.each([0, -1, NaN, Infinity, 101, "12", null])("rejects malformed physical width %s", value => {
    const source = request(); Object.assign(source.building, { widthM: value });
    expect(() => resolveConstructionCorniceDetail(source)).toThrow();
  });
  it("rejects wrong versions, kinds, treatment, fields and invalid cornice dimensions", () => {
    for (const patch of [{ schemaVersion: "0.2.0" }, { kind: "cornice" }, { assembly: "historic" }, { material: "stone" }])
      expect(ConstructionCorniceDetailRequestSchema.safeParse({ ...request(), ...patch }).success).toBe(false);
    for (const cornice of [{ heightM: .09, projectionM: .24 }, { heightM: .61, projectionM: .24 }, { heightM: .3, projectionM: .07 }, { heightM: .3, projectionM: .41 }])
      expect(() => resolveConstructionCorniceDetail({ ...request(), cornice })).toThrow();
    expect(() => resolveConstructionCorniceDetail({ ...request(), building: { widthM: 10, depthM: 10, heightM: .2 } })).toThrow(/wall top/);
  });

  it.each(["cadence", "unit", "address", "ordering", "backing", "envelope", "recipe", "source", "budget"])("rejects tampered %s", field => {
    const result = plan();
    if (field === "cadence") result.faces[0].count--;
    if (field === "unit") result.units[0].centerAlongM += .001;
    if (field === "address") result.units[0].ordinal++;
    if (field === "ordering") result.units.reverse();
    if (field === "backing") result.backingProfile[2].depthM += .001;
    if (field === "envelope") result.envelopeProfile[1].yM += .001;
    if (field === "recipe" && result.recipe.kind === "dentil") result.recipe.widthM += .001;
    if (field === "source") result.source.cornice.projectionM += .01;
    if (field === "budget") Object.assign(result, { unitBudget: 513 });
    expect(() => readConstructionCorniceDetailPlan(result)).toThrow();
  });
  it("rejects accessors and non-JSON source before invoking supplied code", () => {
    let calls = 0; const source = Object.defineProperty(request(), "assembly", { enumerable: true, get() { calls++; return "dentil-course"; } });
    expect(() => resolveConstructionCorniceDetail(source)).toThrow(); expect(calls).toBe(0);
    const cyclic = Object.assign(request(), { self: null as unknown }); cyclic.self = cyclic;
    expect(() => resolveConstructionCorniceDetail(cyclic)).toThrow();
    expect(() => resolveConstructionCorniceDetail({ ...request(), building: new Date() })).toThrow();
  });
});
