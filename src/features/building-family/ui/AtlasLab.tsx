import type { PackedAtlas } from "../materials/atlasPacker";
import type { AtlasDebugExport } from "../materials/atlasDebugExport";

export interface AtlasLabProps {
  packedAtlas: PackedAtlas;
  debugExport: AtlasDebugExport;
}

export function AtlasLab({ packedAtlas, debugExport }: AtlasLabProps) {
  return (
    <section aria-labelledby="atlas-lab-heading">
      <header>
        <h2 id="atlas-lab-heading">Atlas Lab</h2>
        <dl>
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

      <div aria-label="Atlas channels">
        {debugExport.channels.map((channel) => (
          <figure key={channel.name}>
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

      <table>
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
