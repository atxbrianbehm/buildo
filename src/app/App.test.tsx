import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders the Buildo launch shell", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Buildo" })).toBeInTheDocument();
    expect(screen.getByText("Wild Construct Lab")).toBeInTheDocument();
    expect(screen.getByLabelText("Project setup status")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Control Invalidation" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Floors"), { target: { value: "5" } });
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("floorCount");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("Material sources reusable");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("runtimeBuildingIr");
    expect(await screen.findByRole("heading", { name: "Generation Run" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Generation run state")).toHaveTextContent("complete"));
    expect(screen.getByRole("button", { name: "Cancel Run" })).toBeDisabled();
    const firstArtifactId = screen.getByLabelText("Generation run artifact").textContent ?? "";
    fireEvent.click(screen.getByRole("button", { name: "New Building" }));
    await waitFor(() => expect(screen.getByLabelText("Generation run state")).toHaveTextContent("complete"));
    await waitFor(() => expect(screen.getByLabelText("Generation run artifact")).not.toHaveTextContent(firstArtifactId));
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("packed-atlas:");
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("component-catalog:");
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("cache hit");
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("uploadingGpuResources");
    expect(screen.getByLabelText("Generation run artifact")).toHaveTextContent("assembly-hall-fixture:");
    expect(await screen.findByRole("heading", { name: "Artifact Trace" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Registered artifacts" })).toHaveTextContent("runtime-building-ir");
    expect(screen.getByRole("table", { name: "Run event artifact trace" })).toHaveTextContent("packed-atlas:");
    expect(await screen.findByRole("heading", { name: "Atlas Lab" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "baseColor channel" })).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Semantic Slots" })).getByText("wall.primary")).toBeInTheDocument();
    expect(screen.getByLabelText("Atlas fixture provenance")).toHaveTextContent("30 entries");
    expect(await screen.findByRole("heading", { name: "Component Forge" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Component selector" }), {
      target: { value: "component-gallery.recipe.window.tall-arched.frame" }
    });
    expect(screen.getByLabelText("Selected component recipe")).toHaveTextContent("Window frame");
    expect(within(screen.getByRole("table", { name: "Selected atlas slots" })).getByText("glass.primary")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Assembly Hall" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Reveal through stage" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Rendered generated building fixture" })).toBeInTheDocument();
    expect(screen.getByLabelText("Assembly Hall renderer metrics")).toHaveTextContent("Draw calls");
  });

  it("exposes committed roof, trim, and seed controls with invalidation feedback", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Control Invalidation" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Generation run state")).toHaveTextContent("complete"));

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
    await waitFor(() => expect(screen.getByLabelText("Generation run state")).toHaveTextContent("complete"));
    expect(screen.getByLabelText("Generation run timeline")).toHaveTextContent("cache miss");
  });

  it("locks a Component Forge recipe and keeps the lock through a new-building rerun", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Component Forge" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Generation run state")).toHaveTextContent("complete"));
    fireEvent.change(screen.getByRole("combobox", { name: "Component selector" }), {
      target: { value: "component-gallery.recipe.window.tall-arched.frame" }
    });

    fireEvent.click(screen.getByRole("button", { name: "Lock selected component" }));

    expect(screen.getByLabelText("Component lock status")).toHaveTextContent("recipe.window.tall-arched.frame");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("localComponentLock");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("componentCatalog");
    expect(screen.getByLabelText("Invalidation preview")).toHaveTextContent("partial");

    fireEvent.click(screen.getByRole("button", { name: "New Building" }));
    await waitFor(() => expect(screen.getByLabelText("Generation run state")).toHaveTextContent("complete"));
    expect(screen.getByLabelText("Component lock status")).toHaveTextContent("recipe.window.tall-arched.frame");
    expect(screen.getByLabelText("Invalidation preview")).not.toHaveTextContent("localComponentLock");
  });
});
