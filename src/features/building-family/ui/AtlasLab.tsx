import type { PackedAtlas } from "../materials/atlasPacker";
import type { AtlasDebugExport } from "../materials/atlasDebugExport";
import { createRemoteMaterialProofPacket } from "../materials/remoteMaterialProofPacket";
import type { AssemblyHallRemoteMaterialApplication } from "./assemblyHallFixture";

export interface AtlasLabProps {
  packedAtlas: PackedAtlas;
  debugExport: AtlasDebugExport;
  materialSourceCacheHit?: boolean;
  remoteMaterialApplication?: AssemblyHallRemoteMaterialApplication;
}

function cacheStatusLabel(cacheStatus: AtlasDebugExport["providerDiagnostics"][number]["cacheStatus"]): string {
  return cacheStatus.replace("-", " ");
}

function providerCacheLabel(
  cacheStatus: AtlasDebugExport["providerDiagnostics"][number]["cacheStatus"],
  materialSourceCacheHit: boolean | undefined
): string {
  if (materialSourceCacheHit === true) {
    return "cache hit";
  }
  if (materialSourceCacheHit === false) {
    return "cache miss";
  }
  return cacheStatusLabel(cacheStatus);
}

function firstHash(hashes: string[]): string {
  return hashes[0] ?? "none";
}

function optionalLabel(value: string | number | undefined): string {
  return value === undefined ? "none" : String(value);
}

function safeFileSegment(value: string): string {
  const fileSegment = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return fileSegment || "building-family";
}

function downloadJsonFile(fileName: string, payload: unknown): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function canDownloadRemoteMaterialProofPacket(
  remoteMaterialApplication: AssemblyHallRemoteMaterialApplication | undefined
): remoteMaterialApplication is AssemblyHallRemoteMaterialApplication {
  return (
    remoteMaterialApplication?.route.status === "generated" &&
    remoteMaterialApplication.route.providerId === "openai-image" &&
    remoteMaterialApplication.remoteSources.length > 0
  );
}

export function AtlasLab({ packedAtlas, debugExport, materialSourceCacheHit, remoteMaterialApplication }: AtlasLabProps) {
  const canDownloadProofPacket = canDownloadRemoteMaterialProofPacket(remoteMaterialApplication);
  const downloadRemoteProofPacket = () => {
    if (!canDownloadProofPacket) {
      return;
    }

    downloadJsonFile(
      `${safeFileSegment(packedAtlas.atlasId)}-remote-material-proof.json`,
      createRemoteMaterialProofPacket({ packedAtlas, debugExport, remoteMaterialApplication })
    );
  };

  return (
    <section className="atlas-lab" aria-labelledby="atlas-lab-heading">
      <header className="atlas-lab__header">
        <h2 id="atlas-lab-heading">Atlas Lab</h2>
        <dl className="atlas-lab__metrics">
          <div>
            <dt>Atlas</dt>
            <dd>{packedAtlas.atlasId}</dd>
          </div>
          <div>
            <dt>Content</dt>
            <dd>{packedAtlas.contentHash}</dd>
          </div>
          <div>
            <dt>Export</dt>
            <dd>{debugExport.exportHash}</dd>
          </div>
        </dl>
      </header>

      <div className="atlas-lab__channels" aria-label="Atlas channels">
        {debugExport.channels.map((channel) => (
          <figure className="atlas-lab__channel" key={channel.name}>
            <img
              alt={`${channel.name} channel`}
              src={channel.pngDataUrl}
              width={Math.min(192, channel.widthPx)}
              height={Math.min(192, channel.heightPx)}
            />
            <figcaption>
              <span>{channel.name}</span>
              <span>{channel.channelHash}</span>
            </figcaption>
          </figure>
        ))}
      </div>

      {remoteMaterialApplication ? (
        <section className="atlas-lab__remote" aria-labelledby="atlas-lab-remote-heading">
          <div className="atlas-lab__remote-header">
            <h3 id="atlas-lab-remote-heading">Remote Material Details</h3>
            {canDownloadProofPacket ? (
              <button type="button" onClick={downloadRemoteProofPacket}>
                Download Remote Proof Packet
              </button>
            ) : null}
          </div>
          <dl className="atlas-lab__remote-summary" aria-label="Remote material route summary">
            <div>
              <dt>Status</dt>
              <dd>{remoteMaterialApplication.route.status}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{optionalLabel(remoteMaterialApplication.route.providerId)}</dd>
            </div>
            <div>
              <dt>Cache</dt>
              <dd>{optionalLabel(remoteMaterialApplication.route.cacheStatus)}</dd>
            </div>
            <div>
              <dt>Accepted</dt>
              <dd>{optionalLabel(remoteMaterialApplication.route.acceptedRequestCount)}</dd>
            </div>
            <div>
              <dt>Request</dt>
              <dd>{optionalLabel(remoteMaterialApplication.route.requestHash)}</dd>
            </div>
          </dl>
          {remoteMaterialApplication.remoteSources.length ? (
            <table className="atlas-lab__remote-table">
              <caption>Remote Revised Prompts</caption>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Content</th>
                  <th scope="col">Revised Prompt</th>
                </tr>
              </thead>
              <tbody>
                {remoteMaterialApplication.remoteSources.map((source) => (
                  <tr key={`${source.sourceId}-${source.requestHash}`}>
                    <td>{source.sourceId}</td>
                    <td>{source.providerId}</td>
                    <td>{source.contentHash}</td>
                    <td>{source.revisedPrompt ?? "none"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {remoteMaterialApplication.diagnostics.length ? (
            <table className="atlas-lab__remote-table">
              <caption>Remote Material Diagnostics</caption>
              <thead>
                <tr>
                  <th scope="col">Severity</th>
                  <th scope="col">Code</th>
                  <th scope="col">Message</th>
                </tr>
              </thead>
              <tbody>
                {remoteMaterialApplication.diagnostics.map((diagnostic, index) => (
                  <tr key={`${diagnostic.code}-${index}`}>
                    <td>{diagnostic.severity}</td>
                    <td>{diagnostic.code}</td>
                    <td>{diagnostic.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      ) : null}

      <table className="atlas-lab__providers">
        <caption>Provider Diagnostics</caption>
        <thead>
          <tr>
            <th scope="col">Provider</th>
            <th scope="col">Cache</th>
            <th scope="col">Coverage</th>
            <th scope="col">Requests</th>
            <th scope="col">Diagnostics</th>
            <th scope="col">Content</th>
          </tr>
        </thead>
        <tbody>
          {debugExport.providerDiagnostics.map((provider) => (
            <tr key={provider.providerId}>
              <td>{provider.providerId}</td>
              <td>{providerCacheLabel(provider.cacheStatus, materialSourceCacheHit)}</td>
              <td>
                <span>{provider.sourceCount} sources</span>
                <small>{provider.slotCount} slots</small>
              </td>
              <td>
                <span>{provider.requestHashes.length} requests</span>
                <small>{firstHash(provider.requestHashes)}</small>
              </td>
              <td>
                {provider.errorCount} errors / {provider.warningCount} warnings
              </td>
              <td>
                <span>{provider.contentHashes.length} hashes</span>
                <small>{firstHash(provider.contentHashes)}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="atlas-lab__slots">
        <caption>Semantic Slots</caption>
        <thead>
          <tr>
            <th scope="col">Slot</th>
            <th scope="col">Role</th>
            <th scope="col">Source</th>
            <th scope="col">Rect</th>
            <th scope="col">Content</th>
          </tr>
        </thead>
        <tbody>
          {debugExport.slotOverlays.map((slot) => (
            <tr key={slot.slotId}>
              <td>{slot.slotId}</td>
              <td>{slot.role}</td>
              <td>{slot.sourceId}</td>
              <td>
                {slot.rectPx.x},{slot.rectPx.y},{slot.rectPx.width},{slot.rectPx.height}
              </td>
              <td>{slot.contentHash}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
