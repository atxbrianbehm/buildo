import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { SampleBuildingGallery } from "../ui/SampleBuildingGallery";

describe("SampleBuildingGallery", () => {
  it("renders generated family variants as inspectable HTML sample cards", async () => {
    const fixture = await createAssemblyHallFixture();
    const onOpenInAssemblyHall = vi.fn();

    try {
      render(
        <SampleBuildingGallery fixture={fixture} onOpenInAssemblyHall={onOpenInAssemblyHall} />
      );

      expect(screen.getByRole("heading", { name: "Sample Buildings" })).toBeInTheDocument();
      expect(screen.getByLabelText("Generated sample building gallery")).toBeInTheDocument();
      expect(screen.getByLabelText("Sample gallery fidelity mode")).toHaveTextContent(fixture.fidelityMode);
      expect(screen.getByLabelText("Sample gallery fidelity banner")).toHaveTextContent(
        fixture.fidelityMode === "kit" ? "kit-mode" : "proof-mode"
      );
      expect(screen.getAllByLabelText(/^Generated building sample /)).toHaveLength(8);
      expect(screen.getAllByRole("img", { name: /^Facade preview for generated building sample / })).toHaveLength(8);

      const firstSample = screen.getByLabelText("Generated building sample 1");
      expect(firstSample).toHaveTextContent("building-seed");
      expect(firstSample).toHaveTextContent("4 floors");
      expect(firstSample).toHaveTextContent("7 bays");
      expect(firstSample).toHaveTextContent(fixture.spec.familyId);
      expect(firstSample).toHaveTextContent(fixture.packedAtlas.contentHash.slice(0, 12));
      expect(screen.getByLabelText("Sample 1 fidelity mode")).toHaveTextContent(
        fixture.fidelityMode === "kit" ? "kit mode" : "proof mode"
      );

      const eighthSample = screen.getByLabelText("Generated building sample 8");
      expect(eighthSample).toHaveTextContent("building-seed-variant-07");
      fireEvent.click(within(eighthSample).getByRole("button", { name: "Open in Assembly Hall" }));
      expect(onOpenInAssemblyHall).toHaveBeenCalledWith({
        buildingSeed: "building-seed-variant-07",
        sampleNumber: 8
      });
    } finally {
      fixture.familyRuntime.dispose();
    }
  });
});
