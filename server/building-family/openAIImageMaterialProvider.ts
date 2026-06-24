import { z } from "zod";
import { hashCanonicalJson, sha256Hex } from "../../src/features/building-family/core/contentHash";

const openAIImageEndpoint = "https://api.openai.com/v1/images/generations";
const providerId = "openai-image";
const outputFormat = "png";
const quality = "low";
const size = "1024x1024";

export interface RemoteMaterialSourceRequest {
  sourceId: string;
  role:
    | "wall"
    | "roof"
    | "glass"
    | "frame"
    | "door"
    | "horizontalTrim"
    | "verticalTrim"
    | "ornament";
  selectedFamily: string;
  periodicity: "none" | "x" | "xy";
  physicalSizeM: {
    width: number;
    height: number;
  };
  seedPath: string;
  promptVocabulary: string[];
  widthPx: number;
  heightPx: number;
}

export interface OpenAIImageTransportRequest {
  url: string;
  method: "POST";
  headers: {
    authorization: string;
    "content-type": "application/json";
  };
  body: {
    model: string;
    prompt: string;
    n: 1;
    size: typeof size;
    quality: typeof quality;
    output_format: typeof outputFormat;
  };
}

export type OpenAIImageTransport = (
  request: OpenAIImageTransportRequest,
  signal: AbortSignal
) => Promise<unknown>;

export interface RemoteMaterialSourceArtifact {
  schemaVersion: "0.1.0";
  sourceId: string;
  providerId: typeof providerId;
  image: {
    format: typeof outputFormat;
    b64Json: string;
  };
  revisedPrompt?: string;
  requestHash: string;
  contentHash: string;
  provenance: {
    providerId: typeof providerId;
    model: string;
    endpoint: typeof openAIImageEndpoint;
    prompt: string;
    promptVocabulary: string[];
    seedPath: string;
    outputFormat: typeof outputFormat;
    quality: typeof quality;
  };
}

export interface OpenAIImageMaterialProviderOptions {
  apiKey: string;
  model: string;
  transport?: OpenAIImageTransport;
}

const OpenAIImageResponseSchema = z.object({
  data: z
    .array(
      z.object({
        b64_json: z.string().min(1).optional(),
        revised_prompt: z.string().optional()
      })
    )
    .min(1)
});

function buildPrompt(request: RemoteMaterialSourceRequest): string {
  return [
    "Generate a tileable material-detail overlay for a procedural building atlas.",
    `Remote material role: ${request.role}.`,
    `Approved source id: ${request.sourceId}.`,
    `Selected procedural family: ${request.selectedFamily}.`,
    `Prompt vocabulary: ${request.promptVocabulary.join(", ")}.`,
    `Periodicity: ${request.periodicity}.`,
    `Physical source size in meters: ${request.physicalSizeM.width} x ${request.physicalSizeM.height}.`,
    `Seed path: ${request.seedPath}.`,
    "Focus on color, patina, paint, masonry grain, and shallow ornament detail.",
    "Do not generate a complete facade, windows, signage, people, or perspective lighting."
  ].join("\n");
}

async function defaultOpenAIImageTransport(
  request: OpenAIImageTransportRequest,
  signal: AbortSignal
): Promise<unknown> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal
  });

  if (!response.ok) {
    throw new Error(`OpenAI image request failed with status ${response.status}.`);
  }

  return response.json();
}

export class OpenAIImageMaterialProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly transport: OpenAIImageTransport;

  constructor(options: OpenAIImageMaterialProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.transport = options.transport ?? defaultOpenAIImageTransport;
  }

  async generate(
    request: RemoteMaterialSourceRequest,
    signal: AbortSignal
  ): Promise<RemoteMaterialSourceArtifact> {
    const prompt = buildPrompt(request);
    const transportRequest: OpenAIImageTransportRequest = {
      url: openAIImageEndpoint,
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: {
        model: this.model,
        prompt,
        n: 1,
        size,
        quality,
        output_format: outputFormat
      }
    };

    let responseBody: unknown;
    try {
      responseBody = await this.transport(transportRequest, signal);
    } catch {
      throw new Error("OpenAI image transport failed.");
    }

    const parsed = OpenAIImageResponseSchema.safeParse(responseBody);
    const image = parsed.success ? parsed.data.data[0] : undefined;
    if (!image?.b64_json) {
      throw new Error("OpenAI image response did not include base64 image data.");
    }

    const requestHash = await hashCanonicalJson({
      schemaVersion: "0.1.0",
      providerId,
      endpoint: openAIImageEndpoint,
      source: request,
      body: transportRequest.body
    });
    const contentHash = await sha256Hex(Buffer.from(image.b64_json, "base64"));

    return {
      schemaVersion: "0.1.0",
      sourceId: request.sourceId,
      providerId,
      image: {
        format: outputFormat,
        b64Json: image.b64_json
      },
      revisedPrompt: image.revised_prompt,
      requestHash,
      contentHash,
      provenance: {
        providerId,
        model: this.model,
        endpoint: openAIImageEndpoint,
        prompt,
        promptVocabulary: request.promptVocabulary,
        seedPath: request.seedPath,
        outputFormat,
        quality
      }
    };
  }
}
