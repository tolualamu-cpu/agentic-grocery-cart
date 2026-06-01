# Design Guidelines

## Principle

The product should feel calm, scannable, and decision-oriented. The user is here to build and review a grocery cart, not read a dense explanation layer.

## Capability-First UX

- Treat each UX issue as a signal about the underlying shopper capability, not only the visible screen defect.
- Ask what the user was trying to accomplish, what product promise failed, and where the workflow became brittle.
- Fix reusable interaction patterns before polishing the isolated example.
- Test the pattern across happy paths, adjacent edge cases, and unsupported states.

Examples:

- If an add-item search fails for one typo, test typo tolerance across meal input, grocery-list input, and add-item search.
- If an option card click does not change the cart, test all option-switching paths, active labels, selected items, totals, and edited-cart behavior.
- If a pricing display is wrong for one item, test line price, quantity, subtotal, fees, and total across several cart compositions.

## Compact Language

- Prefer one- to two-word descriptors for pills, tags, metadata, option attributes, and repeated controls.
- Use full sentences only for primary user guidance, errors, empty states, high-impact warnings, and explanation panels.
- Avoid implementation details in consumer UI, including mock model references, internal phase names, pipeline terms, or technical architecture.
- Keep repeated labels short enough to scan at a glance.

Good compact labels:

- `Organic`
- `Best value`
- `Low fee`
- `Brand fit`
- `Swap`
- `Pickup`
- `Store brand`
- `Budget fit`

Avoid repeated verbose labels:

- `Why this item was selected`
- `This product matches your organic preference`
- `Inferred from a mock model meal profile`
- `This is the lowest estimated total among comparable options`

## Visual Density

- Do not let secondary metadata compete with the active cart.
- Pills should summarize, not explain.
- Explanations should be available when useful, but not repeated on every card by default.
- Use compact pills when they explain enough on their own; avoid extra disclosure controls for repeated item metadata.

## Cart Review Guidance

- Keep product names, quantities, prices, and selected stores visually primary.
- Use short badges for match attributes such as `Organic`, `Store brand`, `Low fee`, or `Brand fit`.
- For item reasoning, prefer compact pills such as `Package fit`, `Value`, or `Brand fit`.
- Reserve full explanatory copy for unmatched items, user-facing warnings, and option-level tradeoffs.

## Product Images

- Follow [Product Image Standards](product-image-standards.md) for cart, substitute, add-item, and catalog imagery.
- Product images must support recognition and trust; avoid icon-like assets, letter placeholders, or decorative illustrations.
- Substitutes should use smaller thumbnails than selected cart items so alternatives never overpower the main choice.
