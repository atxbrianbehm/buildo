import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
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

    fixture.familyRuntime.dispose();
  });

  it("offers style-pack window family variants and reports swaps to the parent", async () => {
    const fixture = await createAssemblyHallFixture();
    const onComponentFamilyChange = vi.fn();

    render(
      <ComponentForge
        fixture={fixture}
        windowFamily={fixture.spec.selectedFamilies.window}
        corniceFamily={fixture.spec.selectedFamilies.cornice}
        onComponentFamilyChange={onComponentFamilyChange}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Component selector" }), {
      target: { value: "component-gallery.recipe.window.tall-arched.frame" }
    });

    const familySelect = screen.getByRole("combobox", { name: "Window family" });
    expect(familySelect).toHaveValue("tall-arched");
    fireEvent.change(familySelect, { target: { value: "tall-rectangular" } });
    expect(onComponentFamilyChange).toHaveBeenCalledWith("windowFamily", "tall-rectangular");

    fixture.familyRuntime.dispose();
  });

  it("locks and unlocks the selected component recipe through the parent control surface", async () => {
    const fixture = await createAssemblyHallFixture();
    const lockedComponentKeys: string[] = [];
    const toggleLock = vi.fn((componentKey: string) => {
      const index = lockedComponentKeys.indexOf(componentKey);
      if (index === -1) {
        lockedComponentKeys.push(componentKey);
      } else {
        lockedComponentKeys.splice(index, 1);
      }
    });

    const { rerender } = render(
      <ComponentForge
        fixture={fixture}
        lockedComponentKeys={lockedComponentKeys}
        onToggleComponentLock={toggleLock}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Component selector" }), {
      target: { value: "component-gallery.recipe.window.tall-arched.frame" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Lock selected component" }));

    expect(toggleLock).toHaveBeenCalledWith("recipe.window.tall-arched.frame");
    rerender(
      <ComponentForge
        fixture={fixture}
        lockedComponentKeys={lockedComponentKeys}
        onToggleComponentLock={toggleLock}
      />
    );
    expect(screen.getByLabelText("Component lock status")).toHaveTextContent("recipe.window.tall-arched.frame");
    expect(screen.getByLabelText("Selected component recipe")).toHaveTextContent("Locked");
    expect(screen.getByRole("button", { name: "Unlock selected component" })).toBeInTheDocument();

    fixture.familyRuntime.dispose();
  });
});
