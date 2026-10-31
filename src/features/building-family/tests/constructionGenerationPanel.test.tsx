import { render, screen } from "@testing-library/react";
import { defaultConstructionGenerationControls } from "../state/constructionGenerationState";
import { ConstructionGenerationPanel } from "../ui/ConstructionGenerationPanel";

it("pins the material seed while allowing retained-sign geometry generation", () => {
  render(<ConstructionGenerationPanel controls={defaultConstructionGenerationControls} lineage={null} reference={null} onReferenceFile={() => {}}
    disabled={false} onChange={() => {}} onGenerate={() => {}} onSaveResearch={() => {}} materialChangesLocked />);
  expect(screen.getByLabelText("Material seed")).toBeDisabled();
  expect(screen.getByLabelText("Building seed")).toBeEnabled();
  expect(screen.getByRole("button", { name: "Reroll unlocked" })).toBeEnabled();
});
