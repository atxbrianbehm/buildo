import type { BuildingFamilySpec } from "../contracts/buildingFamilySpec";
import type {
  AssemblyHallFixture,
  AssemblyHallVariantStressVariant
} from "./assemblyHallFixture";

export interface SampleBuildingGalleryProps {
  fixture: AssemblyHallFixture;
  sampleCount?: number;
  /**
   * Open a sample in Assembly Hall by regenerating with that sample's building seed.
   * When omitted, links only switch rooms and keep the active fixture seed.
   */
  onOpenInAssemblyHall?: (input: { buildingSeed: string; sampleNumber: number }) => void;
}

interface SampleBuildingCard {
  sampleNumber: number;
  variant: AssemblyHallVariantStressVariant;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function shortHash(value: string): string {
  return value.slice(0, 12);
}

function sampleCardsForFixture(fixture: AssemblyHallFixture, sampleCount: number): SampleBuildingCard[] {
  return fixture.variantStress.variants.slice(0, sampleCount).map((variant, index) => ({
    sampleNumber: index + 1,
    variant
  }));
}

function sampleFacadeFill(sampleNumber: number): string {
  const fills = ["#a2573f", "#b56c46", "#8f674d", "#b98258", "#7f5d4c", "#a74f43", "#977259", "#b8614b"];
  return fills[(sampleNumber - 1) % fills.length];
}

function BuildingFacadePreview({
  sample,
  spec
}: {
  sample: SampleBuildingCard;
  spec: BuildingFamilySpec;
}) {
  const floorCount = spec.massing.floorCount;
  const bayCount = spec.facade.frontBayCount;
  const buildingWidth = 224;
  const buildingHeight = 256;
  const baseY = 338;
  const leftX = 48;
  const topY = baseY - buildingHeight;
  const floorHeight = buildingHeight / floorCount;
  const bayWidth = buildingWidth / bayCount;
  const wallFill = sampleFacadeFill(sample.sampleNumber);
  const roofPath =
    spec.massing.roof.type === "gable"
      ? `M ${leftX - 8} ${topY + 18} L ${leftX + buildingWidth / 2} ${topY - 30} L ${
          leftX + buildingWidth + 8
        } ${topY + 18} Z`
      : `M ${leftX - 8} ${topY + 16} H ${leftX + buildingWidth + 8} V ${topY + 38} H ${leftX - 8} Z`;

  return (
    <svg
      aria-label={`Facade preview for generated building sample ${sample.sampleNumber}`}
      className="sample-gallery__facade"
      role="img"
      viewBox="0 0 320 390"
    >
      <rect className="sample-gallery__sky" height="390" rx="8" width="320" x="0" y="0" />
      <path className="sample-gallery__roof" d={roofPath} />
      <rect
        className="sample-gallery__wall"
        fill={wallFill}
        height={buildingHeight}
        width={buildingWidth}
        x={leftX}
        y={topY}
      />
      {Array.from({ length: floorCount + 1 }, (_, index) => (
        <line
          className="sample-gallery__belt"
          key={`floor-${index}`}
          x1={leftX}
          x2={leftX + buildingWidth}
          y1={baseY - index * floorHeight}
          y2={baseY - index * floorHeight}
        />
      ))}
      {Array.from({ length: bayCount + 1 }, (_, index) => (
        <line
          className="sample-gallery__pilaster"
          key={`bay-${index}`}
          x1={leftX + index * bayWidth}
          x2={leftX + index * bayWidth}
          y1={topY + 10}
          y2={baseY}
        />
      ))}
      {Array.from({ length: floorCount }, (_, floorIndex) =>
        Array.from({ length: bayCount }, (_, bayIndex) => {
          const windowWidth = Math.min(18, bayWidth * 0.46);
          const windowHeight = Math.min(28, floorHeight * 0.48);
          const x = leftX + bayIndex * bayWidth + (bayWidth - windowWidth) / 2;
          const y = baseY - (floorIndex + 1) * floorHeight + (floorHeight - windowHeight) / 2;
          const isGroundCenter = floorIndex === 0 && bayIndex === Math.floor(bayCount / 2);

          if (isGroundCenter) {
            return (
              <rect
                className="sample-gallery__door"
                height={Math.max(34, floorHeight * 0.62)}
                key={`door-${floorIndex}-${bayIndex}`}
                rx="2"
                width={Math.min(24, bayWidth * 0.56)}
                x={leftX + bayIndex * bayWidth + (bayWidth - Math.min(24, bayWidth * 0.56)) / 2}
                y={baseY - Math.max(34, floorHeight * 0.62)}
              />
            );
          }

          return (
            <rect
              className={floorIndex === 0 ? "sample-gallery__storefront" : "sample-gallery__window"}
              height={floorIndex === 0 ? Math.max(22, floorHeight * 0.42) : windowHeight}
              key={`window-${floorIndex}-${bayIndex}`}
              rx={floorIndex === 0 ? "2" : "7"}
              width={floorIndex === 0 ? Math.min(24, bayWidth * 0.6) : windowWidth}
              x={floorIndex === 0 ? leftX + bayIndex * bayWidth + (bayWidth - Math.min(24, bayWidth * 0.6)) / 2 : x}
              y={floorIndex === 0 ? baseY - floorHeight * 0.68 : y}
            />
          );
        })
      )}
      <rect className="sample-gallery__cornice" height="10" width={buildingWidth + 18} x={leftX - 9} y={topY + 28} />
      <ellipse className="sample-gallery__shadow" cx="160" cy="354" rx="116" ry="18" />
    </svg>
  );
}

export function SampleBuildingGallery({
  fixture,
  sampleCount = 8,
  onOpenInAssemblyHall
}: SampleBuildingGalleryProps) {
  const samples = sampleCardsForFixture(fixture, sampleCount);
  const baseColorChannel = fixture.debugExport.channels.find((channel) => channel.name === "baseColor");
  const floorLabel = `${fixture.spec.massing.floorCount} floors`;
  const bayLabel = `${fixture.spec.facade.frontBayCount} bays`;

  return (
    <section className="sample-gallery" aria-labelledby="sample-gallery-heading">
      <div className="sample-gallery__intro">
        <div>
          <p className="project-label">Generated HTML</p>
          <h2 id="sample-gallery-heading">Sample Buildings</h2>
        </div>
        <dl className="sample-gallery__summary" aria-label="Sample gallery lineage">
          <div>
            <dt>Family</dt>
            <dd>{fixture.spec.familyId}</dd>
          </div>
          <div>
            <dt>Fidelity</dt>
            <dd aria-label="Sample gallery fidelity mode">{fixture.fidelityMode}</dd>
          </div>
          <div>
            <dt>Atlas</dt>
            <dd>{shortHash(fixture.packedAtlas.contentHash)}</dd>
          </div>
          <div>
            <dt>Variants</dt>
            <dd>{formatNumber(fixture.variantStress.variantCount)}</dd>
          </div>
          <div>
            <dt>Shape</dt>
            <dd>
              {floorLabel} / {bayLabel}
            </dd>
          </div>
        </dl>
      </div>

      <p className="sample-gallery__fidelity-banner" aria-label="Sample gallery fidelity banner">
        {fixture.fidelityMode === "kit"
          ? "Showing kit-mode variants (art-kit facade planner + plan-driven openings)."
          : "Showing proof-mode variants (legacy front-only openings, no art-kit plan node)."}
      </p>

      <div className="sample-gallery__atlas" aria-label="Sample gallery material atlas">
        {baseColorChannel ? <img alt="baseColor atlas used by sample buildings" src={baseColorChannel.pngDataUrl} /> : null}
        <div>
          <span>Shared atlas</span>
          <strong>{fixture.packedAtlas.atlasId}</strong>
        </div>
      </div>

      <div className="sample-gallery__grid" aria-label="Generated sample building gallery">
        {samples.map((sample) => (
          <article
            aria-label={`Generated building sample ${sample.sampleNumber}`}
            className="sample-gallery__card"
            key={sample.variant.buildingId}
          >
            <BuildingFacadePreview sample={sample} spec={fixture.spec} />
            <div className="sample-gallery__card-body">
              <div className="sample-gallery__card-title">
                <h3>Sample {sample.sampleNumber}</h3>
                <span>{sample.variant.buildingSeed}</span>
              </div>
              <p className="sample-gallery__mode-badge" aria-label={`Sample ${sample.sampleNumber} fidelity mode`}>
                {fixture.fidelityMode === "kit" ? "kit mode" : "proof mode"}
              </p>
              <dl className="sample-gallery__card-metrics">
                <div>
                  <dt>Shape</dt>
                  <dd>
                    {floorLabel} / {bayLabel}
                  </dd>
                </div>
                <div>
                  <dt>Triangles</dt>
                  <dd>{formatNumber(sample.variant.triangleCount)}</dd>
                </div>
                <div>
                  <dt>Instances</dt>
                  <dd>{formatNumber(sample.variant.instanceCount)}</dd>
                </div>
                <div>
                  <dt>Paths</dt>
                  <dd>{formatNumber(sample.variant.semanticPathCount)}</dd>
                </div>
                <div>
                  <dt>Family</dt>
                  <dd>{fixture.spec.familyId}</dd>
                </div>
                <div>
                  <dt>Atlas</dt>
                  <dd>{shortHash(fixture.packedAtlas.contentHash)}</dd>
                </div>
              </dl>
              {onOpenInAssemblyHall ? (
                <button
                  type="button"
                  className="sample-gallery__link"
                  onClick={() =>
                    onOpenInAssemblyHall({
                      buildingSeed: sample.variant.buildingSeed,
                      sampleNumber: sample.sampleNumber
                    })
                  }
                >
                  Open in Assembly Hall
                </button>
              ) : (
                <a
                  className="sample-gallery__link"
                  href={`#room=assemblyHall&buildingSeed=${encodeURIComponent(sample.variant.buildingSeed)}`}
                >
                  Open in Assembly Hall
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
