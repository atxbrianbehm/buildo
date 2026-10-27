import { late19cApartmentKit } from "../art-kit";
import {
  evaluateArtKitPeriodMaterialScale,
  gltfHintsForChannels,
  isPeriodMaterialScale,
  mapSelectedFamilyToArtKitMaterialId,
  resolveArtKitMaterialSet,
  tilePhysicalSizeM
} from "../materials/artKitMaterialSet";

describe("artKitMaterialSet", () => {
  it("resolves kit materials to atlas bindings with glTF channel hints", () => {
    const set = resolveArtKitMaterialSet(late19cApartmentKit);

    expect(set.schemaVersion).toBe("0.1.0");
    expect(set.artKitManifestId).toBe(late19cApartmentKit.id);
    expect(set.bindings.length).toBeGreaterThanOrEqual(6);
    expect(set.bindings.map((binding) => binding.materialRoleId)).toEqual(
      expect.arrayContaining(["brick", "plaster", "roof", "glass", "painted-wood", "painted-metal", "trim-stone", "grime"])
    );

    const brick = set.bindings.find((binding) => binding.materialRoleId === "brick");
    expect(brick).toMatchObject({
      atlasSlotId: "wall.primary",
      metersPerTile: 0.96,
      proceduralSource: "running-bond-brick"
    });
    expect(brick?.gltfHints).toEqual({
      baseColorTexture: true,
      normalTexture: true,
      metallicRoughnessTexture: true,
      occlusionTexture: true,
      alphaMode: "OPAQUE"
    });

    const glass = set.bindings.find((binding) => binding.materialRoleId === "glass");
    expect(glass?.gltfHints.alphaMode).toBe("BLEND");
    expect(set.diagnostics).toEqual([]);
  });

  it("maps selected families onto kit material roles", () => {
    expect(mapSelectedFamilyToArtKitMaterialId("wall", "brick-red")).toBe("brick");
    expect(mapSelectedFamilyToArtKitMaterialId("wall", "painted-stucco")).toBe("plaster");
    expect(mapSelectedFamilyToArtKitMaterialId("roof", "flat-membrane")).toBe("roof");
    expect(mapSelectedFamilyToArtKitMaterialId("frame", "painted-wood-cream")).toBe("painted-wood");
    expect(mapSelectedFamilyToArtKitMaterialId("glass", "any")).toBe("glass");
  });

  it("builds square tile physical sizes from metersPerTile", () => {
    expect(tilePhysicalSizeM(0.96)).toEqual({ width: 0.96, height: 0.96 });
    expect(gltfHintsForChannels(["baseColor", "opacity"]).alphaMode).toBe("BLEND");
  });

  it("accepts late-19c period material scales for the kit (V5)", () => {
    expect(isPeriodMaterialScale("brick", 0.96)).toBe(true);
    expect(isPeriodMaterialScale("brick", 1.5)).toBe(false);
    const evaluation = evaluateArtKitPeriodMaterialScale(late19cApartmentKit);
    expect(evaluation.failCount).toBe(0);
    expect(evaluation.passCount).toBe(late19cApartmentKit.materials.length);
  });
});
