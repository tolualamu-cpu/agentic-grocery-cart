# Phase 3B Closure Checklist

Status: ready for user review after the historical gate passes.

## Scope

Phase 3B covers shopper-facing cart option comparison after Phase 3A optimizer correctness.

It does not expand the catalog, add live retailer connectors, or introduce new semantic search infrastructure. Those belong to Phase 3.5 and later phases.

## Completed Behaviors

- The user can compare cart options in the right-side comparison panel.
- The active cart remains the primary center-page review object.
- Option cards show compact shopper-facing labels:
  - cart option name
  - short cost pill such as `Lowest cost option` or `+$4.20 vs lowest cost`
  - store pill such as `Buy at Walmart` or `Buy at Walmart + Kroger`
  - grocery cost
  - fees
  - estimated total
  - availability or review state
- The UI uses `option/options` for shopper-facing comparison language.
- Internal optimizer IDs and plan contracts remain stable.
- The user can switch between recommended, cheapest single-store, cheapest multi-store, best value, fewest stores, and preferred brands when available.
- Switching an option updates the active cart title, selected items, stores, and totals.
- Manual cart editing still works after option switching.
- Partial, blocked, unmatched, unavailable, and constraint-conflicting states remain visible across option switches.
- Older saved carts with stale option shapes rebuild from saved needs and preferences instead of crashing.

## Explicit Product Decision

Do not add an additional gain/loss explanation layer in Phase 3B.

Reason: the current compact option cards and selected-option breakdown provide enough MVP decision support. More repeated explanation chips would add visual clutter and conflict with the concise UX guideline.

## Required Tests

- Unit tests must continue to validate optimizer option generation and comparison summaries.
- E2E tests must continue to cover:
  - option card visibility
  - compact option copy
  - store pills
  - option switching
  - active cart updates after switching
  - stale saved cart recovery
  - unmatched/review state preservation
  - manual cart editing after option selection
  - desktop and mobile behavior
- The full historical gate must pass:

```bash
npm run test:all
```

## Review Gate

After `npm run test:all` passes, stop for user review before starting Phase 3.5.
