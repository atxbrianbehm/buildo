import type { TrimDensity } from "../contracts/buildingIntent";

export interface PromptInterpretationInput {
  prompt: string;
}

export interface PromptInterpretationResult {
  provider: "local-rule";
  overrides: {
    floorCount?: number;
    bayCount?: number;
    wallMaterial?: string;
    roofType?: string;
    trimDensity?: TrimDensity;
    stylePackId?: string;
  };
  diagnostics: Array<{
    code: string;
    message: string;
    severity: "info" | "warning" | "error";
  }>;
}

export interface PromptInterpreter {
  interpret(input: PromptInterpretationInput): Promise<PromptInterpretationResult>;
}

const numberWords = new Map([
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10]
]);

function parseCount(text: string, nouns: string[]): number | undefined {
  for (const noun of nouns) {
    const digitMatch = new RegExp(`\\b(\\d+)\\s*(?:${noun})\\b`, "i").exec(text);
    if (digitMatch) {
      return Number(digitMatch[1]);
    }

    for (const [word, count] of numberWords) {
      if (new RegExp(`\\b${word}\\s*(?:${noun})\\b`, "i").test(text)) {
        return count;
      }
    }
  }

  return undefined;
}

export class LocalRulePromptInterpreter implements PromptInterpreter {
  async interpret(input: PromptInterpretationInput): Promise<PromptInterpretationResult> {
    const text = input.prompt.toLowerCase();
    const overrides: PromptInterpretationResult["overrides"] = {};

    const floorCount = parseCount(text, ["floors?", "story", "stories", "storey", "storeys"]);
    if (floorCount !== undefined) {
      overrides.floorCount = floorCount;
    }

    const bayCount = parseCount(text, ["bays?"]);
    if (bayCount !== undefined) {
      overrides.bayCount = bayCount;
    }

    if (/\bbrick|masonry\b/.test(text)) {
      overrides.wallMaterial = "brick-red";
    } else if (/\bstucco|plaster\b/.test(text)) {
      overrides.wallMaterial = "painted-stucco";
    }

    if (/\bflat roof|flat\b/.test(text)) {
      overrides.roofType = "flat";
    } else if (/\bgable|pitched\b/.test(text)) {
      overrides.roofType = "gable";
    }

    if (/\blate[-\s]?19|nineteenth|commercial\b/.test(text)) {
      overrides.stylePackId = "late-19c-commercial-demo";
    }

    for (const density of ["restrained", "moderate", "ornate"] as const) {
      if (new RegExp(`\\b${density}\\b`).test(text)) {
        overrides.trimDensity = density;
      }
    }

    return {
      provider: "local-rule",
      overrides,
      diagnostics: []
    };
  }
}
