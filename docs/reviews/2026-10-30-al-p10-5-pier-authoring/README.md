# AL.P10.5 — artist-authored façade piers

A grouped workspace control adds or removes a front upper-storey pier at each bay edge using fixed demo dimensions. Existing graph choices and optional awning/support directives are retained. Removing piers chooses the appropriate prior graph version without dropping existing geometry or fabric; structural history can restore either state. The compiler rejects a placement that conflicts with opening clearance and retains the last good view.

Both actual app backends exercise add, remove, undo/redo, save/reopen, checkpoint recovery and preserved atlas, existing local finish and awning fabric, with zero material-provider calls during the edit. WebGPU additionally exercises a grouped-window clearance conflict and adds piers to a fresh default building. Other assembly, local-detail and family generation controls remain limited while piers are present. Piers are a fixed demo treatment, not a historical claim or a full family vocabulary.

All five checks passed: 2,079 unit tests across 167 files, browser smoke, typecheck, lint and build. The build retains its existing chunk-size warning.
