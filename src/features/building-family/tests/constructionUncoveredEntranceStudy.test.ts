import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { withConstructionStorefrontSign } from "../core/constructionStorefrontSignGraph";
import { withConstructionSignAwningClearance } from "../core/constructionSignAwningGraph";
import { assertUncoveredEntranceLocks, resolveConstructionUncoveredEntranceStudy } from "../core/constructionUncoveredEntranceStudy";
import { evaluateConstruction } from "../compiler/evaluateConstruction";

it("replays uncovered entrances while retaining signed awnings and their supports", async () => {
  const storefront = withConstructionStorefront(createBuildingConstructionGraph("entrance_study"), 1);
  const awnings = withConstructionAwnings(storefront, [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
  const supports = withConstructionAwningSupports(awnings, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
  const graph = withConstructionSignAwningClearance(withConstructionStorefrontSign(supports, { bayIndex: 0, heightM: 0.18, projectionM: 0.08, frameWidthM: 0.035 }), 0.04);
  const source = { schemaVersion: "0.1.0", kind: "construction-uncovered-entrance-study", familySeed: "entrance-demo", openingLock: false, graph };
  const snapshot = structuredClone(source), result = resolveConstructionUncoveredEntranceStudy(source);
  expect(resolveConstructionUncoveredEntranceStudy(JSON.parse(JSON.stringify(source)))).toEqual(result);
  expect(source).toEqual(snapshot); expect(result.availableBays).toEqual([1, 2, 3]);
  expect(result.availableBays).toContain(result.selectedBay);
  const expected = structuredClone(graph); expected.nodes.find(node => node.type === "PlaceDoor")!.parameters.bayIndex = result.selectedBay;
  expect(result.graph).toEqual(expected);
  const variants = Array.from({ length: 12 }, (_, index) => resolveConstructionUncoveredEntranceStudy({ ...source, familySeed: `demo-${index}` }));
  expect(new Set(variants.map(variant => variant.selectedBay)).size).toBeGreaterThan(1);
  const compiled = await Promise.all(variants.map(variant => evaluateConstruction(variant.graph)));
  const doors = compiled.map(item => Array.from(item.ir.meshBatches.find(batch => batch.batchId.endsWith("/leaf"))!.positions!));
  expect(new Set(doors.map(positions => JSON.stringify(positions))).size).toBeGreaterThan(1);
  expect(() => resolveConstructionUncoveredEntranceStudy({ ...source, openingLock: true })).toThrow(/Unlock openings/);
  expect(() => resolveConstructionUncoveredEntranceStudy({ ...source, graph: createBuildingConstructionGraph() })).toThrow(/active storefront/);
  const covered = withConstructionAwnings(storefront, [0, 1, 2, 3].map(bayIndex => ({ bayIndex, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 })));
  expect(() => resolveConstructionUncoveredEntranceStudy({ ...source, graph: covered })).toThrow(/bay without an authored awning/);
}, 120000);

it("protects entrance and frontage pins without blocking unrelated architectural locks", () => {
  for (const semanticPath of ["construction", "construction/entrance", "construction/entrance/bayIndex", "construction/door/bayIndex", "construction/opening/entrance/bayIndex", "construction/frontage/mode"])
    expect(() => assertUncoveredEntranceLocks([{ semanticPath }])).toThrow(/pinned lock/);
  expect(() => assertUncoveredEntranceLocks([{ semanticPath: "construction/roof/parapetHeightM" }])).not.toThrow();
});
