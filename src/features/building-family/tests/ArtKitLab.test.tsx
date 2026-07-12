import { fireEvent, render, screen, within } from "@testing-library/react";
import { late19cApartmentKit } from "../art-kit";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";
import { ArtKitLab } from "../ui/ArtKitLab";

describe("ArtKitLab", () => {
  it("renders module catalog, material roles, presentation modes, and quality report", async () => {
    const fixture = await createAssemblyHallFixture();

    try {
      render(<ArtKitLab fixture={fixture} />);

      expect(screen.getByRole("heading", { name: late19cApartmentKit.label })).toBeInTheDocument();
      expect(screen.getByLabelText("Art kit summary")).toHaveTextContent(late19cApartmentKit.id);
      expect(screen.getByLabelText("Art kit summary")).toHaveTextContent("kit");
      expect(screen.getByLabelText("Art kit module catalog").children.length).toBe(
        late19cApartmentKit.modules.length
      );

      const firstModule = screen.getByLabelText(`Art kit module ${late19cApartmentKit.modules[0]!.id}`);
      expect(firstModule).toHaveTextContent(late19cApartmentKit.modules[0]!.kind);
      expect(firstModule).toHaveTextContent("Bounds (m)");

      const materials = screen.getByRole("table", { name: "Art kit material roles" });
      expect(within(materials).getByText("brick")).toBeInTheDocument();
      expect(within(materials).getByText("running-bond-brick")).toBeInTheDocument();

      const quality = screen.getByLabelText("Art kit quality report");
      expect(quality).toHaveTextContent(String(late19cApartmentKit.modules.length));
      expect(quality).toHaveTextContent("stylized-apartment-kit");

      fireEvent.change(screen.getByRole("combobox", { name: "Art kit presentation mode" }), {
        target: { value: "wireframe" }
      });
      expect(
        screen.getByRole("img", {
          name: `Module preview ${late19cApartmentKit.modules[0]!.id} (wireframe)`
        })
      ).toBeInTheDocument();

      fireEvent.change(screen.getByRole("combobox", { name: "Art kit module kind filter" }), {
        target: { value: "opening" }
      });
      const openingCards = screen.getAllByLabelText(/^Art kit module /);
      expect(openingCards.length).toBeGreaterThan(0);
      expect(openingCards.every((card) => card.textContent?.includes("opening"))).toBe(true);
    } finally {
      fixture.familyRuntime.dispose();
    }
  });

  it("works without a live fixture", () => {
    render(<ArtKitLab />);
    expect(screen.getByLabelText("Art kit summary")).toHaveTextContent("no fixture");
    expect(screen.getByLabelText("Art kit quality report")).toHaveTextContent("n/a");
  });
});
