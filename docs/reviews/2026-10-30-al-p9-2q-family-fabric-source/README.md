# AL.P9.2q: Per-member fabric family source

Family source version 0.11 saves explicit member fabric assignments alongside the shared inherited fabric and optional support graphs. Validation checks family identity, all six member identities, inherited fabric hash, individual artifacts and composition seed. Existing family versions reject the new assignment fields. The current family workspace guards this format until its renderer can own and retain distinct material resources.

Focused tests cover round trip, incompatible versions and wrong family or inherited fabric. An actual editor workflow creates an individual-fabric family file and verifies that attempting to open it leaves the current building unchanged. Its script uses the locally retained P6.2 project at `docs/reviews/2026-10-30-al-p6-2-storefront-authoring/webgpu-02/divided.json`. This is persistence, not a rendered family or artist-facing feature. All five repository checks passed: 2,068 tests across 162 files, standard browser smoke, typecheck, lint and build. The build retains its large-chunk warning.

At AL.P9.2s, workspace opening was implemented; the guard statements above describe this earlier packet. The script now checks the enabled path.
