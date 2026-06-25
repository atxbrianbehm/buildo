import { z } from "zod";
import { SchemaVersion010 } from "../contracts/shared";
import type { RendererBackendSupport } from "../renderer-three/buildingSceneAdapter";
import type { AssemblyHallFixture } from "../ui/assemblyHallFixture";
import type { FamilyBenchmarkReport } from "./familyBenchmarkScene";
import type { FamilyOrbitBenchmarkReport } from "./familyOrbitBenchmarkScene";

export const FAMILY_BENCHMARK_PROFILE_PACKET_KIND = "dynamic-building-family-milestone-7-profile";

const RendererBackendSchema = z.enum(["webgpu", "webgl"]);
const MetricStatusSchema = z.enum(["measured", "estimated", "not-captured"]);
const MetricUnitSchema = z.enum(["ms", "bytes", "count"]);

const RuntimeMetricsSchema = z
  .object({
    buildingCount: z.number().int().nonnegative(),
    meshCount: z.number().int().nonnegative(),
    instanceBatchCount: z.number().int().nonnegative(),
    instanceCount: z.number().int().nonnegative(),
    triangleCount: z.number().int().nonnegative(),
    drawCallCount: z.number().int().nonnegative(),
    sharedMaterialCount: z.number().int().nonnegative(),
    textureCount: z.number().int().nonnegative(),
    preferredBackend: RendererBackendSchema.optional()
  })
  .passthrough();

const ConstructionBenchmarkReportSchema = z
  .object({
    schemaVersion: SchemaVersion010,
    benchmarkKind: z.literal("shared-family-100-building-scene"),
    familyId: z.string().min(1),
    buildingCount: z.number().int().positive(),
    aggregate: z.object({
      drawCallCount: z.number().int().nonnegative(),
      instanceCount: z.number().int().nonnegative(),
      triangleCount: z.number().int().nonnegative()
    }),
    runtimeMetrics: RuntimeMetricsSchema,
    transfer: z.object({
      perBuildingRuntimeIrBytes: z.number().int().nonnegative(),
      runtimeIrBytes: z.number().int().nonnegative()
    }),
    timing: z.object({
      compileTimeMs: z.number().nonnegative(),
      runtimeMountTimeMs: z.number().nonnegative()
    }),
    targets: z.object({
      oneBuildingTriangleLimit: z.object({
        actual: z.number().int().nonnegative(),
        limit: z.number().int().positive(),
        passed: z.boolean()
      }),
      familyAssetSharing: z.object({
        passed: z.boolean()
      })
    })
  })
  .passthrough();

const OrbitBenchmarkReportSchema = z
  .object({
    schemaVersion: SchemaVersion010,
    benchmarkKind: z.literal("shared-family-16-building-orbit"),
    familyId: z.string().min(1),
    buildingCount: z.number().int().positive(),
    frameSampleCount: z.number().int().positive(),
    aggregate: z.object({
      drawCallCount: z.number().int().nonnegative(),
      instanceCount: z.number().int().nonnegative(),
      triangleCount: z.number().int().nonnegative()
    }),
    runtimeMetrics: RuntimeMetricsSchema,
    render: z.object({
      activeBackend: RendererBackendSchema,
      fallbackReason: z.string().nullable()
    }),
    frameTime: z.object({
      budgetMs: z.number().positive(),
      averageFrameTimeMs: z.number().nonnegative(),
      p95FrameTimeMs: z.number().nonnegative(),
      maxFrameTimeMs: z.number().nonnegative(),
      samples: z.array(
        z.object({
          index: z.number().int().nonnegative(),
          cameraPosition: z.tuple([z.number(), z.number(), z.number()]),
          elapsedMs: z.number().nonnegative()
        })
      )
    }),
    targets: z.object({
      interactiveOrbit: z.object({
        actualP95FrameTimeMs: z.number().nonnegative(),
        budgetMs: z.number().positive(),
        passed: z.boolean()
      }),
      familyAssetSharing: z.object({
        passed: z.boolean()
      })
    })
  })
  .passthrough();

export const FamilyBenchmarkProfileEnvironmentSchema = z.object({
  schemaVersion: SchemaVersion010,
  capturedAt: z.string().min(1),
  userAgent: z.string().min(1),
  hardwareConcurrency: z.number().int().positive().nullable(),
  deviceMemoryGb: z.number().positive().nullable(),
  devicePixelRatio: z.number().positive().nullable(),
  viewport: z.object({
    widthPx: z.number().int().positive().nullable(),
    heightPx: z.number().int().positive().nullable()
  }),
  renderer: z.object({
    threeRevision: z.string().min(1),
    preferredBackend: RendererBackendSchema,
    webglAvailable: z.boolean(),
    webgpuAvailable: z.boolean(),
    constructionBackend: RendererBackendSchema.nullable(),
    orbitBackend: RendererBackendSchema.nullable()
  })
});

export const FamilyBenchmarkProfileMetricSchema = z.object({
  id: z.enum([
    "cpuCompileTimeMs",
    "runtimeMountTimeMs",
    "workerTransferBytes",
    "gpuMemoryBytes",
    "triangles",
    "instances",
    "drawCalls",
    "frameTimeMs"
  ]),
  label: z.string().min(1),
  status: MetricStatusSchema,
  value: z.number().nullable(),
  unit: MetricUnitSchema,
  source: z.string().min(1)
});

export const FamilyBenchmarkProfilePacketSchema = z.object({
  schemaVersion: SchemaVersion010,
  profileKind: z.literal(FAMILY_BENCHMARK_PROFILE_PACKET_KIND),
  familyId: z.string().min(1),
  createdAt: z.string().min(1),
  reports: z.object({
    construction: ConstructionBenchmarkReportSchema,
    orbit: OrbitBenchmarkReportSchema
  }),
  environment: FamilyBenchmarkProfileEnvironmentSchema,
  profileCoverage: z.array(FamilyBenchmarkProfileMetricSchema),
  targets: z.object({
    oneBuildingTriangleLimit: z.object({
      actual: z.number().int().nonnegative(),
      limit: z.number().int().positive(),
      passed: z.boolean()
    }),
    constructionFamilyAssetSharing: z.object({
      passed: z.boolean()
    }),
    interactiveOrbit: z.object({
      actualP95FrameTimeMs: z.number().nonnegative(),
      budgetMs: z.number().positive(),
      passed: z.boolean()
    }),
    orbitFamilyAssetSharing: z.object({
      passed: z.boolean()
    }),
    familyAssetSharing: z.object({
      passed: z.boolean()
    })
  }),
  knownLimitations: z.array(z.string().min(1))
});

export type FamilyBenchmarkProfileEnvironment = z.infer<typeof FamilyBenchmarkProfileEnvironmentSchema>;
export type FamilyBenchmarkProfileMetric = z.infer<typeof FamilyBenchmarkProfileMetricSchema>;
export type FamilyBenchmarkProfilePacket = z.infer<typeof FamilyBenchmarkProfilePacketSchema>;

export interface CreateBrowserBenchmarkProfileEnvironmentInput {
  backendSupport: RendererBackendSupport;
  orbitReport?: FamilyOrbitBenchmarkReport | null;
  now?: () => Date;
}

export interface CreateFamilyBenchmarkProfilePacketInput {
  fixture: AssemblyHallFixture;
  constructionReport: FamilyBenchmarkReport;
  orbitReport: FamilyOrbitBenchmarkReport;
  environment?: FamilyBenchmarkProfileEnvironment;
  now?: () => Date;
}

function nullablePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function nullablePositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function browserNavigator(): (Navigator & { deviceMemory?: number }) | undefined {
  return globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
}

function browserWindow(): Window | undefined {
  return globalThis.window as Window | undefined;
}

export function createBrowserBenchmarkProfileEnvironment(
  input: CreateBrowserBenchmarkProfileEnvironmentInput
): FamilyBenchmarkProfileEnvironment {
  const navigatorRef = browserNavigator();
  const windowRef = browserWindow();

  return FamilyBenchmarkProfileEnvironmentSchema.parse({
    schemaVersion: "0.1.0",
    capturedAt: (input.now ?? (() => new Date()))().toISOString(),
    userAgent: navigatorRef?.userAgent || "unknown-browser",
    hardwareConcurrency: nullablePositiveInteger(navigatorRef?.hardwareConcurrency),
    deviceMemoryGb: nullablePositiveNumber(navigatorRef?.deviceMemory),
    devicePixelRatio: nullablePositiveNumber(windowRef?.devicePixelRatio),
    viewport: {
      widthPx: nullablePositiveInteger(windowRef?.innerWidth),
      heightPx: nullablePositiveInteger(windowRef?.innerHeight)
    },
    renderer: {
      threeRevision: input.backendSupport.threeRevision,
      preferredBackend: input.backendSupport.preferredBackend,
      webglAvailable: input.backendSupport.webgl.available,
      webgpuAvailable: input.backendSupport.webgpu.available,
      constructionBackend: null,
      orbitBackend: input.orbitReport?.render.activeBackend ?? null
    }
  });
}

function assertSameFamily(constructionReport: FamilyBenchmarkReport, orbitReport: FamilyOrbitBenchmarkReport): void {
  if (constructionReport.familyId !== orbitReport.familyId) {
    throw new Error(
      `Cannot create benchmark profile packet for mismatched families: ${constructionReport.familyId} and ${orbitReport.familyId}.`
    );
  }
}

function profileCoverage(input: {
  constructionReport: FamilyBenchmarkReport;
  orbitReport: FamilyOrbitBenchmarkReport;
}): FamilyBenchmarkProfileMetric[] {
  const { constructionReport, orbitReport } = input;

  return [
    {
      id: "cpuCompileTimeMs",
      label: "CPU compile time",
      status: "measured",
      value: constructionReport.timing.compileTimeMs,
      unit: "ms",
      source: "100-building construction benchmark compile timing"
    },
    {
      id: "runtimeMountTimeMs",
      label: "Runtime mount time",
      status: "measured",
      value: constructionReport.timing.runtimeMountTimeMs,
      unit: "ms",
      source: "100-building construction benchmark runtime mount timing"
    },
    {
      id: "workerTransferBytes",
      label: "Worker transfer size",
      status: "estimated",
      value: constructionReport.transfer.runtimeIrBytes,
      unit: "bytes",
      source: "RuntimeBuildingIR typed-array byte estimate"
    },
    {
      id: "gpuMemoryBytes",
      label: "GPU memory",
      status: "not-captured",
      value: null,
      unit: "bytes",
      source: "No stable browser GPU memory API is used by the current benchmark profile"
    },
    {
      id: "triangles",
      label: "Triangles",
      status: "measured",
      value: constructionReport.aggregate.triangleCount,
      unit: "count",
      source: "100-building construction benchmark aggregate metrics"
    },
    {
      id: "instances",
      label: "Instances",
      status: "measured",
      value: constructionReport.aggregate.instanceCount,
      unit: "count",
      source: "100-building construction benchmark aggregate metrics"
    },
    {
      id: "drawCalls",
      label: "Draw calls",
      status: "measured",
      value: constructionReport.aggregate.drawCallCount,
      unit: "count",
      source: "100-building construction benchmark aggregate metrics"
    },
    {
      id: "frameTimeMs",
      label: "Frame time",
      status: "measured",
      value: orbitReport.frameTime.p95FrameTimeMs,
      unit: "ms",
      source: "16-building orbit benchmark p95 frame timing"
    }
  ];
}

export function parseFamilyBenchmarkProfilePacket(input: unknown): FamilyBenchmarkProfilePacket {
  const result = FamilyBenchmarkProfilePacketSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid family benchmark profile packet: ${result.error.issues.map((issue) => issue.message).join(", ")}`
    );
  }

  return result.data;
}

export function createFamilyBenchmarkProfilePacket(
  input: CreateFamilyBenchmarkProfilePacketInput
): FamilyBenchmarkProfilePacket {
  assertSameFamily(input.constructionReport, input.orbitReport);
  const environment =
    input.environment ??
    createBrowserBenchmarkProfileEnvironment({
      backendSupport: input.fixture.backendSupport,
      orbitReport: input.orbitReport,
      now: input.now
    });

  return parseFamilyBenchmarkProfilePacket({
    schemaVersion: "0.1.0",
    profileKind: FAMILY_BENCHMARK_PROFILE_PACKET_KIND,
    familyId: input.constructionReport.familyId,
    createdAt: environment.capturedAt,
    reports: {
      construction: input.constructionReport,
      orbit: input.orbitReport
    },
    environment,
    profileCoverage: profileCoverage({
      constructionReport: input.constructionReport,
      orbitReport: input.orbitReport
    }),
    targets: {
      oneBuildingTriangleLimit: input.constructionReport.targets.oneBuildingTriangleLimit,
      constructionFamilyAssetSharing: input.constructionReport.targets.familyAssetSharing,
      interactiveOrbit: input.orbitReport.targets.interactiveOrbit,
      orbitFamilyAssetSharing: input.orbitReport.targets.familyAssetSharing,
      familyAssetSharing: {
        passed:
          input.constructionReport.targets.familyAssetSharing.passed &&
          input.orbitReport.targets.familyAssetSharing.passed
      }
    },
    knownLimitations: [
      "GPU memory is not exposed by a stable browser API in the current benchmark profile.",
      "Representative-machine sign-off requires rerunning this profile packet on the target development hardware.",
      "Configured live-provider proof is not included in this local benchmark profile packet."
    ]
  });
}
