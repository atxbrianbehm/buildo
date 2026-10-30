import { fireEvent, render, screen } from "@testing-library/react";
import { createBuildingConstructionGraph } from "../contracts/bayConstructionGraph";
import { withConstructionStorefront } from "../core/constructionStorefrontGraph";
import { withConstructionAwnings } from "../core/constructionAwningGraph";
import { ConstructionAwningControls } from "../ui/ConstructionAwningControls";

it("offers scoped placement and removal for each front bay", () => {
  const graph = withConstructionAwnings(withConstructionStorefront(createBuildingConstructionGraph(), 1), [{ bayIndex: 1, projectionM: 1, dropM: 0.55, valanceHeightM: 0.2 }]);
  const change = vi.fn();
  render(<ConstructionAwningControls graph={graph} disabled={false} onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "Add awning" })); expect(change).toHaveBeenCalledWith(0, true);
  fireEvent.change(screen.getByLabelText("Awning bay"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Remove awning" })); expect(change).toHaveBeenCalledWith(1, false);
});
