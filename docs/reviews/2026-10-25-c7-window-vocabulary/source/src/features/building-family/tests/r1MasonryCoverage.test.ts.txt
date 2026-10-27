import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson } from "../core/canonicalJson";
import { createSeedTree } from "../core/seedTree";
import { planAtlas, type AtlasPlan } from "../materials/atlasPlanner";
import { packAtlas, type PackedAtlas } from "../materials/atlasPacker";
import { brickMortarCoveragePx, ProceduralMaterialProvider, usesPrimaryWallMortarCoverage,
  type MaterialSourceArtifact, type MaterialSourceRequest, type PixelLayer } from "../materials/providers/proceduralMaterialProvider";
import { R1AcceptanceCardSchema } from "../qa/r1BaselineContracts";
import { buildR1MasonryCoverageDelta, referenceBrickMortarCoveragePx, verifyR1MasonryCoverageDelta,
  type R1MasonryCoverageBuildInput, type R1MasonryCoverageDelta } from "../qa/r1MasonryCoverage";

// Literal outputs captured before the frozen 51cc87... producer was edited.
// CI never reads ignored runtime probes/checkpoints.
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
const PRIMARY_PIXELS = [
  {
    "x": 0,
    "y": 0,
    "baseColor": [
      169,
      156,
      138,
      255
    ],
    "height": [
      82,
      82,
      82,
      255
    ],
    "roughness": [
      216,
      216,
      216,
      255
    ]
  },
  {
    "x": 1,
    "y": 0,
    "baseColor": [
      180,
      167,
      149,
      255
    ],
    "height": [
      82,
      82,
      82,
      255
    ],
    "roughness": [
      222,
      222,
      222,
      255
    ]
  },
  {
    "x": 0,
    "y": 1,
    "baseColor": [
      169,
      156,
      138,
      255
    ],
    "height": [
      82,
      82,
      82,
      255
    ],
    "roughness": [
      216,
      216,
      216,
      255
    ]
  },
  {
    "x": 1,
    "y": 1,
    "baseColor": [
      136,
      46,
      33,
      255
    ],
    "height": [
      172,
      172,
      172,
      255
    ],
    "roughness": [
      222,
      222,
      222,
      255
    ]
  },
  {
    "x": 3,
    "y": 4,
    "baseColor": [
      187,
      174,
      156,
      255
    ],
    "height": [
      82,
      82,
      82,
      255
    ],
    "roughness": [
      202,
      202,
      202,
      255
    ]
  },
  {
    "x": 2,
    "y": 4,
    "baseColor": [
      135,
      46,
      33,
      255
    ],
    "height": [
      157,
      157,
      157,
      255
    ],
    "roughness": [
      201,
      201,
      201,
      255
    ]
  },
  {
    "x": 6,
    "y": 2,
    "baseColor": [
      184,
      171,
      153,
      255
    ],
    "height": [
      82,
      82,
      82,
      255
    ],
    "roughness": [
      216,
      216,
      216,
      255
    ]
  },
  {
    "x": 30,
    "y": 30,
    "baseColor": [
      187,
      174,
      156,
      255
    ],
    "height": [
      82,
      82,
      82,
      255
    ],
    "roughness": [
      226,
      226,
      226,
      255
    ]
  },
  {
    "x": 31,
    "y": 31,
    "baseColor": [
      169,
      156,
      138,
      255
    ],
    "height": [
      82,
      82,
      82,
      255
    ],
    "roughness": [
      216,
      216,
      216,
      255
    ]
  }
] as const;
const sha = (value: string | Uint8Array | Uint8ClampedArray) => createHash("sha256").update(value).digest("hex");
const fileJson = (file: string) => JSON.parse(readFileSync(path.resolve(file), "utf8"));
const layerNames = ["baseColor", "height", "roughness", "metalness", "opacity"] as const;
let fixture: R1MasonryCoverageBuildInput;
let delta: R1MasonryCoverageDelta;
let atlasPlan: AtlasPlan;

function joined(parts: (Uint8Array | Uint8ClampedArray)[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
function sourceContent(source: MaterialSourceArtifact): string {
  const parts = Object.keys(source.layers).sort().flatMap((name) => {
    const layer = source.layers[name as typeof layerNames[number]];
    return layer ? [new TextEncoder().encode(name + ":" + layer.widthPx + "x" + layer.heightPx + ":"), layer.data] : [];
  });
  return sha(canonicalJson({ providerId: source.providerId, requestHash: source.requestHash, layerBytes: Array.from(joined(parts)) }));
}
function atlasContent(atlas: PackedAtlas): string {
  const parts: (Uint8Array | Uint8ClampedArray)[] = [
    new TextEncoder().encode(canonicalJson({ schemaVersion: "0.1.0", slotProvenance: atlas.slotProvenance }))
  ];
  for (const name of Object.keys(atlas.channels).sort() as (keyof PackedAtlas["channels"])[]) {
    const layer = atlas.channels[name];
    parts.push(new TextEncoder().encode(name + ":" + layer.widthPx + "x" + layer.heightPx + ":"), layer.data);
  }
  return sha(joined(parts));
}
function rawChannels(atlas: PackedAtlas) {
  return Object.fromEntries(Object.entries(atlas.channels).map(([name, layer]) => [name, sha(layer.data)]));
}
function legacyPrimary(sourceRequest: MaterialSourceRequest): MaterialSourceArtifact {
  const old = LEGACY_GOLDENS[0];
  const seed = createSeedTree(sourceRequest.seedPath + "/" + old.requestHash);
  const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  const make = (sample: (x: number, y: number) => number[]): PixelLayer => {
    const data = new Uint8ClampedArray(4096);
    for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) data.set(sample(x % 31, y % 31), (y * 32 + x) * 4);
    return { widthPx: 32, heightPx: 32, channels: "rgba8", data };
  };
  const mortar = (x: number, y: number) => y % 3 === 0 || (x + (Math.floor(y / 3) % 2 ? 3 : 0)) % 6 === 0;
  const baseColor = make((x, y) => {
    const grain = seed.float01("brick-grain/" + x + "/" + y) * 22 - 8;
    return (mortar(x, y) ? [176 + grain, 163 + grain, 145 + grain] : [132 + grain, 45 + grain * 0.3, 32 + grain * 0.2]).map(byte).concat(255);
  });
  const height = make((x, y) => {
    const value = mortar(x, y) ? 82 : byte(154 + seed.float01("brick-height/" + x + "/" + y) * 28);
    return [value, value, value, 255];
  });
  const roughness = make((x, y) => {
    const value = byte(188 + seed.float01("brick-roughness/" + x + "/" + y) * 44);
    return [value, value, value, 255];
  });
  return { sourceId: sourceRequest.sourceId, providerId: "procedural", widthPx: 32, heightPx: 32,
    layers: { baseColor, height, roughness }, requestHash: old.requestHash, contentHash: old.contentHash,
    provenance: { providerId: "procedural", seedPath: sourceRequest.seedPath, promptVocabulary: [...sourceRequest.promptVocabulary],
      algorithm: "procedural-v0.1-typed-rgba" } };
}
async function repackAfter(input: R1MasonryCoverageBuildInput): Promise<void> {
  for (const source of input.after.sources) source.contentHash = sourceContent(source);
  input.after.packedAtlas = await packAtlas({ ...atlasPlan, manifest: input.after.packedAtlas.manifest }, [...input.after.sources]);
  const geometry = input.after.geometryCheckpoint as Record<string, unknown>;
  geometry.atlasContentHash = input.after.packedAtlas.contentHash;
  geometry.atlasChannelDataHashes = rawChannels(input.after.packedAtlas);
}
function refreshPackedHash(input: R1MasonryCoverageBuildInput): void {
  input.after.packedAtlas.contentHash = atlasContent(input.after.packedAtlas);
  const geometry = input.after.geometryCheckpoint as Record<string, unknown>;
  geometry.atlasContentHash = input.after.packedAtlas.contentHash;
  geometry.atlasChannelDataHashes = rawChannels(input.after.packedAtlas);
}

beforeAll(async () => {
  const cardFile = "docs/reviews/2026-10-14-r1-s4/acceptance-card.json";
  const samplingFile = "docs/reviews/2026-10-14-r1-s4/sampling-report.json";
  const s5File = "docs/reviews/2026-10-14-r1-s5-verified/masonry-appearance-report.json";
  const card = R1AcceptanceCardSchema.parse(fileJson(cardFile));
  const s5 = fileJson(s5File);
  atlasPlan = await planAtlas(card.resolvedSpec, { widthPx: 128, heightPx: 128, paddingPx: 4 });
  // This historical S6-v1 proof uses explicit no-profile plans/requests. S8's
  // current default profile has separate source-to-atlas regression coverage.
  atlasPlan.materialSources = atlasPlan.materialSources.map((item) => {
    const legacy = { ...item };
    delete legacy.samplingProfile;
    return legacy;
  });
  const requests = atlasPlan.materialSources.map((item) => ({ ...item, widthPx: 32, heightPx: 32 }));
  const current = await Promise.all(requests.map((item) => new ProceduralMaterialProvider().generate(item, new AbortController().signal)));
  const before = structuredClone(current);
  before[0] = legacyPrimary(requests[0]);
  const oldAtlas = await packAtlas(atlasPlan, before);
  const newAtlas = await packAtlas(atlasPlan, current);
  const baseline = {
    s4Card: { file: cardFile, sha256: sha(readFileSync(cardFile)) },
    s4Sampling: { file: samplingFile, sha256: sha(readFileSync(samplingFile)) },
    s5Report: { file: s5File, sha256: sha(readFileSync(s5File)) },
    producerCheckpoint: { file: "inline-producer-checkpoint.json", sha256: "e".repeat(64) },
    producerSnapshot: { file: "inline-producer.ts.snapshot", sha256: "51cc87c0f78f2d9cc77d0ffb734288fc248195955dde4f2547cd4dfb9361d620" }
  };
  const checkpoint = {
    schemaVersion: "0.1.0", packetKind: "buildo-r1-primary-wall-producer-source-checkpoint",
    createdAt: "2026-10-14T20:28:50.753Z", baseline: baseline.s5Report,
    source: { commit: s5.source.commit, trackedDiffSha256: s5.source.trackedDiffSha256 },
    producer: { file: "src/features/building-family/materials/providers/proceduralMaterialProvider.ts",
      sha256: baseline.producerSnapshot.sha256, byteLength: 13391, snapshot: baseline.producerSnapshot },
    scope: "Inline schema fixture; ignored runtime checkpoint is never read by CI."
  };
  const afterGeometry = { ...structuredClone(s5.geometryCheckpoint), atlasContentHash: newAtlas.contentHash,
    atlasChannelDataHashes: rawChannels(newAtlas) };
  fixture = { packetId: "unit-r1-s6", createdAt: "2026-10-14T21:00:00.000Z", baseline,
    s4Card: card, s4Sampling: fileJson(samplingFile), s5Report: s5, producerCheckpoint: checkpoint,
    before: { requests, sources: before, packedAtlas: oldAtlas, geometryCheckpoint: structuredClone(s5.geometryCheckpoint) },
    after: { requests: structuredClone(requests), sources: current, packedAtlas: newAtlas, geometryCheckpoint: afterGeometry } };
  delta = await buildR1MasonryCoverageDelta(fixture);
});

describe("independent mortar rectangle oracle", () => {
  it("keeps a high-column 14% joint exact at the 157-to-82 height-byte rounding tie", () => {
    expect(referenceBrickMortarCoveragePx(21, 4, 6, 3)).toBe(0.14 * 3);
    const offset = (4 * 32 + 21) * 4;
    expect(Array.from(fixture.after.sources[0].layers.baseColor.data.slice(offset, offset + 4))).toEqual([154, 116, 101, 255]);
    expect(Array.from(fixture.after.sources[0].layers.height!.data.slice(offset, offset + 4))).toEqual([126, 126, 126, 255]);
  });
  it.each([
    [0, 0, 6, 3, 0.6636], [1, 0, 6, 3, 0.42], [0, 1, 6, 3, 0.42], [1, 1, 6, 3, 0],
    [3, 3, 6, 3, 0.6636], [0.25, 1, 6, 3, 0.17], [0.3, 0.3, 6, 3, 0.2256],
    [3.75, 4, 7, 3, 0.17], [0, 2.75, 7, 3, 0.525]
  ])("clips box (%s,%s) against %s×%s mortar rectangles", (x, y, width, height, expected) => {
    expect(referenceBrickMortarCoveragePx(x, y, width, height)).toBeCloseTo(expected, 12);
  });
  it.each([[6, 3], [11, 5], [17, 8]])("matches emitted integer pixel geometry for %s×%s including negative phases", (width, height) => {
    for (let y = -height * 2; y < height * 3; y += 1) for (let x = -width * 2; x < width * 3; x += 1) {
      expect(brickMortarCoveragePx(x, y, width, height)).toBeCloseTo(referenceBrickMortarCoveragePx(x, y, width, height), 12);
    }
  });
  it.each([[NaN, 0, 6, 3], [0, Infinity, 6, 3], [0, 0, 0, 3], [0, 0, 6, -3]])("rejects invalid oracle coordinates/cells", (x, y, width, height) => {
    expect(() => referenceBrickMortarCoveragePx(x, y, width, height)).toThrow(/Invalid coverage/);
  });
});

describe("real canonical material outputs and immutable legacy goldens", () => {
  it("selects only primary metadata even though secondary selectedFamily is also brick-red", () => {
    expect(fixture.before.requests.filter(usesPrimaryWallMortarCoverage).map((item) => item.sourceId)).toEqual(["source.wall.primary"]);
    expect(fixture.before.requests[1].selectedFamily).toBe("brick-red");
    expect(fixture.before.requests[1].artKitMaterialRoleId).toBe("plaster");
  });
  it("retains all 12 old request/content/layer identities against pre-edit literal hashes", () => {
    fixture.before.sources.forEach((source, index) => {
      const expected = LEGACY_GOLDENS[index];
      expect(source.sourceId).toBe(expected.sourceId);
      expect(source.requestHash).toBe(expected.requestHash);
      expect(source.contentHash).toBe(expected.contentHash);
      expect(sourceContent(source)).toBe(expected.contentHash);
      for (const name of layerNames) expect(source.layers[name] ? sha(source.layers[name]!.data) : null).toBe(expected.layers[name]);
    });
    fixture.after.sources.slice(1).forEach((source, index) => {
      expect(source.requestHash).toBe(LEGACY_GOLDENS[index + 1].requestHash);
      expect(source.contentHash).toBe(LEGACY_GOLDENS[index + 1].contentHash);
      for (const name of layerNames) expect(source.layers[name] ? sha(source.layers[name]!.data) : null).toBe(LEGACY_GOLDENS[index + 1].layers[name]);
    });
  });
  it("retains literal legacy palette/noise pixels and roughness without reusing the versioned artifact hash as seed", () => {
    for (const pixel of PRIMARY_PIXELS) {
      const offset = (pixel.y * 32 + pixel.x) * 4;
      for (const name of ["baseColor", "height", "roughness"] as const) expect(Array.from(fixture.before.sources[0].layers[name]!.data.slice(offset, offset + 4))).toEqual(pixel[name]);
      expect(Array.from(fixture.after.sources[0].layers.roughness!.data.slice(offset, offset + 4))).toEqual(pixel.roughness);
    }
    expect(delta.legacySeedHash).toBe("de21bfc55069aaba85b6af1e1b37a1d391f03ca26731fcb7ef3fd1dea4cb5c31");
    expect(fixture.after.sources[0].requestHash).toBe("fe3c0040dee939d9713031bbaa6e8edbb84cbb7ccbd29f97c0b136f732a5c57a");
    expect(fixture.after.sources[0].contentHash).toBe("ab206b69ff261d393ca5c1d325a9a919f374ac3f69365e824990054070098a18");
  });
  it("preserves duplicated periodic endpoints for every selected source layer", () => {
    for (const layer of Object.values(fixture.after.sources[0].layers)) {
      for (let row = 0; row < 32; row += 1) expect(Array.from(layer.data.slice(row * 128, row * 128 + 4))).toEqual(Array.from(layer.data.slice(row * 128 + 124, row * 128 + 128)));
      expect(Array.from(layer.data.slice(0, 128))).toEqual(Array.from(layer.data.slice(3968, 4096)));
    }
  });
  it("builds an explicit new baseline with exact actual nearest-pack means and unchanged geometry", () => {
    expect(verifyR1MasonryCoverageDelta(JSON.parse(JSON.stringify(delta)))).toEqual(delta);
    expect(delta.before.atlasContentHash).not.toBe(delta.after.atlasContentHash);
    expect(delta.immutable.geometryHash).toBe("4c884d88523c475649e86fb084073e13c7868d5bad568e26a2822121a8fb045e");
    expect(delta.coverageFieldMeans.source.legacyBinary).toBe(0.4921875);
    expect(delta.coverageFieldMeans.source.subpixel).toBeCloseTo(0.22432265625, 12);
    expect(delta.coverageFieldMeans.packed.legacyBinary).toBeCloseTo(503 / 999, 12);
    expect(delta.coverageFieldMeans.packed.subpixel).toBeCloseTo(0.22732132132132132, 12);
    expect(delta.before.channelDataHashes.orm).toBe(delta.after.channelDataHashes.orm);
    expect(delta.before.channelDataHashes.opacity).toBe(delta.after.channelDataHashes.opacity);
    expect(delta.before.channelHashes.baseColor).not.toBe(delta.before.channelDataHashes.baseColor);
  });
  it("does not mutate actual requests/source/atlas arrays while producing deterministic evidence", async () => {
    // Snapshot every actual byte/metadata value without comparing constructors
    // across jsdom/Node structured-clone realms; retained references also forbid
    // replacement of caller-owned frames, arrays or buffers.
    const retained = sha(JSON.stringify(fixture));
    const beforeFrame = fixture.before, afterFrame = fixture.after;
    const beforeSources = fixture.before.sources, afterSources = fixture.after.sources;
    const views = () => [fixture.before, fixture.after].flatMap((frame) => [
      ...frame.sources.flatMap((source) => Object.values(source.layers).map((layer) => layer.data)),
      ...Object.values(frame.packedAtlas.channels).map((layer) => layer.data)
    ]);
    const retainedViews = views();
    expect(await buildR1MasonryCoverageDelta(fixture)).toEqual(delta);
    expect(sha(JSON.stringify(fixture))).toBe(retained);
    expect(fixture.before).toBe(beforeFrame);
    expect(fixture.after).toBe(afterFrame);
    expect(fixture.before.sources).toBe(beforeSources);
    expect(fixture.after.sources).toBe(afterSources);
    views().forEach((view, index) => expect(view).toBe(retainedViews[index]));
  });
});

describe("fail-closed serialized baseline comparison", () => {
  const badReports: [string, (report: R1MasonryCoverageDelta) => void][] = [
    ["rebadged controlled origin", (report) => { report.controlledOrigins[0].requestHash = report.after.sourceHashes[0].requestHash; }],
    ["rebadged controlled provenance", (report) => { report.controlledOrigins[0].provenance.algorithm += "/primary-authored-wall-mortar-area-v1"; }],
    ["rebadged controlled dimensions", (report) => { report.controlledOrigins[0].widthPx += 1; }],
    ["duplicate source", (report) => { report.sourceRequests[1].sourceId = report.sourceRequests[0].sourceId; }],
    ["swapped controlled origins", (report) => { [report.controlledOrigins[1], report.controlledOrigins[2]] = [report.controlledOrigins[2], report.controlledOrigins[1]]; }],
    ["second eligible metadata source", (report) => { report.sourceRequests[1].artKitMaterialRoleId = "brick"; report.sourceRequests[1].proceduralSource = "running-bond-brick"; }],
    ["selected roughness hash", (report) => { report.after.sourceLayerHashes[0].roughness = "f".repeat(64); }],
    ["nonselected provenance", (report) => { report.after.sourceLayerHashes[2].provenanceHash = "f".repeat(64); }],
    ["nonselected content", (report) => { report.after.sourceHashes[3].contentHash = "f".repeat(64); }],
    ["reseeded primary", (report) => { report.legacySeedHash = report.after.sourceHashes[0].requestHash; }],
    ["ORM channel", (report) => { report.after.channelDataHashes.orm = "f".repeat(64); }],
    ["wrong producer snapshot", (report) => { report.baseline.producerSnapshot.sha256 = "f".repeat(64); }],
    ["thresholded pixel fraction masquerading as area mean", (report) => { report.coverageFieldMeans.source.subpixel = 0.25; }],
    ["unversioned selected request", (report) => { report.after.sourceHashes[0].requestHash = report.before.sourceHashes[0].requestHash; }]
  ];
  it.each(badReports)("rejects %s", (_, edit) => {
    const changed = structuredClone(delta);
    edit(changed);
    expect(() => verifyR1MasonryCoverageDelta(changed)).toThrow();
  });
});

describe("actual byte adversaries with refreshed aggregate identities", () => {
  it("rejects outside-primary packed pixel changes after actual packed/geometry hashes are refreshed", async () => {
    const changed = structuredClone(fixture);
    changed.after.packedAtlas.channels.baseColor.data[(100 * 128 + 100) * 4] ^= 1;
    refreshPackedHash(changed);
    expect(changed.after.packedAtlas.contentHash).toBe(atlasContent(changed.after.packedAtlas));
    await expect(buildR1MasonryCoverageDelta(changed)).rejects.toThrow(/Packed content|Packed channel/);
  });
  it.each(["roughness", "alpha", "height", "color", "nonselected"] as const)("rejects %s source edits after source hashes and actual packing are refreshed", async (kind) => {
    const changed = structuredClone(fixture);
    const selected = changed.after.sources[0];
    if (kind === "roughness") selected.layers.roughness!.data[0] ^= 1;
    if (kind === "alpha") selected.layers.baseColor.data[3] = 254;
    if (kind === "height") selected.layers.height!.data[0] ^= 1;
    if (kind === "color") selected.layers.baseColor.data[0] ^= 1;
    if (kind === "nonselected") changed.after.sources[3].layers.baseColor.data[0] ^= 1;
    await repackAfter(changed);
    for (const source of changed.after.sources) expect(source.contentHash).toBe(sourceContent(source));
    await expect(buildR1MasonryCoverageDelta(changed)).rejects.toThrow(/Unaffected actual source|Atlas bytes|same exact area/);
  });
  it("rejects changed noise while retaining the correct versioned request hash and fresh content/atlas hashes", async () => {
    const changed = structuredClone(fixture);
    changed.after.sources[0].layers.baseColor.data[(1 * 32 + 1) * 4] += 1;
    await repackAfter(changed);
    expect(changed.after.sources[0].requestHash).toBe(delta.after.sourceHashes[0].requestHash);
    await expect(buildR1MasonryCoverageDelta(changed)).rejects.toThrow(/same exact area/);
  });
  it.each(["graph", "geometry", "manifest", "duplicate-slot", "swapped-source", "request"] as const)("rejects changed %s authority", async (kind) => {
    const changed = structuredClone(fixture);
    if (kind === "graph") (changed.after.geometryCheckpoint as Record<string, unknown>).sourceGraphHash = "f".repeat(64);
    if (kind === "geometry") (changed.after.geometryCheckpoint as Record<string, unknown>).geometryHash = "f".repeat(64);
    if (kind === "manifest") changed.after.packedAtlas.manifest.slots[0].physicalSizeM.width = 1;
    if (kind === "duplicate-slot") changed.after.packedAtlas.manifest.slots[1] = structuredClone(changed.after.packedAtlas.manifest.slots[0]);
    if (kind === "swapped-source") {
      const sources = [...changed.after.sources];
      [sources[1], sources[2]] = [sources[2], sources[1]];
      changed.after.sources = sources;
    }
    if (kind === "request") changed.after.requests = changed.after.requests.map((item, index) => index === 0 ? { ...item, seedPath: "rerolled" } : item);
    await expect(buildR1MasonryCoverageDelta(changed)).rejects.toThrow();
  });
});

