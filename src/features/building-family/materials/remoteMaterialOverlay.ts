import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson, sha256Hex } from "../core/contentHash";
import type { Diagnostic } from "../core/diagnostics";
import type { MaterialSourceArtifact, PixelLayer } from "./providers/proceduralMaterialProvider";

const overlayProviderId = "procedural+remote-overlay";

export interface RemoteMaterialOverlay {
  sourceId: string;
  providerId: string;
  widthPx: number;
  heightPx: number;
  layer: PixelLayer;
  requestHash: string;
  contentHash: string;
  revisedPrompt?: string;
  provenance: {
    providerId: string;
    seedPath: string;
    promptVocabulary: string[];
    algorithm: string;
  };
}

export interface RemoteMaterialOverlayOptions {
  opacity?: number;
}

export interface RemoteMaterialOverlayResult {
  artifact: MaterialSourceArtifact;
  diagnostics: Diagnostic[];
}

function cloneLayer(layer: PixelLayer): PixelLayer {
  const data = new Uint8ClampedArray(layer.data.byteLength);
  data.set(layer.data);
  return {
    widthPx: layer.widthPx,
    heightPx: layer.heightPx,
    channels: layer.channels,
    data
  };
}

function cloneLayers(layers: MaterialSourceArtifact["layers"]): MaterialSourceArtifact["layers"] {
  return {
    baseColor: cloneLayer(layers.baseColor),
    height: layers.height ? cloneLayer(layers.height) : undefined,
    roughness: layers.roughness ? cloneLayer(layers.roughness) : undefined,
    metalness: layers.metalness ? cloneLayer(layers.metalness) : undefined,
    opacity: layers.opacity ? cloneLayer(layers.opacity) : undefined
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function blendByte(base: number, overlay: number, alpha: number): number {
  return Math.max(0, Math.min(255, Math.round(base * (1 - alpha) + overlay * alpha)));
}

function compositeBaseColor(
  proceduralBaseColor: PixelLayer,
  remoteOverlay: PixelLayer,
  opacity: number
): PixelLayer {
  const output = cloneLayer(proceduralBaseColor);
  const opacityScale = clamp01(opacity);

  for (let index = 0; index < output.data.length; index += 4) {
    const alpha = (remoteOverlay.data[index + 3] / 255) * opacityScale;
    output.data[index] = blendByte(proceduralBaseColor.data[index], remoteOverlay.data[index], alpha);
    output.data[index + 1] = blendByte(proceduralBaseColor.data[index + 1], remoteOverlay.data[index + 1], alpha);
    output.data[index + 2] = blendByte(proceduralBaseColor.data[index + 2], remoteOverlay.data[index + 2], alpha);
    output.data[index + 3] = proceduralBaseColor.data[index + 3];
  }

  return output;
}

function layerBytes(layers: MaterialSourceArtifact["layers"]): Uint8Array {
  const layerNames = Object.keys(layers).sort() as Array<keyof MaterialSourceArtifact["layers"]>;
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (const name of layerNames) {
    const layer = layers[name];
    if (!layer) {
      continue;
    }

    const header = new TextEncoder().encode(`${name}:${layer.widthPx}x${layer.heightPx}:`);
    const bytes = new Uint8Array(layer.data.byteLength);
    bytes.set(layer.data);
    chunks.push(header, bytes);
    total += header.byteLength + bytes.byteLength;
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function dimensionMismatchDiagnostic(
  proceduralArtifact: MaterialSourceArtifact,
  overlay: RemoteMaterialOverlay
): Diagnostic {
  return {
    code: "remoteMaterialOverlay.dimensionMismatch",
    message: `Remote overlay for ${overlay.sourceId} does not match procedural source dimensions.`,
    severity: "error",
    path: `sources.${overlay.sourceId}.overlay`,
    received: `${overlay.widthPx}x${overlay.heightPx}`,
    allowedValues: [`${proceduralArtifact.widthPx}x${proceduralArtifact.heightPx}`]
  };
}

function sourceMismatchDiagnostic(
  proceduralArtifact: MaterialSourceArtifact,
  overlay: RemoteMaterialOverlay
): Diagnostic {
  return {
    code: "remoteMaterialOverlay.sourceMismatch",
    message: "Remote overlay source id must match the procedural material source id.",
    severity: "error",
    path: "sourceId",
    received: overlay.sourceId,
    allowedValues: [proceduralArtifact.sourceId]
  };
}

function overlayLayerMismatchDiagnostic(overlay: RemoteMaterialOverlay): Diagnostic {
  return {
    code: "remoteMaterialOverlay.layerDimensionMismatch",
    message: `Remote overlay layer for ${overlay.sourceId} does not match overlay dimensions.`,
    severity: "error",
    path: `sources.${overlay.sourceId}.overlay.layer`,
    received: `${overlay.layer.widthPx}x${overlay.layer.heightPx}`,
    allowedValues: [`${overlay.widthPx}x${overlay.heightPx}`]
  };
}

async function contentHashFor(
  requestHash: string,
  layers: MaterialSourceArtifact["layers"]
): Promise<string> {
  return sha256Hex(
    new TextEncoder().encode(
      canonicalJson({
        providerId: overlayProviderId,
        requestHash,
        layerBytes: Array.from(layerBytes(layers))
      })
    )
  );
}

function mergedPromptVocabulary(
  proceduralArtifact: MaterialSourceArtifact,
  overlay: RemoteMaterialOverlay
): string[] {
  return Array.from(
    new Set([
      ...proceduralArtifact.provenance.promptVocabulary,
      ...overlay.provenance.promptVocabulary
    ])
  ).sort();
}

export async function compositeRemoteMaterialOverlay(
  proceduralArtifact: MaterialSourceArtifact,
  overlay: RemoteMaterialOverlay,
  options: RemoteMaterialOverlayOptions = {}
): Promise<RemoteMaterialOverlayResult> {
  const diagnostics: Diagnostic[] = [];

  if (proceduralArtifact.sourceId !== overlay.sourceId) {
    diagnostics.push(sourceMismatchDiagnostic(proceduralArtifact, overlay));
  }

  if (proceduralArtifact.widthPx !== overlay.widthPx || proceduralArtifact.heightPx !== overlay.heightPx) {
    diagnostics.push(dimensionMismatchDiagnostic(proceduralArtifact, overlay));
  }

  if (overlay.layer.widthPx !== overlay.widthPx || overlay.layer.heightPx !== overlay.heightPx) {
    diagnostics.push(overlayLayerMismatchDiagnostic(overlay));
  }

  if (diagnostics.length > 0) {
    return { artifact: proceduralArtifact, diagnostics };
  }

  const opacity = options.opacity ?? 1;
  const layers = {
    ...cloneLayers(proceduralArtifact.layers),
    baseColor: compositeBaseColor(proceduralArtifact.layers.baseColor, overlay.layer, opacity)
  };
  const requestHash = await hashCanonicalJson({
    schemaVersion: "0.1.0",
    providerId: overlayProviderId,
    sourceId: proceduralArtifact.sourceId,
    procedural: {
      providerId: proceduralArtifact.providerId,
      requestHash: proceduralArtifact.requestHash,
      contentHash: proceduralArtifact.contentHash
    },
    remoteOverlay: {
      providerId: overlay.providerId,
      requestHash: overlay.requestHash,
      contentHash: overlay.contentHash,
      revisedPrompt: overlay.revisedPrompt
    },
    options: {
      opacity: clamp01(opacity)
    }
  });
  const contentHash = await contentHashFor(requestHash, layers);

  return {
    artifact: {
      sourceId: proceduralArtifact.sourceId,
      providerId: overlayProviderId,
      widthPx: proceduralArtifact.widthPx,
      heightPx: proceduralArtifact.heightPx,
      layers,
      requestHash,
      contentHash,
      provenance: {
        providerId: overlayProviderId,
        seedPath: proceduralArtifact.provenance.seedPath,
        promptVocabulary: mergedPromptVocabulary(proceduralArtifact, overlay),
        algorithm: "remote-overlay-over-procedural-v0.1"
      }
    },
    diagnostics
  };
}
