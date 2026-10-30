# AL.P9.2f: Selected awning dimensions

An artist can adjust projection, drop and valance height of an existing front-bay awning using the grouped storefront controls. The existing fit and clearance validation remains authoritative; invalid geometry is rejected without replacing the accepted scene. Other awnings and the separate material source remain unchanged.

[WebGL](webgl-edited.png) and [WebGPU](webgpu-edited.png) actual editor captures show two neighboring awnings with different dimensions; [controls](controls.png) show the selected bay. Both workflows verify non-rounded values, clearance rejection without replacing the accepted scene, the sibling directive, unchanged fabric and atlas source, undo/redo, automatic recovery, save/reopen and no additional material-provider calls. The verification script uses the locally retained P6.2 project at `docs/reviews/2026-10-30-al-p6-2-storefront-authoring/webgpu-02/divided.json`.

The fabric remains one shared striped demo, and the rigid canopy has no support arms or cloth deformation. This is an incremental geometry control, not a street-ready or historical reconstruction. All five repository checks passed: 2,062 tests across 159 files, standard browser smoke, typecheck, lint and build. The build retains its large-chunk warning.
