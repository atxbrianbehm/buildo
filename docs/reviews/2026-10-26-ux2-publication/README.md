# UX2 PR and phone-gallery publication

The three sequential selected-window milestones are published to the approved public `atxbrianbehm/buildo` repository, with merging reserved for the user:

| Order | Packet | PR | Implementation commit | Base branch |
|---|---|---|---|---|
| After C8.P2 | Pure target/fit contract | [#6](https://github.com/atxbrianbehm/buildo/pull/6) | `32b16e39c226354040f5cce1ad8d54f428031d82` | `codex/c8-p2-storefront-authoring` |
| Next | Executed aperture/assembly scope | [#7](https://github.com/atxbrianbehm/buildo/pull/7) | `3308201128a604eb52a60430cad872611fa900d7` | `codex/ux2-p0-targeted-opening-contract` |
| Next | Product and source continuation | [#8](https://github.com/atxbrianbehm/buildo/pull/8) | `36bc79cbb4144186a70cecb9b5ae2a24bcdf3bfd` | `codex/ux2-p1-targeted-opening-geometry` |

All three implementation heads were verified against the remote and each PR attached to this task. PR #8 was open and mergeable at verification; GitHub reported no CI checks. No merge or auto-merge occurred. Remote `main` remained `f8cb1486595856255a3b13a3961a42ef5554faba`. Review parent-first and retarget children after each parent merges, preserving ancestry or rebasing children if squashing. A documentation-only follow-up on PR #8 records these external results; the implementation checkpoints above remain fixed.

The [phone gallery](https://app.notion.com/p/3fdb77d6cd4f812a9f88f1316beb9c25) contains **eight new reviewed runtime images and120 total image blocks**. All112 earlier image references are retained. The new before/after pair isolates one window; later controls/cold views include the intentional shared-width edit and finish from continuation testing. [Notion readback proof](notion-proof.json), [eight public-image byte checks](gallery-public-image-proof.json) and the [inserted section](notion-section.md) record the result.

The new image blocks use public GitHub PNG URLs pinned to implementation commit `36bc79cbb4144186a70cecb9b5ae2a24bcdf3bfd`. Every URL returned HTTP200, image/png and bytes exactly matching the reviewed artifact. Automatic approval review rejected both saving temporary direct-upload credentials and a proposed in-memory terminal route. Neither rejected action executed; no upload credentials were persisted or used. Embedding the already-approved public artifacts through the connected Notion tool avoids that credential path entirely. Page permissions were unchanged. Buildo parent placement is still unresolved; no page was moved or reparented.

This receipt supersedes publication-pending statements inside the sealed [P2 implementation archive](../2026-10-26-ux2-p2-selected-window-authoring/README.md); that archive and its118-entry inventory are unchanged. All five checks passed on stable source:1,860 tests/128 files and eight standard E2E workflows. Each backend passed19 native states/16 captures, exact final reopen/room/cold pixels and zero cold provider/material generation. Publication changes no application source.

The next actual human gate is review of the new selected-window task before more scoped operations or broad UI migration. The earlier C6 recipe and UX1 grouped-direction approvals are recorded separately. Artist sessions, representative-machine/family/block acceptance and live historical UTDG architecture coverage remain unproven.
