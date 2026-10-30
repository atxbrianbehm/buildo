# AL.P9.2n: Support-bearing family source

Family source version 0.10 stores original and member support graphs with their independently validated shared fabric and existing atlas. It accepts prior composition versions, validates their seed and material identity, requires at least one support graph, and rejects support graphs in older family versions. This is source ownership only: family generation remains guarded and the workspace rejects this family version until it can display and retain it.

Focused tests round-trip six support-bearing members, compile a support batch, reject older versions and tampered fabric, and preserve existing material inputs. The actual editor guard creates a family file and confirms opening it leaves the current building unchanged. The browser script uses the locally retained P6.2 project at `docs/reviews/2026-10-30-al-p6-2-storefront-authoring/webgpu-02/divided.json`. All five repository checks passed: 2,067 tests across 161 files, standard browser smoke, typecheck, lint and build. The build retains its large-chunk warning.

At AL.P9.2o, support-bearing family generation and opening were implemented; guard statements above describe this earlier packet. The scripts now exercise the enabled path.
