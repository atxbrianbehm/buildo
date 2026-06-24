import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders the Buildo launch shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Buildo" })).toBeInTheDocument();
    expect(screen.getByText("Wild Construct Lab")).toBeInTheDocument();
    expect(screen.getByLabelText("Project setup status")).toBeInTheDocument();
  });
});

