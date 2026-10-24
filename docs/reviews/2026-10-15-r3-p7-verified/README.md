# R3.P7 — owned transaction-complete IndexedDB writes

The generic adapter now owns its entry/key before awaiting database opening and fulfills put only on transaction completion. Request success alone is insufficient; request, transaction, abort and synchronous failures reject without detached promise failures.

All five checks pass: **1,297 tests / 95 files**, TypeScript, lint, build and E2E. Focused App/adapter coverage: **51 / two files**. Source: `0d214fe5dac638a64f970e557aa1eedbd827e3da549402ad8badd6626f829fbf`. Exactly three existing paths change; 250 other sources, every historical assertion and production UI/controller/compiler/materials remain literal. No commit or push was made.

- [Checkpoint](source-check-and-app-checkpoint.json) — `f0c9fa75436aab758fc001f4e8b86b53076ca9713504a9882310c426a793fcf3`
- [Required checks](raw/required-checks-final-01.json)
- [Source review](raw/source-review-01.json) and [root review notes](raw/review-notes-01.md)
- [Current baseline App workflow](raw/app-workflow-01.json) and [current width workflow](raw/app-width-workflow-01.json)
- [Inherited inspected P6 captures](../2026-10-15-r3-p6-verified/raw/rendered-review-02.json)

Six new cases separate open, request success, commit and abort/error. Records remain staged until commit and previous committed records survive failures. Coverage includes caller mutation of key/dependencies/nested data/typed bytes during delayed open, independent acknowledgement promises, request errors, synchronous throw stages with failing cleanup/late events and clone failure before any IO. The App fake now models completion after request success. Original generic cases/helper and all App content outside its fake block remain literal.

The first coherent three-file candidate passes TypeScript, all 51 focused App/adapter cases, both protected browser workflows, the full 1,297-case/95-file regression suite, lint and build. Root and independent adversarial review found no remaining blocker. No feature/test repair or check retry was needed.

The actual browser workflows rerun on the final source, including window edit, Save, fresh-page portable Open and Restore with exact source/IR/gallery/material checks. UI/renderer bytes remain P6, so no additional PNG or detector pass is claimed. The four legacy source canaries and P5 codec roundtrips are inherited.

Transaction completion acknowledges IndexedDB; this does not promise explicit physical-disk flush. No automatic source checkpoint/recovery, queue/CAS, delete/close API or cache-format change is included. Next: separate source-checkpoint contract/storage preparation. Human appearance, worth-keeping, density and representative performance remain open.
