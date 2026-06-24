import type { PsgEvaluationResult } from "../../prompt-spaghetti/contracts/psgDocument";
import {
  BuildingIntentSchema,
  TrimDensitySchema,
  type BuildingIntent,
  type TrimDensity
} from "../contracts/buildingIntent";
import type { Diagnostic } from "../core/diagnostics";

type BuildingRequested = BuildingIntent["requested"];

export interface AdaptPsgEvaluationInput {
  prompt: string;
  seeds: BuildingIntent["seeds"];
  evaluation: PsgEvaluationResult;
  locks?: BuildingIntent["locks"];
  promptOverrides?: BuildingRequested & { stylePackId?: string };
}

export interface AdaptPsgEvaluationResult {
  intent: BuildingIntent;
  diagnostics: Diagnostic[];
}

const knownVariables = new Set([
  "building.stylePack",
  "building.floorCount",
  "building.bayCount",
  "building.wallMaterial",
  "building.roofType",
  "building.windowFamily",
  "building.trimDensity",
  "building.corniceFamily",
  "building.weathering",
  "building.symmetry"
]);

function readNumber(variableName: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${variableName} expected a finite number and received ${JSON.stringify(value)}`);
  }
  return value;
}

function readString(variableName: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(`${variableName} expected a string and received ${JSON.stringify(value)}`);
  }
  return value;
}

function readTrimDensity(variableName: string, value: unknown): TrimDensity {
  const parsed = TrimDensitySchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `${variableName} received ${JSON.stringify(value)}; allowed values: restrained, moderate, ornate`
    );
  }
  return parsed.data;
}

export function adaptPsgEvaluationToBuildingIntent(
  input: AdaptPsgEvaluationInput
): AdaptPsgEvaluationResult {
  const diagnostics: Diagnostic[] = [];
  const requested: BuildingRequested = {};
  let stylePackId: string | undefined;

  for (const [variableName, value] of Object.entries(input.evaluation.variables)) {
    if (variableName.startsWith("building.") && !knownVariables.has(variableName)) {
      diagnostics.push({
        code: "psg.unknownBuildingVariable",
        message: `Ignored unknown building variable ${variableName}.`,
        severity: "warning",
        path: variableName,
        received: value
      });
      continue;
    }

    switch (variableName) {
      case "building.stylePack":
        stylePackId = readString(variableName, value);
        break;
      case "building.floorCount":
        requested.floorCount = readNumber(variableName, value);
        break;
      case "building.bayCount":
        requested.bayCount = readNumber(variableName, value);
        break;
      case "building.wallMaterial":
        requested.wallMaterial = readString(variableName, value);
        break;
      case "building.roofType":
        requested.roofType = readString(variableName, value);
        break;
      case "building.windowFamily":
        requested.windowFamily = readString(variableName, value);
        break;
      case "building.trimDensity":
        requested.trimDensity = readTrimDensity(variableName, value);
        break;
      case "building.corniceFamily":
        requested.corniceFamily = readString(variableName, value);
        break;
      case "building.weathering":
        requested.weathering = readNumber(variableName, value);
        break;
      case "building.symmetry":
        requested.symmetry = readNumber(variableName, value);
        break;
      default:
        break;
    }
  }

  const overrides = input.promptOverrides ?? {};
  const intent = BuildingIntentSchema.parse({
    schemaVersion: "0.1.0",
    prompt: input.prompt,
    stylePackId: overrides.stylePackId ?? stylePackId,
    requested: {
      ...requested,
      ...overrides
    },
    seeds: input.seeds,
    locks: input.locks ?? [],
    psg: {
      evaluatedVariables: input.evaluation.variables,
      traceId: `trace-${input.evaluation.trace.length}-${input.evaluation.outputs.length}`
    }
  });

  return { intent, diagnostics };
}
