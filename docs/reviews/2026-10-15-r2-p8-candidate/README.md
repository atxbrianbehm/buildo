# R2.P8 roof candidate

**Status: App gate failed; candidate retained.** This is the separate five-file roof-geometry checkpoint before R2.P8.1. It does not close P8.

Fresh gable compilation now emits pitched indexed geometry. Roof changes rebuild the matching catalog while retaining materials. Flat geometry and all four controlled flat/non-roof buffer cases remain exact.

- [Checkpoint](source-checkpoint.json), source `2de4ecde860c5610151052043543b4dcbf13c18a9b938dfb66b77dff19f23691`, checkpoint SHA `85aaabfc34fecd6e73a003d82531412cacf42f676be1dd835f8dd532d3966ccf`.
- [Required checks](raw/required-checks-final-01.json): all five pass, 1,143 tests / 95 files; 14 focused cases / three files.
- [Independent source review](raw/source-review-final-01.json): five changed existing files, 248 protected, three complete earlier test prefixes.
- [Actual App failure](raw/app-proof-01/failure.json) and [execution log](raw/app-proof-01.log): non-roof saved geometry changes on the gable edit.
- [Inspected captures](raw/visual-inspection-failed-01.json): [flat](raw/app-proof-01/flat-before-assembly-hall.png), [gable](raw/app-proof-01/gable-assembly-hall.png), [flat return](raw/app-proof-01/flat-return-assembly-hall.png).
- [Causal red](raw/roof-compiler-red-01.log), [same-test green](raw/roof-compiler-green-03.log) and [four exact flat controls](raw/roof-flat-controls-green-03.json).
- [Actual candidate preservation](candidate-preservation.log).

The App attempt reached the pitched roof, literal material comparisons and exact flat restoration, then failed its protected non-roof check. Roof type changes family ID, which enters facade window-module selection paths. The separate P8.1 repair must stabilize this without rerolling the accepted flat facade; the failing assertion stays intact.

Raw preparation and failed wrapper attempts are retained in this packet. Helper01's stale receipt call and the pre-child launcher count error are preparation failures. Green01/02 actual tests passed but their wrappers lacked reporter-suppressed receipts; green03 retains the exact four comparisons. These are distinct from the actual App integration failure.

All three actual PNGs were inspected. Roof texture remains stretched, brick/trim busy and the gable camera crops the base. Human appearance, worth-keeping, material density and representative performance remain open. Legacy completed IR is unchanged. No commit, push, provider spending or release.
