import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ConstructionNodePanel } from "../ui/ConstructionNodePanel";
import { createBayConstructionGraph, repeatBayAsFacade, type BayConstructionNode } from "../contracts/bayConstructionGraph";
const names: Record<BayConstructionNode["type"], string> = {
  Footprint: "Footprint", Storeys: "Storeys", PlaceDoor: "Entrance layout", AssembleDoor: "Door assembly", BuildingRoof: "Complete roof", FacadeScope: "Facade scope", SplitFloors: "Split floors", SplitBays: "Split bays", PlaceOpening: "Opening layout", SelectScopes: "Select scopes",
  EmitWall: "Wall", AssembleWindow: "Window assembly", ProfileTrim: "Profile trim", RoofCap: "Roof cap", Output: "Output", JoinGeometry: "Join geometry", SetSurface: "Surface finish"
};
it("connects real compatible ports and diagnoses an incompatible connection without altering source", () => {
  const graph = repeatBayAsFacade(createBayConstructionGraph()), onChange = vi.fn();
  render(<ConstructionNodePanel graph={graph} selected="facade" names={names} disabled={false} onChange={onChange} onSelect={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Connect from Wall" }));
  fireEvent.click(screen.getByRole("button", { name: "Connect input of Split floors" }));
  expect(screen.getByRole("alert")).toHaveTextContent("matching scope or geometry ports"); expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Connect from Split floors" }));
  fireEvent.click(screen.getByRole("button", { name: "Connect input of Wall" }));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0].nodes.find((node: BayConstructionNode) => node.type === "EmitWall").input.nodeId).toBe("floors");
  expect(graph.nodes.find(node => node.type === "EmitWall")!.input.nodeId).toBe("opening");
});
it("supports keyboard layout, adding and deleting nodes while keeping layout out of authored source", () => {
  const graph = repeatBayAsFacade(createBayConstructionGraph()), onChange = vi.fn(), onSelect = vi.fn();
  const view = render(<ConstructionNodePanel graph={graph} selected="facade" names={names} disabled={false} onChange={onChange} onSelect={onSelect} />);
  fireEvent.keyDown(screen.getByRole("button", { name: "Select Facade scope" }), { key: "ArrowRight", altKey: true });
  expect(view.container.querySelector('[data-node-id="facade"]')).toHaveStyle({ left: "40px" }); expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Add node" }));
  const next = onChange.mock.calls[0][0];
  expect(next.nodes).toHaveLength(11); expect(onSelect).toHaveBeenCalledWith("SplitFloors_1");
  view.rerender(<ConstructionNodePanel graph={next} selected="SplitFloors_1" names={names} disabled={false} onChange={onChange} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
  expect(onChange.mock.calls[1][0].nodes).toHaveLength(10);
  expect(graph.nodes).toHaveLength(10);
});
it("scrolls a newly added node into view at its actual layout position", () => {
  const graph = repeatBayAsFacade(createBayConstructionGraph()), onChange = vi.fn(), onSelect = vi.fn();
  const view = render(<ConstructionNodePanel graph={graph} selected="facade" names={names} disabled={false} onChange={onChange} onSelect={onSelect} />);
  const viewport = screen.getByLabelText("Node canvas");
  Object.defineProperties(viewport, { clientHeight: { value: 300 }, clientWidth: { value: 600 } });
  viewport.scrollTop = 0; viewport.scrollLeft = 0;
  fireEvent.click(screen.getByRole("button", { name: "Add node" }));
  const next = onChange.mock.calls[0][0];
  view.rerender(<ConstructionNodePanel graph={next} selected="SplitFloors_1" names={names} disabled={false} onChange={onChange} onSelect={onSelect} />);
  const node = view.container.querySelector<HTMLElement>('[data-node-id="SplitFloors_1"]')!;
  const visibleTop = Number.parseFloat(node.style.top) * 0.85 - viewport.scrollTop;
  expect(viewport.scrollTop).toBeGreaterThan(0);
  expect(visibleTop).toBeGreaterThanOrEqual(0); expect(visibleTop).toBeLessThan(300);
});
