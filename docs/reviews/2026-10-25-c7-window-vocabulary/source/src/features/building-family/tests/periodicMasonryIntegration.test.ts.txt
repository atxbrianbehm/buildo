import { readFileSync } from "node:fs";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { planAtlas, type AtlasPlan } from "../materials/atlasPlanner";
import { packAtlas, type PackedAtlas } from "../materials/atlasPacker";
import { normalFromHeight } from "../materials/normalFromHeight";
import { blendPeriodicEdges } from "../materials/periodicBlend";
import { PRIMARY_WALL_PERIODIC_SAMPLING_PROFILE, rasterizePeriodicMasonry } from "../materials/periodicMasonryRaster";
import { compositeRemoteMaterialOverlay, type RemoteMaterialOverlay } from "../materials/remoteMaterialOverlay";
import { getProceduralMaterialRequestIdentity, hashMaterialSourceContent, ProceduralMaterialProvider,
  type MaterialSourceArtifact, type MaterialSourceRequest, type PixelLayer } from "../materials/providers/proceduralMaterialProvider";
import { R1AcceptanceCardSchema } from "../qa/r1BaselineContracts";
import { R1MasonryCoverageDeltaSchema, type R1MasonryCoverageDelta } from "../qa/r1MasonryCoverage";

function json(file: string): unknown { return JSON.parse(readFileSync(file, "utf8")); }
function requests(plan: AtlasPlan, size = 32): MaterialSourceRequest[] {
  return plan.materialSources.map((source) => ({ ...source, widthPx: size, heightPx: size }));
}
function withoutProfile(plan: AtlasPlan): AtlasPlan {
  const legacy = structuredClone(plan);
  legacy.materialSources = legacy.materialSources.map((source) => {
    delete source.samplingProfile;
    return source;
  });
  return legacy;
}
function pixel(layer: PixelLayer, x: number, y: number): number[] {
  const offset = (y * layer.widthPx + x) * 4;
  return Array.from(layer.data.slice(offset, offset + 4));
}
function sourceRows(sources: MaterialSourceArtifact[]) {
  return sources.map(({ sourceId, providerId, requestHash, contentHash }) =>
    ({ sourceId, providerId, requestHash, contentHash })).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
}
function cloneSourceArtifacts(input: MaterialSourceArtifact[]): MaterialSourceArtifact[] {
  const copies = structuredClone(input);
  copies.forEach((copy, index) => {
    for (const [name, layer] of Object.entries(input[index].layers)) {
      // Preserve each original typed-array realm so adversarial cases exercise
      // their intended request/hash/field checks, rather than a class guard.
      if (layer) copy.layers[name as keyof MaterialSourceArtifact["layers"]] = { ...layer, data: layer.data.slice() };
    }
  });
  return copies;
}
function overlayFor(source: MaterialSourceArtifact): RemoteMaterialOverlay {
  const data = new Uint8ClampedArray(source.widthPx * source.heightPx * 4);
  for (let index = 0; index < data.length; index += 4) data.set([200, 50, 0, 128], index);
  return {
    sourceId: source.sourceId, providerId: "openai-image", widthPx: source.widthPx, heightPx: source.heightPx,
    layer: { widthPx: source.widthPx, heightPx: source.heightPx, channels: "rgba8", data },
    requestHash: "mock-overlay-request", contentHash: "mock-overlay-content",
    provenance: { providerId: "openai-image", seedPath: source.provenance.seedPath,
      promptVocabulary: ["brick", "patina"], algorithm: "mock-overlay" }
  };
}

let plan: AtlasPlan;
let legacyPlan: AtlasPlan;
let legacySources: MaterialSourceArtifact[];
let sources: MaterialSourceArtifact[];
let oldAtlas: PackedAtlas;
let atlas: PackedAtlas;
let baseline: R1MasonryCoverageDelta;

beforeAll(async () => {
  const card = R1AcceptanceCardSchema.parse(json("docs/reviews/2026-10-14-r1-s6-verified/acceptance-card.json"));
  baseline = R1MasonryCoverageDeltaSchema.parse(json("docs/reviews/2026-10-14-r1-s6-verified/material-baseline-delta.json"));
  plan = await planAtlas(card.resolvedSpec, { widthPx: 128, heightPx: 128, paddingPx: 4 });
  legacyPlan = withoutProfile(plan);
  const provider = new ProceduralMaterialProvider();
  const signal = new AbortController().signal;
  legacySources = await Promise.all(requests(legacyPlan).map((request) => provider.generate(request, signal)));
  sources = await Promise.all(requests(plan).map((request) => provider.generate(request, signal)));
  oldAtlas = await packAtlas(legacyPlan, legacySources);
  atlas = await packAtlas(plan, sources);
});

describe("selected primary wall periodic source-to-atlas integration", () => {
  it("selects only the authoritative primary material without changing the manifest identity", () => {
    expect(plan.materialSources).toHaveLength(12);
    expect(plan.materialSources.filter((source) => source.samplingProfile).map((source) => source.sourceId)).toEqual(["source.wall.primary"]);
    expect(plan.materialSources[0].samplingProfile).toEqual(PRIMARY_WALL_PERIODIC_SAMPLING_PROFILE);
    expect(plan.manifest).toEqual(legacyPlan.manifest);
    expect(plan.manifest.atlasId).toBe("atlas-1d48a26ed6a65eb6");
    expect(plan.manifest.slots[0].physicalSizeM).toEqual({ width: 0.96, height: 0.96 });
    expect(plan.manifest.slots[0].rectPx).toEqual({ x: 4, y: 4, width: 27, height: 37 });
    expect(atlas.diagnostics).toEqual([]);
  });

  it("replays all twelve actual S6 no-profile request/content goldens and the complete old atlas", () => {
    expect(sourceRows(legacySources)).toEqual(baseline.after.sourceHashes);
    expect(oldAtlas.contentHash).toBe("1ad52cb4ac9efae1e2d66d6494858efc853a944adc29a9a43c1d4b4f70b86bfd");
    expect(legacySources.every((source) => !Object.hasOwn(source, "rasterDescriptor"))).toBe(true);
    expect(legacySources[0].requestHash).toBe("fe3c0040dee939d9713031bbaa6e8edbb84cbb7ccbd29f97c0b136f732a5c57a");
    expect(legacySources[0].contentHash).toBe("ab206b69ff261d393ca5c1d325a9a919f374ac3f69365e824990054070098a18");
  });

  it("keeps the S6 legacy stochastic seed and raw roughness while binding the new descriptor", async () => {
    const identity = await getProceduralMaterialRequestIdentity(requests(plan)[0]);
    expect(identity.stochasticHash).toBe(baseline.legacySeedHash);
    expect(identity.stochasticHash).toBe("de21bfc55069aaba85b6af1e1b37a1d391f03ca26731fcb7ef3fd1dea4cb5c31");
    expect(sources[0].rasterDescriptor?.legacyStochasticHash).toBe(identity.stochasticHash);
    expect(sources[0].rasterDescriptor?.seedRoot).toBe(`${sources[0].provenance.seedPath}/${identity.stochasticHash}`);
    expect(sources[0].provenance.algorithm).toBe("procedural-v0.1-typed-rgba/primary-authored-wall-periodic-area-v2");
    expect(sources[0].requestHash).not.toBe(legacySources[0].requestHash);
    expect(sources[0].contentHash).not.toBe(legacySources[0].contentHash);
    expect(sources[0].layers.roughness).toEqual(legacySources[0].layers.roughness);
    expect(sources[0].layers.baseColor.data).not.toEqual(legacySources[0].layers.baseColor.data);
    expect(sources[0].layers.height?.data).not.toEqual(legacySources[0].layers.height?.data);
    expect(await hashMaterialSourceContent(sources[0])).toBe(sources[0].contentHash);
    expect(await hashMaterialSourceContent({ ...sources[0], rasterDescriptor: undefined })).not.toBe(sources[0].contentHash);
    expect(identity.requestHash).toBe(await hashCanonicalJson({
      providerId: "procedural", request: requests(plan)[0], coverageProfile: PRIMARY_WALL_PERIODIC_SAMPLING_PROFILE.model
    }));
  });

  it("keeps all eleven other complete sources and whole ORM/opacity bytes exact", () => {
    expect(sources.slice(1)).toEqual(legacySources.slice(1));
    expect(atlas.channels.orm).toEqual(oldAtlas.channels.orm);
    expect(atlas.channels.opacity).toEqual(oldAtlas.channels.opacity);
    expect(atlas.slotProvenance.slice(1)).toEqual(oldAtlas.slotProvenance.slice(1));
  });

  it("keeps complete source arrays, descriptors and the plan immutable while repacking", async () => {
    // structuredClone crosses the Node/jsdom typed-array realm. Snapshot every
    // metadata/raw byte value, and check ownership separately by identity.
    const frozenSources = canonicalJson(sources);
    const frozenPlan = canonicalJson(plan);
    const layerReferences = sources.flatMap((source) => Object.entries(source.layers).flatMap(([name, layer]) =>
      layer ? [{ source, name: name as keyof MaterialSourceArtifact["layers"], layer, data: layer.data, buffer: layer.data.buffer }] : []));
    const repacked = await packAtlas(plan, sources);
    expect(canonicalJson(sources)).toBe(frozenSources);
    expect(canonicalJson(plan)).toBe(frozenPlan);
    for (const reference of layerReferences) {
      const current = reference.source.layers[reference.name];
      expect(current).toBe(reference.layer);
      expect(current?.data).toBe(reference.data);
      expect(current?.data.buffer).toBe(reference.buffer);
    }
    expect(repacked.contentHash).toBe(atlas.contentHash);
    expect(repacked.channels).toEqual(atlas.channels);
  });

  it("evaluates the actual ROI before normal derivation and preserves padding ownership", () => {
    const slot = plan.manifest.slots[0];
    const roi = rasterizePeriodicMasonry(sources[0].rasterDescriptor!, slot.rectPx.width, slot.rectPx.height);
    const expected = { ...roi, normal: normalFromHeight(roi.height, { wrapX: true, wrapY: true }) };
    const owner = new Int16Array(plan.manifest.widthPx * plan.manifest.heightPx).fill(-1);
    // Later slots own overlap in shared padding. This mirrors write ownership,
    // independently of the packer's sampling/normal/padding implementation.
    plan.manifest.slots.forEach((entry, index) => {
      for (let y = Math.max(0, entry.rectPx.y - plan.manifest.paddingPx);
        y < Math.min(plan.manifest.heightPx, entry.rectPx.y + entry.rectPx.height + plan.manifest.paddingPx); y += 1) {
        for (let x = Math.max(0, entry.rectPx.x - plan.manifest.paddingPx);
          x < Math.min(plan.manifest.widthPx, entry.rectPx.x + entry.rectPx.width + plan.manifest.paddingPx); x += 1) {
          owner[y * plan.manifest.widthPx + x] = index;
        }
      }
    });
    let changedPixels = 0;
    for (let y = 0; y < plan.manifest.heightPx; y += 1) {
      for (let x = 0; x < plan.manifest.widthPx; x += 1) {
        const isPrimary = owner[y * plan.manifest.widthPx + x] === 0;
        for (const name of ["baseColor", "height", "normal"] as const) {
          const actual = pixel(atlas.channels[name], x, y);
          if (isPrimary) {
            const sampleX = Math.max(0, Math.min(slot.rectPx.width - 1, x - slot.rectPx.x));
            const sampleY = Math.max(0, Math.min(slot.rectPx.height - 1, y - slot.rectPx.y));
            expect(actual).toEqual(pixel(expected[name], sampleX, sampleY));
            if (canonicalJson(actual) !== canonicalJson(pixel(oldAtlas.channels[name], x, y))) changedPixels += 1;
          } else expect(actual).toEqual(pixel(oldAtlas.channels[name], x, y));
        }
      }
    }
    expect(changedPixels).toBeGreaterThan(0);
    expect(expected.height.widthPx).toBe(27);
    expect(expected.height.heightPx).toBe(37);
  });

  it.each([16, 64])("preserves the custom %i-pixel source API with a fixed 32-cell grain basis", async (size) => {
    const source = await new ProceduralMaterialProvider().generate(requests(plan, size)[0], new AbortController().signal);
    expect(source.rasterDescriptor?.grainSizePx).toEqual({ width: 32, height: 32 });
    expect(source.layers.baseColor.widthPx).toBe(size);
    const custom = await packAtlas(plan, [source, ...sources.slice(1)]);
    const slot = plan.manifest.slots[0];
    const expected = rasterizePeriodicMasonry(source.rasterDescriptor!, 27, 37);
    for (let y = 0; y < 37; y += 1) for (let x = 0; x < 27; x += 1) {
      expect(pixel(custom.channels.baseColor, slot.rectPx.x + x, slot.rectPx.y + y)).toEqual(pixel(expected.baseColor, x, y));
      expect(pixel(custom.channels.height, slot.rectPx.x + x, slot.rectPx.y + y)).toEqual(pixel(expected.height, x, y));
    }
  });

  it("retains no-profile routing when authored art-kit binding is disabled", async () => {
    const card = R1AcceptanceCardSchema.parse(json("docs/reviews/2026-10-14-r1-s6-verified/acceptance-card.json"));
    const unbound = await planAtlas(card.resolvedSpec, { artKit: null });
    expect(unbound.materialSources.every((source) => source.samplingProfile === undefined)).toBe(true);
  });
});

describe("periodic descriptor and authority rejection", () => {
  it.each([
    { sourceId: "source.wall.primary.lookalike" }, { role: "horizontalTrim" as const },
    { artKitMaterialRoleId: "plaster" }, { proceduralSource: "brick-lookalike" },
    { periodicity: "x" as const }, { metersPerTile: 0.9 }, { physicalSizeM: { width: 0.9, height: 0.96 } }
  ])("rejects a selected request with mismatched authority %j", async (partial) => {
    await expect(new ProceduralMaterialProvider().generate({ ...requests(plan)[0], ...partial }, new AbortController().signal)).rejects.toThrow();
  });

  it.each([0, -1, 1.5, 4097])("rejects an invalid selected source dimension %s", async (widthPx) => {
    await expect(new ProceduralMaterialProvider().generate({ ...requests(plan)[0], widthPx }, new AbortController().signal)).rejects.toThrow();
  });

  it.each(["deleted", "seed", "request", "algorithm", "provider", "prompt", "stochastic", "descriptor-schema", "layer-bytes", "rehashed-field", "rehashed-height"] as const)(
    "rejects selected descriptor/provenance corruption: %s", async (kind) => {
      const changed = cloneSourceArtifacts(sources);
      const source = changed[0];
      if (kind === "deleted") delete source.rasterDescriptor;
      if (kind === "seed") source.provenance.seedPath = "rerolled";
      if (kind === "request") source.requestHash = "f".repeat(64);
      if (kind === "algorithm") source.provenance.algorithm = "legacy";
      if (kind === "provider") source.provenance.providerId = "overlay";
      if (kind === "prompt") source.provenance.promptVocabulary = ["changed"];
      if (kind === "stochastic") {
        source.rasterDescriptor!.legacyStochasticHash = "f".repeat(64);
        source.rasterDescriptor!.seedRoot = `${source.rasterDescriptor!.seedPath}/${"f".repeat(64)}`;
        source.contentHash = await hashMaterialSourceContent(source);
      }
      if (kind === "descriptor-schema") (source.rasterDescriptor as unknown as Record<string, unknown>).schemaVersion = "9.0.0";
      if (kind === "layer-bytes" || kind === "rehashed-field") source.layers.baseColor.data[0] ^= 1;
      if (kind === "rehashed-height") for (let channel = 0; channel < 3; channel += 1) source.layers.height!.data[channel] ^= 1;
      if (kind === "rehashed-field" || kind === "rehashed-height") source.contentHash = await hashMaterialSourceContent(source);
      const expected = kind === "deleted" ? /missing its periodic masonry raster descriptor/ :
        kind === "seed" || kind === "provider" ? /slot, or provenance authority/ :
        kind === "layer-bytes" ? /content hash does not cover/ :
        kind === "rehashed-field" || kind === "rehashed-height" ? /source pixels do not match the declared area field/ :
        kind === "descriptor-schema" ? /0\.1\.0/ : /not bound to the declared procedural request\/provenance/;
      await expect(packAtlas(plan, changed)).rejects.toThrow(expected);
    }
  );

  it.each(["role", "material", "procedure", "periodicity", "anchor", "scale", "slot-id"] as const)(
    "rejects mismatched manifest %s authority", async (kind) => {
      const changed = structuredClone(plan);
      const slot = changed.manifest.slots[0];
      if (kind === "role") slot.role = "horizontalTrim";
      if (kind === "material") slot.artKitMaterialRoleId = "plaster";
      if (kind === "procedure") slot.proceduralSource = "painted-stucco";
      if (kind === "periodicity") slot.periodicity = "x";
      if (kind === "anchor") slot.physicalSizeM.width = 1;
      if (kind === "scale") slot.metersPerTile = 1;
      if (kind === "slot-id") slot.id = "wall.secondary";
      await expect(packAtlas(changed, sources)).rejects.toThrow();
    }
  );

  it("rejects a transplanted descriptor on an ordinary source", async () => {
    const changed = cloneSourceArtifacts(sources);
    changed[1].rasterDescriptor = structuredClone(changed[0].rasterDescriptor);
    await expect(packAtlas(plan, changed)).rejects.toThrow();
  });
});

describe("actual remote overlay descriptor ownership", () => {
  it("drops the descriptor after accepted color replacement and packs the actual overlay bytes", async () => {
    const accepted = await compositeRemoteMaterialOverlay(sources[0], overlayFor(sources[0]));
    expect(accepted.diagnostics).toEqual([]);
    expect(accepted.artifact.providerId).toBe("procedural+remote-overlay");
    expect(accepted.artifact.provenance.algorithm).toBe("remote-overlay-over-procedural-v0.1");
    expect(Object.hasOwn(accepted.artifact, "rasterDescriptor")).toBe(false);
    expect(accepted.artifact.layers.height).toEqual(sources[0].layers.height);
    const packed = await packAtlas(plan, [accepted.artifact, ...sources.slice(1)]);
    const expected = blendPeriodicEdges(accepted.artifact.layers.baseColor, "xy");
    const slot = plan.manifest.slots[0];
    for (let y = 0; y < slot.rectPx.height; y += 1) for (let x = 0; x < slot.rectPx.width; x += 1) {
      const sourceX = Math.floor(x / slot.rectPx.width * expected.widthPx);
      const sourceY = Math.floor(y / slot.rectPx.height * expected.heightPx);
      expect(pixel(packed.channels.baseColor, slot.rectPx.x + x, slot.rectPx.y + y)).toEqual(pixel(expected, sourceX, sourceY));
    }
    expect(packed.channels.baseColor.data).not.toEqual(atlas.channels.baseColor.data);
  });

  it("preserves the descriptor and production pixels after a rejected overlay", async () => {
    const overlay = overlayFor(sources[0]);
    overlay.widthPx += 1;
    const rejected = await compositeRemoteMaterialOverlay(sources[0], overlay);
    expect(rejected.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);
    expect(rejected.artifact).toBe(sources[0]);
    expect(rejected.artifact.rasterDescriptor).toEqual(sources[0].rasterDescriptor);
    const packed = await packAtlas(plan, [rejected.artifact, ...sources.slice(1)]);
    expect(packed.contentHash).toBe(atlas.contentHash);
    expect(packed.channels).toEqual(atlas.channels);
  });
});
