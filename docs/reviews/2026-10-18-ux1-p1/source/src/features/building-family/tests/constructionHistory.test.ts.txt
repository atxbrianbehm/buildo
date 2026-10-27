import { createBayConstructionGraph } from "../contracts/bayConstructionGraph";
import { ConstructionHistory, ConstructionHistorySnapshotSchema } from "../state/constructionHistory";
const library = "a".repeat(64);
function graph(width: number) {
  const value = createBayConstructionGraph(); value.nodes.find(node => node.type === "FacadeScope")!.parameters.widthM = width; return value;
}
it("owns accepted source and moves undo/redo only after the target is accepted", () => {
  const history = new ConstructionHistory(), first = graph(2.8);
  history.record(first, library); history.record(graph(3), library);
  first.nodes.find(node => node.type === "FacadeScope")!.parameters.widthM = 9;
  expect(history.undoCount).toBe(1);
  const target = history.target("undo")!;
  expect(target.nodes.find(node => node.type === "FacadeScope")!.parameters.widthM).toBe(2.8);
  expect(history.undoCount).toBe(1);
  expect(() => history.acceptTraversal("undo", graph(4))).toThrow("before the source was accepted");
  history.acceptTraversal("undo", target); expect(history.canRedo).toBe(true);
  history.acceptTraversal("redo", history.target("redo")!); expect(history.canRedo).toBe(false);
  expect(() => { target.nodes.length = 0; }).toThrow();
});
it("preserves redo for no-ops and clears it for a new accepted branch", () => {
  const history = new ConstructionHistory(); history.record(graph(2.8), library); history.record(graph(3), library);
  history.acceptTraversal("undo", history.target("undo")!);
  expect(history.record(graph(2.8), library)).toBe(false); expect(history.canRedo).toBe(true);
  history.record(graph(3.4), library); expect(history.canRedo).toBe(false); expect(history.undoCount).toBe(1);
});
it("bounds source history and resets it when another material library or file is opened", () => {
  const history = new ConstructionHistory();
  for (let i = 0; i < 70; i++) history.record(graph(2.8 + i * 0.01), library);
  expect(history.undoCount).toBe(63);
  history.record(graph(4), "b".repeat(64)); expect(history.canUndo).toBe(false);
  history.record(graph(5), "b".repeat(64)); history.record(graph(5), "b".repeat(64), true);
  expect(history.canUndo).toBe(false);
});
it("validates and owns versioned session snapshots without invoking accessors", () => {
  const history = new ConstructionHistory(); history.record(graph(2.8), library); history.record(graph(3), library);
  const payload = JSON.parse(JSON.stringify(history.snapshot()));
  const restored = new ConstructionHistory(payload); payload.entries[1].nodes[0].parameters.widthM = 8;
  expect(restored.current).toEqual(graph(3)); expect(restored.undoCount).toBe(1);
  expect(ConstructionHistorySnapshotSchema.safeParse({ ...history.snapshot(), cursor: 999 }).success).toBe(false);
  let reads = 0; const unsafe = { ...history.snapshot() };
  Object.defineProperty(unsafe, "entries", { enumerable: true, get() { reads++; throw new Error("getter"); } });
  expect(ConstructionHistorySnapshotSchema.safeParse(unsafe).success).toBe(false); expect(reads).toBe(0);
});
