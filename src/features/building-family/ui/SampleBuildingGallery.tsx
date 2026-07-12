import { useMemo } from "react";
import { late19cApartmentKit, planFacadeModules, type FacadeModulePlacement } from "../art-kit";
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
  frontOpenings: FacadeModulePlacement[];
  facadeSignature: string;
  archedCount: number;
  rectangularCount: number;
  doorBayIndex: number | null;
}

type OpeningVisualKind = "door" | "arched" | "rectangular" | "storefront";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function shortHash(value: string): string {
  return value.slice(0, 12);
}

function openingVisualKind(moduleId: string, floorIndex: number): OpeningVisualKind {
  if (moduleId.includes("door")) {
    return "door";
  }
  if (moduleId.includes("arch")) {
    return "arched";
  }
  if (floorIndex === 0) {
    return "storefront";
  }
  return "rectangular";
}

function facadeSignatureFor(frontOpenings: FacadeModulePlacement[]): string {
  return frontOpenings
    .slice()
    .sort((a, b) => a.floorIndex - b.floorIndex || a.bayIndex - b.bayIndex)
    .map((placement) => `${placement.floorIndex}:${placement.bayIndex}:${placement.moduleId}`)
    .join("|");
}

function sampleCardsForFixture(fixture: AssemblyHallFixture, sampleCount: number): SampleBuildingCard[] {
  return fixture.variantStress.variants.slice(0, sampleCount).map((variant, index) => {
    const variantSpec: BuildingFamilySpec = {
      ...fixture.spec,
      seeds: {
        ...fixture.spec.seeds,
        building: variant.buildingSeed
      }
    };
    const plan =
      fixture.fidelityMode === "kit"
        ? planFacadeModules({
            spec: variantSpec,
            kit: late19cApartmentKit
          })
        : null;
    const frontOpenings =
      plan?.placements.filter(
        (placement) => placement.facade === "front" && placement.layer === "opening"
      ) ?? [];
    const door = frontOpenings.find((placement) => placement.moduleId.includes("door"));
    const archedCount = frontOpenings.filter((placement) => placement.moduleId.includes("arch")).length;
    const rectangularCount = frontOpenings.filter(
      (placement) =>
        placement.moduleId.includes("window") && !placement.moduleId.includes("arch")
    ).length;

    return {
      sampleNumber: index + 1,
      variant,
      frontOpenings,
      facadeSignature: facadeSignatureFor(frontOpenings),
      archedCount,
      rectangularCount,
      doorBayIndex: door?.bayIndex ?? null
    };
  });
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

  const openingsByCell = new Map(
    sample.frontOpenings.map((placement) => [
      `${placement.floorIndex}:${placement.bayIndex}`,
      placement
    ])
  );

  return (
    <svg
      aria-label={`Facade preview for generated building sample ${sample.sampleNumber}`}
      className="sample-gallery__facade"
      role="img"
      data-facade-signature={sample.facadeSignature}
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
          const placement = openingsByCell.get(`${floorIndex}:${bayIndex}`);
          if (!placement) {
            return null;
          }
          const kind = openingVisualKind(placement.moduleId, floorIndex);
          const cellLeft = leftX + bayIndex * bayWidth;
          const cellBottom = baseY - floorIndex * floorHeight;
          const cellTop = cellBottom - floorHeight;

          if (kind === "door") {
            const doorWidth = Math.min(26, bayWidth * 0.58);
            const doorHeight = Math.max(36, floorHeight * 0.68);
            return (
              <rect
                className="sample-gallery__door"
                data-opening-kind="door"
                height={doorHeight}
                key={`door-${floorIndex}-${bayIndex}`}
                rx="2"
                width={doorWidth}
                x={cellLeft + (bayWidth - doorWidth) / 2}
                y={cellBottom - doorHeight}
              />
            );
          }

          if (kind === "arched") {
            const windowWidth = Math.min(20, bayWidth * 0.48);
            const windowHeight = Math.min(30, floorHeight * 0.5);
            const x = cellLeft + (bayWidth - windowWidth) / 2;
            const y = cellTop + (floorHeight - windowHeight) / 2 + 2;
            const archRadius = windowWidth / 2;
            return (
              <g key={`window-arch-${floorIndex}-${bayIndex}`} data-opening-kind="arched">
                <path
                  className="sample-gallery__window sample-gallery__window--arched"
                  d={`M ${x} ${y + archRadius}
                     L ${x} ${y + windowHeight}
                     L ${x + windowWidth} ${y + windowHeight}
                     L ${x + windowWidth} ${y + archRadius}
                     A ${archRadius} ${archRadius} 0 0 0 ${x} ${y + archRadius}
                     Z`}
                />
              </g>
            );
          }

          const windowWidth =
            kind === "storefront" ? Math.min(24, bayWidth * 0.6) : Math.min(18, bayWidth * 0.46);
          const windowHeight =
            kind === "storefront" ? Math.max(22, floorHeight * 0.42) : Math.min(26, floorHeight * 0.46);
          const x = cellLeft + (bayWidth - windowWidth) / 2;
          const y =
            kind === "storefront"
              ? cellBottom - floorHeight * 0.68
              : cellTop + (floorHeight - windowHeight) / 2;

          return (
            <rect
              className={
                kind === "storefront" ? "sample-gallery__storefront" : "sample-gallery__window"
              }
              data-opening-kind={kind}
              height={windowHeight}
              key={`window-${floorIndex}-${bayIndex}`}
              rx={kind === "storefront" ? "2" : "3"}
              width={windowWidth}
              x={x}
              y={y}
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
  const samples = useMemo(
    () => sampleCardsForFixture(fixture, sampleCount),
    [fixture, sampleCount]
  );
  const distinctFacadeSignatures = useMemo(
    () => new Set(samples.map((sample) => sample.facadeSignature)).size,
    [samples]
  );
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
            <dt>Distinct facades</dt>
            <dd aria-label="Sample gallery distinct facade count">{formatNumber(distinctFacadeSignatures)}</dd>
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
          ? "Showing kit-mode variants (art-kit facade planner + plan-driven openings). Each card uses its building seed plan."
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
            data-facade-signature={sample.facadeSignature}
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
                  <dt>Front openings</dt>
                  <dd aria-label={`Sample ${sample.sampleNumber} opening mix`}>
                    {sample.archedCount} arch / {sample.rectangularCount} rect
                    {sample.doorBayIndex === null ? "" : ` · door bay ${sample.doorBayIndex + 1}`}
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
