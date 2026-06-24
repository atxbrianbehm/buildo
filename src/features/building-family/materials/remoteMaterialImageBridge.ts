import { z } from "zod";
import type { Diagnostic } from "../core/diagnostics";
import type { MaterialSourceRequest, PixelLayer } from "./providers/proceduralMaterialProvider";
import type { RemoteMaterialOverlay } from "./remoteMaterialOverlay";

const RemoteMaterialImageArtifactSchema = z.object({
  schemaVersion: z.literal("0.1.0"),
  sourceId: z.string().min(1),
  providerId: z.literal("openai-image"),
  image: z.object({
    format: z.literal("png"),
    b64Json: z.string().min(1)
  }),
  revisedPrompt: z.string().optional(),
  requestHash: z.string().min(1),
  contentHash: z.string().min(1),
  provenance: z.object({
    providerId: z.literal("openai-image"),
    model: z.string().min(1),
    endpoint: z.string().min(1),
    prompt: z.string().min(1),
    promptVocabulary: z.array(z.string().min(1)),
    seedPath: z.string().min(1),
    outputFormat: z.literal("png"),
    quality: z.string().min(1)
  })
});

export type RemoteMaterialImageArtifact = z.infer<typeof RemoteMaterialImageArtifactSchema>;

export interface PngLayerDecoderInput {
  b64Json: string;
  widthPx: number;
  heightPx: number;
}

export type PngLayerDecoder = (input: PngLayerDecoderInput) => Promise<PixelLayer>;

export interface RemoteMaterialImageBridgeResult {
  overlay?: RemoteMaterialOverlay;
  diagnostics: Diagnostic[];
}

function invalidArtifactDiagnostic(error: z.ZodError): Diagnostic {
  const issue = error.issues[0];
  return {
    code: "remoteMaterialImageBridge.invalidArtifact",
    message: "Remote material image artifact does not match the expected PNG overlay schema.",
    severity: "error",
    path: issue?.path.join("."),
    received: issue?.message
  };
}

function sourceMismatchDiagnostic(
  artifact: RemoteMaterialImageArtifact,
  request: MaterialSourceRequest
): Diagnostic {
  return {
    code: "remoteMaterialImageBridge.sourceMismatch",
    message: "Remote material image artifact source id must match the material source request.",
    severity: "error",
    path: "sourceId",
    received: artifact.sourceId,
    allowedValues: [request.sourceId]
  };
}

function decodedLayerDimensionMismatchDiagnostic(
  layer: PixelLayer,
  request: MaterialSourceRequest
): Diagnostic {
  return {
    code: "remoteMaterialImageBridge.decodedLayerDimensionMismatch",
    message: "Decoded remote material layer dimensions do not match the material source request.",
    severity: "error",
    path: "decodedLayer",
    received: `${layer.widthPx}x${layer.heightPx}`,
    allowedValues: [`${request.widthPx}x${request.heightPx}`]
  };
}

function decodedLayerByteLengthDiagnostic(
  layer: PixelLayer,
  request: MaterialSourceRequest
): Diagnostic {
  return {
    code: "remoteMaterialImageBridge.decodedLayerByteLengthMismatch",
    message: "Decoded remote material layer byte length does not match RGBA8 dimensions.",
    severity: "error",
    path: "decodedLayer.data",
    received: layer.data.byteLength,
    allowedValues: [request.widthPx * request.heightPx * 4]
  };
}

function decodeFailedDiagnostic(error: unknown): Diagnostic {
  return {
    code: "remoteMaterialImageBridge.decodeFailed",
    message: "Remote material PNG artifact could not be decoded into an RGBA8 layer.",
    severity: "warning",
    received: error instanceof Error ? error.message : String(error)
  };
}

export async function remoteMaterialOverlayFromImageArtifact(
  artifactInput: unknown,
  request: MaterialSourceRequest,
  decodePngLayer: PngLayerDecoder
): Promise<RemoteMaterialImageBridgeResult> {
  const parsed = RemoteMaterialImageArtifactSchema.safeParse(artifactInput);
  if (!parsed.success) {
    return { diagnostics: [invalidArtifactDiagnostic(parsed.error)] };
  }

  const artifact = parsed.data;
  if (artifact.sourceId !== request.sourceId) {
    return { diagnostics: [sourceMismatchDiagnostic(artifact, request)] };
  }

  let layer: PixelLayer;
  try {
    layer = await decodePngLayer({
      b64Json: artifact.image.b64Json,
      widthPx: request.widthPx,
      heightPx: request.heightPx
    });
  } catch (error) {
    return { diagnostics: [decodeFailedDiagnostic(error)] };
  }

  if (layer.widthPx !== request.widthPx || layer.heightPx !== request.heightPx) {
    return { diagnostics: [decodedLayerDimensionMismatchDiagnostic(layer, request)] };
  }

  const expectedByteLength = request.widthPx * request.heightPx * 4;
  if (layer.channels !== "rgba8" || layer.data.byteLength !== expectedByteLength) {
    return { diagnostics: [decodedLayerByteLengthDiagnostic(layer, request)] };
  }

  return {
    diagnostics: [],
    overlay: {
      sourceId: artifact.sourceId,
      providerId: artifact.providerId,
      widthPx: request.widthPx,
      heightPx: request.heightPx,
      layer,
      requestHash: artifact.requestHash,
      contentHash: artifact.contentHash,
      revisedPrompt: artifact.revisedPrompt,
      provenance: {
        providerId: artifact.provenance.providerId,
        seedPath: artifact.provenance.seedPath,
        promptVocabulary: artifact.provenance.promptVocabulary,
        algorithm: "remote-png-artifact-decode-v0.1"
      }
    }
  };
}
