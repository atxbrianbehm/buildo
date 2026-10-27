# Buildo packet publication and next decisions

The user explicitly approved publication of the prepared five-packet source, tests, review images and logs to the public `atxbrianbehm/buildo` repository. The atomic push succeeded. This receipt supersedes publication-pending statements inside the sealed historical packet archives; those archives remain unchanged.

| Review order | PR | Published packet head | PR base |
|---|---|---|---|
| Recovery | [#1](https://github.com/atxbrianbehm/buildo/pull/1) | `8f0b1fc62cb3f25ce9a92f28ce0d5b5741c1d4f4` | `main` |
| C7 windows | [#2](https://github.com/atxbrianbehm/buildo/pull/2) | `14a47b94b8b2bf477a33d8e92d402cd744620a64` | `codex/revival-baseline` |
| C8.P0 planning | [#3](https://github.com/atxbrianbehm/buildo/pull/3) | `fc0635ad09cba2640532bdbd183ac31f6f5da39d` | `codex/c7-window-vocabulary` |
| C8.P1 geometry | [#4](https://github.com/atxbrianbehm/buildo/pull/4) | `7efb4de369f67a9a9f14840ad96ce6584285dff0` | `codex/c8-p0-storefront-planning` |
| C8.P2 authoring | [#5](https://github.com/atxbrianbehm/buildo/pull/5) | `f42b6d3e81b9cac522868608260a80c35a8f1721` | `codex/c8-p1-storefront-geometry` |

The hashes above identify the original published implementation checkpoints. A documentation-only follow-up on PR #5 records publication and remaining decisions. At initial verification all five remote heads matched their local branches, every PR had the intended base/head and was open, attached to this task and mergeable. GitHub reported no CI checks. Remote `main` remained `f8cb1486595856255a3b13a3961a42ef5554faba`; no merge or auto-merge occurred. Local machine receipt: `test-results/github-packets-2026-10-25/publication-results-2026-10-26.json`.

Review and merge in the order above, retargeting the next PR to `main` after its parent merges. Preserve merge ancestry, or rebase children if a parent is squashed. Merge decisions remain with the user.

The existing final-source validation passed typecheck, lint, 1,812 tests across 125 files, build and eight standard E2E workflows. Both native backends passed 20 states and 17 captures. Publication changes no application source and does not require repeating those runtime checks. Earlier pixel variance, historical coverage limits and missing artist evidence remain documented in [C8.P2](2026-10-25-c8-p2-storefront-authoring/README.md).

## Review needed to unlock the next packet

Use the [phone gallery](https://app.notion.com/p/3fdb77d6cd4f812a9f88f1316beb9c25) or the linked actual-runtime evidence below. No additional approval button is required; decisions can be given in the task conversation. Publication approval does not mean product acceptance.

| Plan gate | Concrete decision | Existing evidence |
|---|---|---|
| UX1 workflow review | Accept the grouped inspector as the direction for further authoring, or name the changes needed. Shared geometry controls and local surface finishes have different scope; advanced nodes remain available. | [Implemented grouped controls, desktop/compact and advanced fallback](2026-10-18-ux1-p1/README.md); [current storefront controls and continuation](2026-10-25-c8-p2-storefront-authoring/README.md) |
| C6 visual review | Accept restrained masonry, deep reveals and projecting cornice as the geometric recipe baseline, or name the visual defects to repair. | [Whole buildings, openings, entrance, roof and clay views](2026-10-18-c6-p1/README.md) |

These are the current human gates in the [Ready Queue](../plans/building-authoring-revival.md#ready-queue). UX2 is not ready: after the workflow decision it needs a separately defined scoped structural-edit contract and implementation packet. Further vocabulary also needs a bounded packet. Artist usability sessions, live historical UTDG architecture coverage, representative-machine and family/block acceptance remain separate requirements. No new implementation packet or human acceptance is invented by this closeout.
