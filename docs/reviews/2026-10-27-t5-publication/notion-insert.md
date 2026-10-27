## T5 — seeing the bracket course in another light

<date start="2026-10-27" />

The cornice's upper lip physically blocks the default key light from much of the recessed backing. An index-exact shadow-only comparison on WebGPU and WebGL identifies the continuous backing as the dominant caster in this view. An independent ray check found geometry between the key light and all 527 sampled exposed backing points. This is one view and light direction; it does not resolve the separate fringed shadow-edge quality.

The images below are actual product renders with shadows enabled. In the second, the existing Shift + drag light control lowers the key light to reveal the bracket shape. Reset view restores the original view and lighting. The intermediate camera comparison measured small residual drift, documented in the evidence.

[Diagnostic PR #16](https://github.com/atxbrianbehm/buildo/pull/16) · [Full evidence](https://github.com/atxbrianbehm/buildo/blob/7fd1746467891816a578f40960bbb129339acc19/docs/reviews/2026-10-27-t5-cornice-shadow-parts/README.md). No product source or rendering behavior changed. The C9 treatment visual decision below remains pending.

![Bracket course with default light and shadows](https://raw.githubusercontent.com/atxbrianbehm/buildo/7fd1746467891816a578f40960bbb129339acc19/docs/reviews/2026-10-27-t5-cornice-shadow-parts/light-webgpu/close-default.png)

![Same bracket course after lowering the light with Shift + drag; shadows remain enabled](https://raw.githubusercontent.com/atxbrianbehm/buildo/7fd1746467891816a578f40960bbb129339acc19/docs/reviews/2026-10-27-t5-cornice-shadow-parts/light-webgpu/close-lower-light.png)
