# R2.P4 — source-preserving regeneration

Opened source files now retain their pinned style and proposal dependencies through identical Run and window-only edits. The repair changes two production files and three existing test files; no source files were added or removed.

- All five repository checks pass: **1,069 tests across 95 files**, lint, typecheck, production build and E2E. Focused verification passes 149 tests across four files.
- The original regression was observed before repair: identical Run replaced the file's 4.25 m typical-floor style with installed defaults. The exact retained test bytes pass after repair.
- Actual WebGPU Open → identical Run → window edit → Save/Open preserves 4.25 m submitted floor gaps, all five raw material channels and the entire exported atlas. Revisions are **7 → 7 → 8 → 8**.
- Positive controls observed one interpreter call and 12 provider calls. Each continuation operation observed zero calls. Arched/rectangular submitted geometry and fresh connected owners are verified.
- All eight Forge/Hall PNGs were inspected. There were no page, console or request errors.

[Validated checkpoint](source-check-and-app-checkpoint.json) binds the accepted source, checks, independent review and 26-artifact App proof. Its SHA is d439563c544a2a1813a7816f54c2daf8de7dda366bec74dcc9f023c4d5bf88f3. Preservation copied 58 literal inputs plus patch/checkpoint; this folder also retains the actual successful preservation log. Source aggregate: `0a34e983e515ba4516ef610adddad22ef5cb9163628b18c83b24405b9ac0b0a8`.

Useful evidence: [App result](app/result.json), [visual inspection](app/visual-inspection.json), [first Open](app/pinned-open-arched-assembly-hall.png), [window edit](app/pinned-edited-rectangular-assembly-hall.png), [reopened result](app/pinned-reopened-rectangular-assembly-hall.png), [source review](source-review/review.json), [retained red](causal/red.log), [same-test green](causal/green.log), [unit checks](checks/test.log), [E2E](checks/e2e.log), [actual preservation](verification-final-01.log).

The other 248 source files remain byte-identical to accepted P3. Source format and other-control behavior are unchanged. Broader authoring, compiler-content identity and legacy completed-IR migration remain later packets. R1 human appearance, worth-keeping, measured-density and representative-performance gates remain open. No commit, push, publication or provider spending occurred.
