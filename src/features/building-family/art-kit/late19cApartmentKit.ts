import { ArtKitManifestSchema, type ArtKitManifest } from "./artKitContracts";

export const late19cApartmentKit: ArtKitManifest = ArtKitManifestSchema.parse({
  schemaVersion: "0.1.0",
  id: "late-19c-apartment-kit",
  label: "Late 19th Century Apartment Kit",
  unitMeters: 1,
  stylePackIds: ["late-19c-commercial-demo"],
  materials: [
    {
      id: "brick",
      label: "Warm red brick",
      channels: ["baseColor", "normal", "orm", "height"],
      metersPerTile: 1.2,
      atlasSlotHint: "wall.primary",
      proceduralSource: "running-bond-brick"
    },
    {
      id: "plaster",
      label: "Painted plaster / stucco",
      channels: ["baseColor", "normal", "orm", "height"],
      metersPerTile: 1.5,
      atlasSlotHint: "wall.secondary",
      proceduralSource: "painted-stucco"
    },
    {
      id: "trim-stone",
      label: "Pale trim stone",
      channels: ["baseColor", "normal", "orm", "height"],
      metersPerTile: 1,
      atlasSlotHint: "trim.horizontal.primary",
      proceduralSource: "carved-stone-trim"
    },
    {
      id: "painted-wood",
      label: "Painted wood",
      channels: ["baseColor", "normal", "orm"],
      metersPerTile: 0.75,
      atlasSlotHint: "frame.primary",
      proceduralSource: "painted-wood"
    },
    {
      id: "painted-metal",
      label: "Painted metal",
      channels: ["baseColor", "normal", "orm"],
      metersPerTile: 0.75,
      atlasSlotHint: "cornice.primary",
      proceduralSource: "painted-metal"
    },
    {
      id: "glass",
      label: "Wavy glass",
      channels: ["baseColor", "normal", "orm", "opacity"],
      metersPerTile: 1,
      atlasSlotHint: "glass.primary",
      proceduralSource: "glass-tint"
    },
    {
      id: "roof",
      label: "Dark roof membrane",
      channels: ["baseColor", "normal", "orm"],
      metersPerTile: 2,
      atlasSlotHint: "roof.primary",
      proceduralSource: "roof-membrane"
    },
    {
      id: "grime",
      label: "Grime / weathering mask",
      channels: ["baseColor", "orm", "opacity", "height"],
      metersPerTile: 1,
      atlasSlotHint: "utility.mask",
      proceduralSource: "grime-weathering-mask"
    }
  ],
  modules: [
    {
      id: "wall-panel.brick.body",
      kind: "wall-panel",
      boundsMeters: { width: 2, height: 3.4, depth: 0.35 },
      pivot: "bottom-left-back",
      facadeZones: ["body", "side", "rear"],
      sockets: [
        {
          id: "grid-left",
          kind: "edge",
          positionMeters: [0, 0, 0],
          normal: [-1, 0, 0],
          accepts: ["edge", "grid"]
        },
        {
          id: "grid-right",
          kind: "edge",
          positionMeters: [2, 0, 0],
          normal: [1, 0, 0],
          accepts: ["edge", "grid"]
        },
        {
          id: "window-pocket",
          kind: "opening",
          positionMeters: [1, 1.55, 0.02],
          normal: [0, 0, 1],
          accepts: ["opening"]
        }
      ],
      materialRoles: {
        wall: "brick"
      },
      recipe: {
        id: "panel.brick.body",
        kind: "panel"
      },
      lod: {
        high: true
      },
      tags: ["masonry", "repeatable", "body"]
    },
    {
      id: "opening.window.rectangular",
      kind: "opening",
      boundsMeters: { width: 1.25, height: 2.1, depth: 0.42 },
      pivot: "bottom-center-back",
      facadeZones: ["body", "rear"],
      sockets: [
        {
          id: "opening-back",
          kind: "opening",
          positionMeters: [0, 0, 0],
          normal: [0, 0, -1],
          accepts: ["opening"]
        },
        {
          id: "head-trim",
          kind: "trim",
          positionMeters: [0, 2.1, 0.12],
          normal: [0, 1, 0],
          accepts: ["trim"]
        }
      ],
      materialRoles: {
        frame: "painted-wood",
        sash: "painted-wood",
        glass: "glass",
        sill: "trim-stone",
        lintel: "trim-stone"
      },
      recipe: {
        id: "window.rectangular.sash",
        kind: "frame"
      },
      lod: {
        high: true
      },
      tags: ["window", "rectangular", "body"]
    },
    {
      id: "opening.window.arched",
      kind: "opening",
      boundsMeters: { width: 1.35, height: 2.45, depth: 0.45 },
      pivot: "bottom-center-back",
      facadeZones: ["body", "ground"],
      sockets: [
        {
          id: "opening-back",
          kind: "opening",
          positionMeters: [0, 0, 0],
          normal: [0, 0, -1],
          accepts: ["opening"]
        },
        {
          id: "arch-trim",
          kind: "trim",
          positionMeters: [0, 2.45, 0.14],
          normal: [0, 1, 0],
          accepts: ["trim"]
        }
      ],
      materialRoles: {
        frame: "painted-wood",
        sash: "painted-wood",
        glass: "glass",
        sill: "trim-stone",
        arch: "trim-stone"
      },
      recipe: {
        id: "window.arched.sash",
        kind: "frame"
      },
      lod: {
        high: true,
        lowFallbackModuleId: "opening.window.rectangular"
      },
      tags: ["window", "arched", "body"]
    },
    {
      id: "door.storefront.recessed",
      kind: "door",
      boundsMeters: { width: 1.7, height: 2.7, depth: 0.55 },
      pivot: "bottom-center-back",
      facadeZones: ["ground"],
      sockets: [
        {
          id: "door-opening",
          kind: "opening",
          positionMeters: [0, 0, 0],
          normal: [0, 0, -1],
          accepts: ["opening"]
        },
        {
          id: "transom-trim",
          kind: "trim",
          positionMeters: [0, 2.7, 0.12],
          normal: [0, 1, 0],
          accepts: ["trim"]
        }
      ],
      materialRoles: {
        door: "painted-wood",
        transom: "glass",
        hardware: "painted-metal",
        threshold: "trim-stone"
      },
      recipe: {
        id: "door.storefront.recessed",
        kind: "boxAssembly"
      },
      lod: {
        high: true
      },
      tags: ["door", "storefront", "ground"]
    },
    {
      id: "trim.belt-course.stone",
      kind: "trim-run",
      boundsMeters: { width: 2, height: 0.24, depth: 0.18 },
      pivot: "bottom-left-back",
      facadeZones: ["ground", "body"],
      sockets: [
        {
          id: "trim-left",
          kind: "trim",
          positionMeters: [0, 0.12, 0],
          normal: [-1, 0, 0],
          accepts: ["trim", "edge"]
        },
        {
          id: "trim-right",
          kind: "trim",
          positionMeters: [2, 0.12, 0],
          normal: [1, 0, 0],
          accepts: ["trim", "edge"]
        }
      ],
      materialRoles: {
        trim: "trim-stone"
      },
      recipe: {
        id: "trim.belt-course.stone",
        kind: "profileSweep"
      },
      lod: {
        high: true
      },
      tags: ["trim", "belt-course", "repeatable"]
    },
    {
      id: "trim.cornice.bracketed",
      kind: "cornice",
      boundsMeters: { width: 2, height: 0.75, depth: 0.55 },
      pivot: "bottom-left-back",
      facadeZones: ["cornice"],
      sockets: [
        {
          id: "cornice-left",
          kind: "trim",
          positionMeters: [0, 0.35, 0],
          normal: [-1, 0, 0],
          accepts: ["trim", "edge"]
        },
        {
          id: "cornice-right",
          kind: "trim",
          positionMeters: [2, 0.35, 0],
          normal: [1, 0, 0],
          accepts: ["trim", "edge"]
        },
        {
          id: "roof-seat",
          kind: "roof",
          positionMeters: [1, 0.75, 0],
          normal: [0, 1, 0],
          accepts: ["roof"]
        }
      ],
      materialRoles: {
        fascia: "painted-metal",
        cap: "trim-stone",
        brackets: "painted-metal"
      },
      recipe: {
        id: "cornice.bracketed.profile",
        kind: "profileSweep"
      },
      lod: {
        high: true,
        lowFallbackModuleId: "trim.belt-course.stone"
      },
      tags: ["cornice", "roofline", "repeatable"]
    },
    {
      id: "parapet.brick.flat-roof",
      kind: "parapet",
      boundsMeters: { width: 2, height: 0.85, depth: 0.4 },
      pivot: "bottom-left-back",
      facadeZones: ["roof"],
      sockets: [
        {
          id: "parapet-left",
          kind: "edge",
          positionMeters: [0, 0, 0],
          normal: [-1, 0, 0],
          accepts: ["edge", "grid"]
        },
        {
          id: "roof-back",
          kind: "roof",
          positionMeters: [1, 0.85, 0],
          normal: [0, 1, 0],
          accepts: ["roof"]
        }
      ],
      materialRoles: {
        wall: "brick",
        cap: "trim-stone",
        roof: "roof"
      },
      recipe: {
        id: "parapet.brick.flat-roof",
        kind: "boxAssembly"
      },
      lod: {
        high: true
      },
      tags: ["parapet", "roof", "masonry"]
    },
    {
      id: "corner.quoin.stone",
      kind: "corner-quoin",
      boundsMeters: { width: 0.42, height: 3.4, depth: 0.42 },
      pivot: "bottom-left-back",
      facadeZones: ["ground", "body", "side"],
      sockets: [
        {
          id: "quoin-wall-left",
          kind: "edge",
          positionMeters: [0, 0, 0],
          normal: [-1, 0, 0],
          accepts: ["edge"]
        },
        {
          id: "quoin-wall-right",
          kind: "edge",
          positionMeters: [0.42, 0, 0],
          normal: [1, 0, 0],
          accepts: ["edge"]
        }
      ],
      materialRoles: {
        quoin: "trim-stone"
      },
      recipe: {
        id: "corner.quoin.stacked",
        kind: "boxAssembly"
      },
      lod: {
        high: true
      },
      tags: ["corner", "quoin", "stone"]
    }
  ],
  quality: {
    target: "stylized-apartment-kit",
    status: "draft",
    notes: [
      "Contract fixture only; geometry is generated in later slices.",
      "Designed around 1 meter modular assumptions and late-19c demo style constraints."
    ]
  }
});
