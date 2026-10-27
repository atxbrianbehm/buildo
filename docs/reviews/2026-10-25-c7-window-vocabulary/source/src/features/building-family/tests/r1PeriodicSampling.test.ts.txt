import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson } from "../core/canonicalJson";
import { createSeedTree } from "../core/seedTree";
import { planAtlas, type AtlasPlan } from "../materials/atlasPlanner";
import { packAtlas, type PackedAtlas } from "../materials/atlasPacker";
import { ProceduralMaterialProvider, hashMaterialSourceContent, type PixelLayer } from "../materials/providers/proceduralMaterialProvider";
import { R1AcceptanceCardSchema } from "../qa/r1BaselineContracts";
import { R1PeriodicSamplingByteCheckpointSchema, buildR1PeriodicSamplingDelta, verifyR1PeriodicSamplingDelta,
  type R1PeriodicSamplingBuildInput, type R1PeriodicSamplingDelta, type R1PeriodicSamplingOracleRaster } from "../qa/r1PeriodicSampling";
import type { R1PeriodicSamplingFrame } from "../qa/r1PeriodicSampling";

// These independent unaffected goldens precede S6. CI never reads ignored runtime checkpoints.
const LEGACY_GOLDENS = [
  {
    "sourceId": "source.wall.primary",
    "requestHash": "de21bfc55069aaba85b6af1e1b37a1d391f03ca26731fcb7ef3fd1dea4cb5c31",
    "contentHash": "c0dfd0513b820a27095e9357ffc42013def2d1f100fba253217b8a9edd7e4bc2",
    "layers": {
      "baseColor": "3d914320e374a093653f0866a437e6610e04abef953b16d4b69d9415b9884c07",
      "height": "109e8bad00aeefc2317521c2464e38d011f23fb9f01d2f15da420795ea449273",
      "roughness": "5c456366ae573db99c42c67074f8ebc9404a0ea702a8ca7ca16de37b8f2ceb4b",
      "metalness": null,
      "opacity": null
    }
  },
  {
    "sourceId": "source.wall.secondary",
    "requestHash": "a7507d9fbd6e2f1d1f5ee2cac6f7c6b781b99506a69cb52313887fb344c7af75",
    "contentHash": "986b45a1225f77e40a9cfb881e68bf7aeffeb0884ec1295e18367be417c372ae",
    "layers": {
      "baseColor": "f97645454ca5d8775f0afa9a658fa97d2e5eebdac1ca032a9c34225e6319b09e",
      "height": "16dbb42c2c1d5fb28b18d16ef02165a8bee887ea0fdf9f997719aea74899c977",
      "roughness": "fd72c1053292a3a8bf071d38b811a5b90ced0848d89cfa0ea6fc059136c97247",
      "metalness": null,
      "opacity": null
    }
  },
  {
    "sourceId": "source.roof.primary",
    "requestHash": "ceba1fb6d19f470336d764b0b6e5017dcd47233430e4ca2a0484533c7e895a16",
    "contentHash": "275823e48114ada21d258d65ef5a84fbf03e72f9f59695d7d38d3442a323ae20",
    "layers": {
      "baseColor": "81eca29990797d3f7a4f8090cb21a4392ceba5fd203fc6c1604ae21f9c72030d",
      "height": "8e22b90d4d7f07c1aad47329afa181604ae55ded17a015674617083017b60d87",
      "roughness": "ab5ddfd1df92becd8f1ce0dc2b5026f610ea6928eb334345b2b6de00393c751a",
      "metalness": null,
      "opacity": null
    }
  },
  {
    "sourceId": "source.glass.primary",
    "requestHash": "d6dc4b1f198f857096f9eb4492c132aa1aff86b2b9b0f39038bb6e014fa6c57a",
    "contentHash": "386be192c5a79315e691526bd39859a4003f682e7c94ae41b583091859c96047",
    "layers": {
      "baseColor": "a5d684891b8190003aa91ca9161d8e26db650574e9f5c2ef3ca3a7cf10e2d79c",
      "height": null,
      "roughness": "991b52b70fe8a10e46aad5055d7b923a2ba6629e0d999c0278706c5d7547a1b2",
      "metalness": null,
      "opacity": "6480015e508666f23de80fa360256a3b23c20f17e5859da600520634babf98e3"
    }
  },
  {
    "sourceId": "source.frame.primary",
    "requestHash": "0dbad88ec78d4d985e62c98db227eab9ef75208b6012e2e7fd1f67ed37036b9d",
    "contentHash": "7a06889a3fc34bf4f40eeb0ef476a81853c11df6f676711e1efc90d6bf07aec0",
    "layers": {
      "baseColor": "57ef5d2b4484acfd25c7ebbba2d9766e8ef373de40e51771c7f6ae415dcbaf0f",
      "height": "b909800bb2b7c3b60ccd59b9403ae3eea38e92aa2bb636ddb22a9c86c3da614a",
      "roughness": "1ba58733db41cb8d0f4f533fa397c9a8424a4f35da38f2a2fa71070c78297d9b",
      "metalness": null,
      "opacity": null
    }
  },
  {
    "sourceId": "source.door.primary",
    "requestHash": "661212197a1264a592df7ce846f20261ff0281da382cbe0226c0d3eabba98351",
    "contentHash": "79e9ad53fcc03cca7a6adfdb33495767a4fcdff08ea2bf2e40d5e83ba81fe1a8",
    "layers": {
      "baseColor": "518e5881ea1fdd4a0dfdd257fb66f1c7c495969e3f51e3ff6effe03afb698703",
      "height": "3e9a55d74f25bd78b81d8ef5d058060d8e7f6a50a72690a373c2efaa5c9c1807",
      "roughness": "f67306c8e18686d8c1cfd1636c43d0d7f310a7c922471e820bda4c74e4560630",
      "metalness": null,
      "opacity": null
    }
  },
  {
    "sourceId": "source.trim.horizontal.primary",
    "requestHash": "75fbd2115c9cee206dc76d745a3d1579d09f5e134110f44cf3c9d6cfb55ac5cf",
    "contentHash": "342eb5c7167f4566fe0a68403093358c0136388910f13ee1856edea1ca28854d",
    "layers": {
      "baseColor": "6307b1125e17673e8264fe876829a0c8a7d3818ca083519e2c8ba7e8b41d69cd",
      "height": null,
      "roughness": "b683fc0bfcc998ac7998e57eaa9a0c386881ee988f8c0310f28a16bc62488ebc",
      "metalness": "f419694bdd1b80e6dc15cd39f0b18f68b29e2306a98ad20edc14d0b6c5ed689c",
      "opacity": null
    }
  },
  {
    "sourceId": "source.trim.horizontal.secondary",
    "requestHash": "542705dd1c1c06429939f2bf16585b70ee417a62353324cb57a8cdf537c17c80",
    "contentHash": "f97dc514093f4202d73b96a06dba15e0c254707077f01cd03b7054e6aa461ddf",
    "layers": {
      "baseColor": "77a0afd6bcd1596389d8446f88cdc98426be27bc4be2e82f6fa6ca761b2205f9",
      "height": null,
      "roughness": "35067a005796ace6a96f6633ce986ffc1022a2f746c94863f90a157545fc6216",
      "metalness": "0f3ecd405097cc9f9e6c2140351104979d72ef65585f8a63658f2663de5f8b6d",
      "opacity": null
    }
  },
  {
    "sourceId": "source.trim.vertical.primary",
    "requestHash": "aa04c6d0cbea38e25db2ff70ccfd0997a58508c660b2719d0dbc60918815e458",
    "contentHash": "648ebb4e3474fdc8dbb535855896563ee75846954696896ad8b2f8faa36f0f59",
    "layers": {
      "baseColor": "990cc06027dc34305be21bfb9e807643d5a653f37abae6169d69aa39ded5a3d3",
      "height": null,
      "roughness": "b3746b6356e582dbe822ff1e3cb9d1c8c1c22eb5057368d9b345251cff330ccd",
      "metalness": "19765b53e2cd01ab12b45d9744865b8db999946c3023c721d92347b0a8e6e764",
      "opacity": null
    }
  },
  {
    "sourceId": "source.cornice.primary",
    "requestHash": "92193df15bbfc1e4b2a63885039198c4176df18e3eb6f0c8c75b769ed9a10618",
    "contentHash": "10cb054bfd9313aa9ae8e37eeb4bdfb58c194595804c922e50541d1d31e037ee",
    "layers": {
      "baseColor": "cd19b68815d372db1467b680123e8e2575126f8ccc9bb219672cbf4a1cfb5390",
      "height": null,
      "roughness": "299252ade7d4fe095ee29c50be966340fa77fcf8fe8aefe0a30079925b39f1e4",
      "metalness": "7ff4f0eb4d3eda2771d44219f4ef82bb14becb52ad8d67a62e5dc03c38b381d7",
      "opacity": null
    }
  },
  {
    "sourceId": "source.ornament.primary",
    "requestHash": "bff5d1bebde48e9ee853da2ee9e0d18b19b5dfa0568d43cae0e00f9c05ea91a3",
    "contentHash": "403b47f9b00241434412738ca5a767c24b1a519569eb7b059369f78e4423f598",
    "layers": {
      "baseColor": "55ada17dd6402800a97de6a5f3088e151ccb7348ff03e2976543c5253641b5ae",
      "height": "a5eac5414ded35cdba966785d0518694cb9c5e72c314dba0503456c7d4547871",
      "roughness": null,
      "metalness": null,
      "opacity": "af90e5a0406ac3ba70e62c54f38a9fc7e1e7cf2bae7c74b25e49011f7d46a5f5"
    }
  },
  {
    "sourceId": "source.utility.mask",
    "requestHash": "b97a364c82e89e4fa79e8be3cd507ac8e33fe292e7da4ee7e1c374e2e29548cb",
    "contentHash": "1ab99bac5e6845a8df571748e7afa7a3b9c2a3a63c1cb84a9330df686c0bd585",
    "layers": {
      "baseColor": "55ada17dd6402800a97de6a5f3088e151ccb7348ff03e2976543c5253641b5ae",
      "height": "98218bd2cd49e8895267be284bba6bd23b474296d000029ac5e38026643abf6f",
      "roughness": null,
      "metalness": null,
      "opacity": "7cece27a6ccaf8237b3ff694e0bc77584b323a73345244b780b8988af9b05720"
    }
  }
] as const;
const PRIMARY = "source.wall.primary";
const layerNames = ["baseColor", "height", "roughness", "metalness", "opacity"] as const;
const sha = (value: string | Uint8Array | Uint8ClampedArray) => createHash("sha256").update(
  typeof value === "string" ? value : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)).digest("hex");
const json = (file: string) => JSON.parse(readFileSync(path.resolve(file), "utf8"));
const record = (file: string) => ({ file, sha256: sha(readFileSync(file)) });
let fixture: R1PeriodicSamplingBuildInput;
let delta: R1PeriodicSamplingDelta;
let newPlan: AtlasPlan;

function layerDTO(layer: PixelLayer) {
  return { widthPx: layer.widthPx, heightPx: layer.heightPx, channels: layer.channels, arrayType: "Uint8ClampedArray",
    dataBase64: Buffer.from(layer.data).toString("base64"), sha256: sha(layer.data) };
}
function rawChannels(atlas: PackedAtlas) {
  return Object.fromEntries(Object.entries(atlas.channels).map(([name, layer]) => [name, sha(layer.data)]));
}
function geometry(atlas: PackedAtlas) {
  const card = fixture.s6Card as ReturnType<typeof R1AcceptanceCardSchema.parse>;
  const material = fixture.s6Material as { immutable: { geometryHash: string; cost: Record<string, number> } };
  return { schemaVersion: "0.1.0", packetKind: "buildo-r1-masonry-geometry-checkpoint", baseline: fixture.baseline.s6Card,
    sourceGraphHash: card.identity.sourceGraphHash, atlasContentHash: atlas.contentHash,
    geometryHash: material.immutable.geometryHash, ...material.immutable.cost, atlasChannelDataHashes: rawChannels(atlas) };
}
function cloneFrame(frame: R1PeriodicSamplingFrame): R1PeriodicSamplingFrame {
  const clone = structuredClone(frame);
  // Vitest's structuredClone can return host-realm arrays. Preserve the real
  // provider's array constructor so adversarial cases reach their intended gate.
  for (let index = 0; index < frame.sources.length; index += 1) for (const name of layerNames) {
    const original = frame.sources[index].layers[name], copied = clone.sources[index].layers[name];
    if (original && copied) { const ArrayType = original.data.constructor as typeof Uint8ClampedArray; copied.data = new ArrayType(copied.data); }
  }
  for (const name of Object.keys(frame.packedAtlas.channels) as (keyof PackedAtlas["channels"])[]) {
    const ArrayType = frame.packedAtlas.channels[name].data.constructor as typeof Uint8ClampedArray;
    clone.packedAtlas.channels[name].data = new ArrayType(clone.packedAtlas.channels[name].data);
  }
  return clone;
}
function cloneInput(): R1PeriodicSamplingBuildInput {
  return { ...fixture, baseline: structuredClone(fixture.baseline), s6Card: structuredClone(fixture.s6Card),
    s6Sampling: structuredClone(fixture.s6Sampling), s6Material: structuredClone(fixture.s6Material),
    beforeCheckpoint: structuredClone(fixture.beforeCheckpoint), before: cloneFrame(fixture.before),
    after: cloneFrame(fixture.after), legacyReplay: cloneFrame(fixture.legacyReplay) };
}
function changed(input: unknown, keys: (string | number)[], value: unknown): unknown {
  const copy = structuredClone(input);
  let cursor = copy as Record<string | number, unknown>;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] as Record<string | number, unknown>;
  cursor[keys.at(-1)!] = value;
  return copy;
}
function atlasContent(atlas: PackedAtlas): string {
  const parts: (Uint8Array | Uint8ClampedArray)[] = [new TextEncoder().encode(canonicalJson({ schemaVersion: "0.1.0", slotProvenance: atlas.slotProvenance }))];
  for (const name of Object.keys(atlas.channels).sort() as (keyof PackedAtlas["channels"])[]) {
    const layer = atlas.channels[name]; parts.push(new TextEncoder().encode(name + ":" + layer.widthPx + "x" + layer.heightPx + ":"), layer.data);
  }
  const data = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0; for (const part of parts) { data.set(part, offset); offset += part.length; } return sha(data);
}
function refreshAtlas(input: R1PeriodicSamplingBuildInput) {
  input.after.packedAtlas.contentHash = atlasContent(input.after.packedAtlas);
  input.after.geometryCheckpoint = geometry(input.after.packedAtlas);
}
async function repack(input: R1PeriodicSamplingBuildInput) {
  for (const source of input.after.sources) source.contentHash = await hashMaterialSourceContent(source);
  input.after.packedAtlas = await packAtlas({ ...newPlan, manifest: input.after.packedAtlas.manifest }, [...input.after.sources]);
  input.after.geometryCheckpoint = geometry(input.after.packedAtlas);
}

beforeAll(async () => {
  const cardFile = "docs/reviews/2026-10-14-r1-s6-verified/acceptance-card.json";
  const samplingFile = "docs/reviews/2026-10-14-r1-s6-verified/sampling-report.json";
  const materialFile = "docs/reviews/2026-10-14-r1-s6-verified/material-baseline-delta.json";
  const seamsFile = "docs/reviews/2026-10-14-r1-s7-verified/wall-seam-report.json";
  const card = R1AcceptanceCardSchema.parse(json(cardFile)), material = json(materialFile), seams = json(seamsFile);
  newPlan = await planAtlas(card.resolvedSpec, { widthPx: 128, heightPx: 128, paddingPx: 4 });
  const oldRequests = structuredClone(material.sourceRequests);
  const afterRequests = newPlan.materialSources.map((source) => ({ ...source, widthPx: 32, heightPx: 32 })).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  const oldPlan = { ...newPlan, materialSources: oldRequests };
  const generate = async (requests: typeof afterRequests) => Promise.all(requests.map((source) =>
    new ProceduralMaterialProvider().generate(structuredClone(source), new AbortController().signal)));
  const beforeSources = await generate(oldRequests), afterSources = await generate(afterRequests), legacySources = await generate(oldRequests);
  const beforeAtlas = await packAtlas(oldPlan, beforeSources), afterAtlas = await packAtlas(newPlan, afterSources), legacyAtlas = await packAtlas(oldPlan, legacySources);
  const { channels: _channels, ...metadata } = beforeAtlas; void _channels;
  const baseline = { s6Card: record(cardFile), s6Sampling: record(samplingFile), s6Material: record(materialFile),
    beforeCheckpoint: { file: "inline/material-byte-checkpoint.json", sha256: "e".repeat(64) }, s7Report: record(seamsFile),
    s7SourceProof: { file: "inline/prior-source-proof.json", sha256: "f431bd621adff3c3c4d384e1a0e94d72fb5355265958b1a5c3aff326b67b83be" } };
  const checkpoint = {
    schemaVersion: "0.1.0", packetKind: "buildo-r1-s8-pre-edit-material-byte-checkpoint", packetId: "2026-10-14-r1-s8",
    createdAt: "2026-10-14T23:00:00.000Z", sourceCommit: card.source.commit,
    trackedPatch: { file: "inline/prior.patch", sha256: card.source.trackedDiffSha256 },
    priorPacket: baseline.s7Report, priorSourceProof: baseline.s7SourceProof, baselineCard: baseline.s6Card, baselineMaterial: baseline.s6Material,
    sourceFingerprints: seams.source.diagnosticFiles, identity: card.identity, geometryHash: material.immutable.geometryHash,
    sources: beforeSources.map(({ layers, ...source }, index) => ({ ...source, request: oldRequests[index],
      layers: Object.fromEntries(Object.entries(layers).filter(([, layer]) => layer).map(([name, layer]) => [name, layerDTO(layer!)])) })),
    packedAtlas: { metadata: JSON.parse(canonicalJson(metadata)), channels: Object.fromEntries(Object.entries(beforeAtlas.channels).map(([name, layer]) => [name, layerDTO(layer)])) },
    sourceLayerHashes: material.after.sourceLayerHashes, channelHashes: material.after.channelHashes, channelDataHashes: material.after.channelDataHashes
  };
  const oraclePath = pathToFileURL(path.resolve("scripts/diagnostics/r1-periodic-masonry-oracle.mjs")).href;
  const oracleModule = await import(/* @vite-ignore */ oraclePath) as {
    createIndependentPeriodicMasonryOracle(root: string, seed: typeof createSeedTree): { rasterize(width: number, height: number): R1PeriodicSamplingOracleRaster }
  };
  const primary = oldRequests.find((source: { sourceId: string }) => source.sourceId === PRIMARY);
  fixture = { packetId: "inline-s8-regression", createdAt: "2026-10-14T23:01:00.000Z", baseline,
    s6Card: card, s6Sampling: json(samplingFile), s6Material: material, beforeCheckpoint: checkpoint,
    before: { requests: oldRequests, sources: beforeSources, packedAtlas: beforeAtlas, geometryCheckpoint: null },
    after: { requests: afterRequests, sources: afterSources, packedAtlas: afterAtlas, geometryCheckpoint: null },
    legacyReplay: { requests: structuredClone(oldRequests), sources: legacySources, packedAtlas: legacyAtlas, geometryCheckpoint: null },
    oracle: oracleModule.createIndependentPeriodicMasonryOracle(primary.seedPath + "/" + material.legacySeedHash, createSeedTree) };
  for (const frame of [fixture.before, fixture.after, fixture.legacyReplay]) frame.geometryCheckpoint = geometry(frame.packedAtlas);
  delta = await buildR1PeriodicSamplingDelta(fixture);
});

describe("S8 actual periodic material proof", () => {
  it("replays twelve no-profile sources and every raw/encoded S6 atlas identity", () => {
    expect(delta.before).toEqual(delta.legacyReplay); expect(delta.before).toEqual((fixture.s6Material as { after: unknown }).after);
    expect(delta.after.atlasContentHash).not.toBe(delta.before.atlasContentHash);
    expect(delta.controlledOrigins).toEqual((fixture.s6Material as { controlledOrigins: unknown }).controlledOrigins);
    const index = delta.beforeRequests.findIndex((source) => source.sourceId === PRIMARY);
    expect(delta.before.sourceHashes[index].requestHash).toBe("fe3c0040dee939d9713031bbaa6e8edbb84cbb7ccbd29f97c0b136f732a5c57a");
    expect(delta.controlledOrigins[index].requestHash).toBe("de21bfc55069aaba85b6af1e1b37a1d391f03ca26731fcb7ef3fd1dea4cb5c31");
    expect(delta.controlledOrigins[index].contentHash).toBe("c0dfd0513b820a27095e9357ffc42013def2d1f100fba253217b8a9edd7e4bc2");
  });
  it.each(LEGACY_GOLDENS.filter((source) => source.sourceId !== PRIMARY))("preserves literal unaffected bytes for $sourceId", (expected) => {
    const source = fixture.after.sources.find((item) => item.sourceId === expected.sourceId)!;
    expect(source.requestHash).toBe(expected.requestHash); expect(source.contentHash).toBe(expected.contentHash);
    for (const name of layerNames) expect(source.layers[name] ? sha(source.layers[name]!.data) : null).toBe(expected.layers[name]);
  });
  it("pins S6 primary content, color, height and roughness before applying the new model", () => {
    const source = fixture.before.sources.find((item) => item.sourceId === PRIMARY)!;
    expect(source.contentHash).toBe("ab206b69ff261d393ca5c1d325a9a919f374ac3f69365e824990054070098a18");
    expect(sha(source.layers.baseColor.data)).toBe("3d6db139436c8a6741e155971e13f22bc54c0bf6ab3f64bb38c899d4686a8b2b");
    expect(sha(source.layers.height!.data)).toBe("99170c4556e952d4476e7d84a59b6ee8ea1ef542da9cb7335ec94b8ef1cf5ec5");
    expect(sha(source.layers.roughness!.data)).toBe("5c456366ae573db99c42c67074f8ebc9404a0ea702a8ca7ca16de37b8f2ceb4b");
  });
  it("declares 80/160 mm cadence with exact20.02% areas separately from nominal75", () => {
    expect(delta.afterRequests.filter((source) => source.samplingProfile).map((source) => source.sourceId)).toEqual([PRIMARY]);
    expect(delta.profile.tileSizeM / delta.profile.courseCount).toBe(0.08);
    expect(delta.profile.tileSizeM / delta.profile.columnsPerCourse).toBe(0.16);
    expect(delta.immutable.materialAnchors.brickCourseHeightM).toBe(0.075);
    expect(delta.coverageFieldMeans.source.coverageSum).toBe(205.0048); expect(delta.coverageFieldMeans.packed.coverageSum).toBe(199.9998);
    expect(delta.coverageFieldMeans.source.coverageMean).toBe(0.2002); expect(delta.coverageFieldMeans.packed.coverageMean).toBe(0.2002);
  });
  it("checks source pixels against the independent area oracle without duplicate-edge assumptions", () => {
    const expected = fixture.oracle.rasterize(32, 32), source = fixture.after.sources.find((item) => item.sourceId === PRIMARY)!;
    expect(Array.from(source.layers.baseColor.data)).toEqual(Array.from(expected.baseColor.data));
    expect(Array.from(source.layers.height!.data)).toEqual(Array.from(expected.height.data));
    expect(Array.from(expected.coverage).some((area) => area > 0 && area < 1)).toBe(true);
    expect(Array.from(source.layers.height!.data.slice(0, 4))).not.toEqual(Array.from(source.layers.height!.data.slice(-4)));
  });
  it("preserves caller metadata, bytes and original buffer ownership", async () => {
    const input = cloneInput(), source = input.after.sources[0], data = source.layers.baseColor.data, buffer = data.buffer, snapshot = canonicalJson(input.after);
    await buildR1PeriodicSamplingDelta(input);
    expect(input.after.sources[0]).toBe(source); expect(source.layers.baseColor.data).toBe(data); expect(data.buffer).toBe(buffer);
    expect(canonicalJson(input.after)).toBe(snapshot);
  });
  const reportChanges: [string, (string | number)[], unknown][] = [
    ["odd lattice", ["profile", "courseCount"], 11], ["changed tile", ["profile", "tileSizeM"], 0.9],
    ["descriptor reseed", ["rasterDescriptor", "seedRoot"], "reseeded"],
    ["missing primary profile", ["afterRequests", 10, "samplingProfile"], undefined],
    ["false area sum", ["coverageFieldMeans", "packed", "coverageSum"], 200],
    ["v1 rebadged as v2", ["profile", "model"], "primary-authored-wall-mortar-area-v1"],
    ["changed geometry", ["immutable", "geometryHash"], "a".repeat(64)],
    ["rebadged checker origin", ["controlledOrigins", 10, "requestHash"], "b".repeat(64)],
    ["changed whole opacity", ["after", "channelDataHashes", "opacity"], "c".repeat(64)]
  ];
  it.each(reportChanges)("rejects serialized %s", (_name, keys, value) => expect(() => verifyR1PeriodicSamplingDelta(changed(delta, keys, value))).toThrow());
  const checkpointChanges: [string, (string | number)[], unknown][] = [
    ["wrong storage", ["sources", 0, "layers", "baseColor", "arrayType"], "Uint8Array"],
    ["short buffer", ["sources", 0, "layers", "baseColor", "dataBase64"], "AA=="],
    ["bad base64", ["sources", 0, "layers", "baseColor", "dataBase64"], "?".repeat(5464)],
    ["wrong dimensions", ["sources", 0, "layers", "baseColor", "widthPx"], 31],
    ["detached raw hash", ["sources", 0, "layers", "baseColor", "sha256"], "d".repeat(64)],
    ["detached atlas hash", ["packedAtlas", "channels", "height", "sha256"], "d".repeat(64)]
  ];
  it.each(checkpointChanges)("rejects checkpoint %s before decode", (_name, keys, value) =>
    expect(() => R1PeriodicSamplingByteCheckpointSchema.parse(changed(fixture.beforeCheckpoint, keys, value))).toThrow());
  it("rejects a duplicate of an actual distinct source row", () => {
    const checkpoint = R1PeriodicSamplingByteCheckpointSchema.parse(fixture.beforeCheckpoint);
    expect(checkpoint.sources[1].sourceId).not.toBe(checkpoint.sources[0].sourceId);
    expect(() => R1PeriodicSamplingByteCheckpointSchema.parse(changed(checkpoint, ["sources", 1, "sourceId"], checkpoint.sources[0].sourceId))).toThrow();
  });
  it("rejects noncanonical padding bits that decode to identical bytes", () => {
    const checkpoint = R1PeriodicSamplingByteCheckpointSchema.parse(fixture.beforeCheckpoint), value = checkpoint.sources[0].layers.baseColor.dataBase64;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const malformed = value.slice(0, -3) + alphabet[alphabet.indexOf(value.at(-3)!) | 1] + "==";
    expect(Buffer.from(malformed, "base64")).toEqual(Buffer.from(value, "base64"));
    expect(() => R1PeriodicSamplingByteCheckpointSchema.parse(changed(checkpoint, ["sources", 0, "layers", "baseColor", "dataBase64"], malformed))).toThrow();
  });
  it("rejects nonselected bytes after recalculating content and atlas identities", async () => {
    const input = cloneInput(), source = input.after.sources.find((item) => item.sourceId === "source.wall.secondary")!;
    source.layers.baseColor.data[0] ^= 1; await repack(input);
    await expect(buildR1PeriodicSamplingDelta(input)).rejects.toThrow(/Unaffected actual source bytes|nonselected/);
  });
  it("rejects selected roughness/alpha after legitimate repacking", async () => {
    const input = cloneInput(), source = input.after.sources.find((item) => item.sourceId === PRIMARY)!;
    source.layers.roughness!.data[3] ^= 1; await repack(input);
    await expect(buildR1PeriodicSamplingDelta(input)).rejects.toThrow(/Unaffected actual source bytes/);
  });
  it.each(["baseColor", "normal", "height", "orm", "opacity"] as const)("rejects outside-primary %s with refreshed aggregate hashes", async (name) => {
    const input = cloneInput(); input.after.packedAtlas.channels[name].data[(127 * 128 + 127) * 4] ^= 1; refreshAtlas(input);
    await expect(buildR1PeriodicSamplingDelta(input)).rejects.toThrow(/Actual atlas bytes differ|Packed metadata/);
  });
  it("rejects selected alpha even after descriptor-bound content refresh", async () => {
    const input = cloneInput(), source = input.after.sources.find((item) => item.sourceId === PRIMARY)!;
    source.layers.baseColor.data[3] = 254; source.contentHash = await hashMaterialSourceContent(source);
    await expect(buildR1PeriodicSamplingDelta(input)).rejects.toThrow();
  });
  it("rejects a reseeded descriptor with refreshed content", async () => {
    const input = cloneInput(), source = input.after.sources.find((item) => item.sourceId === PRIMARY)!;
    source.rasterDescriptor!.legacyStochasticHash = "b".repeat(64);
    source.rasterDescriptor!.seedRoot = source.rasterDescriptor!.seedPath + "/" + source.rasterDescriptor!.legacyStochasticHash;
    source.contentHash = await hashMaterialSourceContent(source);
    await expect(buildR1PeriodicSamplingDelta(input)).rejects.toThrow(/reseeded/);
  });
  it("rejects false selected request identity with refreshed content", async () => {
    const input = cloneInput(), source = input.after.sources.find((item) => item.sourceId === PRIMARY)!;
    source.requestHash = "b".repeat(64); source.contentHash = await hashMaterialSourceContent(source);
    await expect(buildR1PeriodicSamplingDelta(input)).rejects.toThrow(/Request\/content hash/);
  });
  it("rejects shared old/replay buffers even when bytes and hashes are exact", async () => {
    const input = cloneInput(); input.legacyReplay.sources[0].layers.baseColor = input.before.sources[0].layers.baseColor;
    await expect(buildR1PeriodicSamplingDelta(input)).rejects.toThrow(/reuse source buffers/);
  });
  it("rejects actual geometry drift", async () => {
    const input = cloneInput(); input.after.geometryCheckpoint = changed(input.after.geometryCheckpoint, ["geometryHash"], "b".repeat(64));
    await expect(buildR1PeriodicSamplingDelta(input)).rejects.toThrow(/Actual geometry/);
  });
  it("rejects graph identity drift", async () => {
    const input = cloneInput(); input.s6Card = changed(input.s6Card, ["identity", "graphId"], "graph-rebadged");
    await expect(buildR1PeriodicSamplingDelta(input)).rejects.toThrow();
  });
  it("rejects changed manifest packing", async () => {
    const input = cloneInput(); input.after.packedAtlas.manifest.slots[0].rectPx.x += 1;
    await expect(buildR1PeriodicSamplingDelta(input)).rejects.toThrow(/Manifest/);
  });
  it("rejects an oracle callback that mutates actual owned source bytes", async () => {
    const input = cloneInput(), oracle = input.oracle;
    input.oracle = { rasterize(width, height) { const expected = oracle.rasterize(width, height);
      input.after.sources.find((item) => item.sourceId === PRIMARY)!.layers.baseColor.data[3] = 254; return expected; } };
    await expect(buildR1PeriodicSamplingDelta(input)).rejects.toThrow(/oracle|mutated/);
  });
});

