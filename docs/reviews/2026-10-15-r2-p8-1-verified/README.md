# R2.P8.1 — stable facade choices during roof edits

**Engineering passed.** This separate three-file packet clears the protected non-roof App gate left open by the [P8 roof candidate](../2026-10-15-r2-p8-candidate/README.md).

Only the family-identity roof token changes in production. Flat inputs retain their exact previous IDs/output; actual gable type, geometry, catalog and graph content remain distinct. The two test files retain every prior byte and their complete red snapshots.

- [Checkpoint](source-check-and-app-checkpoint.json): `31688f764b03881cb95ef0fb0766514c89134034f6c3605f0e536710c4eb5ac9`; source `64ead03e4dd407ae5c030ee01fd49c90330fce38f195bc3cbdb536ee65979ac3`.
- [Required checks](raw/required-checks-final-02.json): 1,147 tests / 95 files; lint, typecheck, build and E2E pass. Focused coverage: 18 cases / four files.
- [Independent source review](raw/source-review-final-02.json): exact identity reversal, whole retained tests, 250 protected sources and four old P8 buffer controls.
- [Causal red](raw/causal-red-01.log) and [same-test green](raw/causal-green-01.log).
- [Actual App proof](raw/app-proof-02/result.json): flat→gable→flat, unchanged non-roof saved buffers, fresh connected roof owners and literal five-channel material reuse.
- [Inspected captures](raw/visual-inspection-02.json): [flat](raw/app-proof-02/flat-before-assembly-hall.png), [gable](raw/app-proof-02/gable-assembly-hall.png), [flat return](raw/app-proof-02/flat-return-assembly-hall.png).
- [Flat compatibility](raw/crosspacket-flat-compatibility-02.json): the earlier P8 flat spec, saved buffers, submitted roof attributes and material receipts remain exact.
- [Independent App audit](raw/app-proof-audit-02.json).
- [Preservation execution](verification.log).

Typecheck, focused coverage and the full suite passed in attempt01. The evidence archive's executable filenames caused lint to include copied scripts; snapshot filenames corrected that without changing source, bytes or lint rules. Lint02/build02/E2E02 finish the same-source check record. [The archive correction](raw/archive-correction-01.json) and original failure are retained. All archived runnable/source copies use snapshot filenames.

App01 stopped at server startup before creating a browser. The successful helper permits another available loopback port. The original P8 App non-roof failure remains in its separate candidate packet; this packet passes that unchanged assertion.

Root inspected all three actual WebGPU captures. Roof sampling, busy brick/dark trim and gable camera cropping remain visible. Human appearance, worth-keeping, density and representative performance are pending. Legacy completed IR is unchanged. The next packet admits isolated roof edits through the existing v3 source envelope.
