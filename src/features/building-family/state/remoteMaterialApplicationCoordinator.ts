import type { Diagnostic } from "../core/diagnostics";
import {
  compositeRemoteMaterialOverlay,
  type RemoteMaterialOverlayOptions
} from "../materials/remoteMaterialOverlay";
import {
  remoteMaterialOverlayFromImageArtifact,
  type PngLayerDecoder
} from "../materials/remoteMaterialImageBridge";
import type {
  MaterialSourceArtifact,
  MaterialSourceRequest
} from "../materials/providers/proceduralMaterialProvider";
import {
  requestRemoteMaterialImages,
  type RequestRemoteMaterialImagesInput,
  type RemoteMaterialRouteResult
} from "./remoteMaterialRouteClient";

export type RemoteMaterialImageRequester = (
  input: RequestRemoteMaterialImagesInput
) => Promise<RemoteMaterialRouteResult>;

export interface AppliedRemoteMaterialSourceSummary {
  sourceId: string;
  providerId: string;
  requestHash: string;
  contentHash: string;
  revisedPrompt?: string;
}

export interface RemoteMaterialApplicationRouteSummary {
  schemaVersion: "0.1.0";
  status: RemoteMaterialRouteResult["status"];
  providerId?: string;
  requestHash?: string;
  acceptedRequestCount?: number;
  cacheStatus?: string;
}

export interface RemoteMaterialApplicationResult {
  artifacts: MaterialSourceArtifact[];
  diagnostics: Diagnostic[];
  remoteSources: AppliedRemoteMaterialSourceSummary[];
  route: RemoteMaterialApplicationRouteSummary;
}

export interface ApplyRemoteMaterialRouteOverlaysInput {
  runId: string;
  requests: MaterialSourceRequest[];
  proceduralArtifacts: MaterialSourceArtifact[];
  decodePngLayer: PngLayerDecoder;
  requestRemoteImages?: RemoteMaterialImageRequester;
  overlayOptions?: RemoteMaterialOverlayOptions;
}

function routeSummary(routeResult: RemoteMaterialRouteResult): RemoteMaterialApplicationRouteSummary {
  if (routeResult.status === "rejected") {
    return {
      schemaVersion: routeResult.schemaVersion,
      status: routeResult.status
    };
  }

  return {
    schemaVersion: routeResult.schemaVersion,
    status: routeResult.status,
    providerId: routeResult.providerId,
    requestHash: routeResult.requestHash,
    acceptedRequestCount: routeResult.acceptedRequestCount,
    cacheStatus: routeResult.cacheStatus
  };
}

function requestForSource(
  sourceId: string,
  requestsBySourceId: ReadonlyMap<string, MaterialSourceRequest>
): MaterialSourceRequest | undefined {
  return requestsBySourceId.get(sourceId);
}

function artifactForSource(
  sourceId: string,
  artifactsBySourceId: ReadonlyMap<string, MaterialSourceArtifact>
): MaterialSourceArtifact | undefined {
  return artifactsBySourceId.get(sourceId);
}

function missingProceduralArtifactDiagnostic(sourceId: string): Diagnostic {
  return {
    code: "remoteMaterialApplicationCoordinator.missingProceduralArtifact",
    message: "Remote material overlay could not be applied because the procedural source artifact is missing.",
    severity: "error",
    path: `sources.${sourceId}`
  };
}

function missingRequestDiagnostic(sourceId: string): Diagnostic {
  return {
    code: "remoteMaterialApplicationCoordinator.missingRequest",
    message: "Remote material overlay could not be applied because the source request is missing.",
    severity: "error",
    path: `sources.${sourceId}`
  };
}

function missingRemoteArtifactDiagnostic(sourceId: string): Diagnostic {
  return {
    code: "remoteMaterialApplicationCoordinator.missingRemoteArtifact",
    message: "Remote material route reported generated output but did not return an artifact for this requested source.",
    severity: "warning",
    path: `sources.${sourceId}`
  };
}

export async function applyRemoteMaterialRouteOverlays(
  input: ApplyRemoteMaterialRouteOverlaysInput
): Promise<RemoteMaterialApplicationResult> {
  const requestRemoteImages = input.requestRemoteImages ?? requestRemoteMaterialImages;
  const routeResult = await requestRemoteImages({
    runId: input.runId,
    requests: input.requests
  });
  const diagnostics: Diagnostic[] = [...routeResult.diagnostics];
  const requestsBySourceId = new Map(input.requests.map((request) => [request.sourceId, request]));
  const artifactsBySourceId = new Map(input.proceduralArtifacts.map((artifact) => [artifact.sourceId, artifact]));
  const appliedArtifacts = new Map(input.proceduralArtifacts.map((artifact) => [artifact.sourceId, artifact]));
  const remoteSources: AppliedRemoteMaterialSourceSummary[] = [];

  if (routeResult.status !== "generated") {
    return {
      artifacts: input.proceduralArtifacts,
      diagnostics,
      remoteSources,
      route: routeSummary(routeResult)
    };
  }

  for (const remoteArtifact of routeResult.artifacts) {
    const request = requestForSource(remoteArtifact.sourceId, requestsBySourceId);
    const proceduralArtifact = artifactForSource(remoteArtifact.sourceId, artifactsBySourceId);

    if (!request) {
      diagnostics.push(missingRequestDiagnostic(remoteArtifact.sourceId));
      continue;
    }
    if (!proceduralArtifact) {
      diagnostics.push(missingProceduralArtifactDiagnostic(remoteArtifact.sourceId));
      continue;
    }

    const bridgeResult = await remoteMaterialOverlayFromImageArtifact(
      remoteArtifact,
      request,
      input.decodePngLayer
    );
    diagnostics.push(...bridgeResult.diagnostics);
    if (!bridgeResult.overlay) {
      continue;
    }

    const compositeResult = await compositeRemoteMaterialOverlay(
      proceduralArtifact,
      bridgeResult.overlay,
      input.overlayOptions
    );
    diagnostics.push(...compositeResult.diagnostics);
    if (compositeResult.diagnostics.length > 0) {
      continue;
    }

    appliedArtifacts.set(proceduralArtifact.sourceId, compositeResult.artifact);
    remoteSources.push({
      sourceId: remoteArtifact.sourceId,
      providerId: remoteArtifact.providerId,
      requestHash: remoteArtifact.requestHash,
      contentHash: remoteArtifact.contentHash,
      revisedPrompt: remoteArtifact.revisedPrompt
    });
  }

  const remoteArtifactSourceIds = new Set(routeResult.artifacts.map((artifact) => artifact.sourceId));
  for (const request of input.requests) {
    if (!remoteArtifactSourceIds.has(request.sourceId)) {
      diagnostics.push(missingRemoteArtifactDiagnostic(request.sourceId));
    }
  }

  return {
    artifacts: input.proceduralArtifacts.map((artifact) => appliedArtifacts.get(artifact.sourceId) ?? artifact),
    diagnostics,
    remoteSources,
    route: routeSummary(routeResult)
  };
}
