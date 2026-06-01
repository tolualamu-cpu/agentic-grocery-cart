# Phase 2 Closure Checklist

## Purpose

This checklist closes Phase 2 only. The next eligible roadmap phase is Phase 2.5, and that work should not start until the user reviews this gate.

Roadmap source of truth: [MVP Roadmap](mvp-roadmap.md)

Gate rule: [Phase Gates](phase-gates.md)

## Phase 2 Scope

Phase 2 is complete when the MVP has model-ready need generation, search foundations, and deterministic product matching without requiring live OpenAI or retailer APIs.

Required capabilities:

- reusable `NeedGenerator` implementations for template, mock model, and hybrid inference
- strict schema validation for inferred `GroceryNeed` data
- data-driven meal profiles with aliases, signals, warnings, and variants
- supported proof meals, including Cobb salad, shawarma, lamb shawarma plate, tacos, pasta dinner, curry, and stir fry
- reliable partial input handling for high-confidence inputs such as `shawarma`
- uncertainty states for unsupported or ambiguous input
- deterministic product matching from canonical products, aliases, categories, tags, offers, package fit, price, availability, dietary fit, and brand fit
- ranked alternatives with compact reasons and warnings
- strict substitution handling
- unmatched need handling
- cart persistence through refresh
- no model-invented prices, availability, fees, or totals

## Closure Criteria

Phase 2 can be marked closed only when all of the following are true:

- Phase 1 behavior still works.
- All Phase 2 success criteria in the roadmap are met.
- New tests cover Phase 2 behavior.
- Historical unit and e2e tests still pass.
- The full gate passes:

```bash
npm run test:all
```

## Current Evidence

Implemented:

- data-driven meal profiles in `app/src/data/mealProfiles.ts`
- full model-like inference result schema validation
- ambiguity handling for broad inputs such as `chicken`, `healthy lunch`, and `dinner for four`
- strict substitution matching that avoids loose product substitutions
- compact item reasoning with short cart pills
- unmatched need review state with item removal

Focused validation already run during closure:

- `npm run test:unit -- needs`
- `npm run lint`
- `npm run test:unit -- needs productMatcher`
- `npm run test:e2e`

Final closure evidence:

- `npm run test:unit -- exploratoryJourneys`
- `npm run test:all`

Result:

- lint passed
- 190 unit tests passed
- 40 e2e tests passed
- production build passed

Status:

- Phase 2 implementation is ready for user review.
- Phase 2 should be marked closed only after user review.

## Stop Point

After this gate passes, stop and wait for user review. Do not start Phase 2.5 until the user explicitly approves moving forward.
