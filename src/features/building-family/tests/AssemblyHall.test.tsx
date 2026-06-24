import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { AssemblyHall, type AssemblyRendererFactory } from "../ui/AssemblyHall";
import { createAssemblyHallFixture } from "../ui/assemblyHallFixture";

function fakeRendererFactory(): AssemblyRendererFactory {
  return () => {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("data-testid", "assembly-renderer-canvas");
    return {
      domElement: canvas,
      dispose: vi.fn(),
      render: vi.fn(),
      setPixelRatio: vi.fn(),
      setSize: vi.fn()
    };
  };
}

describe("AssemblyHall", () => {
  it("renders the generated building fixture, atlas identity, component gallery, and renderer metrics", async () => {
    const fixture = await createAssemblyHallFixture();

    render(<AssemblyHall fixture={fixture} rendererFactory={fakeRendererFactory()} />);

    expect(screen.getByRole("heading", { name: "Assembly Hall" })).toBeInTheDocument();
    const viewport = screen.getByRole("img", { name: "Rendered generated building fixture" });
    expect(within(viewport).getByTestId("assembly-renderer-canvas")).toBeInTheDocument();
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
});
