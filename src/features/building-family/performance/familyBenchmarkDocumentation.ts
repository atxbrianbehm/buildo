import type { FamilyBenchmarkReport } from "./familyBenchmarkScene";

export type FamilyBenchmarkMetricStatus = "measured" | "estimated" | "not-captured";
export type FamilyBenchmarkMetricUnit = "ms" | "bytes" | "count";

export interface FamilyBenchmarkProfileMetric {
  id:
    | "cpuCompileTimeMs"
    | "runtimeMountTimeMs"
    | "workerTransferBytes"
    | "gpuMemoryBytes"
    | "triangles"
    | "instances"
    | "drawCalls"
    | "frameTimeMs";
  label: string;
  status: FamilyBenchmarkMetricStatus;
  value: number | null;
  unit: FamilyBenchmarkMetricUnit;
  source: string;
}

export interface FamilyBenchmarkDocumentation {
  schemaVersion: "0.1.0";
  benchmarkKind: FamilyBenchmarkReport["benchmarkKind"];
  familyId: string;
  buildingCount: number;
  reportSchemaVersion: FamilyBenchmarkReport["schemaVersion"];
  profileCoverage: FamilyBenchmarkProfileMetric[];
  knownLimitations: string[];
}

export interface CreateFamilyBenchmarkDocumentationInput {
  report: FamilyBenchmarkReport;
}

export function createFamilyBenchmarkDocumentation(
  input: CreateFamilyBenchmarkDocumentationInput
): FamilyBenchmarkDocumentation {
  const { report } = input;

  return {
    schemaVersion: "0.1.0",
    benchmarkKind: report.benchmarkKind,
    familyId: report.familyId,
    buildingCount: report.buildingCount,
    reportSchemaVersion: report.schemaVersion,
    profileCoverage: [
      {
        id: "cpuCompileTimeMs",
        label: "CPU compile time",
        status: "measured",
        value: report.timing.compileTimeMs,
        unit: "ms",
        source: "compileBuilding() timing during benchmark IR generation"
      },
      {
        id: "runtimeMountTimeMs",
        label: "Runtime mount time",
        status: "measured",
        value: report.timing.runtimeMountTimeMs,
        unit: "ms",
        source: "BuildingFamilyRuntime.createOrReplaceBuilding() timing"
      },
      {
        id: "workerTransferBytes",
        label: "Worker transfer size",
        status: "estimated",
        value: report.transfer.runtimeIrBytes,
        unit: "bytes",
        source: "RuntimeBuildingIR typed-array byte estimate"
      },
      {
        id: "gpuMemoryBytes",
        label: "GPU memory",
        status: "not-captured",
        value: null,
        unit: "bytes",
        source: "No stable browser GPU memory API is used by the current benchmark"
      },
      {
        id: "triangles",
        label: "Triangles",
        status: "measured",
        value: report.aggregate.triangleCount,
        unit: "count",
        source: "Compiled runtime IR aggregate metrics"
      },
      {
        id: "instances",
        label: "Instances",
        status: "measured",
        value: report.aggregate.instanceCount,
        unit: "count",
        source: "BuildingFamilyRuntime aggregate metrics"
      },
      {
        id: "drawCalls",
        label: "Draw calls",
        status: "measured",
        value: report.aggregate.drawCallCount,
        unit: "count",
        source: "BuildingFamilyRuntime aggregate metrics"
      },
      {
        id: "frameTimeMs",
        label: "Frame time",
        status: "not-captured",
        value: null,
        unit: "ms",
        source: "Captured by the separate 16-building orbit benchmark"
      }
    ],
    knownLimitations: [
      "GPU memory is not exposed by a stable browser API in the current benchmark surface.",
      "Frame time is captured by the separate 16-building orbit benchmark rather than this 100-building construction benchmark.",
      "Worker transfer size is estimated from RuntimeBuildingIR typed arrays rather than measured through an actual worker round trip."
    ]
  };
}
