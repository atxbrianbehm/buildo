import { describe, expect, it } from "vitest";
import { createConstructionAwningFabric, readConstructionAwningFabric } from "../materials/constructionAwningFabric";

const request = () => ({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "fabric-one", pattern: "striped",
  primary: [222, 214, 191], secondary: [75, 102, 83], physicalSizeM: [1, 1] });
describe("independent awning fabric source", () => {
  it("owns, deterministically generates and replays a versioned striped material", async () => {
    const input = request(), before = structuredClone(input), artifact = await createConstructionAwningFabric(input);
    expect(await readConstructionAwningFabric(JSON.parse(JSON.stringify(artifact)))).toEqual(artifact);
    expect(artifact.baseColorRgbaHex).toHaveLength(64 * 64 * 8); expect(artifact.source.physicalSizeM).toEqual([1, 1]);
    expect(artifact.source.pattern).toBe("striped"); expect(artifact.roughness).toBe(0.9); expect(artifact.metalness).toBe(0);
    const pixel = (x: number, y: number) => artifact.baseColorRgbaHex.slice((y * 64 + x) * 8, (y * 64 + x) * 8 + 8);
    expect(pixel(5, 5)).not.toBe(pixel(40, 5)); expect(input).toEqual(before);
    artifact.source.primary[0] = 0; expect(input).toEqual(before);
  });
  it("distinguishes solid and striped sources and rejects altered pixels, metadata and malformed input", async () => {
    const striped = await createConstructionAwningFabric(request());
    const solid = await createConstructionAwningFabric({ ...request(), pattern: "solid" });
    expect(striped.contentHash).not.toBe(solid.contentHash);
    const altered = structuredClone(striped); altered.baseColorRgbaHex = "00" + altered.baseColorRgbaHex.slice(2);
    await expect(readConstructionAwningFabric(altered)).rejects.toThrow(/does not match/);
    const stale = structuredClone(striped); stale.source.seed = "other";
    await expect(readConstructionAwningFabric(stale)).rejects.toThrow(/does not match/);
    await expect(createConstructionAwningFabric({ ...request(), projectionM: 1 })).rejects.toThrow();
  });
});
