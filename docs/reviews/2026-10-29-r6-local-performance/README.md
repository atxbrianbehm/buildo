# R6 local family-workflow performance baseline

On source commit `3c0b53d78f6bf028ecb37da17e6ccc481d41e2d2`, Chromium exercised the actual saved six-building family: open the family, select a member, change its width, return to the family, and save. Three sequential edit/return/save cycles were measured in each renderer. Wall-clock times include browser automation and UI handoff, and the first family open includes file decoding and validation. They are not GPU frame times.

The machine has an AMD Ryzen Threadripper PRO 7975WX (64 logical processors), 512 GB host RAM and an NVIDIA GeForce RTX 4090; Windows reported driver `32.0.16.1088`. Chromium reported 64 logical processors and `deviceMemory` 32 GB, a browser-reported value rather than host RAM. These measurements are a local baseline, not representative-machine acceptance.

| Operation | WebGPU, three samples | WebGL, three samples |
| --- | --- | --- |
| First family open | 5,740 ms | 4,941 ms |
| Open member | 554–676 ms | 547–660 ms |
| Apply width | 663–672 ms | 523–546 ms |
| Return to family | 2,472–2,529 ms | 1,920–1,973 ms |
| Save family | 1,951–2,057 ms | 941–1,023 ms |

The [uninstrumented WebGPU](webgpu.json) and [WebGL](webgl.json) runs have zero page errors. A separate instrumented run divided return into worker compilation, fixture preparation and viewer preparation: [WebGPU](webgpu-phases.json) and [WebGL](webgl-phases.json). In the WebGPU run, fixture preparation was about 1.5 s of a 2.5 s return, compilation about 245–278 ms, and viewer preparation about 562–581 ms. In WebGL the corresponding fixture cost was about 1.46–1.50 s and viewer preparation about 102–106 ms.

An additional [WebGPU fixture trace](webgpu-detail.json) measured first-member fixture preparation at about 270–300 ms; each of the other five members spent about 223–266 ms in surface-runtime preparation and 13–17 ms creating its geometry runtime. These are inclusive timings around existing calls, not proof of which internal surface operation dominates. The [diagnostic script](verify.mjs) instruments temporary Vite transforms; it does not modify the product. It needs the locally retained P3.1 family file and Chromium. Source/material fidelity and native browser behavior are established in the preceding P3.2 packet, not inferred from timings.

The next bounded step is to measure the internal surface-preparation stages before deciding whether and how to reuse work. Any optimization must retain member-specific semantic bindings, correct atlas and finish identity, cancellation and disposal, and exact rendered material behavior. Representative-device performance, frame time, memory limits, and the Phase F visual gate remain open.
