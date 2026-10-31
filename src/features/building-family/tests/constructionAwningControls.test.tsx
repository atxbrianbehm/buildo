import { fireEvent, render, screen } from "@testing-library/react";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwningSupports } from "../core/constructionAwningSupportGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { ConstructionAwningControls } from "../ui/ConstructionAwningControls";

it("offers scoped placement and removal for each front bay", () => {
  const graph = withConstructionAwnings(withConstructionStorefront(createBuildingConstructionGraph(), 1), [{ bayIndex: 1, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
  const change = vi.fn();
  render(<ConstructionAwningControls graph={graph} disabled={false} onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "Add awning" })); expect(change).toHaveBeenCalledWith(0, true);
  fireEvent.change(screen.getByLabelText("Awning bay"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Remove awning" })); expect(change).toHaveBeenCalledWith(1, false);
});


it("edits dimensions only for the selected authored bay", () => {
  const graph = withConstructionAwnings(withConstructionStorefront(createBuildingConstructionGraph(), 1), [{ bayIndex: 1, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
  const change = vi.fn();
  render(<ConstructionAwningControls graph={graph} disabled={false} onChange={change} />);
  fireEvent.change(screen.getByLabelText("Awning bay"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("Awning projection"), { target: { value: "1.53" } });
  fireEvent.change(screen.getByLabelText("Awning drop"), { target: { value: "0.71" } });
  fireEvent.change(screen.getByLabelText("Awning valance height"), { target: { value: "0.3" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply awning dimensions" }));
  expect(change).toHaveBeenCalledWith(1, true, { projectionM: 1.53, dropM: 0.71, valanceHeightM: 0.3 });
});


it("edits the shared fabric explicitly and disables it for a family member", async () => {
  const graph = withConstructionAwnings(withConstructionStorefront(createBuildingConstructionGraph(), 1), [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
  const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "fabric", pattern: "striped", primary: [224, 213, 187], secondary: [69, 99, 78], physicalSizeM: [1, 1] });
  const change = vi.fn();
  const { rerender } = render(<ConstructionAwningControls graph={graph} disabled={false} onChange={() => {}} fabric={fabric} onFabricChange={change} />);
  fireEvent.change(screen.getByLabelText("Awning fabric pattern"), { target: { value: "solid" } });
  fireEvent.change(screen.getByLabelText("Awning primary color"), { target: { value: "#994422" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply awning fabric" }));
  expect(change).toHaveBeenCalledWith("solid", [153, 68, 34], [69, 99, 78]);
  rerender(<ConstructionAwningControls graph={graph} disabled={false} onChange={() => {}} fabric={fabric} fabricDisabled onFabricChange={change} />);
  expect(screen.getByRole("button", { name: "Apply awning fabric" })).toBeDisabled();
});


it("offers support rods only for the selected awning and guards family members", () => {
  const graph = withConstructionAwnings(withConstructionStorefront(createBuildingConstructionGraph(), 1), [{ bayIndex: 0, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
  const change = vi.fn();
  const { rerender } = render(<ConstructionAwningControls graph={graph} disabled={false} onChange={() => {}} onSupportChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "Add support rods" })); expect(change).toHaveBeenCalledWith(0, true);
  const supported = withConstructionAwningSupports(graph, [{ bayIndex: 0, anchorRiseM: 0.15, thicknessM: 0.03 }]);
  rerender(<ConstructionAwningControls graph={supported} disabled={false} onChange={() => {}} onSupportChange={change} supportDisabled />);
  expect(screen.getByRole("button", { name: "Remove support rods" })).toBeDisabled();
});

it("locks the combined bay and permits only its dimensions to change", () => {
  const graph = withConstructionAwningSupports(withConstructionAwnings(withConstructionStorefront(createBuildingConstructionGraph(), 1),
    [{ bayIndex: 1, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]), [{ bayIndex: 1, anchorRiseM: 0.15, thicknessM: 0.03 }]);
  const change = vi.fn(), support = vi.fn();
  render(<ConstructionAwningControls graph={graph} disabled={false} onChange={change} onSupportChange={support} lockedBayIndex={1} dimensionsOnly />);
  expect(screen.getByLabelText("Awning bay")).toHaveValue("1"); expect(screen.getByLabelText("Awning bay")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove awning" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Remove support rods" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Awning projection"), { target: { value: "0.9" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply awning dimensions" }));
  expect(change).toHaveBeenCalledWith(1, true, { projectionM: 0.9, dropM: 0.55, valanceHeightM: 0.2 }); expect(support).not.toHaveBeenCalled();
});
