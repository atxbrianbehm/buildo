import type { PackedAtlas } from "../materials/atlasPacker";
import type { AtlasDebugExport } from "../materials/atlasDebugExport";

export interface AtlasLabProps {
  packedAtlas: PackedAtlas;
  debugExport: AtlasDebugExport;
  materialSourceCacheHit?: boolean;
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

export function AtlasLab({ packedAtlas, debugExport, materialSourceCacheHit }: AtlasLabProps) {
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
