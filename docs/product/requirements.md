# Product Requirements

## MVP Scope

The MVP should validate two core workflows:

1. Build From Meal
2. Optimize My List

Both workflows must feed the same backend pipeline:

```text
Input -> GroceryNeeds -> Product Candidates -> Optimized Cart -> Review
```

## MVP Requirements

### Input

The app must accept natural-language grocery intent.

Examples:

- "Build me a cart for Cobb salad with chicken and rice."
- "Optimize my weekly grocery list for price."
- "Make this as cheap as possible but keep organic eggs."

The app should also support manually entered grocery items.

### Grocery Need Generation

The system must convert user input into normalized grocery needs.

Each need should include:

- canonical name
- quantity
- unit
- category
- source
- dietary constraints if known
- brand preference if known
- substitution policy
- confidence score

In Phase 2, grocery need generation must support model-assisted inference for meals and grocery intents that are not hardcoded in templates.

Example:

- Input: "I want a lamb shawarma plate"
- Expected inferred needs may include lamb, pita or flatbread, rice, cucumber, tomato, red onion, yogurt or garlic sauce, lemon, garlic, shawarma seasoning, and parsley.

Model-generated needs must:

- conform to a strict schema
- include confidence scores
- expose uncertainty
- preserve dietary and substitution constraints
- avoid inventing price, availability, fees, or retailer-specific truth
- be validated before product matching

### User Preferences

The system must support preference inputs early, even if the MVP starts simple.

Preference categories:

- max number of stores
- pickup vs delivery
- preferred stores
- avoided stores
- brand loyalty
- organic preference
- dietary restrictions
- substitution flexibility
- budget target
- time sensitivity
- quality sensitivity

Budget target is a soft requirement. It should directionally pressure recommendations toward lower-cost plans and make the user aware of spend relative to target, but it should not block cart creation or override hard requirements such as dietary constraints, organic required, fulfillment eligibility, or max store count.

Organic preference must support four states:

- no organic preference
- prefer organic
- require organic
- prefer non-organic

### Product Matching

The system must map grocery needs to candidate products or offers.

Candidate matching should consider:

- semantic product match
- package size
- unit compatibility
- quantity coverage
- dietary constraints
- brand preference
- price
- availability
- store location
- substitution policy

In Phase 2, product matching should establish the search and ranking interfaces, deterministic scoring, and explainable candidate objects. Embedding-backed semantic matching should come after the targeted mock catalog proves the interface, likely in Phase 3.5 alongside broader catalog expansion.

Recommended approach:

- normalize product and grocery need search text
- retrieve candidate product concepts through exact, alias, token, category, tag, and fuzzy matching
- score candidates using deterministic rules
- rank retailer offers using price, availability, quantity, dietary constraints, brand preference, and substitution policy
- add embeddings when the catalog becomes large enough to justify semantic retrieval infrastructure

### Cart Optimization

The system must create at least one recommended cart.

The MVP should support these optimization goals:

- cheapest
- best value
- fewest stores
- preferred brands

The optimizer should consider total cart cost rather than only item-level prices.

Total cart cost may include:

- item subtotal
- discounts
- pickup fees
- delivery fees
- service fees
- minimum order effects
- substitutions
- unavailable item penalties
- extra store penalties

### Cart Review

The user must be able to review and edit the proposed cart before any retailer handoff.

The cart review should show:

- selected item
- matched grocery need
- store
- quantity
- price
- confidence
- substitutions or alternatives
- reason selected

### Explanation

The system must explain meaningful decisions.

Examples:

- why a store was chosen
- why an item was substituted
- why a preferred brand was preserved
- why the cart was split across stores
- why an item could not be matched

### Retailer Handoff

The MVP may stop at an editable cart or shopping list. Direct checkout is not required.

Future retailer handoff options:

- open product links
- export shopping list
- create retailer cart through official APIs where available
- browser-assisted cart handoff with user approval

## Non-Goals For MVP

- Fully autonomous purchase completion
- Guaranteed real-time retailer availability across all stores
- Full nutrition planning
- Pantry tracking with receipts
- Coupon clipping automation
- Support for every retailer

## Constraints

- Do not use the LLM as the source of truth for price, availability, totals, or fees.
- Do not hardcode one retailer into the core product flow.
- Do not treat recipes as the central data model.
- Do not hide uncertainty from the user.
- Do not allow model-generated grocery needs into cart optimization without schema validation.

## Trust And Safety Requirements

- The user must approve carts before purchase or retailer handoff.
- The system must clearly label estimated or unavailable data.
- The system must avoid dietary substitutions when the substitution policy is strict.
- The system must keep an audit trail of cart decisions.
- The system must gracefully handle unavailable items and connector failures.
