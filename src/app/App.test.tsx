import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders the Buildo launch shell", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Buildo" })).toBeInTheDocument();
    expect(screen.getByText("Wild Construct Lab")).toBeInTheDocument();
    expect(screen.getByLabelText("Project setup status")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Atlas Lab" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "baseColor channel" })).toBeInTheDocument();
    expect(screen.getByText("wall.primary")).toBeInTheDocument();
    expect(screen.getByLabelText("Atlas fixture provenance")).toHaveTextContent("30 entries");
  });
});
