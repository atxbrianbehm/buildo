# C3.P1a candidate 01 review

The initial focused run passes 64 tests in six files; typecheck and lint pass. Actual WebGPU and WebGL each pass fourteen full/close captures for base, empty, zero, tiny, local, shared and cleared composition. Native empty/zero/clear bitmaps are exact, tiny opacity remains near accepted paint, local/shared bindings and submitted instance geometry are checked, source channels and provider/interpreter counters remain unchanged, and all surface owners close. Six distinct images were directly reviewed.

Before accepting the packet, review identified three contract issues: base verification yielded before resolver IR metadata capture, declared base parameters were not compared with the borrowed flat material, and the new tile reference did not enforce its slot matching the base slot. These are corrected with ownership/affinity/reference regression coverage. The native probe also hashes all submitted mesh and instance geometry and transforms.

The candidate-01 full five-check process passed typecheck/lint and was interrupted by the agent during the unit step (session 70748, Ctrl+C, exit 1) to apply these corrections. Its partial logs are excluded from final acceptance. Native candidate-01 finished before any source or harness edits.

An earlier focused attempt caught two test-only TypeScript assertions and an incorrect raw same-slot no-op expectation: normal replacement renormalizes bytes, so the deliberate same-slot no-op discriminator uses color/ORM channels. No production change was made for that assertion.
