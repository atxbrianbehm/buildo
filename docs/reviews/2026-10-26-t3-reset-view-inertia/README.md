# T3 — Reset-view inertia recovery

Reset view now consumes pending OrbitControls motion before restoring the configured camera/target. Previously a completed drag could move the freshly reset camera again. The existing damping setting is restored with `finally`; the default pose, lighting setup, orbit/pan controls and source remain intact.

The regression performs an actual pointer drag through real OrbitControls in the existing AssemblyHall harness, clicks Reset view, allows subsequent frames and checks a stable default camera. It fails before the repair and passes afterward, including repeated Reset. Only eight production lines and one regression are added, in the existing UI/test files. All345 other code/config/test pins remain exact out of347 total. Compiler, renderer, material and persistence modules are unchanged.

## Native proof

WebGPU and WebGL each pass **six states/seven captures**: default, Reset after real orbit, Reset after real right-button pan, repeated Reset, source reopening and cold recovery. Default camera, lighting and native pixels return exactly. Every geometry/channel/finish-binding hash stays exact, including against the T2 texture stress source. Cold provider/material-generation calls are zero. There is no diagnostic control-state mutation or pixel tolerance in the final runs.

A read-only negative control removes only the eight-line repair from the pinned final UI module. Its default camera/pixels equal the final default; after the same orbit and actual Reset, camera/pixels differ. Geometry, materials and source stay exact. [Old Reset drift](negative-control-webgl/legacy-reset-drift.png), [corrected Reset](webgl/reset-after-orbit.png), [WebGPU](webgpu/reset-after-orbit.png), [machine proof](verification.json). The negative control has two states/three captures and does not claim cold recovery.

The six saved/reopened/cold files remain byte-identical to the T2 diagnostic version8 source, SHA256 `eb7466b09ab10f3e4040aeeb5acb85e959cd7dc75efa73f4f2da5140b0661cd1`. Reuse [T2's unique portable replay](../2026-10-26-t2-regular-trim-recovery/textured-project.zip); no new material/source format or duplicate library is introduced.

## Checks and limits

All five required checks pass: typecheck, lint, **1,867 tests/129 files**, build and **eight standard E2E workflows**. [Gate receipt](required-checks.json). The initial typecheck rejected a test-only `exact` option belonging to Playwright rather than Testing Library; its log is retained and the query corrected. The final full suite re-exercises that test. Native captures preceded this test-only correction; every native production/config pin remains exact. [Red regression](red-reset.log) and [initial green runtime case](reset-regression.log) are preserved.

This resolves the camera-state issue that T2 isolated during its end-view exercise. It makes no additional building-geometry, artist-study, historical UTDG, release or performance claim. Familiar WebGL deprecation/precision warnings remain. Browser/server ownership is closed in `finally`; the production change allocates no resources or async work.

Publication targets a separate PR stacked on PR10. Subsequent delivery receipts will supersede pending-publication wording here. After this bounded cleanup, C9 resumes the authorized vocabulary direction in three separate cornice planning/geometry/authoring milestones.
