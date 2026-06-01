# Phase 3A Test Plan

## Purpose

This document is the required test plan for Phase 3A: Optimizer Correctness.

Phase 3A cannot be marked complete until every required category in this plan is implemented and the full historical gate passes. Future work may add coverage, clarify expectations, or make criteria stricter. It may not skip, remove, or weaken this coverage without explicit user approval.

Roadmap source of truth: [MVP Roadmap](mvp-roadmap.md)

Gate rule: [Phase Gates](phase-gates.md)

## Unit Tests

The optimizer unit suite must cover the following behavior.

Hard constraint filtering:

- unavailable offers are excluded
- stores that do not support the selected fulfillment mode are excluded
- selected stores never exceed `maxStores`
- organic required excludes non-organic offers
- need-level dietary constraints exclude incompatible products

Item candidate scoring:

- match quality affects candidate rank
- package fit affects candidate rank
- organic preference affects candidate rank
- non-organic preference affects candidate rank
- brand flexibility affects store-brand rank

Cart-level scoring:

- subtotal includes item quantities
- fees are included in total
- pickup and delivery produce different totals
- the selected cart score is based on the full cart, not a single item
- score breakdown is deterministic and inspectable

Strategy behavior:

- cheapest chooses the lowest feasible full-cart total
- best value balances fit and cost
- fewest stores minimizes store count first
- preferred brands reduces store-brand reliance when comparable options exist

Budget behavior:

- budget never blocks cart creation
- over-budget carts produce warnings
- tight budget nudges comparable lower-cost options
- impossible budget still builds the best feasible cart

Exception behavior:

- unmatched needs are returned, not silently dropped
- partial carts are marked `needs_review`
- fully unbuildable carts are marked `blocked`
- soft preference misses degrade gracefully
- hard constraint misses remain unmatched

## Matrix Tests

Add generated matrix coverage across these preference axes:

```text
optimizationGoal:
- cheapest
- best_value
- fewest_stores
- preferred_brands

organicPreference:
- none
- prefer
- prefer_non_organic
- required

brandFlexibility:
- flexible
- balanced
- strict

fulfillmentMode:
- pickup
- delivery

maxStores:
- 1
- 2
- 3

budgetTarget:
- none
- comfortable
- tight
- impossible
```

Required invariants:

- store count never exceeds `maxStores`
- organic required never selects non-organic
- budget never blocks cart creation
- delivery totals include delivery fees
- pickup totals include pickup fees
- cheapest is never more expensive than another feasible equivalent cheapest option
- fewest stores uses the minimum feasible store count
- missing items are always represented as unmatched needs
- blocked carts never display as ready
- results are deterministic for the same input and preferences

## Exception And Edge-Case Tests

Required exception scenarios:

- item does not exist in the catalog
- item exists but not with the required organic constraint
- item exists but not with the required dietary constraint
- item exists only at a store outside `maxStores`
- item exists only at a store without the selected fulfillment mode
- item is unavailable or out of stock
- only a store-brand option exists under strict brand settings
- multiple missing items appear in one cart
- no items match at all
- one item has only a soft preference miss

Expected cart statuses:

- `ready`: all required needs matched
- `needs_review`: a useful partial cart exists, with unmatched needs
- `blocked`: no reliable cart can be built

Expected unmatched need shape:

```ts
type UnmatchedNeed = {
  need: GroceryNeed;
  reason:
    | "no_candidate"
    | "constraint_conflict"
    | "fulfillment_unavailable"
    | "max_stores_conflict"
    | "out_of_stock";
  blockingConstraints: string[];
  suggestedActions: Array<
    | "relax_constraint"
    | "remove_item"
    | "search_manually"
    | "increase_max_stores"
  >;
};
```

## E2E Tests

Required shopper journeys:

- build a normal meal cart and confirm status is ready
- build a grocery-list cart and confirm matched items render
- switch cart options and confirm items and totals update
- change organic preference and confirm cart rebuilds predictably
- change brand flexibility and confirm product choice changes
- change fulfillment mode and confirm fees and totals update
- change max stores and confirm selected stores stay within the cap
- set a low budget and confirm warning appears without blocking cart
- add an item after optimizer output and confirm totals update
- remove an item and confirm totals update
- increment and decrement quantity and confirm subtotal and total update
- switch an alternative item and confirm item and total update
- build a partial cart with one unmatched item and confirm `needs_review`
- build an impossible cart and confirm `blocked`
- recover from an unmatched item by removing it
- recover from a constraint conflict by relaxing the constraint
- recover from a max-store conflict by increasing store count

## Completion Gate

Phase 3A cannot be marked complete until:

- every listed unit test category exists
- matrix coverage exists
- exception handling tests exist
- e2e shopper journeys exist
- all historical tests still pass
- the full validation gate passes:

```bash
npm run test:all
```

No existing historical test may be skipped, weakened, or deleted to make Phase 3A pass.

## Governance

This test plan is additive-only.

Future edits may:

- add more tests
- add more edge cases
- add stricter acceptance criteria
- clarify wording

Future edits may not:

- remove required test categories
- skip exception handling
- skip matrix coverage
- skip historical tests
- mark Phase 3A complete without `npm run test:all`
