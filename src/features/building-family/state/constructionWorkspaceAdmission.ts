import type { BayConstructionGraph } from "../contracts/bayConstructionGraph";

/** Keep newer project sources out of the editor until its controls preserve them. */
export function assertConstructionWorkspaceSupported(graph: BayConstructionGraph): void {
  if (graph.schemaVersion === "0.17.0") throw new Error("The combined sign and awning project is not yet supported in this workspace. Its source has been retained.");
}
