# Cart-Centered UX Plan

## Design Principle

The MVP should feel like a grocery search and cart review workspace. The shopping brief is the user's search entrypoint, the active cart is the primary review object, and cart options are supporting comparison context.

This plan follows the broader product language rules in [Design Guidelines](design-guidelines.md).

This follows the product pipeline:

```text
Input -> GroceryNeeds -> Product Candidates -> Optimized Cart -> Review
```

## Desktop Layout

- Use a three-column workspace: shopping brief, active cart, cart options.
- Make the shopping brief wider than a utility sidebar, roughly 436 CSS pixels, so the intent input is easy to notice and comfortable to type in.
- Keep the active cart in the center column because it is the user's primary task after build.
- Keep cart option comparison in the right column as decision support, not the main object.

## Shopping Brief

- Treat the shopping brief like ecommerce search: visible, immediate, and low-friction.
- Keep `Meal idea` and `Grocery list` as the top-level mode control.
- Keep the text input large enough for natural-language intent.
- Keep examples near the input but visually secondary.
- Keep preferences below the primary input so they support the search without competing with it.

## Inference Summary

- Keep inference as a compact strip above the active cart.
- Use concise copy: `Inferred from your cart`.
- Show inferred need chips.
- Inferred need chips must keep item names readable. Do not truncate or clip item names; move overflow into `+X more`.
- Keep the reminder: `Missing something? Add or remove items in your cart.`
- Do not expose internal mock model, phase, or implementation details in the consumer UI.

## Active Cart

- The active cart is the largest post-build surface.
- It must preserve add, remove, quantity, alternative switching, total updates, budget messaging, and option title visibility.
- Show compact top totals under the active cart type pill at the far right, formatted as a tight subtotal, estimated fees, separator, and estimated total stack so the sum is visible without competing with cart contents.
- Keep the detailed bottom cart summary as the canonical summary and test target for the final cart total.
- Alternative item options should render as inline cards: 3 columns on desktop, 2 columns on medium layouts, and 1 column on narrow/mobile layouts.
- Each alternative card should keep the product or brand label, price, store/package count, and `Use this item` action.
- Cart notes may summarize important optimizer decisions, but a separate option-breakdown panel should not compete with the cart.
- Building or rebuilding a cart should hide stale cart contents and use one calm loading canvas before progressively revealing the new cart. Do not add a second floating loading pill when the canvas is already visible.
- Switching cart options should use a lightweight one-second fade transition rather than the full loading treatment.

## Cart Option Comparison

- Option cards should be compact and scannable.
- Each option card should show only:
  - cart name with one short cost pill on the same line
  - grocery cost excluding fees
  - fees
  - estimated total
  - store pill such as `Buy at Walmart` or `Buy at Walmart + Kroger`
- Option overview cards should not repeat store count or store-brand pills when those details are already implied by the store pill or reserved for deeper tradeoff explanations.
- Use consumer-facing option names in the UI while keeping optimizer IDs stable:
  - `cheapest-one-store` displays as `Cheapest single-store`
  - `cheapest-split` displays as `Cheapest multi-store`
- Store pills should always begin with `Buy at` so one-store and multi-store options use the same visual grammar.
- Selecting an option must immediately update the center active cart.
- Option switching should feel smooth but not blocked by a search-style loading state.

## Mobile Order

Mobile should stack in the order users think:

1. Shopping brief
2. Active cart
3. Cart options

## Acceptance Criteria

- The shopping brief is visually prominent and wider than the previous left rail.
- The active cart appears in the center column after build.
- Compare cart options appears in the right column on desktop.
- The inference panel is compact and contains no mock implementation copy.
- Inference chips are readable, never clipped, and overflow into `+X more`.
- Pills, tags, metadata, and repeated controls use compact one- to two-word descriptors.
- Item reasoning uses compact pills and avoids repeated disclosure controls.
- Option cards show grocery cost, fees, and store names.
- The active cart shows top and bottom totals without duplicating the `cart-total` test target.
- Alternatives scan as 2-3 inline options on wider cart layouts.
- Option comparison labels use `Cheapest single-store`, `Cheapest multi-store`, and consistent `Buy at ...` store pills.
- Build/rebuild transitions hide stale carts during loading, use one loading surface, and progressively reveal the resulting cart.
- Cart option switching uses a one-second fade transition without showing the build loading state.
- Existing cart, preference, search, pricing, and persistence tests continue to pass.
