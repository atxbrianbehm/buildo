import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import type { AssemblyRendererActivation } from "../renderer-three/assemblyRendererFactory";
import { AssemblyHall } from "../ui/AssemblyHall";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";

function fakeRendererFactory(
  activeBackend: AssemblyRendererActivation["activeBackend"] = "webgl",
  fallbackReason?: string
) {
  return async (): Promise<AssemblyRendererActivation> => {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("data-testid", "assembly-renderer-canvas");
    return {
      activeBackend,
      fallbackReason,
      renderer: {
        domElement: canvas,
        dispose: vi.fn(),
        render: vi.fn(),
        setPixelRatio: vi.fn(),
        setSize: vi.fn()
      }
    };
  };
}

describe("AssemblyHall", () => {
  it("renders the generated building fixture, atlas identity, component gallery, and renderer metrics", async () => {
    const fixture = await createAssemblyHallFixture();

    render(<AssemblyHall fixture={fixture} rendererFactory={fakeRendererFactory()} />);

    expect(screen.getByRole("heading", { name: "Assembly Hall" })).toBeInTheDocument();
    const viewport = screen.getByRole("img", { name: "Rendered generated building fixture" });
    expect(await within(viewport).findByTestId("assembly-renderer-canvas")).toBeInTheDocument();
    expect(screen.getByText(fixture.prompt)).toBeInTheDocument();
    expect(screen.getByLabelText("Assembly Hall renderer metrics")).toHaveTextContent(
      String(fixture.metrics.drawCallCount)
    );
    expect(screen.getByLabelText("Assembly Hall renderer metrics")).toHaveTextContent(
      String(fixture.metrics.instanceCount)
    );
    expect(screen.getByLabelText("Assembly Hall atlas identity")).toHaveTextContent(fixture.packedAtlas.contentHash);
    expect(screen.getByRole("table", { name: "Component gallery summary" })).toHaveTextContent(
      "Window frame"
    );
    expect(screen.getByRole("table", { name: "Component gallery summary" })).toHaveTextContent(
      "instanceBatch"
    );
  });

  it("exposes the sixteen-variant shared-family stress summary", async () => {
    const fixture = await createAssemblyHallFixture();

    render(<AssemblyHall fixture={fixture} rendererFactory={fakeRendererFactory()} />);

    const stressView = screen.getByLabelText("16-variant family stress view");
    expect(stressView).toHaveTextContent("16 variants");
    expect(stressView).toHaveTextContent(fixture.packedAtlas.contentHash);
    expect(stressView).toHaveTextContent(fixture.catalog.catalogId);
    expect(screen.getByRole("table", { name: "16-variant family stress variants" })).toHaveTextContent(
      fixture.ir.buildingId
    );
    expect(screen.getByRole("table", { name: "16-variant family stress variants" })).toHaveTextContent(
      fixture.variantStress.variants[15].buildingSeed
    );
  });

  it("exposes semantic renderer lookup entries as a selectable Assembly Hall inspector", async () => {
    const fixture = await createAssemblyHallFixture();
    const windowPath = `building/${fixture.ir.familyId}/facade/front/floor/0/bay/0/window/frame`;

    render(<AssemblyHall fixture={fixture} rendererFactory={fakeRendererFactory()} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Semantic element" }), {
      target: { value: windowPath }
    });

    const inspector = screen.getByLabelText("Selected semantic element");
    expect(inspector).toHaveTextContent(windowPath);
    expect(inspector).toHaveTextContent("instances.window");
    expect(inspector).toHaveTextContent("openings");
    expect(inspector).toHaveTextContent("glass.primary");
    expect(inspector).toHaveTextContent("InstancedMesh");
    expect(inspector).toHaveTextContent("Window frame");
  });

  it("shows the activated renderer backend and fallback reason from the renderer factory", async () => {
    const fixture = await createAssemblyHallFixture();

    render(
      <AssemblyHall
        fixture={fixture}
        rendererFactory={fakeRendererFactory("webgl", "WebGPU renderer activation failed: adapter unavailable. Using WebGL fallback.")}
      />
    );

    const metrics = screen.getByLabelText("Assembly Hall renderer metrics");
    expect(await within(screen.getByRole("img", { name: "Rendered generated building fixture" })).findByTestId("assembly-renderer-canvas")).toBeInTheDocument();
    expect(metrics).toHaveTextContent("webgl active / webgpu preferred");
    expect(screen.getByRole("status")).toHaveTextContent("adapter unavailable");
  });

  it("drives stage group visibility from the Assembly Hall reveal controls", async () => {
    const fixture = await createAssemblyHallFixture();

    render(<AssemblyHall fixture={fixture} rendererFactory={fakeRendererFactory()} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Reveal through stage" }), {
      target: { value: "facade" }
    });

    const stageVisibility = screen.getByLabelText("Assembly stage visibility");
    expect(stageVisibility).toHaveTextContent("massing");
    expect(stageVisibility).toHaveTextContent("visible");
    expect(stageVisibility).toHaveTextContent("facade");
    expect(stageVisibility).toHaveTextContent("openings");
    expect(stageVisibility).toHaveTextContent("hidden");

    const stageGroups = new Map(fixture.buildingRuntime.stageGroups.map((entry) => [entry.stage, entry.group.visible]));
    expect(stageGroups.get("massing")).toBe(true);
    expect(stageGroups.get("facade")).toBe(true);
    expect(stageGroups.get("openings")).toBe(false);
    expect(stageGroups.get("trim")).toBe(false);
    expect(stageGroups.get("roof")).toBe(false);
  });
});
