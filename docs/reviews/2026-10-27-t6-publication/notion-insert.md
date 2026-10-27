## T6 — why stronger shadow bias needs care

<date start="2026-10-27" />

The second image is a temporary diagnostic, not the product setting. Stronger depth bias makes the cornice face lighter but also shifts contact shadows and brightens sampled areas where the upper lip physically blocks the key light. It is not yet a safe fix for the fringed edge. Both native backends returned to the original image and exact camera after every setting; materials and geometry stayed unchanged.

[Diagnostic PR #17](https://github.com/atxbrianbehm/buildo/pull/17) · [Full evidence](https://github.com/atxbrianbehm/buildo/blob/3c803ee43e44db761e5589618dba5c279c89a76d/docs/reviews/2026-10-27-t6-shadow-bias-sweep/README.md). Further work will examine shadow-map resolution and filtering while preserving useful shadows. The C9 visual decision remains pending.

![Current bracket appearance at default shadow bias](https://raw.githubusercontent.com/atxbrianbehm/buildo/3c803ee43e44db761e5589618dba5c279c89a76d/docs/reviews/2026-10-27-t6-shadow-bias-sweep/webgpu/bracket-baseline.png)

![Experimental stronger bias; brighter but not an approved product setting](https://raw.githubusercontent.com/atxbrianbehm/buildo/3c803ee43e44db761e5589618dba5c279c89a76d/docs/reviews/2026-10-27-t6-shadow-bias-sweep/webgpu/bracket-bias-0.001.png)
