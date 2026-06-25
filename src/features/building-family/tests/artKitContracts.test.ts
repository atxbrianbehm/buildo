import {
  ArtKitManifestSchema,
  late19cApartmentKit,
  validateArtKitManifest
} from "../art-kit";

const artKitSources = import.meta.glob("../art-kit/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default"
}) as Record<string, string>;

describe("art kit contracts", () => {
  it("validates the late 19th century apartment kit fixture", () => {
    const parsed = ArtKitManifestSchema.parse(late19cApartmentKit);
    const result = validateArtKitManifest(parsed);

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    expect(result.data.schemaVersion).toBe("0.1.0");
    expect(result.data.unitMeters).toBe(1);
    expect(result.data.materials.map((material) => material.id)).toEqual(
      expect.arrayContaining(["brick", "trim-stone", "painted-wood", "painted-metal", "glass", "roof"])
    );
    expect(result.data.modules.map((module) => module.id)).toEqual(
      expect.arrayContaining([
        "wall-panel.brick.body",
        "opening.window.rectangular",
        "opening.window.arched",
        "door.storefront.recessed",
        "trim.cornice.bracketed",
        "corner.quoin.stone"
      ])
    );
  });

  it("reports duplicate module ids with a module id diagnostic", () => {
    const manifest = {
      ...late19cApartmentKit,
      modules: [
        late19cApartmentKit.modules[0],
        {
          ...late19cApartmentKit.modules[1],
          id: late19cApartmentKit.modules[0].id
        }
      ]
    };

    const result = validateArtKitManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "artKit.module.duplicateId",
        path: "modules[1].id",
        message: expect.stringContaining(late19cApartmentKit.modules[0].id)
      })
    );
  });

  it("reports sockets without accepted kinds with a socket diagnostic", () => {
    const manifest = {
      ...late19cApartmentKit,
      modules: [
        {
          ...late19cApartmentKit.modules[0],
          sockets: [
            {
              ...late19cApartmentKit.modules[0].sockets[0],
              accepts: []
            }
          ]
        }
      ]
    };

    const result = validateArtKitManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "artKit.socket.accepts.empty",
        path: "modules[0].sockets[0].accepts"
      })
    );
  });

  it("reports low-detail fallback module ids that do not exist in the manifest", () => {
    const missingFallbackId = "opening.window.missing-low";
    const manifest = {
      ...late19cApartmentKit,
      modules: [
        {
          ...late19cApartmentKit.modules[1],
          lod: {
            ...late19cApartmentKit.modules[1].lod,
            lowFallbackModuleId: missingFallbackId
          }
        }
      ]
    };

    const result = validateArtKitManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "artKit.module.lowFallbackUnknown",
        path: "modules[0].lod.lowFallbackModuleId",
        received: missingFallbackId,
        allowedValues: ["opening.window.rectangular"]
      })
    );
  });

  it("reports duplicate socket ids within a module", () => {
    const duplicateSocketId = late19cApartmentKit.modules[0].sockets[0].id;
    const manifest = {
      ...late19cApartmentKit,
      modules: [
        {
          ...late19cApartmentKit.modules[0],
          sockets: [
            late19cApartmentKit.modules[0].sockets[0],
            {
              ...late19cApartmentKit.modules[0].sockets[1],
              id: duplicateSocketId
            }
          ]
        }
      ]
    };

    const result = validateArtKitManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "artKit.socket.duplicateId",
        path: "modules[0].sockets[1].id",
        received: duplicateSocketId
      })
    );
  });

  it("reports module material roles that do not exist in the manifest", () => {
    const manifest = {
      ...late19cApartmentKit,
      modules: [
        {
          ...late19cApartmentKit.modules[0],
          materialRoles: {
            ...late19cApartmentKit.modules[0].materialRoles,
            wall: "missing-brick"
          }
        }
      ]
    };

    const result = validateArtKitManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "artKit.materialRole.unknown",
        path: "modules[0].materialRoles.wall",
        received: "missing-brick"
      })
    );
  });

  it("rejects non-positive meter dimensions", () => {
    const manifest = {
      ...late19cApartmentKit,
      modules: [
        {
          ...late19cApartmentKit.modules[0],
          boundsMeters: {
            ...late19cApartmentKit.modules[0].boundsMeters,
            width: 0
          }
        }
      ]
    };

    const result = validateArtKitManifest(manifest);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "artKit.schema.invalid",
        path: "modules[0].boundsMeters.width"
      })
    );
  });

  it("keeps art-kit and contract files free of Three.js imports", () => {
    const contractSources = import.meta.glob("../contracts/**/*.ts", {
      eager: true,
      query: "?raw",
      import: "default"
    }) as Record<string, string>;
    const sourceEntries = [...Object.entries(artKitSources), ...Object.entries(contractSources)];

    expect(sourceEntries.length).toBeGreaterThan(0);
    for (const [, source] of sourceEntries) {
      expect(source).not.toMatch(/from\s+["']three(?:\/[^"']*)?["']/);
    }
  });
});
