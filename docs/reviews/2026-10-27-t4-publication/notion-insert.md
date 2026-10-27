## T4 — shadow comparison for the C9 review

<date start="2026-10-27" />

The bracket looks dark partly because the same cornice batch both casts and receives shadow. On WebGPU and WebGL, temporarily disabling either cornice casting or reception brightened the same close-view pixels. Disabling wall shadow reception changed no pixels in that cornice region. The batch contains several pieces, so this does not yet prove which surface casts the shadow or whether it is unwanted self-shadowing or intended occlusion.

At the displayed sill, turning off cornice casting changed no pixels in the measured sill region, while turning off wall shadow reception changed part of that view. The second and fourth images below are diagnostic comparisons, not a proposed blanket shadow-removal setting. A targeted repair remains to be investigated.

The tests restored all 16 native frames and camera matrices exactly, retained the material/geometry source, and made no material-generation calls. A WebGPU light-toggle attempt and two bias sweeps are excluded after restoration errors. [Diagnostic PR #15](https://github.com/atxbrianbehm/buildo/pull/15) · [Full evidence](https://github.com/atxbrianbehm/buildo/blob/ab7a99b3ec4a1a41402020aaa5e0ea7e324e5888/docs/reviews/2026-10-27-t4-shadow-discriminator/README.md).

The C9 treatment visual decision below remains pending.

![Bracket course — normal product rendering](https://raw.githubusercontent.com/atxbrianbehm/buildo/ab7a99b3ec4a1a41402020aaa5e0ea7e324e5888/docs/reviews/2026-10-27-t4-shadow-discriminator/webgpu/bracket-baseline.png)

![Same view — cornice casting disabled as a diagnostic, not a product change](https://raw.githubusercontent.com/atxbrianbehm/buildo/ab7a99b3ec4a1a41402020aaa5e0ea7e324e5888/docs/reviews/2026-10-27-t4-shadow-discriminator/webgpu/bracket-cornice-cast-off.png)

![Repaired sill and wall — normal product rendering](https://raw.githubusercontent.com/atxbrianbehm/buildo/ab7a99b3ec4a1a41402020aaa5e0ea7e324e5888/docs/reviews/2026-10-27-t4-shadow-discriminator/webgpu/sill-baseline.png)

![Same sill and wall — wall shadow reception disabled as a diagnostic](https://raw.githubusercontent.com/atxbrianbehm/buildo/ab7a99b3ec4a1a41402020aaa5e0ea7e324e5888/docs/reviews/2026-10-27-t4-shadow-discriminator/webgpu/sill-wall-receive-off.png)
