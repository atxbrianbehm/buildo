import { compileBuilding } from "../compiler/buildingCompiler";
import { buildComponentGallery } from "../compiler/componentGalleryBuilder";
import { canonicalJson } from "../core/canonicalJson";
import { sha256Hex } from "../core/contentHash";
import type { AtlasDebugExport } from "../materials/atlasDebugExport";
import {
  parseCompletedFamilyExportBundle,
  type CompletedFamilyExportBundle
} from "./completedFamilyExportBundle";
import {
  completedFamilyExportAtlasContentHash,
  decodeCompletedFamilyExportAtlasChannels,
  verifyCompletedFamilyExportBundle
} from "./completedFamilyExportVerifier";
import {
  parseCompletedFamilyPersistencePacket,
  type CompletedFamilyPersistencePacket
} from "./completedFamilyPersistence";

function debugSlotOverlaysFor(bundle: CompletedFamilyExportBundle): AtlasDebugExport["slotOverlays"] {
  const provenanceBySlot = new Map(bundle.atlas.slotProvenance.map((entry) => [entry.slotId, entry]));

  return bundle.atlas.manifest.slots.map((slot) => {
    const provenance = provenanceBySlot.get(slot.id);
    if (!provenance) {
      throw new Error(`Missing slot provenance for imported completed-family export slot ${slot.id}.`);
    }

    return {
      slotId: slot.id,
      sourceId: slot.materialSourceId,
      role: slot.role,
      rectPx: slot.rectPx,
      providerId: provenance.providerId,
      requestHash: provenance.requestHash,
      contentHash: provenance.contentHash
    };
  });
}

function debugProviderDiagnosticsFor(bundle: CompletedFamilyExportBundle): AtlasDebugExport["providerDiagnostics"] {
  const buckets = new Map<
    string,
    {
      contentHashes: Set<string>;
      requestHashes: Set<string>;
      slotIds: Set<string>;
      sourceIds: Set<string>;
    }
  >();

  for (const provenance of bundle.atlas.slotProvenance) {
    const bucket = buckets.get(provenance.providerId) ?? {
      contentHashes: new Set<string>(),
      requestHashes: new Set<string>(),
      slotIds: new Set<string>(),
      sourceIds: new Set<string>()
    };
    bucket.contentHashes.add(provenance.contentHash);
    bucket.requestHashes.add(provenance.requestHash);
    bucket.slotIds.add(provenance.slotId);
    bucket.sourceIds.add(provenance.sourceId);
    buckets.set(provenance.providerId, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([providerId, bucket]) => ({
      schemaVersion: "0.1.0",
      providerId,
      cacheStatus: "generated",
      sourceCount: bucket.sourceIds.size,
      slotCount: bucket.slotIds.size,
      requestHashes: Array.from(bucket.requestHashes).sort((left, right) => left.localeCompare(right)),
      contentHashes: Array.from(bucket.contentHashes).sort((left, right) => left.localeCompare(right)),
      warningCount: 0,
      errorCount: 0,
      diagnostics: []
    }));
}

async function importedDebugExportFor(bundle: CompletedFamilyExportBundle): Promise<AtlasDebugExport> {
  const slotOverlays = debugSlotOverlaysFor(bundle);
  const providerDiagnostics = debugProviderDiagnosticsFor(bundle);
  const exportHash = await sha256Hex(
    canonicalJson({
      schemaVersion: "0.1.0",
      atlasId: bundle.atlas.manifest.atlasId,
      sourceContentHash: bundle.atlas.contentHash,
      channelHashes: bundle.atlas.channels.map((channel) => [channel.name, channel.channelHash]),
      slotOverlays,
      providerDiagnostics,
      diagnostics: bundle.atlas.diagnostics
    })
  );

  return {
    schemaVersion: "0.1.0",
    atlasId: bundle.atlas.manifest.atlasId,
    sourceContentHash: bundle.atlas.contentHash,
    exportHash,
    channels: bundle.atlas.channels,
    slotOverlays,
    providerDiagnostics,
    diagnostics: bundle.atlas.diagnostics
  };
}

export async function importCompletedFamilyExportBundleToPacket(
  input: unknown
): Promise<CompletedFamilyPersistencePacket> {
  const bundle = parseCompletedFamilyExportBundle(input);
  const verification = await verifyCompletedFamilyExportBundle(bundle);
  if (verification.status !== "verified") {
    throw new Error(
      `Completed-family export bundle could not be imported: ${verification.checks
        .filter((check) => check.status === "failed")
        .map((check) => check.code)
        .join(", ")}`
    );
  }

  const atlasChannels = decodeCompletedFamilyExportAtlasChannels(bundle);
  const atlasContentHash = await completedFamilyExportAtlasContentHash({
    channels: atlasChannels,
    slotProvenance: bundle.atlas.slotProvenance
  });
  const runtimeIr = await compileBuilding({
    spec: bundle.spec,
    catalog: bundle.componentCatalog,
    graph: bundle.graph,
    buildingId: bundle.buildingId
  });
  const componentGallery = await buildComponentGallery({
    catalog: bundle.componentCatalog,
    ir: runtimeIr
  });

  return parseCompletedFamilyPersistencePacket({
    schemaVersion: "0.1.0",
    documentId: bundle.documentId,
    runId: bundle.runId,
    requestHash: bundle.requestHash,
    contentHash: bundle.contentHash,
    createdAt: bundle.createdAt,
    familyId: bundle.familyId,
    buildingId: bundle.buildingId,
    stylePackReference: bundle.stylePackReference,
    artifacts: {
      spec: bundle.spec,
      atlasManifest: bundle.atlas.manifest,
      atlasChannels,
      atlasContentHash,
      atlasSlotProvenance: bundle.atlas.slotProvenance,
      componentCatalog: bundle.componentCatalog,
      graph: bundle.graph,
      runtimeIr,
      componentGallery,
      debugExport: await importedDebugExportFor(bundle)
    },
    provenance: bundle.provenance
  });
}
