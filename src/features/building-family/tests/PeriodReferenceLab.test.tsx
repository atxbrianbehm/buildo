import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  periodReferenceCatalog,
  PERIOD_COMPARISON_NOTES_KIND
} from "../qa/periodReferenceCatalog";
import { PeriodReferenceLab } from "../ui/PeriodReferenceLab";

describe("PeriodReferenceLab", () => {
  it("lists primary refs, shows look-for cues, and exports comparison notes", () => {
    const createObjectURL = vi.fn<(value: Blob | MediaSource) => string>(() => "blob:period-ref");
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === "a") {
        Object.defineProperty(element, "click", { value: click });
      }
      return element;
    });

    const onOpenAssemblyHall = vi.fn();
    render(
      <PeriodReferenceLab
        fidelityMode="kit"
        seeds={{
          family: "family-seed",
          building: "building-seed",
          material: "material-seed",
          trim: "trim-seed"
        }}
        onOpenAssemblyHall={onOpenAssemblyHall}
      />
    );

    expect(screen.getByRole("heading", { name: periodReferenceCatalog.label })).toBeInTheDocument();
    expect(screen.getByLabelText("Period reference catalog summary")).toHaveTextContent(
      periodReferenceCatalog.id
    );
    expect(screen.getByLabelText("Period reference list")).toBeInTheDocument();
    expect(screen.getByLabelText("Period comparison rubric")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Assembly Hall" }));
    expect(onOpenAssemblyHall).toHaveBeenCalledTimes(1);

    const silhouetteScore = screen.getByRole("combobox", { name: "Rubric score Silhouette / massing" });
    fireEvent.change(silhouetteScore, { target: { value: "pass" } });

    fireEvent.click(screen.getByRole("button", { name: "Download comparison notes" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);

    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
    expect((createObjectURL.mock.calls[0]?.[0] as Blob).type).toBe("application/json");

    // Ensure list filters still expose a primary entry
    const list = screen.getByLabelText("Period reference list");
    expect(within(list).getAllByRole("button").length).toBeGreaterThan(0);
    expect(PERIOD_COMPARISON_NOTES_KIND).toContain("period-comparison");
  });

  it("filters by collection", () => {
    render(<PeriodReferenceLab />);
    fireEvent.change(screen.getByRole("combobox", { name: "Period reference collection filter" }), {
      target: { value: "habs" }
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Period reference priority filter" }), {
      target: { value: "all" }
    });
    const list = screen.getByLabelText("Period reference list");
    const buttons = within(list).getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.textContent?.includes("habs"))).toBe(true);
  });
});
