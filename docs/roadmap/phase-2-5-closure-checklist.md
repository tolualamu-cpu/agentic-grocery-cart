# Phase 2.5 Closure Checklist

## Purpose

This checklist closes Phase 2.5 only. The next eligible roadmap phase is Phase 3A, and that work should not start until the user reviews this gate.

Roadmap source of truth: [MVP Roadmap](mvp-roadmap.md)

Gate rule: [Phase Gates](phase-gates.md)

## Phase 2.5 Scope

Phase 2.5 is complete when search and ranking are resilient to realistic MVP user input without live APIs, broad catalog infrastructure, or embeddings.

Required capabilities:

- shared `SearchService` behavior across meal input, grocery list parsing, add-item search, and product matching
- model-ready grocery intent interpretation before need generation
- intent classification for meal, list, product search, optimization, constraint, and ambiguity cases
- typo-tolerant matching for common grocery terms and meal names
- singular/plural and light stemming normalization
- context-aware ranking, so the same query can rank differently by surface
- multi-retriever scoring across exact, alias, token, category, tag, fuzzy, and meal-profile matches
- explainable ranked candidates with reasons and warnings
- ambiguity handling for short broad inputs
- unsupported input rejection for misleading partial matches
- at least 50 automated search evaluation fixtures
- at least 50 additional constraint-understanding fixtures across meal idea, grocery list, and add-item search
- no live OpenAI API dependency; live model-backed intent understanding is planned for Phase 3.5

## Closure Criteria

Phase 2.5 can be marked closed only when all of the following are true:

- Phase 1 and Phase 2 behavior still works.
- All Phase 2.5 success criteria in the roadmap are met.
- Search evaluation tests cover at least 50 representative inputs.
- Historical unit and e2e tests still pass.
- The full gate passes:

```bash
npm run test:all
```

## Current Evidence

Implemented:

- 60-case search evaluation suite
- 101-case constraint-understanding fixture suite across meal idea, grocery list, and add-item search
- constraint-aware query understanding
- schema-validated `GroceryIntentInterpretation`
- replaceable `GroceryIntentInterpreter` interface
- deterministic, mock/model-like, and hybrid intent interpreter implementations
- shared intent interpretation routed through meal inference, grocery-list parsing, and add-item search
- generic meal ambiguity detection
- stop-word cleanup for user phrasing
- stricter fuzzy matching for short-token false positives
- context ranking for meal profile vs product search
- dietary tag ranking for dairy-free product search
- unsupported add-item rejection for cases such as `moon milk`
- preserved default add-item suggestions for empty search
- structured constraint parsing before need generation
- model-ready intent interpretation pattern for constrained inputs
- semantic typo and synonym handling for constraint language such as `dary free milk`, `lactose free milk`, `orgnic eggs`, and `cheep tacos`
- typo coverage for dairy-free, gluten-free, organic, non-organic, price/value, pickup/delivery, meal names, and add-item product search
- constraint-aware meal inference for dairy-free, organic, non-organic, price, pickup, and delivery language
- constraint-aware grocery list parsing, including `dairy free milk`
- constraint-aware add-item search e2e coverage

Focused validation already run during closure:

- `npm run test:unit -- searchEvaluation search needs productMatcher exploratoryJourneys`
- `npm run test:unit -- constraintUnderstanding searchEvaluation search needs productMatcher`
- `npm run test:unit -- constraintUnderstanding productMatcher needs search`
- `npm run test:e2e -- cart-builder`

Final closure evidence:

- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e -- cart-builder`
- `npm run test:all`

Result:

- lint passed
- 328 unit tests passed
- 52 e2e tests passed
- production build passed

Status:

- Phase 2.5 implementation is ready for user review.
- Phase 2.5 should be marked closed only after user review.

## Stop Point

After this gate passes, stop and wait for user review. Do not start Phase 3A until the user explicitly approves moving forward.
