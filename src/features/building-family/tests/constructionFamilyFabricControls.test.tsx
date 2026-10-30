import { fireEvent, render, screen } from "@testing-library/react";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { ConstructionFamilyFabricControls } from "../ui/ConstructionFamilyFabricControls";

it("edits one building's explicit fabric and offers a return to the inherited source", async () => {
  const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "fabric", pattern: "striped", primary: [224, 213, 187], secondary: [69, 99, 78], physicalSizeM: [1, 1] });
  const apply = vi.fn(), reset = vi.fn();
  const { rerender } = render(<ConstructionFamilyFabricControls buildingNumber={2} fabric={fabric} inherited disabled={false} onApply={apply} onReset={reset} />);
  expect(screen.getByRole("button", { name: "Use shared fabric" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Family fabric pattern"), { target: { value: "solid" } });
  fireEvent.change(screen.getByLabelText("Family fabric primary color"), { target: { value: "#993322" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply individual fabric" }));
  expect(apply).toHaveBeenCalledWith("solid", [153, 51, 34], [69, 99, 78]);
  rerender(<ConstructionFamilyFabricControls buildingNumber={2} fabric={fabric} inherited={false} disabled={false} onApply={apply} onReset={reset} />);
  fireEvent.click(screen.getByRole("button", { name: "Use shared fabric" })); expect(reset).toHaveBeenCalledOnce();
});
