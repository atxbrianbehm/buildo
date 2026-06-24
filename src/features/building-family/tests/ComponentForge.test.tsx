import { fireEvent, render, screen, within } from "@testing-library/react";
import { ComponentForge } from "../ui/ComponentForge";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";

describe("ComponentForge", () => {
  it("renders generated component entries with selector controls, recipe data, dimensions, anchors, and atlas slot highlight", async () => {
    const fixture = await createAssemblyHallFixture();

    render(<ComponentForge fixture={fixture} />);

    expect(screen.getByRole("heading", { name: "Component Forge" })).toBeInTheDocument();
    const componentGrid = screen.getByLabelText("Generated component grid");
    expect(componentGrid).toHaveTextContent("Window frame");
    expect(componentGrid).toHaveTextContent("Storefront door");
    expect(componentGrid).toHaveTextContent("Cornice");

    fireEvent.change(screen.getByRole("combobox", { name: "Component selector" }), {
      target: { value: "component-gallery.recipe.window.tall-arched.frame" }
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Wireframe" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "UV Overlay" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Semantic Anchors" }));

    const selected = screen.getByLabelText("Selected component recipe");
    expect(selected).toHaveTextContent("Window frame");
    expect(selected).toHaveTextContent("recipe.window.tall-arched.frame");
    expect(selected).toHaveTextContent("frame");
    expect(selected).toHaveTextContent("instanceBatch");
    expect(selected).toHaveTextContent("Wireframe on");
    expect(selected).toHaveTextContent("UV overlay on");
    expect(selected).toHaveTextContent("Semantic anchors on");
    expect(selected).toHaveTextContent("1.35");
    expect(selected).toHaveTextContent("2.45");
    expect(selected).toHaveTextContent("0.18");

    const atlasSlots = screen.getByRole("table", { name: "Selected atlas slots" });
    expect(within(atlasSlots).getByText("glass.primary")).toBeInTheDocument();
    expect(within(atlasSlots).getByText("frame.primary")).toBeInTheDocument();
    expect(atlasSlots).toHaveTextContent("stretch");
    expect(atlasSlots).toHaveTextContent("cap-repeat-cap");

    expect(screen.getByLabelText("Selected semantic anchors")).toHaveTextContent("origin");
    expect(screen.getByLabelText("Selected component recipe JSON")).toHaveTextContent('"role": "window"');
  });
});
