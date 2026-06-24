import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "./App";

async function waitForInitialRun(): Promise<void> {
  await waitFor(() => expect(screen.getByLabelText("Generation run state")).toHaveTextContent("complete"));
}

function selectRoom(name: "Prompt Lab" | "Atlas Lab" | "Component Forge" | "Assembly Hall"): void {
  fireEvent.click(screen.getByRole("tab", { name }));
}

describe("App", () => {
  it("renders the Buildo launch shell as a four-room workflow", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Buildo" })).toBeInTheDocument();
    expect(screen.getByText("Wild Construct Lab")).toBeInTheDocument();
    expect(screen.getByLabelText("Project setup status")).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Building rooms" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Prompt Lab" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("heading", { name: "Prompt Lab" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Control Invalidation" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Atlas Lab" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Floors"), { target: { value: "5" } });
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("floorCount");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("Material sources reusable");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("runtimeBuildingIr");
    expect(await screen.findByRole("heading", { name: "Generation Run" })).toBeInTheDocument();
    await waitForInitialRun();
    expect(screen.getByRole("button", { name: "Cancel Run" })).toBeDisabled();
    const firstArtifactId = screen.getByLabelText("Generation run artifact").textContent ?? "";
    fireEvent.click(screen.getByRole("button", { name: "New Building" }));
    await waitForInitialRun();
    await waitFor(() => expect(screen.getByLabelText("Generation run artifact")).not.toHaveTextContent(firstArtifactId));
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("packed-atlas:");
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("component-catalog:");
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("cache hit");
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("uploadingGpuResources");
    expect(screen.getByLabelText("Generation run artifact")).toHaveTextContent("assembly-hall-fixture:");
    expect(await screen.findByRole("heading", { name: "Artifact Trace" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Registered artifacts" })).toHaveTextContent("runtime-building-ir");
    expect(screen.getByRole("table", { name: "Run event artifact trace" })).toHaveTextContent("packed-atlas:");

    selectRoom("Atlas Lab");
    expect(screen.getByRole("tab", { name: "Atlas Lab" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("heading", { name: "Prompt Lab" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Atlas Lab" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "baseColor channel" })).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Semantic Slots" })).getByText("wall.primary")).toBeInTheDocument();
    expect(screen.getByLabelText("Atlas fixture provenance")).toHaveTextContent("30 entries");

    selectRoom("Component Forge");
    expect(await screen.findByRole("heading", { name: "Component Forge" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Component selector" }), {
      target: { value: "component-gallery.recipe.window.tall-arched.frame" }
    });
    expect(screen.getByLabelText("Selected component recipe")).toHaveTextContent("Window frame");
    expect(within(screen.getByRole("table", { name: "Selected atlas slots" })).getByText("glass.primary")).toBeInTheDocument();

    selectRoom("Assembly Hall");
    expect(await screen.findByRole("heading", { name: "Assembly Hall" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Reveal through stage" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Rendered generated building fixture" })).toBeInTheDocument();
    expect(screen.getByLabelText("Assembly Hall renderer metrics")).toHaveTextContent("Draw calls");
  });

  it("exposes committed roof, trim, and seed controls with invalidation feedback", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Control Invalidation" })).toBeInTheDocument();
    await waitForInitialRun();

    expect(screen.getByLabelText("Family Seed")).toHaveValue("family-seed");
    expect(screen.getByLabelText("Material Seed")).toHaveValue("material-seed");
    expect(screen.getByLabelText("Trim Seed")).toHaveValue("trim-seed");
    expect(screen.getByLabelText("Roof Type")).toHaveValue("flat");
    expect(screen.getByLabelText("Trim Density")).toHaveValue("ornate");

    fireEvent.change(screen.getByLabelText("Roof Type"), { target: { value: "gable" } });
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("roofType");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("Material sources reusable");

    fireEvent.change(screen.getByLabelText("Trim Density"), { target: { value: "moderate" } });
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("trimDensity");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("Material sources regenerate");

    fireEvent.change(screen.getByLabelText("Material Seed"), { target: { value: "material-seed-2" } });
    fireEvent.change(screen.getByLabelText("Trim Seed"), { target: { value: "trim-seed-2" } });
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("materialSeed");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("trimSeed");

    fireEvent.click(screen.getByRole("button", { name: "Run Current" }));
    await waitForInitialRun();
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("cache miss");
  });

  it("locks a Component Forge recipe and keeps the lock through a new-building rerun", async () => {
    render(<App />);

    await waitForInitialRun();
    selectRoom("Component Forge");
    expect(await screen.findByRole("heading", { name: "Component Forge" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Component selector" }), {
      target: { value: "component-gallery.recipe.window.tall-arched.frame" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Lock selected component" }));

    expect(screen.getByLabelText("Component lock status")).toHaveTextContent("recipe.window.tall-arched.frame");
    selectRoom("Prompt Lab");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("localComponentLock");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("componentCatalog");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("partial");

    fireEvent.click(screen.getByRole("button", { name: "New Building" }));
    await waitForInitialRun();
    selectRoom("Component Forge");
    expect(screen.getByLabelText("Component lock status")).toHaveTextContent("recipe.window.tall-arched.frame");
    selectRoom("Prompt Lab");
    expect(screen.getByLabelText("Invalidation preview")).not.toHaveTextContent("localComponentLock");
  });
});
