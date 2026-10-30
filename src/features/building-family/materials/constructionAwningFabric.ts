import { ConstructionAwningFabricArtifactSchema, ConstructionAwningFabricRequestSchema, type ConstructionAwningFabricArtifact } from "../contracts/constructionAwningFabric";
import { canonicalJson } from "../core/canonicalJson";
import { hashCanonicalJson } from "../core/contentHash";
import { createSeedTree } from "../core/seedTree";

/** Explicit material creation, independent of awning dimensions and structural seeds. */
export async function createConstructionAwningFabric(input: unknown): Promise<ConstructionAwningFabricArtifact> {
  const source = structuredClone(ConstructionAwningFabricRequestSchema.parse(input));
  const tree = createSeedTree(source.seed).fork("awning-fabric/weave-v1"), warp = tree.int(0, 7, "warp"), weft = tree.int(0, 7, "weft");
  const bytes: number[] = [];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const color = source.pattern === "striped" && x >= 32 ? source.secondary : source.primary;
    const weave = ((x + warp) % 8 < 2 ? 2 : 0) + ((y + weft) % 8 < 2 ? 2 : 0) - 1;
    bytes.push(...color.map(value => Math.max(0, Math.min(255, value + weave))), 255);
  }
  const payload = { schemaVersion: "0.1.0" as const, kind: "construction-awning-fabric-artifact" as const, source,
    widthPx: 64 as const, heightPx: 64 as const, baseColorRgbaHex: bytes.map(value => value.toString(16).padStart(2, "0")).join(""),
    roughness: 0.9 as const, metalness: 0 as const };
  return ConstructionAwningFabricArtifactSchema.parse({ ...payload, contentHash: await hashCanonicalJson(payload) });
}

/** Recompute the source-derived artifact; altered bytes or metadata never silently pass. */
export async function readConstructionAwningFabric(input: unknown): Promise<ConstructionAwningFabricArtifact> {
  const artifact = ConstructionAwningFabricArtifactSchema.parse(input), expected = await createConstructionAwningFabric(artifact.source);
  if (canonicalJson(artifact) !== canonicalJson(expected)) throw new Error("Awning fabric does not match its source and content hash.");
  return expected;
}
