# Phase Gates

## Purpose

Development must move phase by phase. Later-phase experiments may exist in the local MVP, but the product is not considered ready for the next phase until every earlier phase gate is closed.

The ordered source of truth is [MVP Roadmap](mvp-roadmap.md). If a new phase is inserted into the roadmap later, it automatically becomes part of the required sequence. Do not skip it.

## Completion Rule

A phase or major feature is complete only when:

- all acceptance criteria for that phase are met
- all prior phase behavior still works
- new unit and e2e coverage exists for new behavior
- all historical unit and e2e tests still pass
- the full validation gate passes:

```bash
npm run test:all
```

`npm run test:all` is the default completion gate because it runs lint, unit tests, e2e tests, and production build.

## Sequential Development Rule

If later-phase work already exists while an earlier phase remains incomplete, pause net-new later-phase expansion and close the earlier phase gate first.

Phase gates must close in the exact order they appear in [MVP Roadmap](mvp-roadmap.md).

Before starting or continuing work in any phase:

- identify the target phase in the roadmap
- scan every earlier roadmap phase
- confirm each earlier phase is explicitly closed
- if any earlier phase is open, stop later-phase work and close the earliest open phase first
- after each phase passes its gate, stop and let the user review before moving to the next roadmap phase

This applies to current phases and all future phases added to the roadmap.

Current immediate gate:

- Phase 2, Phase 2.5, Phase 3A, and Phase 3B have been closed in sequence.
- [Phase 3.5](phase-3-5-closure-checklist.md) passed its full validation gate on July 16, 2026.
- stop for explicit user review of Phase 3.5 before starting OpenAI intent interpretation, embeddings, API connections, retailer connectors, or personalization work
- after that review, continue one roadmap phase at a time

## Regression Rule

Do not mark work complete if it breaks any historical workflow, even when the new feature works. Historical tests represent protected product behavior.

When adding new behavior:

- add focused tests for the new behavior
- keep existing unit and e2e tests intact
- update tests only when the intended product behavior changes
- run `npm run test:all` before declaring the work complete

## Root-Cause And Extensibility Rule

Every identified issue must be treated as evidence of a product capability gap, not only as a one-off defect.

Before implementing a fix:

- identify the immediate symptom
- identify the root cause behind the symptom
- state what product capability is weak, missing, or underspecified
- choose a remedy that improves the reusable capability, not just the reported example

Before marking the fix complete:

- add tests for the reported case
- add tests for neighboring cases in the same capability class
- include at least one negative or unsupported case when relevant
- run all historical tests through `npm run test:all`

Examples:

- A typo such as `dary free milk` is not only a spelling bug; it is an intent-interpretation and typo-tolerance capability.
- A cart total that does not update after quantity changes is not only a display bug; it is a cart-pricing consistency capability.
- A plan picker that does not change the cart is not only a click bug; it is a plan-selection state and optimizer-contract capability.

## Future Gate Additions

If docs linting, schema checks, visual regression tests, accessibility checks, or connector contract tests are added later, include them in the full completion gate.
