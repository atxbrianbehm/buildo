import { render, screen, within } from "@testing-library/react";
import type { ArtKitFacadePlanSummary } from "../art-kit";
import type { GenerationRun } from "../contracts/generationRun";
import type { BuildingArtifactSliceState } from "../state/buildingStore";
import { ArtifactTracePanel } from "../ui/ArtifactTracePanel";

const completedRun: GenerationRun = {
  schemaVersion: "0.1.0",
  runId: "run-trace-001",
  stage: "complete",
  events: [
    {
      stage: "resolvingPrompt",
      startedAtMs: 10,
      endedAtMs: 12
    },
    {
      stage: "packingAtlas",
      startedAtMs: 20,
      endedAtMs: 24,
      outputArtifactId: "packed-atlas:atlas-demo:atlas-hash",
      cacheHit: true
    },
    {
      stage: "compilingGeometry",
      startedAtMs: 30,
      endedAtMs: 35,
      outputArtifactId: "runtime-building-ir:building-demo:graph-hash",
      cacheHit: false
    },
    {
      stage: "complete",
      startedAtMs: 40,
      endedAtMs: 40,
      outputArtifactId: "assembly-hall-fixture:building-demo:atlas-hash"
    }
  ]
};

const artifacts: BuildingArtifactSliceState = {
  byId: {
    "packed-atlas:atlas-demo:atlas-hash": {
      schemaVersion: "0.1.0",
      artifactId: "packed-atlas:atlas-demo:atlas-hash",
      artifactType: "atlas-channel",
      requestHash: "request-family",
      contentHash: "atlas-hash",
      dependencies: ["atlas-manifest:atlas-demo"],
      createdAt: "2026-06-24T00:00:00.000Z"
    },
    "runtime-building-ir:building-demo:graph-hash": {
      schemaVersion: "0.1.0",
      artifactId: "runtime-building-ir:building-demo:graph-hash",
      artifactType: "runtime-building-ir",
      requestHash: "request-building",
      contentHash: "graph-hash",
      dependencies: ["building-graph:graph-demo"],
      createdAt: "2026-06-24T00:00:01.000Z"
    },
    "assembly-hall-fixture:building-demo:atlas-hash": {
      schemaVersion: "0.1.0",
      artifactId: "assembly-hall-fixture:building-demo:atlas-hash",
      artifactType: "assembly-hall-fixture",
      requestHash: "request-building",
      contentHash: "atlas-hash",
      dependencies: ["graph-hash"],
      createdAt: "2026-06-24T00:00:02.000Z"
    }
  },
  byType: {
    "atlas-channel": ["packed-atlas:atlas-demo:atlas-hash"],
    "runtime-building-ir": ["runtime-building-ir:building-demo:graph-hash"],
    "assembly-hall-fixture": ["assembly-hall-fixture:building-demo:atlas-hash"]
  }
};

const artKitFacadePlan: ArtKitFacadePlanSummary = {
  schemaVersion: "0.1.0",
  present: true,
  artKitManifestId: "late-19c-apartment-kit",
  plannerId: "seeded-greedy",
  unitMeters: 1,
  cellCount: 12,
  placementCount: 20,
  placementsByFacade: { front: 10, rear: 6, left: 2, right: 2 },
  diagnostics: [
    {
      code: "artKit.facadePlanner.missingModule",
      message: "No cornice module for zone.",
      severity: "error",
      path: "modules.cornice"
    }
  ],
  samplePlacements: []
};

describe("ArtifactTracePanel", () => {
  it("renders run-event artifact lineage and registered artifact metadata", () => {
    render(
      <ArtifactTracePanel
        activeArtifactId="assembly-hall-fixture:building-demo:atlas-hash"
        artifacts={artifacts}
        run={completedRun}
        artKitFacadePlan={artKitFacadePlan}
      />
    );

    expect(screen.getByRole("heading", { name: "Artifact Trace" })).toBeInTheDocument();
    expect(screen.getByLabelText("Artifact trace summary")).toHaveTextContent("run-trace-001");
    expect(screen.getByLabelText("Artifact trace summary")).toHaveTextContent("3");

    const runEvents = screen.getByRole("table", { name: "Run event artifact trace" });
    expect(runEvents).toHaveTextContent("packingAtlas");
    expect(runEvents).toHaveTextContent("cache hit");
    expect(runEvents).toHaveTextContent("runtime-building-ir:building-demo:graph-hash");

    const registered = screen.getByRole("table", { name: "Registered artifacts" });
    expect(within(registered).getByText("atlas-channel")).toBeInTheDocument();
    expect(within(registered).getByText("runtime-building-ir")).toBeInTheDocument();
    expect(registered).toHaveTextContent("atlas-manifest:atlas-demo");

    const active = screen.getByLabelText("Active artifact provenance");
    expect(active).toHaveTextContent("assembly-hall-fixture");
    expect(active).toHaveTextContent("graph-hash");

    const planSummary = screen.getByLabelText("Art-kit facade plan summary");
    expect(planSummary).toHaveTextContent("late-19c-apartment-kit");
    expect(planSummary).toHaveTextContent("seeded-greedy");
    expect(planSummary).toHaveTextContent("20");
    expect(planSummary).toHaveTextContent("front:10");
    expect(screen.getByLabelText("Art-kit facade plan diagnostics")).toHaveTextContent(
      "artKit.facadePlanner.missingModule"
    );
  });
});
