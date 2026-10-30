import { RepeatWrapping, SRGBColorSpace } from "three";
import { createConstructionAwningFabric } from "../materials/constructionAwningFabric";
import { prepareConstructionAwningFabricRuntime } from "../renderer-three/constructionAwningFabricRuntime";

it("owns a verified independent fabric texture until its last scene lease is released", async () => {
  const fabric = await createConstructionAwningFabric({ schemaVersion: "0.1.0", kind: "construction-awning-fabric-request", seed: "runtime-fabric", pattern: "striped", primary: [220, 210, 190], secondary: [60, 90, 70], physicalSizeM: [0.5, 2] });
  const runtime = await prepareConstructionAwningFabricRuntime(fabric);
  const first = runtime.acquire(), second = runtime.acquire(), material = first.getMaterial(), texture = material.map!;
  expect(runtime.contentHash).toBe(fabric.contentHash); expect(material.userData.fabricContentHash).toBe(fabric.contentHash);
  expect(texture.colorSpace).toBe(SRGBColorSpace); expect(texture.wrapS).toBe(RepeatWrapping); expect(texture.wrapT).toBe(RepeatWrapping);
  expect(texture.repeat.toArray()).toEqual([2, 0.5]);
  const image = texture.image as { data: Uint8Array };
  expect(Array.from(image.data.slice(0, 4))).toEqual([parseInt(fabric.baseColorRgbaHex.slice(0, 2), 16), parseInt(fabric.baseColorRgbaHex.slice(2, 4), 16), parseInt(fabric.baseColorRgbaHex.slice(4, 6), 16), 255]);
  const disposeMaterial = vi.fn(), disposeTexture = vi.fn();
  material.addEventListener("dispose", disposeMaterial); texture.addEventListener("dispose", disposeTexture);
  runtime.dispose(); expect(() => runtime.acquire()).toThrow(/closed/); expect(disposeMaterial).not.toHaveBeenCalled();
  first.release(); first.release(); expect(() => first.getMaterial()).toThrow(/released/); expect(disposeTexture).not.toHaveBeenCalled();
  expect(second.getMaterial()).toBe(material); second.release(); expect(disposeMaterial).toHaveBeenCalledOnce(); expect(disposeTexture).toHaveBeenCalledOnce();
  runtime.dispose(); expect(disposeTexture).toHaveBeenCalledOnce();
  const bad = structuredClone(fabric); bad.source.seed = "tampered";
  await expect(prepareConstructionAwningFabricRuntime(bad)).rejects.toThrow(/does not match/);
});
